import { OBSWebSocketError, type OBSRequestTypes, type OBSResponseTypes } from "obs-websocket-js";
import { describe, expect, it } from "vitest";
import {
  ObsConnectionRefSchema,
  ObsSceneItemRefSchema,
  ObsSceneRefSchema,
  ObsSourceRefSchema,
  type ObsConnectionRef
} from "../../domain/obs/index.js";
import { ObsControlError, isObsControlError } from "./control-port.js";
import {
  createObsWebSocketControlPort,
  type ObsWebSocketClient
} from "./obs-websocket-control-port.js";

/**
 * Real-adapter unit tests for `createObsWebSocketControlPort`. These inject a FAKE
 * obs-websocket-js client (its `call` signature taken verbatim from the SDK's
 * `OBSRequestTypes` / `OBSResponseTypes` maps, so `tsc` still validates the request
 * each adapter method builds) and NEVER open a socket — there is no real OBS here.
 * The real OBS connection (host/port/password) is resolved and dialed by the caller
 * at the composition root, never in this adapter. The adapter is UNIT-tested, not
 * live-verified.
 *
 * The assertions mirror the AI-adapter + `fake-control-port` test style: for each
 * key operation, assert the adapter calls `client.call` with the correct
 * obs-websocket request NAME and the payload derived from the port args, and parses
 * the typed response into the port's secret-free return type; one read/catalog op
 * maps a response; and an error path (the fake `call` rejects → the adapter throws a
 * redacted `ObsControlError`).
 */

/** One captured `client.call(requestType, requestData)` the fake recorded. */
interface CapturedCall {
  readonly requestData: unknown;
  readonly requestType: keyof OBSRequestTypes;
}

/**
 * A per-request response/throw table. A key maps to either a typed response value
 * (returned from `call`), a function of the request payload (so a per-scene request
 * like `GetSceneItemList` can answer differently per `sceneName`, exactly as a real
 * OBS does), or a thrown value (to exercise the normalized-error path). Requests not
 * in the table resolve `undefined` (the SDK's own shape for the side-effecting
 * `Set*` / `Start*` / `Stop*` requests).
 */
type Outcome =
  | { readonly kind: "resolve"; readonly value: unknown }
  | { readonly kind: "resolveFrom"; readonly value: (requestData: unknown) => unknown }
  | { readonly kind: "reject"; readonly error: unknown };

/**
 * A fake `ObsWebSocketClient` whose `call` is typed against the real SDK signature,
 * so the adapter's call sites are type-checked exactly as they are against a real
 * `OBSWebSocket`. It records every call and returns the per-request outcome.
 */
const createFakeClient = (
  outcomes: Partial<Record<keyof OBSRequestTypes, Outcome>> = {}
): {
  readonly client: ObsWebSocketClient;
  readonly calls: CapturedCall[];
  readonly disconnectCalls: () => number;
} => {
  const calls: CapturedCall[] = [];
  let disconnects = 0;

  const call = (<Type extends keyof OBSRequestTypes>(
    requestType: Type,
    requestData?: OBSRequestTypes[Type]
  ): Promise<OBSResponseTypes[Type]> => {
    calls.push({ requestData, requestType });
    const outcome = outcomes[requestType];

    if (outcome?.kind === "reject") {
      return Promise.reject(
        outcome.error instanceof Error
          ? outcome.error
          : new Error(String(outcome.error))
      );
    }

    if (outcome?.kind === "resolveFrom") {
      return Promise.resolve(outcome.value(requestData) as OBSResponseTypes[Type]);
    }

    return Promise.resolve(
      (outcome?.kind === "resolve"
        ? outcome.value
        : undefined) as OBSResponseTypes[Type]
    );
  }) as ObsWebSocketClient["call"];

  const client: ObsWebSocketClient = {
    call,
    connect: (() =>
      Promise.resolve({})) as ObsWebSocketClient["connect"],
    disconnect: (): Promise<void> => {
      disconnects += 1;

      return Promise.resolve();
    }
  };

  return { calls, client, disconnectCalls: () => disconnects };
};

const connectionRef: ObsConnectionRef =
  ObsConnectionRefSchema.parse("vault-connection-1");

const lastCall = (calls: readonly CapturedCall[]): CapturedCall | undefined =>
  calls.at(-1);

