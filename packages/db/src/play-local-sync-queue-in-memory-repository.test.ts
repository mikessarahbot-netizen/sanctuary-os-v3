import { describe, expect, it } from "vitest";
import {
  createInMemoryPlayLocalSyncQueueRepositoryAdapter,
  type PlayLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const tenantId = "tenant_1";
const queuedAt = "2026-06-17T01:00:00.000Z";
const transitionedAt = "2026-06-17T02:00:00.000Z";

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId },
  intent: "update"
} as const;

const makeEntry = (
  queueEntryId: string,
  overrides: Partial<PlayLocalSyncQueueEntryPersistenceRecord> = {}
): PlayLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "actor_1",
  attemptCount: 0,
  createdAt: queuedAt,
  operation: {
    operation: "updateTrackSetMembers",
    payload: {
      trackRefs: [{ muted: false, role: "stem", trackRef: "media_stem" }],
      trackSetId: "track_set_1"
    }
  },
  queuedAt,
  queueEntryId,
  requestId: "request_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "pending",
  tenantId,
  trackSetId: "track_set_1",
  updatedAt: queuedAt,
  ...overrides
});

describe("Play local sync queue in-memory repository", () => {
  it("enqueues, gets, and lists pending entries scoped to the tenant", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter();
    const entry = makeEntry("queue_entry_1");

    await expect(
      adapter.repository.enqueue({ input: { entry }, options: writeOptions })
    ).resolves.toEqual({ entry });

    await expect(
      adapter.repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: readOptions
      })
    ).resolves.toEqual(entry);

    await expect(
      adapter.repository.listPending({ input: {}, options: readOptions })
    ).resolves.toEqual([entry]);
  });

  it("isolates entries by tenant on reads", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [makeEntry("queue_entry_1")]
    });

    await expect(
      adapter.repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: {
          context: { actorId: "actor_2", requestId: "request_read", tenantId: "tenant_other" }
        }
      })
    ).resolves.toBeNull();

    await expect(
      adapter.repository.listPending({
        input: {},
        options: {
          context: { actorId: "actor_2", requestId: "request_read", tenantId: "tenant_other" }
        }
      })
    ).resolves.toEqual([]);
  });

  it("rejects a duplicate enqueue for the same tenant entry", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [makeEntry("queue_entry_1")]
    });

    await expect(
      adapter.repository.enqueue({
        input: { entry: makeEntry("queue_entry_1") },
        options: writeOptions
      })
    ).rejects.toThrow("already exists");
  });

  it("orders pending entries by queue position and honours the limit", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [
        makeEntry("queue_entry_b", { queuedAt: "2026-06-17T01:00:02.000Z" }),
        makeEntry("queue_entry_a", { queuedAt: "2026-06-17T01:00:01.000Z" })
      ]
    });

    const ordered = await adapter.repository.listPending({ input: {}, options: readOptions });
    expect(ordered.map((entry) => entry.queueEntryId)).toEqual([
      "queue_entry_a",
      "queue_entry_b"
    ]);

    const limited = await adapter.repository.listPending({
      input: { limit: 1 },
      options: readOptions
    });
    expect(limited.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_a"]);
  });

  it("filters pending entries by track-set id", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [
        makeEntry("queue_entry_1"),
        makeEntry("queue_entry_2", {
          operation: {
            operation: "updateTrackSetMembers",
            payload: {
              trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
              trackSetId: "track_set_2"
            }
          },
          trackSetId: "track_set_2"
        })
      ]
    });

    const filtered = await adapter.repository.listPending({
      input: { trackSetId: "track_set_2" },
      options: readOptions
    });
    expect(filtered.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_2"]);
  });

  it("runs the pending → in-flight → synced lifecycle and prunes", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [makeEntry("queue_entry_1")]
    });

    const inFlight = await adapter.repository.markInFlight({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "pending", to: "in-flight", transitionedAt }
      },
      options: writeOptions
    });
    expect(inFlight.entry.status).toBe("in-flight");
    expect(inFlight.entry.attemptCount).toBe(1);
    expect(inFlight.entry.lastAttemptedAt).toBe(transitionedAt);

    await expect(
      adapter.repository.listPending({ input: {}, options: readOptions })
    ).resolves.toEqual([]);

    const synced = await adapter.repository.markSynced({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "in-flight", to: "synced", transitionedAt: "2026-06-17T02:01:00.000Z" }
      },
      options: writeOptions
    });
    expect(synced.entry.status).toBe("synced");

    await expect(
      adapter.repository.pruneSynced({
        input: { olderThan: "2026-06-17T03:00:00.000Z" },
        options: writeOptions
      })
    ).resolves.toEqual({ removedCount: 1 });

    await expect(
      adapter.repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: readOptions
      })
    ).resolves.toBeNull();
  });

  it("records failure metadata and requeues back to pending", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [makeEntry("queue_entry_1")]
    });

    await adapter.repository.markInFlight({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "pending", to: "in-flight", transitionedAt }
      },
      options: writeOptions
    });

    const failed = await adapter.repository.markFailed({
      input: {
        nextAttemptAt: "2026-06-17T02:05:00.000Z",
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "Sync failed; will retry.",
        transition: { from: "in-flight", to: "failed", transitionedAt: "2026-06-17T02:01:00.000Z" }
      },
      options: writeOptions
    });
    expect(failed.entry.status).toBe("failed");
    expect(failed.entry.safeErrorMessage).toBe("Sync failed; will retry.");
    expect(failed.entry.nextAttemptAt).toBe("2026-06-17T02:05:00.000Z");

    const requeued = await adapter.repository.requeue({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "failed", to: "pending", transitionedAt: "2026-06-17T02:06:00.000Z" }
      },
      options: writeOptions
    });
    expect(requeued.entry.status).toBe("pending");
    expect(requeued.entry.safeErrorMessage).toBeUndefined();
    expect(requeued.entry.nextAttemptAt).toBeUndefined();
    expect(requeued.entry.attemptCount).toBe(1);
  });

  it("rejects a transition when the stored status does not match the requested from", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [makeEntry("queue_entry_1")]
    });

    await expect(
      adapter.repository.markSynced({
        input: {
          queueEntryId: "queue_entry_1",
          transition: { from: "in-flight", to: "synced", transitionedAt }
        },
        options: writeOptions
      })
    ).rejects.toThrow("did not match a tenant-scoped entry");
  });

  it("records each operation with actor, request, and tenant context", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter();

    await adapter.repository.enqueue({
      input: { entry: makeEntry("queue_entry_1") },
      options: writeOptions
    });
    await adapter.repository.listPending({ input: {}, options: readOptions });

    const operations = adapter.readOperations();
    expect(operations.map((operation) => operation.operationName)).toEqual([
      "enqueue",
      "listPending"
    ]);
    expect(operations[0]).toMatchObject({
      actorId: "actor_1",
      intent: "update",
      requestId: "request_write",
      tenantId
    });
  });

  it("counts entries by status scoped to the tenant", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter({
      entries: [
        makeEntry("queue_entry_pending_1"),
        makeEntry("queue_entry_pending_2"),
        makeEntry("queue_entry_in_flight", {
          attemptCount: 1,
          lastAttemptedAt: transitionedAt,
          status: "in-flight"
        }),
        makeEntry("queue_entry_failed", {
          attemptCount: 1,
          lastAttemptedAt: transitionedAt,
          safeErrorMessage: "Network was unavailable.",
          status: "failed"
        }),
        makeEntry("queue_entry_synced", { status: "synced" }),
        makeEntry("queue_entry_other_tenant", {
          status: "synced",
          tenantId: "tenant_other"
        })
      ]
    });

    await expect(
      adapter.repository.countByStatus({ input: {}, options: readOptions })
    ).resolves.toEqual({ failed: 1, inFlight: 1, pending: 2, synced: 1 });
  });

  it("counts an empty queue as all zeroes", async () => {
    const adapter = createInMemoryPlayLocalSyncQueueRepositoryAdapter();

    await expect(
      adapter.repository.countByStatus({ input: {}, options: readOptions })
    ).resolves.toEqual({ failed: 0, inFlight: 0, pending: 0, synced: 0 });
  });
});
