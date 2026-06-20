import OBSWebSocket, {
  OBSWebSocketError,
  type OBSRequestTypes,
  type OBSResponseTypes
} from "obs-websocket-js";
import {
  ObsConnectionInfoSchema,
  ObsControlError,
  ObsObservedCatalogSchema,
  ObsObservedProgramSceneSchema,
  ObsObservedRecordStatusSchema,
  ObsObservedStreamStatusSchema,
  type ObsConnectionInfo,
  type ObsControlErrorCode,
  type ObsControlPort,
  type ObsObservedCatalog,
  type ObsObservedProgramScene,
  type ObsObservedRecordStatus,
  type ObsObservedStreamStatus,
  type ObsSetInputMuteArgs,
  type ObsSetSceneItemEnabledArgs
} from "./control-port.js";
import type {
  ObsConnectionRef,
  ObsRecordingStatus,
  ObsSceneRef,
  ObsStreamStatus
} from "../../domain/obs/index.js";

/**
 * Real, obs-websocket-v5-backed implementation of the injected `ObsControlPort`
 * (slice 11 — the live OBS-control seam). The fake in `fake-control-port.ts`
 * stands in for every unit test; this is the production adapter wired against the
 * official obs-websocket-js v5 SDK (`obs-websocket-js`, the typed client for OBS
 * Studio 28+'s obs-websocket v5). It is the OBS analog of the Anthropic-backed AI
 * adapters (`anthropic-ai-suggest-port.ts` / `community/anthropic-ai-draft-port.ts`)
 * and follows the same four rules: co-located with its port, injected + SDK-typed
 * client (so `tsc` validates every request shape), never reads a secret, unit-tested
 * with a fake.
 *
 * **Why co-located with the port (not in `packages/obs-agent`).** The adapter
 * depends on the port contract (`ObsControlPort` and its secret-free result shapes),
 * which lives in this api workspace. Normal dependency direction is app → package,
 * never package → app, so making `packages/obs-agent` (a scaffold, intentionally
 * left empty here) import these api-owned types would invert it. The adapter
 * therefore lives beside its port; `packages/obs-agent` stays a placeholder for the
 * genuinely runtime-specific agent code (the desktop/agent process that owns the
 * socket lifecycle) that the api could one day depend on — exactly the rationale the
 * AI adapters use for `packages/ai-engine`.
 *
 * **Secret posture is unchanged by this adapter — it operates an already-connected
 * client.** The adapter NEVER stores, reads, or logs the OBS host/port/password/auth
 * token or any streaming-service stream key. The connection (url + password) is
 * resolved at the composition root from the access-controlled vault/env and used to
 * construct/connect the injected `OBSWebSocket` client; the OBS domain records keep
 * only the opaque `connectionRef` (a vault handle). The `connectionRef` this port's
 * methods take is therefore NOT used to dial OBS here — the caller already owns
 * connect/auth + secret resolution; the ref is carried only so the port surface
 * matches the contract the service depends on. Every result this adapter returns is
 * the same Zod-validated, secret-free, telemetry-free shape the fake returns: refs +
 * coarse status only, never a host/port/password/token/stream key, never a raw
 * obs-websocket payload, never bitrate/dropped-frame/uptime telemetry.
 *
 * **Failures are normalized to a redacted `ObsControlError`.** A typed
 * `OBSWebSocketError` (or any other throw) is mapped to a thrown `ObsControlError`
 * whose `safeMessage` is one of the fixed, redacted operator strings below — never
 * the raw obs-websocket message, code, URL, or payload — so the existing dispatch
 * error classifier (`error-classifier.ts`) handles it unchanged.
 */

/**
 * The minimal obs-websocket-js client surface this adapter depends on: `call`,
 * `connect`, and `disconnect`, typed verbatim from the real SDK's `OBSWebSocket`
 * (its `BaseOBSWebSocket` base). Typing the injected client this way means `tsc`
 * validates every `client.call("RequestName", payload)` against the library's
 * `OBSRequestTypes` / `OBSResponseTypes` maps even though no live socket is opened
 * in tests — an invented request name or a wrong payload field is a compile error.
 * A real `new OBSWebSocket()` satisfies it (it extends `BaseOBSWebSocket`, which
 * declares exactly these three members); the test fake supplies only what is used.
 */
export interface ObsWebSocketClient {
  readonly call: <Type extends keyof OBSRequestTypes>(
    requestType: Type,
    requestData?: OBSRequestTypes[Type]
  ) => Promise<OBSResponseTypes[Type]>;
  readonly connect: OBSWebSocket["connect"];
  readonly disconnect: OBSWebSocket["disconnect"];
}