describe("createObsWebSocketControlPort", () => {
  it("switches the program scene via SetCurrentProgramScene with the scene ref as sceneName", async () => {
    const { client, calls } = createFakeClient();
    const port = createObsWebSocketControlPort({ client });

    await port.setCurrentProgramScene(
      connectionRef,
      ObsSceneRefSchema.parse("scene-lower")
    );

    expect(calls).toHaveLength(1);
    expect(lastCall(calls)).toEqual({
      requestData: { sceneName: "scene-lower" },
      requestType: "SetCurrentProgramScene"
    });
  });

  it("mutes an input via SetInputMute with the source ref as inputName and the coarse muted flag", async () => {
    const { client, calls } = createFakeClient();
    const port = createObsWebSocketControlPort({ client });

    await port.setInputMute(connectionRef, {
      muted: true,
      obsSourceRef: ObsSourceRefSchema.parse("source-mic")
    });

    expect(lastCall(calls)).toEqual({
      requestData: { inputMuted: true, inputName: "source-mic" },
      requestType: "SetInputMute"
    });
  });

  it("toggles scene-item visibility via SetSceneItemEnabled, coercing the opaque item ref to the numeric sceneItemId", async () => {
    const { client, calls } = createFakeClient();
    const port = createObsWebSocketControlPort({ client });

    await port.setSceneItemEnabled(connectionRef, {
      enabled: false,
      obsSceneItemId: ObsSceneItemRefSchema.parse("7"),
      obsSceneRef: ObsSceneRefSchema.parse("scene-main")
    });

    expect(lastCall(calls)).toEqual({
      requestData: {
        sceneItemEnabled: false,
        sceneItemId: 7,
        sceneName: "scene-main"
      },
      requestType: "SetSceneItemEnabled"
    });
  });

  it("fails closed with not-found when a scene-item ref is non-numeric (never sends a NaN id)", async () => {
    const { client, calls } = createFakeClient();
    const port = createObsWebSocketControlPort({ client });

    await expect(
      port.setSceneItemEnabled(connectionRef, {
        enabled: true,
        obsSceneItemId: ObsSceneItemRefSchema.parse("not-a-number"),
        obsSceneRef: ObsSceneRefSchema.parse("scene-main")
      })
    ).rejects.toMatchObject({ code: "not-found" });

    // The bad ref is rejected before any request is dispatched.
    expect(calls).toHaveLength(0);
  });

  it("starts the stream via StartStream then reports the coarse status read back from GetStreamStatus", async () => {
    const { client, calls } = createFakeClient({
      GetStreamStatus: {
        kind: "resolve",
        value: {
          outputActive: true,
          outputBytes: 0,
          outputCongestion: 0,
          outputDuration: 0,
          outputReconnecting: false,
          outputSkippedFrames: 0,
          outputTimecode: "00:00:00.000",
          outputTotalFrames: 0
        }
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const result = await port.startStream(connectionRef);

    // Dispatches StartStream, then reads GetStreamStatus.
    expect(calls.map((entry) => entry.requestType)).toEqual([
      "StartStream",
      "GetStreamStatus"
    ]);
    // The coarse, secret-free, telemetry-free return shape — no bitrate/bytes/uptime.
    expect(result).toEqual({ streamStatus: "active" });
  });

  it("stops the stream via StopStream and maps an inactive output to streamStatus inactive", async () => {
    const { client, calls } = createFakeClient({
      GetStreamStatus: {
        kind: "resolve",
        value: {
          outputActive: false,
          outputBytes: 0,
          outputCongestion: 0,
          outputDuration: 0,
          outputReconnecting: false,
          outputSkippedFrames: 0,
          outputTimecode: "00:00:00.000",
          outputTotalFrames: 0
        }
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const result = await port.stopStream(connectionRef);

    expect(calls.map((entry) => entry.requestType)).toEqual([
      "StopStream",
      "GetStreamStatus"
    ]);
    expect(result).toEqual({ streamStatus: "inactive" });
  });

  it("reads the catalog: GetSceneList + GetInputList + per-scene GetSceneItemList parsed into the secret-free ObsObservedCatalog", async () => {
    const { client, calls } = createFakeClient({
      GetSceneList: {
        kind: "resolve",
        value: {
          currentProgramSceneName: "scene-main",
          currentProgramSceneUuid: "uuid-main",
          currentPreviewSceneName: "",
          currentPreviewSceneUuid: "",
          scenes: [
            { sceneIndex: 0, sceneName: "scene-main", sceneUuid: "uuid-main" },
            { sceneIndex: 1, sceneName: "scene-lower", sceneUuid: "uuid-lower" }
          ]
        }
      },
      GetInputList: {
        kind: "resolve",
        value: {
          inputs: [
            {
              inputKind: "coreaudio_input_capture",
              inputName: "source-mic",
              inputUuid: "uuid-mic",
              unversionedInputKind: "coreaudio_input_capture"
            }
          ]
        }
      },
      // A real OBS answers GetSceneItemList per scene: scene-main owns the mic
      // item; scene-lower has none. The fake routes on the requested sceneName.
      GetSceneItemList: {
        kind: "resolveFrom",
        value: (requestData: unknown): unknown => {
          const sceneName =
            typeof requestData === "object" &&
            requestData !== null &&
            "sceneName" in requestData
              ? requestData.sceneName
              : undefined;

          return sceneName === "scene-main"
            ? {
                sceneItems: [
                  { sceneItemEnabled: true, sceneItemId: 3, sourceName: "source-mic" }
                ]
              }
            : { sceneItems: [] };
        }
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const catalog = await port.getSceneList(connectionRef);

    // The refresh fans out: the scene list, the input list, then one
    // GetSceneItemList per scene.
    const requestTypes = calls.map((entry) => entry.requestType);
    expect(requestTypes).toContain("GetSceneList");
    expect(requestTypes).toContain("GetInputList");
    expect(
      requestTypes.filter((entry) => entry === "GetSceneItemList")
    ).toHaveLength(2);

    // Scenes carry the opaque ref + current-program flag; sources carry the kind
    // label; scene-items carry the numeric id coerced back to an opaque string.
    expect(catalog.currentProgramSceneRef).toBe("scene-main");
    expect(catalog.scenes).toEqual([
      { displayName: "scene-main", isCurrentProgramScene: true, obsSceneRef: "scene-main" },
      { displayName: "scene-lower", isCurrentProgramScene: false, obsSceneRef: "scene-lower" }
    ]);
    expect(catalog.sources).toEqual([
      { kindLabel: "coreaudio_input_capture", obsSourceRef: "source-mic" }
    ]);
    expect(catalog.sceneItems).toEqual([
      {
        obsSceneItemId: "3",
        obsSceneRef: "scene-main",
        obsSourceRef: "source-mic",
        visibleHint: true
      }
    ]);
  });

  it("reports the connection via GetVersion, surfacing only the coarse status + obs-websocket version", async () => {
    const { client } = createFakeClient({
      GetVersion: {
        kind: "resolve",
        value: {
          availableRequests: [],
          obsVersion: "30.1.0",
          obsWebSocketVersion: "5.5.0",
          platform: "macos",
          platformDescription: "macOS",
          rpcVersion: 1,
          supportedImageFormats: []
        }
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const info = await port.connect(connectionRef);

    expect(info).toEqual({
      connectionStatus: "connected",
      obsWebsocketVersion: "5.5.0"
    });
  });

  it("maps a thrown OBSWebSocketError on dispatch to a redacted ObsControlError (no raw obs-websocket detail leaks)", async () => {
    const rawMessage = "obs at ws://10.0.0.5:4455 rejected password hunter2";
    const { client } = createFakeClient({
      SetCurrentProgramScene: {
        kind: "reject",
        // 604 = InvalidResourceState → normalized to the coarse not-found code.
        error: new OBSWebSocketError(604, rawMessage)
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const error = await port
      .setCurrentProgramScene(connectionRef, ObsSceneRefSchema.parse("scene-gone"))
      .then(
        () => undefined,
        (caught: unknown) => caught
      );

    expect(isObsControlError(error)).toBe(true);
    if (!(error instanceof ObsControlError)) {
      throw new Error("expected an ObsControlError");
    }

    expect(error.code).toBe("not-found");
    // The safeMessage is the fixed redacted operator string — the raw host, port,
    // and password from the underlying error are never echoed.
    expect(error.safeMessage).toBe(
      "The referenced OBS scene, source, or scene-item was not found."
    );
    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain("10.0.0.5");
    expect(error.message).not.toContain("4455");
  });

  it("maps a transport-level OBSWebSocketError (closed socket) to the retryable disconnected code", async () => {
    const { client } = createFakeClient({
      GetStreamStatus: {
        kind: "reject",
        // 1006 = abnormal WebSocket closure → retryable disconnected.
        error: new OBSWebSocketError(1006, "connection closed abnormally")
      }
    });
    const port = createObsWebSocketControlPort({ client });

    const error = await port.getStreamStatus(connectionRef).then(
      () => undefined,
      (caught: unknown) => caught
    );

    if (!(error instanceof ObsControlError)) {
      throw new Error("expected an ObsControlError");
    }

    expect(error.code).toBe("disconnected");
    expect(error.retryable).toBe(true);
  });

  it("maps any non-OBS throw to the generic port-failure code", async () => {
    const { client } = createFakeClient({
      GetRecordStatus: { kind: "reject", error: new Error("totally unexpected") }
    });
    const port = createObsWebSocketControlPort({ client });

    const error = await port.getRecordStatus(connectionRef).then(
      () => undefined,
      (caught: unknown) => caught
    );

    if (!(error instanceof ObsControlError)) {
      throw new Error("expected an ObsControlError");
    }

    expect(error.code).toBe("port-failure");
    expect(error.message).not.toContain("totally unexpected");
  });

  it("disconnects by delegating to the injected client's disconnect (caller owns the socket lifecycle)", async () => {
    const { client, disconnectCalls } = createFakeClient();
    const port = createObsWebSocketControlPort({ client });

    await port.disconnect(connectionRef);

    expect(disconnectCalls()).toBe(1);
  });
});
