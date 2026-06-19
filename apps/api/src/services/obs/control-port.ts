import { z } from "zod";
import {
  ObsRecordingStatusSchema,
  ObsSceneItemRefSchema,
  ObsSceneRefSchema,
  ObsSourceRefSchema,
  ObsStreamStatusSchema,
  type ObsConnectionRef,
  type ObsRecordingStatus,
  type ObsSceneItemRef,
  type ObsSceneRef,
  type ObsSourceRef,
  type ObsStreamStatus
} from "../../domain/obs/index.js";

/**
 * The injected obs-websocket seam — `ObsControlPort` + its secret-free observed
 * result shapes + the typed, redacted `ObsControlError` (slice 5).
 *
 * The OBS service depends on this interface and **never** on `obs-websocket`
 * directly. The real obs-websocket v5 client implements it inside
 * `packages/obs-agent` (slice 11, driven by the desktop/agent runtime); a fake
 * (`fake-control-port.ts`) implements it in every unit test. This is the OBS
 * analog of Community+'s injected `CommunicationSendPort` and follows the API-shape
 * rule that "integration adapters isolate vendor SDKs and normalize failures".
 *
 * Two structural safety rules hold at this boundary:
 *   - **The port takes an opaque `connectionRef`, never a credential.** A
 *     `connectionRef` is a vault handle (an `ObsConnectionRef`); the real
 *     implementation resolves the OBS host/port/password/auth token from the
 *     access-controlled vault at call time. The host/port/password/token and any
 *     streaming-service stream key never cross this boundary, are never returned
 *     upward, and are never logged. Every input is an opaque ref (a `connectionRef`
 *     plus scene/source/scene-item refs) — never a secret.
 *   - **Every result is Zod-validated and secret-free.** Results carry only
 *     scene/source/scene-item refs and coarse stream/recording status — never a
 *     host, port, password, token, or stream key, never a raw obs-websocket
 *     payload, never high-frequency telemetry (bitrate / dropped frames / uptime).
 *
 * Failures are normalized to a typed, redacted `ObsControlError` (`code` +
 * `retryable` + a redacted `safeMessage`), aligned with the plan's
 * `IntegrationFailure` posture — the port never surfaces a raw obs-websocket error
 * object, stack, or payload, and the `safeMessage` never carries a secret, URL, or
 * raw connection detail.
 */
const NonEmptyStringSchema = z.string().min(1);

/**
 * One observed scene from a live OBS catalog read. Refs + a display label +
 * the coarse program-scene flag only — never a credential or a render. The
 * `obsSceneRef` is the opaque OBS scene name/uuid the durable `Scene` record
 * mirrors.
 */
export const ObsObservedSceneSchema = z
  .object({
    displayName: NonEmptyStringSchema,
    isCurrentProgramScene: z.boolean(),
    obsSceneRef: ObsSceneRefSchema
  })
  .strict();

/**
 * One observed source/input. An opaque `obsSourceRef`, a descriptive `kindLabel`
 * (e.g. "browser_source"), and coarse mute/active hints only — never a device
 * handle, filter data, or audio level.
 */
export const ObsObservedSourceSchema = z
  .object({
    activeHint: z.boolean().optional(),
    kindLabel: NonEmptyStringSchema,
    mutedHint: z.boolean().optional(),
    obsSourceRef: ObsSourceRefSchema
  })
  .strict();

/**
 * One observed scene-item: a source's placement within a scene. Refs + the
 * coarse visibility hint only — never transform/crop geometry.
 */
export const ObsObservedSceneItemSchema = z
  .object({
    obsSceneItemId: ObsSceneItemRefSchema,
    obsSceneRef: ObsSceneRefSchema,
    obsSourceRef: ObsSourceRefSchema,
    visibleHint: z.boolean()
  })
  .strict();

/**
 * The catalog observed from a live OBS read (`getSceneList`): scenes + sources +
 * scene-items + the current program scene ref. The pure `snapshot.ts`
 * reconciliation step diffs this against the durable catalog. Secret-free and
 * telemetry-free by construction.
 */