export interface CreateObsWebSocketControlPortOptions {
  readonly client: ObsWebSocketClient;
}

/**
 * The fixed, redacted operator message per normalized failure code — identical in
 * spirit to the fake's `SAFE_MESSAGE_BY_CODE`. Generated here (never derived from
 * the raw obs-websocket error), so an `ObsControlError` this adapter throws can
 * carry no OBS host/port/password/token, stream key, connection URL, or raw
 * obs-websocket payload — only a coarse, safe description.
 */
const SAFE_MESSAGE_BY_CODE: Readonly<Record<ObsControlErrorCode, string>> = {
  "action-rejected": "OBS rejected the requested action.",
  disconnected: "The OBS instance is not reachable.",
  "not-found": "The referenced OBS scene, source, or scene-item was not found.",
  "port-failure": "The OBS control connection failed."
};

const DEFAULT_RETRYABLE_BY_CODE: Readonly<Record<ObsControlErrorCode, boolean>> =
  {
    "action-rejected": false,
    disconnected: true,
    "not-found": false,
    "port-failure": false
  };

const controlError = (code: ObsControlErrorCode): ObsControlError =>
  new ObsControlError(
    code,
    SAFE_MESSAGE_BY_CODE[code],
    DEFAULT_RETRYABLE_BY_CODE[code]
  );

/**
 * obs-websocket v5 request-error codes (`RequestStatus`) this adapter maps to the
 * port's coarse `not-found` failure. `600` = ResourceNotFound, `604` =
 * InvalidResourceState (the named resource is not in a state the request needs),
 * `700` = ResourceNotFound for outputs. Anything else from a request error is a
 * generic `action-rejected` (OBS refused the operation). These are the numeric
 * codes obs-websocket itself returns on the `OBSWebSocketError.code` field.
 */
const NOT_FOUND_REQUEST_CODES: ReadonlySet<number> = new Set([600, 604, 700]);

/**
 * Numeric `OBSWebSocketError.code` values obs-websocket-js raises for a closed /
 * failed transport (rather than a request the server processed and rejected). These
 * map to the retryable `disconnected` graceful-degradation trigger. `1001`–`1011`
 * are the WebSocket close codes the library surfaces; `-1` is its internal
 * "not connected/handshake failed" sentinel.
 */
const DISCONNECTED_ERROR_CODES: ReadonlySet<number> = new Set([
  -1, 1001, 1002, 1003, 1005, 1006, 1009, 1011, 1012, 1013, 1014, 1015
]);

/**
 * Map any thrown value from an obs-websocket call to a redacted `ObsControlError`.
 * A typed `OBSWebSocketError` is classified by its numeric `code`
 * (`disconnected` / `not-found` / `action-rejected`); anything else becomes the
 * generic `port-failure`. The raw error's message/code/stack is intentionally
 * discarded — only the fixed `safeMessage` is surfaced, so no secret or
 * connection-shaped detail can leak upward. An already-normalized `ObsControlError`
 * (it should not occur from the SDK, but be defensive) passes through unchanged.
 */
const toObsControlError = (error: unknown): ObsControlError => {
  if (error instanceof ObsControlError) {
    return error;
  }

  if (error instanceof OBSWebSocketError) {
    if (DISCONNECTED_ERROR_CODES.has(error.code)) {
      return controlError("disconnected");
    }

    if (NOT_FOUND_REQUEST_CODES.has(error.code)) {
      return controlError("not-found");
    }

    return controlError("action-rejected");
  }

  return controlError("port-failure");
};

/**
 * Safe field readers for the `JsonObject` entries obs-websocket returns inside its
 * `scenes` / `inputs` / `sceneItems` arrays. The SDK types each array element as an
 * opaque `JsonObject` (a `{ [key: string]: JsonValue }`), so the per-item protocol
 * fields (`sceneName`, `inputName`, `sceneItemId`, …) are not statically typed and
 * must be narrowed at runtime. With `noUncheckedIndexedAccess` each lookup is
 * `JsonValue | undefined`; these guards collapse that to a concrete value or
 * `undefined` without any `any`.
 */
const readString = (entry: unknown, key: string): string | undefined => {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }

  const value = (entry as Record<string, unknown>)[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readBoolean = (entry: unknown, key: string): boolean | undefined => {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }

  const value = (entry as Record<string, unknown>)[key];

  return typeof value === "boolean" ? value : undefined;
};

