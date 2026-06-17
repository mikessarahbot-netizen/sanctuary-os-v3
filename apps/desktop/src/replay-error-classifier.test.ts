import { describe, expect, it } from "vitest";
import type { PresenterLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import { PresenterNetworkReplayError } from "./network-command-service.js";
import { createPresenterReplayErrorClassifier } from "./replay-error-classifier.js";

const entry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 1,
  baseRevision: "revision_4",
  createdAt: "2026-06-17T05:00:00.000Z",
  lastAttemptedAt: "2026-06-17T05:01:00.000Z",
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_1", title: "Sunday" }
  },
  presentationId: "presentation_1",
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "replaying",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T05:01:00.000Z"
};

const networkError = (
  code: string,
  extensions: Readonly<Record<string, unknown>> = {}
): PresenterNetworkReplayError =>
  new PresenterNetworkReplayError("mutation failed", [
    { extensions: { code, ...extensions }, message: "failed" }
  ]);

describe("createPresenterReplayErrorClassifier", () => {
  it("classifies a known conflict code as a conflict with mapped details", () => {
    const classify = createPresenterReplayErrorClassifier();

    const classification = classify(
      networkError("STALE_PRESENTATION", { serverRevision: "revision_9" }),
      entry
    );

    expect(classification).toEqual({
      conflict: {
        conflictKind: "stale-presentation",
        localBaseRevision: "revision_4",
        safeMessage:
          "This presentation changed on the server since the edit was made. Please review it.",
        serverRevision: "revision_9"
      },
      kind: "conflict"
    });
  });

  it("maps each known conflict code to its conflict kind", () => {
    const classify = createPresenterReplayErrorClassifier();
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["MISSING_SLIDE", "missing-slide"],
      ["THEME_MISMATCH", "theme-mismatch"],
      ["OUTPUT_TARGET_MISMATCH", "output-target-mismatch"],
      ["VALIDATION_FAILED", "validation-failed"],
      ["AUTHORIZATION_FAILED", "authorization-failed"]
    ];

    for (const [code, kind] of cases) {
      const classification = classify(networkError(code), entry);
      expect(classification.kind).toBe("conflict");
      if (classification.kind === "conflict") {
        expect(classification.conflict.conflictKind).toBe(kind);
        expect(classification.conflict.serverRevision).toBe("unknown");
      }
    }
  });

  it("classifies an unknown error code as retryable failure", () => {
    const classify = createPresenterReplayErrorClassifier();

    const classification = classify(networkError("INTERNAL_SERVER_ERROR"), entry);

    expect(classification).toEqual({
      kind: "failed",
      safeErrorMessage: "This edit could not be synced yet and will be retried automatically."
    });
  });

  it("classifies a non-network error as retryable failure with a custom message", () => {
    const classify = createPresenterReplayErrorClassifier({
      safeErrorMessage: "Offline — will retry."
    });

    const classification = classify(new Error("socket hang up"), entry);

    expect(classification).toEqual({ kind: "failed", safeErrorMessage: "Offline — will retry." });
  });
});