export const ObsObservedCatalogSchema = z
  .object({
    currentProgramSceneRef: ObsSceneRefSchema.optional(),
    scenes: z.array(ObsObservedSceneSchema),
    sceneItems: z.array(ObsObservedSceneItemSchema),
    sources: z.array(ObsObservedSourceSchema)
  })
  .strict();

/**
 * The coarse program-scene observed by `getCurrentProgramScene`. A single opaque
 * ref — never the rendered frame.
 */
export const ObsObservedProgramSceneSchema = z
  .object({
    currentProgramSceneRef: ObsSceneRefSchema
  })
  .strict();

/**
 * Connection info returned by `connect`. The coarse last-known `connectionStatus`
 * plus, at most, the obs-websocket protocol version — never the resolved
 * host/port/password/token. Mirrors the `IntegrationFailure`-aligned posture: the
 * credential the real port resolved from the vault is never echoed back.
 */
export const ObsConnectionInfoSchema = z
  .object({
    connectionStatus: z.enum(["connected", "disconnected", "unknown"]),
    obsWebsocketVersion: NonEmptyStringSchema.optional()
  })
  .strict();

/**
 * The coarse stream status observed by `getStreamStatus` /
 * `startStream` / `stopStream`. Active/inactive/unknown only — **no** bitrate,
 * uptime, or dropped-frame count (that high-frequency telemetry stays on the
 * local runtime bus, never crosses this boundary).
 */
export const ObsObservedStreamStatusSchema = z
  .object({
    streamStatus: ObsStreamStatusSchema
  })
  .strict();

/**
 * The coarse recording status observed by `getRecordStatus` / `startRecord` /
 * `stopRecord`. Active/paused/inactive/unknown only — **no** file path, bytes, or
 * codec.
 */
export const ObsObservedRecordStatusSchema = z
  .object({
    recordingStatus: ObsRecordingStatusSchema
  })
  .strict();

export type ObsObservedScene = z.infer<typeof ObsObservedSceneSchema>;
export type ObsObservedSource = z.infer<typeof ObsObservedSourceSchema>;
export type ObsObservedSceneItem = z.infer<typeof ObsObservedSceneItemSchema>;
export type ObsObservedCatalog = z.infer<typeof ObsObservedCatalogSchema>;
export type ObsObservedProgramScene = z.infer<
  typeof ObsObservedProgramSceneSchema
>;
export type ObsConnectionInfo = z.infer<typeof ObsConnectionInfoSchema>;
export type ObsObservedStreamStatus = z.infer<
  typeof ObsObservedStreamStatusSchema
>;
export type ObsObservedRecordStatus = z.infer<
  typeof ObsObservedRecordStatusSchema
>;

/**
 * Stable, machine-readable failure codes the port normalizes obs-websocket
 * failures into. `disconnected` — the named OBS instance is unreachable / the
 * session is down (graceful-degradation trigger). `action-rejected` — OBS
 * refused the operation (e.g. switching to a scene that vanished, an obs-websocket
 * request error). `not-found` — a referenced scene/source/scene-item does not
 * exist on the live instance. `port-failure` — any other normalized adapter
 * failure (a malformed response, an unexpected transport error). These map to the
 * service's `OBS_DISCONNECTED` / `PORT_FAILURE` domain codes in later slices and
 * let the error classifier branch retryable-vs-terminal.
 */
export const OBS_CONTROL_ERROR_CODES = [
  "disconnected",
  "action-rejected",
  "not-found",
  "port-failure"
] as const;

export type ObsControlErrorCode = (typeof OBS_CONTROL_ERROR_CODES)[number];

