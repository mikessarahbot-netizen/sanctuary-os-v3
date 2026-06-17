import { describe, expect, it } from "vitest";
import type { PlayLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import { PlayNetworkReplayError } from "./play-network-command-service.js";
import { createPlayReplayErrorClassifier } from "./play-replay-error-classifier.js";

const entry: PlayLocalSyncQueueEntryPersistenceRecord = {
  actorId: "musician_1",
  attemptCount: 1,
  createdAt: "2026-06-17T05:00:00.000Z",
  lastAttemptedAt: "2026-06-17T05:01:00.000Z",
  operation: {
    operation: "setPlaybackState",
    payload: {
      clickEnabled: true,
      positionBeats: 0,
      tenantId: "tenant_1",
      trackSetId: "track_set_1",
      transportStatus: "stopped",
      updatedAt: "2026-06-17T05:00:00.000Z"
    }
  },
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "in-flight",
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T05:01:00.000Z"
};

const networkError = (
  code: string,
  extensions: Readonly<Record<string, unknown>> = {}
): PlayNetworkReplayError =>
  new PlayNetworkReplayError("mutation failed", [
    { extensions: { code, ...extensions }, message: "failed" }
  ]);

describe("createPlayReplayErrorClassifier", () => {
  it("classifies a known Play domain code as a terminal failure with a redacted message", () => {
    const classify = createPlayReplayErrorClassifier();

    const classification = classify(networkError("TRACK_SET_NOT_FOUND"), entry);

    expect(classification).toEqual({
      kind: "terminal",
      safeErrorMessage:
        "A track set this edit depends on no longer exists on the server. Please review it."
    });
  });

  it("maps each known terminal code to a terminal classification", () => {
    const classify = createPlayReplayErrorClassifier();
    const codes = [
      "TRACK_SET_NOT_FOUND",
      "ARRANGEMENT_NOT_FOUND",
      "SECTION_NOT_FOUND",
      "CUE_NOT_FOUND",
      "PAD_LAYER_NOT_FOUND",
      "PLAYBACK_STATE_NOT_FOUND",
      "VALIDATION_FAILED",
      "AUTHORIZATION_FAILED"
    ] as const;

    for (const code of codes) {
      const classification = classify(networkError(code), entry);
      expect(classification.kind).toBe("terminal");
      expect(classification.safeErrorMessage.length).toBeGreaterThan(0);
    }
  });

  it("classifies an unknown error code as a retryable failure", () => {
    const classify = createPlayReplayErrorClassifier();

    const classification = classify(networkError("INTERNAL_SERVER_ERROR"), entry);

    expect(classification).toEqual({
      kind: "retryable",
      safeErrorMessage: "This edit could not be synced yet and will be retried automatically."
    });
  });

  it("classifies a non-network error as a retryable failure with a custom message", () => {
    const classify = createPlayReplayErrorClassifier({
      retryableSafeErrorMessage: "Offline — will retry."
    });

    const classification = classify(new Error("socket hang up"), entry);

    expect(classification).toEqual({
      kind: "retryable",
      safeErrorMessage: "Offline — will retry."
    });
  });
});
