import { describe, expect, it } from "vitest";
import {
  decidePlayLocalSyncQueueReplay,
  type PlayLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const queuedEntry = (
  overrides: Partial<PlayLocalSyncQueueEntryPersistenceRecord> & {
    readonly queueEntryId?: string;
    readonly trackSetId?: string;
  } = {}
): PlayLocalSyncQueueEntryPersistenceRecord => {
  const trackSetId = overrides.trackSetId ?? "track_set_1";

  return {
    actorId: "actor_1",
    attemptCount: 0,
    createdAt: "2026-06-17T03:00:00.000Z",
    operation: {
      operation: "setPlaybackState",
      payload: {
        clickEnabled: true,
        positionBeats: 0,
        tenantId: "tenant_1",
        trackSetId,
        transportStatus: "stopped",
        updatedAt: "2026-06-17T03:00:00.000Z"
      }
    },
    queuedAt: "2026-06-17T03:00:00.000Z",
    queueEntryId: "queue_entry_1",
    requestId: "request_1",
    schemaVersion: "play-local-sync-queue.v1",
    status: "pending",
    tenantId: "tenant_1",
    trackSetId,
    updatedAt: "2026-06-17T03:00:00.000Z",
    ...overrides
  };
};

describe("decidePlayLocalSyncQueueReplay", () => {
  it("rejects a policy whose backoff cap is below the base delay", () => {
    expect(() =>
      decidePlayLocalSyncQueueReplay([], {
        now: "2026-06-17T03:00:00.000Z",
        policy: { ...policy, backoffBaseSeconds: 90 }
      })
    ).toThrow("backoff cap");
  });

  it("marks a fresh pending entry eligible immediately", () => {
    const decision = decidePlayLocalSyncQueueReplay([queuedEntry()], {
      now: "2026-06-17T03:00:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.waiting).toEqual([]);
    expect(decision.exhausted).toEqual([]);
  });

  it("ignores entries that are not pending", () => {
    const decision = decidePlayLocalSyncQueueReplay(
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

    const decision = decidePlayLocalSyncQueueReplay([entry], {
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

    const decision = decidePlayLocalSyncQueueReplay([entry], {
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

    const decision = decidePlayLocalSyncQueueReplay([entry], {
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

    const decision = decidePlayLocalSyncQueueReplay([entry], {
      now: "2026-06-17T04:00:00.000Z",
      policy
    });

    expect(decision.exhausted.map((value) => value.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.eligible).toEqual([]);
    expect(decision.waiting).toEqual([]);
  });

  it("decides only the earliest pending entry per track set", () => {
    const head = queuedEntry({
      queueEntryId: "queue_entry_head",
      queuedAt: "2026-06-17T03:00:00.000Z"
    });
    const follower = queuedEntry({
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });

    const decision = decidePlayLocalSyncQueueReplay([follower, head], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_head"]);
  });

  it("decides track sets independently", () => {
    const first = queuedEntry({ queueEntryId: "queue_entry_t1", trackSetId: "track_set_1" });
    const second = queuedEntry({ queueEntryId: "queue_entry_t2", trackSetId: "track_set_2" });

    const decision = decidePlayLocalSyncQueueReplay([first, second], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId).sort()).toEqual([
      "queue_entry_t1",
      "queue_entry_t2"
    ]);
  });

  it("filters to a single track set when a track set id is supplied", () => {
    const first = queuedEntry({ queueEntryId: "queue_entry_t1", trackSetId: "track_set_1" });
    const second = queuedEntry({ queueEntryId: "queue_entry_t2", trackSetId: "track_set_2" });

    const decision = decidePlayLocalSyncQueueReplay([first, second], {
      now: "2026-06-17T03:05:00.000Z",
      policy,
      trackSetId: "track_set_2"
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_t2"]);
  });

  it("groups track-set-less arrangement saves under a per-tenant fallback key", () => {
    const arrangementPayload = {
      arrangementRef: "arrangement_1",
      defaultKey: "G",
      label: "Acoustic",
      sectionOrder: ["verse"],
      songRef: "song_1",
      tempoBpm: 120,
      tenantId: "tenant_1"
    };
    const head = queuedEntry({
      operation: { operation: "savePlayArrangement", payload: arrangementPayload },
      queueEntryId: "queue_entry_head",
      queuedAt: "2026-06-17T03:00:00.000Z"
    });
    const follower = queuedEntry({
      operation: { operation: "savePlayArrangement", payload: arrangementPayload },
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });
    delete head.trackSetId;
    delete follower.trackSetId;

    const decision = decidePlayLocalSyncQueueReplay([follower, head], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_head"]);
  });
});
