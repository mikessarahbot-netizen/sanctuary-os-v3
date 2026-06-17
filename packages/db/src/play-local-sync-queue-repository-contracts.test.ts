import { describe, expect, it } from "vitest";
import {
  EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema,
  MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema,
  PlayLocalSyncQueueEntryPersistenceRecordSchema,
  PlayLocalSyncQueueStatusTransitionPersistenceSchema,
  type PlayLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const tenantId = "tenant_1";
const timestamp = "2026-06-17T08:00:00.000Z";

const baseEntry: PlayLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  createdAt: timestamp,
  operation: {
    operation: "updateTrackSetMembers",
    payload: {
      trackRefs: [{ muted: false, role: "stem", trackRef: "media_stem" }],
      trackSetId: "track_set_1"
    }
  },
  queuedAt: timestamp,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "pending",
  tenantId,
  trackSetId: "track_set_1",
  updatedAt: timestamp
};

describe("Play local sync queue entry record", () => {
  it("accepts a valid pending entry", () => {
    expect(PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(baseEntry)).toEqual(baseEntry);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, extra: true })
    ).toThrow();
  });

  it("requires the play queue schema version", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        schemaVersion: "play-local-sync-queue.v2"
      })
    ).toThrow();
  });

  it("rejects an unknown status value", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, status: "queued" })
    ).toThrow();
  });

  it("rejects an operation outside the non-destructive Play union", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        operation: {
          operation: "removePlayCue",
          payload: { cueId: "cue_1", trackSetId: "track_set_1" }
        }
      })
    ).toThrow();
  });

  it("rejects a negative attempt count", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, attemptCount: -1 })
    ).toThrow();
  });

  it("rejects a non-integer attempt count", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, attemptCount: 1.5 })
    ).toThrow();
  });

  it("rejects a tenant mismatch between entry and queued payload", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        operation: {
          operation: "saveTrackSet",
          payload: {
            createdAt: timestamp,
            defaultKey: "G",
            schemaVersion: "play.v1",
            songRef: "song_1",
            tempoBpm: 120,
            tenantId: "tenant_other",
            trackRefs: [],
            trackSetId: "track_set_1",
            updatedAt: timestamp
          }
        }
      })
    ).toThrow("tenant must match");
  });

  it("rejects a track-set mismatch between entry and queued payload", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        operation: {
          operation: "updateTrackSetMembers",
          payload: {
            trackRefs: [{ muted: false, role: "stem", trackRef: "media_stem" }],
            trackSetId: "track_set_other"
          }
        }
      })
    ).toThrow("track set must match");
  });

  it("accepts an arrangement save entry without a track-set id", () => {
    const arrangementEntry: PlayLocalSyncQueueEntryPersistenceRecord = {
      ...baseEntry,
      operation: {
        operation: "savePlayArrangement",
        payload: {
          arrangementRef: "arrangement_1",
          defaultKey: "G",
          label: "Acoustic",
          sectionOrder: ["verse-1", "chorus-1"],
          songRef: "song_1",
          tempoBpm: 120,
          tenantId
        }
      },
      trackSetId: undefined
    };

    expect(PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(arrangementEntry)).toEqual(
      arrangementEntry
    );
  });

  it("requires a safe error message on failed entries", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        attemptCount: 1,
        lastAttemptedAt: timestamp,
        status: "failed"
      })
    ).toThrow("require a safe error message");
  });

  it("rejects a safe error message on non-failed entries", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        safeErrorMessage: "boom"
      })
    ).toThrow("allowed only on failed entries");
  });

  it("rejects backoff metadata on non-failed entries", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        nextAttemptAt: "2026-06-17T09:00:00.000Z"
      })
    ).toThrow("allowed only on failed entries");
  });

  it("accepts a failed entry with attempt, backoff, and error metadata", () => {
    const failedEntry: PlayLocalSyncQueueEntryPersistenceRecord = {
      ...baseEntry,
      attemptCount: 2,
      lastAttemptedAt: "2026-06-17T08:30:00.000Z",
      nextAttemptAt: "2026-06-17T09:00:00.000Z",
      safeErrorMessage: "Sync failed; will retry.",
      status: "failed"
    };

    expect(PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(failedEntry)).toEqual(failedEntry);
  });

  it("rejects a last-attempt timestamp with a zero attempt count", () => {
    expect(() =>
      PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        lastAttemptedAt: timestamp
      })
    ).toThrow("must record an attempt count");
  });
});

describe("Play local sync queue status transitions", () => {
  it("allows pending to in-flight", () => {
    expect(
      PlayLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "pending",
        to: "in-flight",
        transitionedAt: timestamp
      }).to
    ).toBe("in-flight");
  });

  it("allows in-flight to failed", () => {
    expect(() =>
      PlayLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "in-flight",
        to: "failed",
        transitionedAt: timestamp
      })
    ).not.toThrow();
  });

  it("rejects a transition out of a terminal synced status", () => {
    expect(() =>
      PlayLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "synced",
        to: "pending",
        transitionedAt: timestamp
      })
    ).toThrow("transition is not allowed");
  });

  it("rejects an illegal pending to synced jump", () => {
    expect(() =>
      PlayLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "pending",
        to: "synced",
        transitionedAt: timestamp
      })
    ).toThrow("transition is not allowed");
  });
});

describe("Play local sync queue operation inputs", () => {
  it("requires pending status to enqueue", () => {
    expect(() =>
      EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema.parse({
        entry: { ...baseEntry, attemptCount: 1, lastAttemptedAt: timestamp, status: "in-flight" }
      })
    ).toThrow("requires pending status");
  });

  it("requires a zero attempt count to enqueue", () => {
    expect(() =>
      EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema.parse({
        entry: { ...baseEntry, attemptCount: 3 }
      })
    ).toThrow();
  });

  it("requires the failure input to transition to failed", () => {
    expect(() =>
      MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema.parse({
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "boom",
        transition: { from: "in-flight", to: "synced", transitionedAt: timestamp }
      })
    ).toThrow();
  });

  it("accepts a failure input with optional backoff", () => {
    expect(
      MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema.parse({
        nextAttemptAt: "2026-06-17T09:00:00.000Z",
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "boom",
        transition: { from: "in-flight", to: "failed", transitionedAt: timestamp }
      }).nextAttemptAt
    ).toBe("2026-06-17T09:00:00.000Z");
  });
});
