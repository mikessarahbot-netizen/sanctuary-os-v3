import { describe, expect, it } from "vitest";
import {
  ObsActionIntentSchema,
  ObsActionLogEntrySchema,
  ObsConnectionProfileSchema,
  ObsRecordingStateSchema,
  ObsSceneItemSchema,
  ObsSceneSchema,
  ObsSourceSchema,
  ObsStreamStateSchema,
  parseObsActionIntent,
  parseObsConnectionProfile
} from "./schemas.js";

const ISO = "2026-06-18T10:00:00.000Z";
const ISO_LATER = "2026-06-18T11:00:00.000Z";

const baseConnectionProfile = {
  connectionProfileId: "conn-1",
  connectionRef: "vault://obs/conn-1",
  connectionStatus: "connected",
  createdAt: ISO,
  label: "Sanctuary Stage OBS",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseScene = {
  connectionProfileId: "conn-1",
  displayName: "Worship Wide",
  isCurrentProgramScene: true,
  obsSceneRef: "scene-worship-wide",
  orderHint: 0,
  sceneId: "scene-1",
  snapshotAt: ISO,
  tenantId: "tenant-1"
} as const;

const baseSource = {
  connectionProfileId: "conn-1",
  kindLabel: "browser_source",
  obsSourceRef: "source-lyrics",
  snapshotAt: ISO,
  sourceId: "source-1",
  tenantId: "tenant-1"
} as const;

const baseSceneItem = {
  connectionProfileId: "conn-1",
  obsSceneItemId: "item-7",
  orderHint: 0,
  sceneItemId: "scene-item-1",
  sceneRef: "scene-worship-wide",
  snapshotAt: ISO,
  sourceRef: "source-lyrics",
  tenantId: "tenant-1",
  visibleHint: true
} as const;

const baseStreamState = {
  connectionProfileId: "conn-1",
  streamStatus: "inactive",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseRecordingState = {
  connectionProfileId: "conn-1",
  recordingStatus: "inactive",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const confirmation = {
  confirmed: true,
  confirmedAt: ISO_LATER,
  confirmedByRef: "actor-1",
  reason: "Service is starting; go live."
} as const;

const baseRequestedAction = {
  actionIntentId: "action-1",
  affectsLiveOutput: true,
  connectionProfileId: "conn-1",
  createdAt: ISO,
  kind: "start-stream",
  origin: "human",
  requestedByRef: "actor-1",
  status: "requested",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseLogEntry = {
  actionIntentRef: "action-1",
  actorId: "actor-1",
  connectionProfileId: "conn-1",
  logEntryId: "log-1",
  occurredAt: ISO,
  outcome: "requested",
  reason: "Operator requested start-stream.",
  tenantId: "tenant-1"
} as const;

describe("ObsConnectionProfileSchema", () => {
  it("accepts a valid opaque-ref-only profile", () => {
    expect(parseObsConnectionProfile(baseConnectionProfile).connectionRef).toBe(
      "vault://obs/conn-1"
    );
  });

  it("rejects an empty label", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({ ...baseConnectionProfile, label: "" })
        .success
    ).toBe(false);
  });

  it("rejects an empty connectionRef", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        connectionRef: ""
      }).success
    ).toBe(false);
  });

  it("rejects an unknown connectionStatus", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        connectionStatus: "connecting"
      }).success
    ).toBe(false);
  });
});

describe("ObsConnectionProfile no-secrets posture (strict, structural)", () => {
  // The single most important domain invariant: no credential field can ever be
  // attached to a connection profile. `.strict()` makes the absence structural.
  it("rejects a host key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        host: "192.168.1.50"
      }).success
    ).toBe(false);
  });

  it("rejects a port key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({ ...baseConnectionProfile, port: 4455 })
        .success
    ).toBe(false);
  });

  it("rejects a password key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        password: "hunter2"
      }).success
    ).toBe(false);
  });

  it("rejects a token key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        token: "obs-auth-token"
      }).success
    ).toBe(false);
  });

  it("rejects a streamKey key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        streamKey: "rtmp-stream-key"
      }).success
    ).toBe(false);
  });

  it("rejects a generic secret key", () => {
    expect(
      ObsConnectionProfileSchema.safeParse({
        ...baseConnectionProfile,
        secret: "anything"
      }).success
    ).toBe(false);
  });
});

