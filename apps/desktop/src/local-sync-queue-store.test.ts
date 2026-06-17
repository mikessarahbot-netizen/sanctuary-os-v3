import { describe, expect, it } from "vitest";
import type {
  PresenterLocalSyncQueueEntryPersistenceRecord,
  SqliteBindValue,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import { createPresenterDesktopLocalSyncQueueStore } from "./local-sync-queue-store.js";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const tenantId = "tenant_desktop_1";

const wrapMigrationClient = (
  database: InstanceType<NonNullable<typeof nodeSqlite>["DatabaseSync"]>
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
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

const queuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_desktop_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: "2026-06-17T05:00:00.000Z",
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_desktop_1", title: "Desktop Gathering" }
  },
  presentationId: "presentation_desktop_1",
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_desktop_1",
  requestId: "request_desktop_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt: "2026-06-17T05:00:00.000Z"
};

describe("createPresenterDesktopLocalSyncQueueStore", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("migrates the store and round-trips through the composed repository", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const store = await createPresenterDesktopLocalSyncQueueStore({
        clock: () => "2026-06-17T05:00:00.000Z",
        database: wrapMigrationClient(database)
      });

      expect(store.migrations).toEqual([
        { migrationId: "202606170002_presenter_local_sync_queue", outcome: "applied" }
      ]);

      const writeOptions = {
        context: {
          actorId: "actor_desktop_1",
          requestId: "request_write",
          tenantId
        },
        intent: "update" as const
      };

      await expect(
        store.repository.enqueue({ input: { entry: queuedEntry }, options: writeOptions })
      ).resolves.toEqual({ entry: queuedEntry });

      await expect(
        store.repository.getById({
          input: { queueEntryId: "queue_entry_desktop_1" },
          options: { context: { actorId: "actor_desktop_1", requestId: "request_read", tenantId } }
        })
      ).resolves.toEqual(queuedEntry);

      // A second composition is idempotent: the migration is already applied.
      const second = await createPresenterDesktopLocalSyncQueueStore({
        clock: () => "2026-06-17T05:10:00.000Z",
        database: wrapMigrationClient(database)
      });
      expect(second.migrations).toEqual([
        { migrationId: "202606170002_presenter_local_sync_queue", outcome: "skipped" }
      ]);
    } finally {
      database.close();
    }
  });
});
