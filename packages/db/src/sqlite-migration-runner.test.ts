import { describe, expect, it } from "vitest";
import {
  PresenterLocalSyncQueueMigration,
  createSqliteMigrationRunner,
  planSqliteMigrationApply,
  type MigrationRecord,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "./index.js";

const migration = PresenterLocalSyncQueueMigration;

describe("planSqliteMigrationApply", () => {
  it("plans an apply when no record exists", () => {
    const plan = planSqliteMigrationApply([], [migration]);

    expect(plan.map((step) => step.outcome)).toEqual(["apply"]);
  });

  it("skips a migration already applied with a matching checksum", () => {
    const applied: MigrationRecord = {
      appliedAt: "2026-06-17T03:00:00.000Z",
      checksum: migration.checksum,
      migrationId: migration.migrationId,
      state: "applied"
    };

    expect(planSqliteMigrationApply([applied], [migration]).map((step) => step.outcome)).toEqual([
      "skip"
    ]);
  });

  it("throws on checksum drift for an applied migration", () => {
    const drifted: MigrationRecord = {
      checksum: "fnv1a32:deadbeef",
      migrationId: migration.migrationId,
      state: "applied"
    };

    expect(() => planSqliteMigrationApply([drifted], [migration])).toThrow(
      "checksum drift detected"
    );
  });

  it("re-applies a migration that was previously rolled back", () => {
    const rolledBack: MigrationRecord = {
      checksum: migration.checksum,
      migrationId: migration.migrationId,
      state: "rolled-back"
    };

    expect(
      planSqliteMigrationApply([rolledBack], [migration]).map((step) => step.outcome)
    ).toEqual(["apply"]);
  });
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

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

const tableExists = (
  database: InstanceType<NonNullable<typeof nodeSqlite>["DatabaseSync"]>,
  tableName: string
): boolean =>
  database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName).length > 0;

describe("SQLite migration runner smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("applies, skips on re-run, detects drift, and rolls back", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const runner = createSqliteMigrationRunner({
        clock: () => "2026-06-17T03:00:00.000Z",
        database: wrapMigrationClient(database)
      });

      await expect(runner.applyPending([migration])).resolves.toEqual([
        { migrationId: migration.migrationId, outcome: "applied" }
      ]);
      expect(tableExists(database, "presenter_local_sync_queue_entries")).toBe(true);

      // A second run is idempotent.
      await expect(runner.applyPending([migration])).resolves.toEqual([
        { migrationId: migration.migrationId, outcome: "skipped" }
      ]);

      await expect(runner.listApplied()).resolves.toEqual([
        {
          appliedAt: "2026-06-17T03:00:00.000Z",
          checksum: migration.checksum,
          migrationId: migration.migrationId,
          state: "applied"
        }
      ]);

      // A drifted artifact (same id, different checksum) is rejected.
      await expect(
        runner.applyPending([{ ...migration, checksum: "fnv1a32:deadbeef" }])
      ).rejects.toThrow("checksum drift detected");

      await expect(runner.rollback(migration)).resolves.toEqual({
        checksum: migration.checksum,
        migrationId: migration.migrationId,
        state: "rolled-back"
      });
      expect(tableExists(database, "presenter_local_sync_queue_entries")).toBe(false);

      await expect(runner.listApplied()).resolves.toEqual([
        {
          checksum: migration.checksum,
          migrationId: migration.migrationId,
          state: "rolled-back"
        }
      ]);
    } finally {
      database.close();
    }
  });
});