describe("every OBS record rejects credential keys (strict, no secrets anywhere)", () => {
  const secretKeys = ["host", "port", "password", "token", "streamKey", "secret"];
  const records = [
    { name: "ObsConnectionProfile", schema: ObsConnectionProfileSchema, base: baseConnectionProfile },
    { name: "ObsScene", schema: ObsSceneSchema, base: baseScene },
    { name: "ObsSource", schema: ObsSourceSchema, base: baseSource },
    { name: "ObsSceneItem", schema: ObsSceneItemSchema, base: baseSceneItem },
    { name: "ObsStreamState", schema: ObsStreamStateSchema, base: baseStreamState },
    { name: "ObsRecordingState", schema: ObsRecordingStateSchema, base: baseRecordingState },
    { name: "ObsActionIntent", schema: ObsActionIntentSchema, base: baseRequestedAction },
    { name: "ObsActionLogEntry", schema: ObsActionLogEntrySchema, base: baseLogEntry }
  ] as const;

  for (const record of records) {
    for (const secretKey of secretKeys) {
      it(`${record.name} rejects a ${secretKey} key`, () => {
        expect(
          record.schema.safeParse({ ...record.base, [secretKey]: "x" }).success
        ).toBe(false);
      });
    }
  }
});

describe("ObsScene / ObsSource / ObsSceneItem", () => {
  it("accepts a valid scene", () => {
    expect(ObsSceneSchema.safeParse(baseScene).success).toBe(true);
  });

  it("rejects an empty scene displayName", () => {
    expect(ObsSceneSchema.safeParse({ ...baseScene, displayName: "" }).success).toBe(
      false
    );
  });

  it("rejects a negative scene orderHint", () => {
    expect(ObsSceneSchema.safeParse({ ...baseScene, orderHint: -1 }).success).toBe(
      false
    );
  });

  it("accepts a source with optional coarse hints omitted", () => {
    expect(ObsSourceSchema.safeParse(baseSource).success).toBe(true);
  });

  it("accepts a source with coarse hints present", () => {
    expect(
      ObsSourceSchema.safeParse({ ...baseSource, activeHint: true, mutedHint: false })
        .success
    ).toBe(true);
  });

  it("accepts a valid scene-item and rejects a negative orderHint", () => {
    expect(ObsSceneItemSchema.safeParse(baseSceneItem).success).toBe(true);
    expect(
      ObsSceneItemSchema.safeParse({ ...baseSceneItem, orderHint: -1 }).success
    ).toBe(false);
  });
});

describe("ObsStreamState / ObsRecordingState (coarse only)", () => {
  it("accepts a coarse stream state", () => {
    expect(ObsStreamStateSchema.safeParse(baseStreamState).success).toBe(true);
  });

  it("rejects a high-frequency telemetry field (bitrate)", () => {
    expect(
      ObsStreamStateSchema.safeParse({ ...baseStreamState, bitrate: 4500 }).success
    ).toBe(false);
  });

  it("rejects an unknown streamStatus", () => {
    expect(
      ObsStreamStateSchema.safeParse({ ...baseStreamState, streamStatus: "live" })
        .success
    ).toBe(false);
  });

  it("accepts the paused recording status", () => {
    expect(
      ObsRecordingStateSchema.safeParse({
        ...baseRecordingState,
        recordingStatus: "paused"
      }).success
    ).toBe(true);
  });

  it("rejects a recording file-path field", () => {
    expect(
      ObsRecordingStateSchema.safeParse({
        ...baseRecordingState,
        filePath: "/tmp/rec.mkv"
      }).success
    ).toBe(false);
  });
});

