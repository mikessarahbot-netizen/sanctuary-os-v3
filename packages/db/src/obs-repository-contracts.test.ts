import { describe, expect, it } from "vitest";
import {
  AppendObsActionLogEntryPersistenceInputSchema,
  ObsActionIntentPersistenceRecordSchema,
  ObsActionLogEntryPersistenceRecordSchema,
  ObsConnectionProfilePersistenceRecordSchema,
  ObsPersistenceWriteOptionsSchema,
  ObsRecordingStatePersistenceRecordSchema,
  ObsSceneItemPersistenceRecordSchema,
  ObsScenePersistenceRecordSchema,
  ObsSourcePersistenceRecordSchema,
  ObsStreamStatePersistenceRecordSchema,
  ReplaceObsCatalogSnapshotPersistenceInputSchema,
  SetObsActionIntentStatusPersistenceInputSchema
} from "./index.js";

const connectionProfile = {
  connectionProfileId: "connection_1",
  connectionRef: "vault_obs_handle_1",
  connectionStatus: "connected",
  createdAt: "2026-06-17T08:00:00.000Z",
  label: "Main Auditorium OBS",
  lastSeenAt: "2026-06-17T08:05:00.000Z",
  obsWebsocketVersion: "5.4.2",
  schemaVersion: "obs.v1",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:05:00.000Z"
} as const;

const scene = {
  connectionProfileId: "connection_1",
  displayName: "Worship Wide",
  isCurrentProgramScene: true,
  obsSceneRef: "scene_worship_wide",
  orderHint: 0,
  sceneId: "scene_1",
  snapshotAt: "2026-06-17T08:05:00.000Z",
  tenantId: "tenant_1"
} as const;

const source = {
  connectionProfileId: "connection_1",
  kindLabel: "browser_source",
  mutedHint: false,
  obsSourceRef: "source_lower_third",
  snapshotAt: "2026-06-17T08:05:00.000Z",
  sourceId: "source_1",
  tenantId: "tenant_1"
} as const;

const sceneItem = {
  connectionProfileId: "connection_1",
  obsSceneItemId: "12",
  orderHint: 0,
  sceneItemId: "scene_item_1",
  sceneRef: "scene_worship_wide",
  snapshotAt: "2026-06-17T08:05:00.000Z",
  sourceRef: "source_lower_third",
  tenantId: "tenant_1",
  visibleHint: true
} as const;

const streamState = {
  connectionProfileId: "connection_1",
  lastActionIntentRef: "action_intent_1",
  lastTransitionActorId: "actor_1",
  lastTransitionAt: "2026-06-17T08:10:00.000Z",
  streamStatus: "active",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:10:00.000Z"
} as const;

const recordingState = {
  connectionProfileId: "connection_1",
  lastTransitionActorId: "actor_1",
  lastTransitionAt: "2026-06-17T08:10:00.000Z",
  recordingStatus: "inactive",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:10:00.000Z"
} as const;

const confirmation = {
  confirmed: true,
  confirmedAt: "2026-06-17T08:09:00.000Z",
  confirmedByRef: "actor_1",
  reason: "Service starting — going live."
} as const;

const requestedStartStream = {
  actionIntentId: "action_intent_1",
  affectsLiveOutput: true,
  connectionProfileId: "connection_1",
  createdAt: "2026-06-17T08:08:00.000Z",
  kind: "start-stream",
  origin: "human",
  requestedByRef: "actor_1",
  status: "requested",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:08:00.000Z"
} as const;

const confirmedStartStream = {
  ...requestedStartStream,
  confirmation,
  status: "confirmed",
  updatedAt: "2026-06-17T08:09:00.000Z"
} as const;

const switchSceneIntent = {
  actionIntentId: "action_intent_2",
  affectsLiveOutput: true,
  connectionProfileId: "connection_1",
  createdAt: "2026-06-17T08:08:00.000Z",
  kind: "switch-scene",
  origin: "human",
  requestedByRef: "actor_1",
  status: "requested",
  targetSceneRef: "scene_worship_wide",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:08:00.000Z"
} as const;

const actionLogEntry = {
  actionIntentRef: "action_intent_1",
  actorId: "actor_1",
  connectionProfileId: "connection_1",
  logEntryId: "log_entry_1",
  occurredAt: "2026-06-17T08:09:00.000Z",
  outcome: "confirmed",
  reason: "Service starting — going live.",
  tenantId: "tenant_1"
} as const;

