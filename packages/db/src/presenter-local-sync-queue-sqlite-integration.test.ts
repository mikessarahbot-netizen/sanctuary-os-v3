import { describe, expect, it } from "vitest";
import {
  PresenterLocalSyncQueueMigration,
  createPresenterLocalSyncQueueSqlRepository,
  createSqliteExecutor,
  type PresenterLocalSyncConflictDetailPersistence,
  type PresenterLocalSyncQueueEntryPersistenceRecord,
  type SqliteBindValue,
  type SqliteDatabaseClient
} from "./index.js";

/**
 * The local sync queue is backed by SQLite in production. Node ships an
 * in-process engine (`node:sqlite`) on recent versions, so this smoke runs
 * against a real engine when available and skips cleanly otherwise — it needs
 * no external server, connection string, or secret.
 */
const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const tenantId = "tenant_live_1";

const baseQueuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_live_1",
  attemptCount: 0,
  baseRevision: "revision_7",
  createdAt: "2026-06-17T03:00:00.000Z",
  operation: {
    operation: "updatePresentation",
    payload: {
      presentationId: "presentation_live_1",
      title: "Live Gathering"
    }
  },
  presentationId: "presentation_live_1",
  queuedAt: "2026-06-17T03:00:00.000Z",
  queueEntryId: "queue_entry_live_1",
  requestId: "request_live_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt: "2026-06-17T03:00:00.000Z"
};

const readOptions = {
  context: { actorId: "actor_live_1", requestId: "request_read", tenantId }
} as const;

const writeOptions = {
  context: { actorId: "actor_live_1", requestId: "request_write", tenantId },
  intent: "update"
} as const;

const wrapDatabaseClient = (
  database: InstanceType<NonNullable<typeof nodeSqlite>["DatabaseSync"]>
): SqliteDatabaseClient => ({
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters: readonly SqliteBindValue[]): readonly Record<string, unknown>[] =>
        statement.all(...parameters),
      run: (...parameters: readonly SqliteBindValue[]) => {
        const result = statement.run(...parameters);

        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        };
      }
    };
  }
});

describe("Presenter local sync queue SQLite integration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt(
    "runs the queue lifecycle through a real SQLite engine",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        database.exec(PresenterLocalSyncQueueMigration.upSql);

        const repository = createPresenterLocalSyncQueueSqlRepository({
          executor: createSqliteExecutor({ database: wrapDatabaseClient(database) })
        });

        await expect(
          repository.enqueue({
            input: { entry: baseQueuedEntry },
            options: writeOptions
          })
        ).resolves.toEqual({ entry: baseQueuedEntry });

        // Duplicate primary keys must surface as a rejection from the real engine.
        await expect(
          repository.enqueue({
            input: { entry: baseQueuedEntry },
            options: writeOptions
          })
        ).rejects.toThrow();

        await expect(
          repository.getById({
            input: { queueEntryId: "queue_entry_live_1" },
            options: readOptions
          })
        ).resolves.toEqual(baseQueuedEntry);

        await expect(
          repository.listReadyForReplay({ input: {}, options: readOptions })
        ).resolves.toEqual([baseQueuedEntry]);

        const replaying = await repository.markReplaying({
          input: {
            queueEntryId: "queue_entry_live_1",
            transition: {
              from: "queued",
              to: "replaying",
              transitionedAt: "2026-06-17T03:01:00.000Z"
            }
          },
          options: writeOptions
        });
        expect(replaying.entry.status).toBe("replaying");
        expect(replaying.entry.attemptCount).toBe(1);

        const conflict: PresenterLocalSyncConflictDetailPersistence = {
          conflictKind: "stale-presentation",
          localBaseRevision: "revision_7",
          safeMessage: "Server changed since this edit was queued.",
          serverRevision: "revision_8"
        };
        const conflicted = await repository.markConflict({
          input: {
            conflict,
            queueEntryId: "queue_entry_live_1",
            transition: {
              from: "replaying",
              to: "conflict",
              transitionedAt: "2026-06-17T03:02:00.000Z"
            }
          },
          options: writeOptions
        });
        expect(conflicted.entry.conflict).toEqual(conflict);

        // A conflicted entry blocks its presentation from replay.
        await expect(
          repository.listReadyForReplay({ input: {}, options: readOptions })
        ).resolves.toEqual([]);

        // Requeue must clear conflict detail to satisfy the table CHECK constraint.
        const requeued = await repository.requeue({
          input: {
            queueEntryId: "queue_entry_live_1",
            transition: {
              from: "conflict",
              to: "queued",
              transitionedAt: "2026-06-17T03:03:00.000Z"
            }
          },
          options: writeOptions
        });
        expect(requeued.entry.status).toBe("queued");
        expect(requeued.entry.conflict).toBeUndefined();

        const reReplaying = await repository.markReplaying({
          input: {
            queueEntryId: "queue_entry_live_1",
            transition: {
              from: "queued",
              to: "replaying",
              transitionedAt: "2026-06-17T03:04:00.000Z"
            }
          },
          options: writeOptions
        });
        expect(reReplaying.entry.attemptCount).toBe(2);

        await repository.markSynced({
          input: {
            queueEntryId: "queue_entry_live_1",
            transition: {
              from: "replaying",
              to: "synced",
              transitionedAt: "2026-06-17T03:05:00.000Z"
            }
          },
          options: writeOptions
        });

        await expect(
          repository.cleanupSyncedAndCancelled({
            input: { olderThan: "2026-06-17T04:00:00.000Z" },
            options: writeOptions
          })
        ).resolves.toEqual({ removedCount: 1 });

        await expect(
          repository.getById({
            input: { queueEntryId: "queue_entry_live_1" },
            options: readOptions
          })
        ).resolves.toBeNull();
      } finally {
        database.close();
      }
    }
  );
});