describe("ObsActionIntent per-kind target-ref invariants", () => {
  it("accepts a valid requested start-stream", () => {
    expect(parseObsActionIntent(baseRequestedAction).kind).toBe("start-stream");
  });

  it("rejects affectsLiveOutput = false", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        affectsLiveOutput: false
      }).success
    ).toBe(false);
  });

  it("requires targetSceneRef on switch-scene", () => {
    expect(
      ObsActionIntentSchema.safeParse({ ...baseRequestedAction, kind: "switch-scene" })
        .success
    ).toBe(false);
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        kind: "switch-scene",
        targetSceneRef: "scene-worship-wide"
      }).success
    ).toBe(true);
  });

  it("requires source + scene-item + desiredVisible on toggle-source-visibility", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        kind: "toggle-source-visibility",
        targetSourceRef: "source-lyrics"
      }).success
    ).toBe(false);
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        desiredVisible: true,
        kind: "toggle-source-visibility",
        targetSceneItemId: "item-7",
        targetSourceRef: "source-lyrics"
      }).success
    ).toBe(true);
  });

  it("requires source + desiredMuted on toggle-source-mute", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        kind: "toggle-source-mute",
        targetSourceRef: "source-lyrics"
      }).success
    ).toBe(false);
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        desiredMuted: true,
        kind: "toggle-source-mute",
        targetSourceRef: "source-lyrics"
      }).success
    ).toBe(true);
  });

  it("rejects target refs on a start-stream", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        targetSceneRef: "scene-worship-wide"
      }).success
    ).toBe(false);
  });

  it("rejects desiredMuted on a switch-scene (wrong-kind extra)", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        desiredMuted: true,
        kind: "switch-scene",
        targetSceneRef: "scene-worship-wide"
      }).success
    ).toBe(false);
  });
});

describe("ObsActionIntent confirmation-gate invariants", () => {
  it("rejects a confirmed status without a confirmation", () => {
    expect(
      ObsActionIntentSchema.safeParse({ ...baseRequestedAction, status: "confirmed" })
        .success
    ).toBe(false);
  });

  it("rejects a dispatched status without a confirmation", () => {
    expect(
      ObsActionIntentSchema.safeParse({ ...baseRequestedAction, status: "dispatched" })
        .success
    ).toBe(false);
  });

  it("accepts a confirmed status with a recorded confirmation", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        confirmation,
        status: "confirmed"
      }).success
    ).toBe(true);
  });

  it("rejects a requested action that already carries a confirmation", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        confirmation,
        status: "requested"
      }).success
    ).toBe(false);
  });

  it("rejects confirmed = false in a confirmation object", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        confirmation: { ...confirmation, confirmed: false },
        status: "confirmed"
      }).success
    ).toBe(false);
  });
});

describe("ObsActionIntent origin / failure invariants", () => {
  it("accepts an ai-suggested action only at requested", () => {
    expect(
      ObsActionIntentSchema.safeParse({ ...baseRequestedAction, origin: "ai-suggested" })
        .success
    ).toBe(true);
  });

  it("rejects an ai-suggested action self-advanced past requested without a confirmation", () => {
    // status `dispatched` is not gate-covered by a present confirmation here:
    // the action carries none, so the ai-suggested-cannot-self-advance rule and
    // the confirmation-required rule both reject it.
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        origin: "ai-suggested",
        status: "confirmed"
      }).success
    ).toBe(false);
  });

  it("accepts an ai-suggested action at confirmed once a human confirmation is recorded", () => {
    // AI proposes, a human confirms: the origin stays ai-suggested but a human
    // confirmation has authorized the advance. (Mirrors Community+ ai-drafted.)
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        confirmation,
        origin: "ai-suggested",
        status: "confirmed"
      }).success
    ).toBe(true);
  });

  it("rejects a safeFailureMessage when status is not failed", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        safeFailureMessage: "Port unreachable."
      }).success
    ).toBe(false);
  });

  it("accepts a safeFailureMessage on a failed action", () => {
    expect(
      ObsActionIntentSchema.safeParse({
        ...baseRequestedAction,
        confirmation,
        safeFailureMessage: "Port unreachable.",
        status: "failed"
      }).success
    ).toBe(true);
  });
});

describe("ObsActionLogEntry (append-only audit)", () => {
  it("accepts a valid log entry", () => {
    expect(ObsActionLogEntrySchema.safeParse(baseLogEntry).success).toBe(true);
  });

  it("rejects a safeMessage when outcome is not failed", () => {
    expect(
      ObsActionLogEntrySchema.safeParse({ ...baseLogEntry, safeMessage: "boom" })
        .success
    ).toBe(false);
  });

  it("accepts a safeMessage on a failed outcome", () => {
    expect(
      ObsActionLogEntrySchema.safeParse({
        ...baseLogEntry,
        outcome: "failed",
        safeMessage: "Port unreachable."
      }).success
    ).toBe(true);
  });

  it("rejects an empty reason", () => {
    expect(
      ObsActionLogEntrySchema.safeParse({ ...baseLogEntry, reason: "" }).success
    ).toBe(false);
  });
});
