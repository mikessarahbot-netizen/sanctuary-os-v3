import { describe, expect, it } from "vitest";
import {
  decidePresenterLocalSyncQueueReplay,
  type PresenterLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const queuedEntry = (
  overrides: Partial<PresenterLocalSyncQueueEntryPersistenceRecord> & {
    readonly presentationId?: string;
    readonly queueEntryId?: string;
  } = {}
): PresenterLocalSyncQueueEntryPersistenceRecord => {
  const presentationId = overrides.presentationId ?? "presentation_1";

  return {
    actorId: "actor_1",
    attemptCount: 0,
    baseRevision: "revision_1",
    createdAt: "2026-06-17T03:00:00.000Z",
    operation: {
      operation: "updatePresentation",
      payload: { presentationId, title: "Title" }
    },
    presentationId,
    queuedAt: "2026-06-17T03:00:00.000Z",
    queueEntryId: "queue_entry_1",
    requestId: "request_1",
    schemaVersion: "presenter-local-sync-queue.v1",
    status: "queued",
    tenantId: "tenant_1",
    updatedAt: "2026-06-17T03:00:00.000Z",
    ...overrides
  };
};

describe("decidePresenterLocalSyncQueueReplay", () => {
  it("rejects a policy whose backoff cap is below the base delay", () => {
    expect(() =>
      decidePresenterLocalSyncQueueReplay([], {
        now: "2026-06-17T03:00:00.000Z",
        policy: { ...policy, backoffBaseSeconds: 90 }
      })
    ).toThrow("backoff cap");
  });

  it("marks a fresh queued entry eligible immediately", () => {
    const decision = decidePresenterLocalSyncQueueReplay([queuedEntry()], {
      now: "2026-06-17T03:00:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.waiting).toEqual([]);
    expect(decision.exhausted).toEqual([]);
  });

  it("holds a retried entry until its backoff window elapses", () => {
    const entry = queuedEntry({
      attemptCount: 1,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decidePresenterLocalSyncQueueReplay([entry], {
      now: "2026-06-17T03:00:05.000Z",
      policy
    });

    expect(decision.eligible).toEqual([]);
    expect(decision.waiting).toEqual([
      { entry, nextEligibleAt: "2026-06-17T03:00:10.000Z" }
    ]);
  });

  it("makes a retried entry eligible once its backoff window elapses", () => {
    const entry = queuedEntry({
      attemptCount: 1,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decidePresenterLocalSyncQueueReplay([entry], {
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

    const decision = decidePresenterLocalSyncQueueReplay([entry], {
      now: "2026-06-17T03:00:30.000Z",
      policy: { ...policy, maxAttempts: 20 }
    });

    // 10 * 2^4 = 160s, capped at 60s -> next eligible at 03:01:00.
    expect(decision.waiting).toEqual([
      { entry, nextEligibleAt: "2026-06-17T03:01:00.000Z" }
    ]);
  });

  it("surfaces an entry that has exhausted its attempt budget", () => {
    const entry = queuedEntry({
      attemptCount: 3,
      lastAttemptedAt: "2026-06-17T03:00:00.000Z"
    });

    const decision = decidePresenterLocalSyncQueueReplay([entry], {
      now: "2026-06-17T04:00:00.000Z",
      policy
    });

    expect(decision.exhausted.map((value) => value.queueEntryId)).toEqual(["queue_entry_1"]);
    expect(decision.eligible).toEqual([]);
  });

  it("decides only the earliest entry per presentation", () => {
    const head = queuedEntry({
      queueEntryId: "queue_entry_head",
      queuedAt: "2026-06-17T03:00:00.000Z"
    });
    const follower = queuedEntry({
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });

    const decision = decidePresenterLocalSyncQueueReplay([follower, head], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_head"]);
  });

  it("blocks a queued entry sitting behind a conflict for the same presentation", () => {
    const conflicted = queuedEntry({
      conflict: {
        conflictKind: "stale-presentation",
        localBaseRevision: "revision_1",
        safeMessage: "Server changed since this edit was queued.",
        serverRevision: "revision_2"
      },
      queueEntryId: "queue_entry_conflict",
      queuedAt: "2026-06-17T03:00:00.000Z",
      status: "conflict"
    });
    const follower = queuedEntry({
      queueEntryId: "queue_entry_follower",
      queuedAt: "2026-06-17T03:01:00.000Z"
    });

    const decision = decidePresenterLocalSyncQueueReplay([conflicted, follower], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible).toEqual([]);
    expect(decision.waiting).toEqual([]);
  });

  it("decides presentations independently", () => {
    const first = queuedEntry({
      presentationId: "presentation_1",
      queueEntryId: "queue_entry_p1"
    });
    const second = queuedEntry({
      presentationId: "presentation_2",
      queueEntryId: "queue_entry_p2"
    });

    const decision = decidePresenterLocalSyncQueueReplay([first, second], {
      now: "2026-06-17T03:05:00.000Z",
      policy
    });

    expect(decision.eligible.map((entry) => entry.queueEntryId).sort()).toEqual([
      "queue_entry_p1",
      "queue_entry_p2"
    ]);
  });
});