const readNumber = (entry: unknown, key: string): number | undefined => {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }

  const value = (entry as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/**
 * obs-websocket reports stream/recording activity as a coarse boolean
 * (`outputActive`) plus, for recording, an `outputPaused` flag. Collapse those to
 * the port's coarse status enums. A missing/garbled flag is reported as `unknown`
 * rather than guessed — the port's status enums include `unknown` precisely for an
 * indeterminate read.
 */
const toStreamStatus = (outputActive: boolean): ObsStreamStatus =>
  outputActive ? "active" : "inactive";

const toRecordingStatus = (
  outputActive: boolean,
  outputPaused: boolean
): ObsRecordingStatus => {
  if (!outputActive) {
    return "inactive";
  }

  return outputPaused ? "paused" : "active";
};

/**
 * Parse obs-websocket's `GetSceneList` response into the port's secret-free
 * `ObsObservedCatalog`. obs-websocket returns scenes + the current program scene
 * name from `GetSceneList`; sources come from a separate `GetInputList`, and
 * scene-items from a per-scene `GetSceneItemList`. The opaque OBS `sceneName` /
 * `inputName` / numeric `sceneItemId` become the catalog's opaque refs (the
 * `ObsSceneRef` / `ObsSourceRef` / `ObsSceneItemRef` the durable records mirror).
 * Items lacking the ref fields they need are skipped (never fabricated) so the
 * `.strict()` schema can validate every entry.
 */
const buildObservedCatalog = (
  sceneList: OBSResponseTypes["GetSceneList"],
  inputList: OBSResponseTypes["GetInputList"],
  sceneItemsByScene: ReadonlyMap<string, OBSResponseTypes["GetSceneItemList"]>
): ObsObservedCatalog => {
  const currentProgramSceneName =
    typeof sceneList.currentProgramSceneName === "string" &&
    sceneList.currentProgramSceneName.length > 0
      ? sceneList.currentProgramSceneName
      : undefined;

  const scenes = sceneList.scenes.flatMap((scene) => {
    const obsSceneRef = readString(scene, "sceneName");
    if (obsSceneRef === undefined) {
      return [];
    }

    return [
      {
        displayName: obsSceneRef,
        isCurrentProgramScene: obsSceneRef === currentProgramSceneName,
        obsSceneRef
      }
    ];
  });

  const sources = inputList.inputs.flatMap((input) => {
    const obsSourceRef = readString(input, "inputName");
    if (obsSourceRef === undefined) {
      return [];
    }

    const kindLabel =
      readString(input, "inputKind") ??
      readString(input, "unversionedInputKind") ??
      "input";

    return [{ kindLabel, obsSourceRef }];
  });

  const sceneItems = [...sceneItemsByScene.entries()].flatMap(
    ([obsSceneRef, response]) =>
      response.sceneItems.flatMap((item) => {
        const numericId = readNumber(item, "sceneItemId");
        const obsSourceRef = readString(item, "sourceName");
        if (numericId === undefined || obsSourceRef === undefined) {
          return [];
        }

        return [
          {
            obsSceneItemId: String(numericId),
            obsSceneRef,
            obsSourceRef,
            visibleHint: readBoolean(item, "sceneItemEnabled") ?? false
          }
        ];
      })
  );

  return ObsObservedCatalogSchema.parse({
    scenes,
    sceneItems,
    sources,
    ...(currentProgramSceneName !== undefined
      ? { currentProgramSceneRef: currentProgramSceneName }
      : {})
  });
};

/**
 * The numeric `sceneItemId` obs-websocket requires for `SetSceneItemEnabled`. The
 * port carries the scene-item id as an opaque string (`ObsSceneItemRef`); OBS keyed
 * it by a non-negative integer. Coerce it back, failing closed with `not-found`
 * (rather than sending a NaN) if a stored ref is somehow non-numeric — the same
 * "referenced scene-item does not exist" outcome the fake yields for an unknown id.
 */
const toSceneItemNumericId = (obsSceneItemId: string): number => {
  const numericId = Number(obsSceneItemId);
  if (!Number.isInteger(numericId) || numericId < 0) {
    throw controlError("not-found");
  }

  return numericId;
};

/**
 * Build the real obs-websocket-v5-backed `ObsControlPort`. Each method maps to the
 * single matching obs-websocket request via `client.call(...)` and parses the typed
 * response into the port's exact secret-free return type; every call is wrapped so a
 * thrown obs-websocket error becomes a redacted `ObsControlError`.
 *
 * To wire it live (see `docs/running.md` → "Live OBS"): resolve the OBS connection
 * (host/port/password) from the vault/env at the composition root, construct +
 * `connect` an `OBSWebSocket`, then pass it here —
 *   createObsWebSocketControlPort({ client: obs })
 * — as the OBS persistence selection's `controlPort` in place of the fake, behind
 * the existing request → confirm → dispatch gate. The caller owns connect/auth and
 * secret resolution; this adapter never sees a credential.
 */
export const createObsWebSocketControlPort = (
  options: CreateObsWebSocketControlPortOptions
): ObsControlPort => {
  const { client } = options;

  /**
   * Run one obs-websocket request, normalizing any throw to a redacted
   * `ObsControlError`. Every port method funnels through here so failure mapping is
   * defined in exactly one place.
   */
  const runRequest = async <Type extends keyof OBSRequestTypes>(
    requestType: Type,
    requestData?: OBSRequestTypes[Type]
  ): Promise<OBSResponseTypes[Type]> => {
    try {
      return await client.call(requestType, requestData);
    } catch (error: unknown) {
      throw toObsControlError(error);
    }
  };

  const readStreamStatus = async (): Promise<ObsObservedStreamStatus> => {
    const status = await runRequest("GetStreamStatus");

    return ObsObservedStreamStatusSchema.parse({
      streamStatus: toStreamStatus(status.outputActive)
    });
  };

  const readRecordStatus = async (): Promise<ObsObservedRecordStatus> => {
    const status = await runRequest("GetRecordStatus");

    return ObsObservedRecordStatusSchema.parse({
      recordingStatus: toRecordingStatus(
        status.outputActive,
        status.outputPaused
      )
    });
  };

  return {
    // `connect` is owned by the caller (it resolves the secret + dials OBS). This
    // method reports the already-established session's coarse state by reading the
    // negotiated obs-websocket version — it never re-dials and never resolves a
    // credential. A read failure surfaces as a normalized `ObsControlError`.
    connect: async (): Promise<ObsConnectionInfo> => {
      const version = await runRequest("GetVersion");

      return ObsConnectionInfoSchema.parse({
        connectionStatus: "connected",
        obsWebsocketVersion: version.obsWebSocketVersion
      });
    },

    disconnect: async (): Promise<void> => {
      try {
        await client.disconnect();
      } catch (error: unknown) {
        throw toObsControlError(error);
      }
    },

    getCurrentProgramScene: async (): Promise<ObsObservedProgramScene> => {
      const scene = await runRequest("GetCurrentProgramScene");

      return ObsObservedProgramSceneSchema.parse({
        currentProgramSceneRef: scene.sceneName
      });
    },

    getRecordStatus: (): Promise<ObsObservedRecordStatus> => readRecordStatus(),

    getSceneList: async (): Promise<ObsObservedCatalog> => {
      const sceneList = await runRequest("GetSceneList");
      const inputList = await runRequest("GetInputList");

      const sceneItemsByScene = new Map<
        string,
        OBSResponseTypes["GetSceneItemList"]
      >();
      for (const scene of sceneList.scenes) {
        const sceneName = readString(scene, "sceneName");
        if (sceneName === undefined) {
          continue;
        }

        sceneItemsByScene.set(
          sceneName,
          await runRequest("GetSceneItemList", { sceneName })
        );
      }

      return buildObservedCatalog(sceneList, inputList, sceneItemsByScene);
    },

    getStreamStatus: (): Promise<ObsObservedStreamStatus> => readStreamStatus(),

    setCurrentProgramScene: async (
      _connectionRef: ObsConnectionRef,
      obsSceneRef: ObsSceneRef
    ): Promise<void> => {
      await runRequest("SetCurrentProgramScene", { sceneName: obsSceneRef });
    },

    setInputMute: async (
      _connectionRef: ObsConnectionRef,
      args: ObsSetInputMuteArgs
    ): Promise<void> => {
      await runRequest("SetInputMute", {
        inputMuted: args.muted,
        inputName: args.obsSourceRef
      });
    },

    setSceneItemEnabled: async (
      _connectionRef: ObsConnectionRef,
      args: ObsSetSceneItemEnabledArgs
    ): Promise<void> => {
      await runRequest("SetSceneItemEnabled", {
        sceneItemEnabled: args.enabled,
        sceneItemId: toSceneItemNumericId(args.obsSceneItemId),
        sceneName: args.obsSceneRef
      });
    },

    startRecord: async (): Promise<ObsObservedRecordStatus> => {
      await runRequest("StartRecord");

      return readRecordStatus();
    },

    startStream: async (): Promise<ObsObservedStreamStatus> => {
      await runRequest("StartStream");

      return readStreamStatus();
    },

    stopRecord: async (): Promise<ObsObservedRecordStatus> => {
      await runRequest("StopRecord");

      return readRecordStatus();
    },

    stopStream: async (): Promise<ObsObservedStreamStatus> => {
      await runRequest("StopStream");

      return readStreamStatus();
    }
  };
};
