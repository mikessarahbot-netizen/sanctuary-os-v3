import { describe, expect, it } from "vitest";
import {
  ChartsLocalSyncQueueMigration,
  createChartsLocalSyncQueueSqlRepository,
  createSqliteExecutor,
  type ChartsLocalSyncQueueEntryPersistenceRecord,
  type SqliteBindValue,
  type SqliteDatabaseClient
} from "./index.js";

/**
 * The Charts local sync queue is backed by SQLite on the offline-first mobile
 * client. Node ships an in-process engine (`node:sqlite`) on recent versions, so
 * this smoke runs against a real engine when available and skips cleanly
 * otherwise — it needs no external server, connection string, or secret.
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

const baseEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_live_1",
  attemptCount: 0,
  chartId: "chart_live_1",
  createdAt: "2026-06-17T03:00:00.000Z",
  operation: {
    operation: "setMusicianChartPreference",
    payload: {
      capo: 2,
      chartId: "chart_live_1",
      chordsVisible: true,
      fontScale: 1.25,
      instrument: "guitar",
      musicianId: "musician_live_1",
      tenantId,
      transposeSemitones: -2,
      updatedAt: "2026-06-17T03:00:00.000Z"
    }
  },
  queuedAt: "2026-06-17T03:00:00.000Z",
  queueEntryId: "queue_entry_live_1",
  requestId: "request_live_1",
  schemaVersion: "charts-local-sync-queue.v1",
  status: "pending",
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

describe("Charts local sync queue SQLite integration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("runs the queue lifecycle through a real SQLite engine", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(ChartsLocalSyncQueueMigration.upSql);

      const repository = createChartsLocalSyncQueueSqlRepository({
        executor: createSqliteExecutor({ database: wrapDatabaseClient(database) })
      });

      await expect(
        repository.enqueue({ input: { entry: baseEntry }, options: writeOptions })
      ).resolves.toEqual({ entry: baseEntry });

      // Duplicate primary keys must surface as a rejection from the real engine.
      await expect(
        repository.enqueue({ input: { entry: baseEntry }, options: writeOptions })
      ).rejects.toThrow();

      await expect(
        repository.getById({
          input: { queueEntryId: "queue_entry_live_1" },
          options: readOptions
        })
      ).resolves.toEqual(baseEntry);

      await expect(
        repository.listPending({ input: {}, options: readOptions })
      ).resolves.toEqual([baseEntry]);

      const inFlight = await repository.markInFlight({
        input: {
          queueEntryId: "queue_entry_live_1",
          transition: { from: "pending", to: "in-flight", transitionedAt: "2026-06-17T03:01:00.000Z" }
        },
        options: writeOptions
      });
      expect(inFlight.entry.status).toBe("in-flight");
      expect(inFlight.entry.attemptCount).toBe(1);

      // An in-flight entry is no longer pending.
      await expect(
        repository.listPending({ input: {}, options: readOptions })
      ).resolves.toEqual([]);

      const failed = await repository.markFailed({
        input: {
          nextAttemptAt: "2026-06-17T03:05:00.000Z",
          queueEntryId: "queue_entry_live_1",
          safeErrorMessage: "Sync failed; will retry.",
          transition: { from: "in-flight", to: "failed", transitionedAt: "2026-06-17T03:02:00.000Z" }
        },
        options: writeOptions
      });
      expect(failed.entry.status).toBe("failed");
      expect(failed.entry.nextAttemptAt).toBe("2026-06-17T03:05:00.000Z");

      // Requeue must clear failure metadata to satisfy the table CHECK constraint.
      const requeued = await repository.requeue({
        input: {
          queueEntryId: "queue_entry_live_1",
          transition: { from: "failed", to: "pending", transitionedAt: "2026-06-17T03:03:00.000Z" }
        },
        options: writeOptions
      });
      expect(requeued.entry.status).toBe("pending");
      expect(requeued.entry.safeErrorMessage).toBeUndefined();
      expect(requeued.entry.nextAttemptAt).toBeUndefined();

      const reInFlight = await repository.markInFlight({
        input: {
          queueEntryId: "queue_entry_live_1",
          transition: { from: "pending", to: "in-flight", transitionedAt: "2026-06-17T03:04:00.000Z" }
        },
        options: writeOptions
      });
      expect(reInFlight.entry.attemptCount).toBe(2);

      await repository.markSynced({
        input: {
          queueEntryId: "queue_entry_live_1",
          transition: { from: "in-flight", to: "synced", transitionedAt: "2026-06-17T03:06:00.000Z" }
        },
        options: writeOptions
      });

      await expect(
        repository.pruneSynced({
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
  });
});