/**
 * Typed, redacted OBS control-port error — the normalized failure shape the port
 * surfaces upward (aligned with the plan's `IntegrationFailure` `{ retryable,
 * safeMessage }`).
 *
 * It carries a stable `code`, a `retryable` flag the later error classifier uses
 * to decide a transient retry vs a terminal failure, and a `safeMessage` that is
 * **already redacted for operator display**. The `safeMessage` is generated by the
 * adapter and, by construction, **never** contains the OBS host, port, password,
 * auth token, stream key, a connection URL, or a raw obs-websocket payload/stack.
 * The port never throws a raw obs-websocket error object — only this. Mirrors the
 * typed-error-plus-redacted-`safeMessage` pattern of `CommunityDomainError` and
 * the desktop `PlayNetworkReplayError` code-carrying classifier seam.
 */
export class ObsControlError extends Error {
  readonly code: ObsControlErrorCode;
  readonly retryable: boolean;
  readonly safeMessage: string;

  constructor(
    code: ObsControlErrorCode,
    safeMessage: string,
    retryable: boolean
  ) {
    super(safeMessage);
    this.name = "ObsControlError";
    this.code = code;
    this.retryable = retryable;
    this.safeMessage = safeMessage;
  }
}

export const isObsControlError = (error: unknown): error is ObsControlError =>
  error instanceof ObsControlError;

/**
 * Opaque arguments for a scene-item visibility change. Refs only — the
 * `obsSceneRef`/`obsSceneItemId` name the placement, `enabled` is the desired
 * coarse visibility. No transform/crop geometry, no source content.
 */
export interface ObsSetSceneItemEnabledArgs {
  readonly enabled: boolean;
  readonly obsSceneItemId: ObsSceneItemRef;
  readonly obsSceneRef: ObsSceneRef;
}

/**
 * Opaque arguments for a source mute change. The `obsSourceRef` names the input;
 * `muted` is the desired coarse mute state. No audio level, no device handle.
 */
export interface ObsSetInputMuteArgs {
  readonly muted: boolean;
  readonly obsSourceRef: ObsSourceRef;
}

/**
 * The obs-websocket boundary the OBS service depends on.
 *
 * Every method takes an opaque `connectionRef` (a vault handle), never a
 * credential, and returns a Zod-validated, secret-free, telemetry-free result (or
 * resolves `void` for a pure side effect). Every failure is normalized to a typed,
 * redacted `ObsControlError` — a raw obs-websocket error never escapes. The real
 * implementation (slice 11) resolves the credential from the vault behind this
 * interface; the fake (slice 5) simulates an in-memory OBS instance. The OBS
 * service calls the output-affecting methods (`setCurrentProgramScene`,
 * `setSceneItemEnabled`, `setInputMute`, `startStream`, `stopStream`,
 * `startRecord`, `stopRecord`) **only after the human-confirm gate** (slice 7).
 */
export interface ObsControlPort {
  readonly connect: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsConnectionInfo>;
  readonly disconnect: (connectionRef: ObsConnectionRef) => Promise<void>;
  readonly getCurrentProgramScene: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedProgramScene>;
  readonly getRecordStatus: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedRecordStatus>;
  readonly getSceneList: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedCatalog>;
  readonly getStreamStatus: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedStreamStatus>;
  readonly setCurrentProgramScene: (
    connectionRef: ObsConnectionRef,
    obsSceneRef: ObsSceneRef
  ) => Promise<void>;
  readonly setInputMute: (
    connectionRef: ObsConnectionRef,
    args: ObsSetInputMuteArgs
  ) => Promise<void>;
  readonly setSceneItemEnabled: (
    connectionRef: ObsConnectionRef,
    args: ObsSetSceneItemEnabledArgs
  ) => Promise<void>;
  readonly startRecord: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedRecordStatus>;
  readonly startStream: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedStreamStatus>;
  readonly stopRecord: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedRecordStatus>;
  readonly stopStream: (
    connectionRef: ObsConnectionRef
  ) => Promise<ObsObservedStreamStatus>;
}

/**
 * Re-exported coarse status types the port results are built from, so callers can
 * type against the port surface without reaching into the domain barrel.
 */
export type {
  ObsRecordingStatus,
  ObsStreamStatus,
  ObsConnectionRef,
  ObsSceneRef,
  ObsSourceRef,
  ObsSceneItemRef
};

export { ObsRecordingStatusSchema, ObsStreamStatusSchema };