describe("OBS persistence contracts", () => {
  it("accepts a valid connection profile record", () => {
    expect(ObsConnectionProfilePersistenceRecordSchema.parse(connectionProfile)).toEqual(
      connectionProfile
    );
  });

  it("rejects an unknown connection profile field", () => {
    expect(() =>
      ObsConnectionProfilePersistenceRecordSchema.parse({
        ...connectionProfile,
        extra: true
      })
    ).toThrow();
  });

  it("rejects every secret/credential key on a connection profile (no-secrets)", () => {
    for (const secretKey of [
      "host",
      "port",
      "password",
      "token",
      "authToken",
      "streamKey",
      "secret"
    ]) {
      expect(() =>
        ObsConnectionProfilePersistenceRecordSchema.parse({
          ...connectionProfile,
          [secretKey]: "leaked-secret-value"
        })
      ).toThrow();
    }
  });

  it("requires the obs schema version on the connection profile", () => {
    expect(() =>
      ObsConnectionProfilePersistenceRecordSchema.parse({
        ...connectionProfile,
        schemaVersion: "obs.v2"
      })
    ).toThrow();
  });

  it("accepts valid scene, source, and scene-item snapshot records", () => {
    expect(ObsScenePersistenceRecordSchema.parse(scene)).toEqual(scene);
    expect(ObsSourcePersistenceRecordSchema.parse(source)).toEqual(source);
    expect(ObsSceneItemPersistenceRecordSchema.parse(sceneItem)).toEqual(sceneItem);
  });

  it("rejects an unknown field on a scene record", () => {
    expect(() => ObsScenePersistenceRecordSchema.parse({ ...scene, extra: 1 })).toThrow();
  });

  it("accepts coarse stream and recording state records", () => {
    expect(ObsStreamStatePersistenceRecordSchema.parse(streamState)).toEqual(streamState);
    expect(ObsRecordingStatePersistenceRecordSchema.parse(recordingState)).toEqual(
      recordingState
    );
  });

  it("rejects high-frequency telemetry columns on stream state (coarse only)", () => {
    for (const telemetryKey of ["bitrate", "uptime", "droppedFrames", "fps"]) {
      expect(() =>
        ObsStreamStatePersistenceRecordSchema.parse({
          ...streamState,
          [telemetryKey]: 1
        })
      ).toThrow();
    }
  });

  it("accepts a requested human start-stream intent", () => {
    expect(ObsActionIntentPersistenceRecordSchema.parse(requestedStartStream)).toEqual(
      requestedStartStream
    );
  });

  it("accepts a confirmed start-stream intent carrying a confirmation", () => {
    expect(ObsActionIntentPersistenceRecordSchema.parse(confirmedStartStream)).toEqual(
      confirmedStartStream
    );
  });

  it("rejects affectsLiveOutput = false on an action intent", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        affectsLiveOutput: false
      })
    ).toThrow("affectsLiveOutput must be true");
  });

  it("rejects advancing to confirmed without a recorded confirmation (confirm-before-dispatch)", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        status: "confirmed"
      })
    ).toThrow("only with a recorded human confirmation");
  });

  it("rejects advancing to dispatched without a recorded confirmation", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        status: "dispatched"
      })
    ).toThrow("only with a recorded human confirmation");
  });

  it("rejects a requested intent that already carries a confirmation", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        confirmation
      })
    ).toThrow("must not already carry a confirmation");
  });

  it("rejects an ai-suggested intent self-advancing past requested without confirmation", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        origin: "ai-suggested",
        status: "dispatched"
      })
    ).toThrow();
  });

  it("rejects a switch-scene intent missing its target scene ref", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...switchSceneIntent,
        targetSceneRef: undefined
      })
    ).toThrow("switch-scene requires targetSceneRef");
  });

  it("rejects a start-stream intent carrying a target ref", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        targetSceneRef: "scene_worship_wide"
      })
    ).toThrow("must not carry targetSceneRef");
  });

  it("rejects a safeFailureMessage when the intent did not fail", () => {
    expect(() =>
      ObsActionIntentPersistenceRecordSchema.parse({
        ...requestedStartStream,
        safeFailureMessage: "redacted"
      })
    ).toThrow("only when status is failed");
  });

  it("accepts an append-only action log entry", () => {
    expect(ObsActionLogEntryPersistenceRecordSchema.parse(actionLogEntry)).toEqual(
      actionLogEntry
    );
    expect(AppendObsActionLogEntryPersistenceInputSchema.parse(actionLogEntry)).toEqual(
      actionLogEntry
    );
  });

  it("rejects a safeMessage on a non-failed action log entry", () => {
    expect(() =>
      ObsActionLogEntryPersistenceRecordSchema.parse({
        ...actionLogEntry,
        safeMessage: "redacted"
      })
    ).toThrow("only when outcome is failed");
  });

  it("accepts a status transition to confirmed carrying a confirmation", () => {
    const transition = {
      actionIntentId: "action_intent_1",
      confirmation,
      status: "confirmed",
      updatedAt: "2026-06-17T08:09:00.000Z"
    } as const;

    expect(SetObsActionIntentStatusPersistenceInputSchema.parse(transition)).toEqual(
      transition
    );
  });

  it("rejects a status transition to dispatched without a confirmation", () => {
    expect(() =>
      SetObsActionIntentStatusPersistenceInputSchema.parse({
        actionIntentId: "action_intent_1",
        status: "dispatched",
        updatedAt: "2026-06-17T08:10:00.000Z"
      })
    ).toThrow("only with a recorded human confirmation");
  });

  it("accepts a catalog snapshot with a single program scene", () => {
    const snapshot = {
      connectionProfileId: "connection_1",
      sceneItems: [sceneItem],
      scenes: [scene],
      sources: [source]
    } as const;

    expect(ReplaceObsCatalogSnapshotPersistenceInputSchema.parse(snapshot)).toEqual(
      snapshot
    );
  });

  it("rejects a catalog snapshot with more than one program scene", () => {
    expect(() =>
      ReplaceObsCatalogSnapshotPersistenceInputSchema.parse({
        connectionProfileId: "connection_1",
        sceneItems: [],
        scenes: [
          scene,
          {
            ...scene,
            obsSceneRef: "scene_announcements",
            sceneId: "scene_2"
          }
        ],
        sources: []
      })
    ).toThrow("At most one scene may be the current program scene");
  });

  it("rejects a catalog snapshot whose scene targets a different connection", () => {
    expect(() =>
      ReplaceObsCatalogSnapshotPersistenceInputSchema.parse({
        connectionProfileId: "connection_1",
        sceneItems: [],
        scenes: [{ ...scene, connectionProfileId: "connection_2" }],
        sources: []
      })
    ).toThrow("share the snapshot connectionProfileId");
  });

  it("requires an actor on write options", () => {
    expect(() =>
      ObsPersistenceWriteOptionsSchema.parse({
        context: { requestId: "request_1", tenantId: "tenant_1" },
        intent: "update"
      })
    ).toThrow("require an actor");
  });
});
