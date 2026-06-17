import { describe, expect, it } from "vitest";
import {
  decideChartsLocalSyncQueueReplay,
  type ChartsLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const queuedEntry = (
  overrides: Partial<ChartsLocalSyncQueueEntryPersistenceRecord> & {
    readonly chartId?: string;
    readonly queueEntryId?: string;
  } = {}
): ChartsLocalSyncQueueEntryPersistenceRecord => {
  const chartId = overrides.chartId ?? "chart_1";

  return {
    actorId: "actor_1",
    attemptCount: 0,
    chartId,
    createdAt: "2026-06-17T03:00:00.000Z",
    operation: {
      operation: "updateChartSource",
      payload: { chartId, chordProSource: "[G]Hello" }
    },
    queuedAt: "2026-06-17T03:00:00.000Z",
    queueEntryId: "queue_entry_1",
    requestId: "request_1",
    schemaVersion: "charts-local-sync-queue.v1",
    status: "pending",
    tenantId: "tenant_1",
    updatedAt: "2026-06-17T03:00:00.000Z",
    ...overrides
  };
};

describe("decideChartsLocalSyncQueueReplay", () => {
  it("rejects a policy whose backoff cap is below the base delay", () => {
    expect(() =>
      decideChartsLocalSyncQueueReplay([], {
        now: "2026-06-17T03:00:00.000Z",
        policy: { ...policy, backoffBaseSeconds: 90 }
      })
    ).toThrow("backoff cap");
  });

  it("marks a fresh pending entry eligible immediately", () => {
    const decision = decideChartsLocalSyncQueueReplay([queuedEntry()], {
      now: "2026-06-17T03:00:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.waiting).toEqual([]);
    expect(decision.exhausted).toEqual([]);
  });

  it("ignores entries that are not pending", () => {
    const decision = decideChartsLocalSyncQueueReplay(
      [
        queuedEntry({ queueEntryId: "queue_entry_synced", status: "synced" }),
        queuedEntry({
          attemptCount: 1,
          lastAttemptedAt: "2026-06-17T03:00:00.000Z",
          queueEntryId: "queue_entry_failed",
          safeErrorMessage: "Network was unavailable.",
          status: "failed"
        })
      ],
      { now: "2026-06-17T03:05:00.000Z", policy }
    );

    expect(decision).toEqual({ eligible: [], exhausted: [], waiting: [] });
  });

  it("holds a retried entry until its backoff window elapses", () => {
    const entry = queuedEntry({
      attemptCount: 1,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decideChartsLocalSyncQueueReplay([entry], {
      now: "2026-06-17T03:00:05.000Z",
      policy
    });

    expect(decision.eligible).toEqual([]);
    expect(decision.waiting).toEqual([
      { entry, nextEligibleAt: "2026-06-17T03:00:10.000Z" }
    ]);
  });

  it("makes a retried entry eligible exactly at its backoff boundary", () => {
    const entry = queuedEntry({
      attemptCount: 1,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decideChartsLocalSyncQueueReplay([entry], {
      now: "2026-06-17T03:00:10.000Z",
      policy
    });

    expect(decision.eligible.map((value) => value.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.waiting).toEqual([]);
  });

  it("grows the backoff window exponentially up to the cap", () => {
    const entry = queuedEntry({
      attemptCount: 5,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decideChartsLocalSyncQueueReplay([entry], {
      now: "2026-06-17T03:00:30.000Z",
      policy: { ...policy, maxAttempts: 20 }
    });

    // 10 * 2^4 = 160s, capped at 60s -> next eligible at 03:01:00.
    expect(decision.waiting).toEqual([
      { entry, nextEligibleAt: "2026-06-17T03:01:00.000Z" }
    ]);
  });

  it("surfaces an entry that has reached its attempt budget", () => {
    const entry = queuedEntry({
      attemptCount: 3,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decideChartsLocalSyncQueueReplay([entry], {
      now: "2026-06-17T04:00:00.000Z",
      policy
    });

    expect(decision.exhausted.map((value) => value.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.eligible).toEqual([]);
    expect(decision.waiting).toEqual([]);
  });

  it("decides only the earliest pending entry per chart", () => {
    const head = queuedEntry({
      queueEntryId: "queue_entry_head",
      queuedAt: "2026-06-17T03:00:00.000Z"
    });
    const follower = queuedEntry({
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });

    const decision = decideChartsLocalSyncQueueReplay([follower, head], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_head"]);
  });

  it("decides charts independently", () => {
    const first = queuedEntry({ chartId: "chart_1", queueEntryId: "queue_entry_c1" });
    const second = queuedEntry({ chartId: "chart_2", queueEntryId: "queue_entry_c2" });

    const decision = decideChartsLocalSyncQueueReplay([first, second], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId).sort()).toEqual([
      "queue_entry_c1",
      "queue_entry_c2"
    ]);
  });

  it("filters to a single chart when a chart id is supplied", () => {
    const first = queuedEntry({ chartId: "chart_1", queueEntryId: "queue_entry_c1" });
    const second = queuedEntry({ chartId: "chart_2", queueEntryId: "queue_entry_c2" });

    const decision = decideChartsLocalSyncQueueReplay([first, second], {
      chartId: "chart_2",
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_c2"]);
  });

  it("groups chart-less arrangement saves under a per-tenant fallback key", () => {
    const arrangementPayload = {
      arrangementRef: "arrangement_1",
      capo: 0,
      defaultKey: "G",
      label: "Acoustic",
      sectionOrder: ["verse"],
      songRef: "song_1",
      tenantId: "tenant_1"
    };
    const head = queuedEntry({
      operation: { operation: "saveChartArrangement", payload: arrangementPayload },
      queueEntryId: "queue_entry_head",
      queuedAt: "2026-06-17T03:00:00.000Z"
    });
    const follower = queuedEntry({
      operation: { operation: "saveChartArrangement", payload: arrangementPayload },
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });
    delete head.chartId;
    delete follower.chartId;

    const decision = decideChartsLocalSyncQueueReplay([follower, head], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_head"]);
  });
});
