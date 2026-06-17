import { describe, expect, it } from "vitest";
import {
  ChartsLocalSyncQueueEntryPersistenceRecordSchema,
  ChartsLocalSyncQueueStatusTransitionPersistenceSchema,
  EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema,
  MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema,
  type ChartsLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const tenantId = "tenant_1";
const timestamp = "2026-06-17T08:00:00.000Z";

const baseEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  chartId: "chart_1",
  createdAt: timestamp,
  operation: {
    operation: "updateChartSource",
    payload: {
      chartId: "chart_1",
      chordProSource: "[G]Hello"
    }
  },
  queuedAt: timestamp,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "charts-local-sync-queue.v1",
  status: "pending",
  tenantId,
  updatedAt: timestamp
};

describe("Charts local sync queue entry record", () => {
  it("accepts a valid pending entry", () => {
    expect(ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse(baseEntry)).toEqual(baseEntry);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, extra: true })
    ).toThrow();
  });

  it("requires the charts queue schema version", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        schemaVersion: "charts-local-sync-queue.v2"
      })
    ).toThrow();
  });

  it("rejects an unknown status value", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, status: "queued" })
    ).toThrow();
  });

  it("rejects a negative attempt count", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, attemptCount: -1 })
    ).toThrow();
  });

  it("rejects a non-integer attempt count", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({ ...baseEntry, attemptCount: 1.5 })
    ).toThrow();
  });

  it("rejects a tenant mismatch between entry and queued payload", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        operation: {
          operation: "saveChart",
          payload: {
            chartId: "chart_1",
            chordProSource: "[G]Hello",
            createdAt: timestamp,
            defaultKey: "G",
            schemaVersion: "charts.v1",
            songRef: "song_1",
            tenantId: "tenant_other",
            updatedAt: timestamp
          }
        }
      })
    ).toThrow("tenant must match");
  });

  it("rejects a chart mismatch between entry and queued payload", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        operation: {
          operation: "updateChartSource",
          payload: { chartId: "chart_other", chordProSource: "[G]Hello" }
        }
      })
    ).toThrow("chart must match");
  });

  it("accepts an arrangement save entry without a chart id", () => {
    const arrangementEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
      ...baseEntry,
      chartId: undefined,
      operation: {
        operation: "saveChartArrangement",
        payload: {
          arrangementRef: "arrangement_1",
          capo: 2,
          defaultKey: "G",
          label: "Acoustic",
          sectionOrder: ["verse-1", "chorus-1"],
          songRef: "song_1",
          tenantId
        }
      }
    };

    expect(ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse(arrangementEntry)).toEqual(
      arrangementEntry
    );
  });

  it("requires a safe error message on failed entries", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        attemptCount: 1,
        lastAttemptedAt: timestamp,
        status: "failed"
      })
    ).toThrow("require a safe error message");
  });

  it("rejects a safe error message on non-failed entries", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        safeErrorMessage: "boom"
      })
    ).toThrow("allowed only on failed entries");
  });

  it("rejects backoff metadata on non-failed entries", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        nextAttemptAt: "2026-06-17T09:00:00.000Z"
      })
    ).toThrow("allowed only on failed entries");
  });

  it("accepts a failed entry with attempt, backoff, and error metadata", () => {
    const failedEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
      ...baseEntry,
      attemptCount: 2,
      lastAttemptedAt: "2026-06-17T08:30:00.000Z",
      nextAttemptAt: "2026-06-17T09:00:00.000Z",
      safeErrorMessage: "Sync failed; will retry.",
      status: "failed"
    };

    expect(ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse(failedEntry)).toEqual(
      failedEntry
    );
  });

  it("rejects a last-attempt timestamp with a zero attempt count", () => {
    expect(() =>
      ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...baseEntry,
        lastAttemptedAt: timestamp
      })
    ).toThrow("must record an attempt count");
  });
});

describe("Charts local sync queue status transitions", () => {
  it("allows pending to in-flight", () => {
    expect(
      ChartsLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "pending",
        to: "in-flight",
        transitionedAt: timestamp
      }).to
    ).toBe("in-flight");
  });

  it("allows in-flight to failed", () => {
    expect(() =>
      ChartsLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "in-flight",
        to: "failed",
        transitionedAt: timestamp
      })
    ).not.toThrow();
  });

  it("rejects a transition out of a terminal synced status", () => {
    expect(() =>
      ChartsLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "synced",
        to: "pending",
        transitionedAt: timestamp
      })
    ).toThrow("transition is not allowed");
  });

  it("rejects an illegal pending to synced jump", () => {
    expect(() =>
      ChartsLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "pending",
        to: "synced",
        transitionedAt: timestamp
      })
    ).toThrow("transition is not allowed");
  });
});

describe("Charts local sync queue operation inputs", () => {
  it("requires pending status to enqueue", () => {
    expect(() =>
      EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema.parse({
        entry: { ...baseEntry, attemptCount: 1, lastAttemptedAt: timestamp, status: "in-flight" }
      })
    ).toThrow("requires pending status");
  });

  it("requires a zero attempt count to enqueue", () => {
    expect(() =>
      EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema.parse({
        entry: { ...baseEntry, attemptCount: 3 }
      })
    ).toThrow();
  });

  it("requires the failure input to transition to failed", () => {
    expect(() =>
      MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema.parse({
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "boom",
        transition: { from: "in-flight", to: "synced", transitionedAt: timestamp }
      })
    ).toThrow();
  });

  it("accepts a failure input with optional backoff", () => {
    expect(
      MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema.parse({
        nextAttemptAt: "2026-06-17T09:00:00.000Z",
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "boom",
        transition: { from: "in-flight", to: "failed", transitionedAt: timestamp }
      }).nextAttemptAt
    ).toBe("2026-06-17T09:00:00.000Z");
  });
});
