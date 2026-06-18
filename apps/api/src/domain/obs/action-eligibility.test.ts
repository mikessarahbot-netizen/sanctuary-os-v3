import { describe, expect, it } from "vitest";
import {
  checkActionEligibility,
  type ActionEligibilitySnapshot
} from "./action-eligibility.js";
import {
  parseObsActionIntent,
  parseObsConnectionProfile,
  parseObsRecordingState,
  parseObsScene,
  parseObsSceneItem,
  parseObsSource,
  parseObsStreamState,
  type ObsActionIntent,
  type ObsConnectionStatus,
  type ObsStreamStatus
} from "./schemas.js";

const ISO = "2026-06-18T10:00:00.000Z";

const buildSnapshot = (overrides?: {
  connectionStatus?: ObsConnectionStatus;
  streamStatus?: ObsStreamStatus;
}): ActionEligibilitySnapshot => ({
  connection: parseObsConnectionProfile({
    connectionProfileId: "conn-1",
    connectionRef: "vault://obs/conn-1",
    connectionStatus: overrides?.connectionStatus ?? "connected",
    createdAt: ISO,
    label: "Sanctuary Stage OBS",
    tenantId: "tenant-1",
    updatedAt: ISO
  }),
  recording: parseObsRecordingState({
    connectionProfileId: "conn-1",
    recordingStatus: "inactive",
    tenantId: "tenant-1",
    updatedAt: ISO
  }),
  sceneItems: [
    parseObsSceneItem({
      connectionProfileId: "conn-1",
      obsSceneItemId: "item-7",
      orderHint: 0,
      sceneItemId: "scene-item-1",
      sceneRef: "scene-worship-wide",
      snapshotAt: ISO,
      sourceRef: "source-lyrics",
      tenantId: "tenant-1",
      visibleHint: true
    })
  ],
  scenes: [
    parseObsScene({
      connectionProfileId: "conn-1",
      displayName: "Worship Wide",
      isCurrentProgramScene: true,
      obsSceneRef: "scene-worship-wide",
      orderHint: 0,
      sceneId: "scene-1",
      snapshotAt: ISO,
      tenantId: "tenant-1"
    })
  ],
  sources: [
    parseObsSource({
      connectionProfileId: "conn-1",
      kindLabel: "browser_source",
      obsSourceRef: "source-lyrics",
      snapshotAt: ISO,
      sourceId: "source-1",
      tenantId: "tenant-1"
    })
  ],
  stream: parseObsStreamState({
    connectionProfileId: "conn-1",
    streamStatus: overrides?.streamStatus ?? "inactive",
    tenantId: "tenant-1",
    updatedAt: ISO
  })
});

const intent = (overrides: Record<string, unknown>): ObsActionIntent =>
  parseObsActionIntent({
    actionIntentId: "action-1",
    affectsLiveOutput: true,
    connectionProfileId: "conn-1",
    createdAt: ISO,
    kind: "start-stream",
    origin: "human",
    requestedByRef: "actor-1",
    status: "requested",
    tenantId: "tenant-1",
    updatedAt: ISO,
    ...overrides
  });

describe("checkActionEligibility eligible cases", () => {
  it("allows start-stream when connected and inactive", () => {
    const result = checkActionEligibility(intent({ kind: "start-stream" }), buildSnapshot());

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("allows stop-stream when connected and active", () => {
    const result = checkActionEligibility(
      intent({ kind: "stop-stream" }),
      buildSnapshot({ streamStatus: "active" })
    );

    expect(result.eligible).toBe(true);
  });

  it("allows switch-scene to a known scene", () => {
    const result = checkActionEligibility(
      intent({ kind: "switch-scene", targetSceneRef: "scene-worship-wide" }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(true);
  });

  it("allows toggle-source-visibility for a known source + scene-item", () => {
    const result = checkActionEligibility(
      intent({
        desiredVisible: false,
        kind: "toggle-source-visibility",
        targetSceneItemId: "item-7",
        targetSourceRef: "source-lyrics"
      }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(true);
  });

  it("allows toggle-source-mute for a known source", () => {
    const result = checkActionEligibility(
      intent({
        desiredMuted: true,
        kind: "toggle-source-mute",
        targetSourceRef: "source-lyrics"
      }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(true);
  });
});

describe("checkActionEligibility flagged-ineligible reasons", () => {
  it("flags obs-disconnected when the connection is not connected", () => {
    const result = checkActionEligibility(
      intent({ kind: "start-stream" }),
      buildSnapshot({ connectionStatus: "disconnected" })
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("obs-disconnected");
  });

  it("flags already-streaming for start-stream while active", () => {
    const result = checkActionEligibility(
      intent({ kind: "start-stream" }),
      buildSnapshot({ streamStatus: "active" })
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("already-streaming");
  });

  it("flags not-streaming for stop-stream while inactive", () => {
    const result = checkActionEligibility(intent({ kind: "stop-stream" }), buildSnapshot());

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("not-streaming");
  });

  it("flags scene-not-found for switch-scene to an unknown scene", () => {
    const result = checkActionEligibility(
      intent({ kind: "switch-scene", targetSceneRef: "scene-does-not-exist" }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("scene-not-found");
  });

  it("flags source-not-found for toggle-source-mute on an unknown source", () => {
    const result = checkActionEligibility(
      intent({
        desiredMuted: true,
        kind: "toggle-source-mute",
        targetSourceRef: "source-unknown"
      }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("source-not-found");
  });

  it("flags scene-item-not-found for toggle-source-visibility on an unknown scene-item", () => {
    const result = checkActionEligibility(
      intent({
        desiredVisible: true,
        kind: "toggle-source-visibility",
        targetSceneItemId: "item-unknown",
        targetSourceRef: "source-lyrics"
      }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("scene-item-not-found");
  });

  it("flags connection-mismatch when the intent targets a different connection", () => {
    const result = checkActionEligibility(
      intent({ connectionProfileId: "conn-2", kind: "start-stream" }),
      buildSnapshot()
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("connection-mismatch");
  });

  it("accumulates multiple reasons (disconnected + already-streaming)", () => {
    const result = checkActionEligibility(
      intent({ kind: "start-stream" }),
      buildSnapshot({ connectionStatus: "unknown", streamStatus: "active" })
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("obs-disconnected");
    expect(result.reasons).toContain("already-streaming");
  });
});

describe("checkActionEligibility determinism", () => {
  it("returns equal results for identical inputs", () => {
    const sameIntent = intent({ kind: "switch-scene", targetSceneRef: "scene-x" });
    const snapshot = buildSnapshot();

    expect(checkActionEligibility(sameIntent, snapshot)).toEqual(
      checkActionEligibility(sameIntent, snapshot)
    );
  });

  it("does not duplicate a reason", () => {
    const result = checkActionEligibility(
      intent({ connectionProfileId: "conn-2", kind: "start-stream" }),
      buildSnapshot({ connectionStatus: "disconnected" })
    );

    const mismatchCount = result.reasons.filter(
      (reason) => reason === "connection-mismatch"
    ).length;
    expect(mismatchCount).toBe(1);
  });
});
