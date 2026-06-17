import { describe, expect, it } from "vitest";
import {
  ChartsInitialMigrationIndexNames,
  ChartsInitialMigrationTableNames,
  ChartsInitialSchemaMigration,
  ChartsLocalSyncQueueMigration,
  ChartsLocalSyncQueueMigrationIndexNames,
  ChartsLocalSyncQueueMigrationTableNames,
  ChartsSqlMigrations,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

describe("Charts initial migration artifact", () => {
  it("declares the charts tables and indexes", () => {
    expect(ChartsInitialSchemaMigration.requiredTables).toEqual([
      ...ChartsInitialMigrationTableNames
    ]);
    expect(ChartsInitialSchemaMigration.requiredIndexes).toEqual([
      ...ChartsInitialMigrationIndexNames
    ]);
    expect(ChartsInitialSchemaMigration.tenantScopedTables).toEqual([
      ...ChartsInitialMigrationTableNames
    ]);
  });

  it("creates each table and index in the forward SQL", () => {
    for (const table of ChartsInitialMigrationTableNames) {
      expect(ChartsInitialSchemaMigration.upSql).toContain(`CREATE TABLE ${table} (`);
    }
    for (const index of ChartsInitialMigrationIndexNames) {
      expect(ChartsInitialSchemaMigration.upSql).toContain(`CREATE INDEX ${index}`);
    }
  });

  it("enforces the schema version, annotation kind, and instrument constraints", () => {
    expect(ChartsInitialSchemaMigration.upSql).toContain("schema_version = 'charts.v1'");
    expect(ChartsInitialSchemaMigration.upSql).toContain(
      "kind IN ('highlight', 'note', 'repeat', 'section-marker')"
    );
    expect(ChartsInitialSchemaMigration.upSql).toContain(
      "instrument IN ('guitar', 'piano', 'bass', 'vocal', 'other')"
    );
    expect(ChartsInitialSchemaMigration.upSql).toContain("chords_visible IN (0, 1)");
  });

  it("drops every index and table in the rollback SQL", () => {
    for (const index of ChartsInitialMigrationIndexNames) {
      expect(ChartsInitialSchemaMigration.downSql).toContain(`DROP INDEX IF EXISTS ${index}`);
    }
    for (const table of ChartsInitialMigrationTableNames) {
      expect(ChartsInitialSchemaMigration.downSql).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("has a stable checksum derived from its SQL", () => {
    expect(ChartsInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(ChartsInitialSchemaMigration)
    );
    expect(ChartsInitialSchemaMigration.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
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

describe("Charts initial migration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("applies, enforces constraints, and rolls back against node:sqlite", () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(ChartsInitialSchemaMigration.upSql);

      database
        .prepare(
          `INSERT INTO charts (tenant_id, chart_id, song_id, default_key, chord_pro_source, schema_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("tenant_1", "chart_1", "song_1", "G", "[G]hi", "charts.v1", "t", "t");

      expect(() =>
        database
          .prepare(
            `INSERT INTO charts (tenant_id, chart_id, song_id, default_key, chord_pro_source, schema_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run("tenant_1", "chart_bad", "song_1", "G", "x", "charts.v2", "t", "t")
      ).toThrow();

      expect(() =>
        database
          .prepare(
            `INSERT INTO chart_annotations (tenant_id, annotation_id, chart_id, musician_id, section_index, line_index, kind, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run("tenant_1", "annotation_bad", "chart_1", "musician_1", 0, 0, "note", "t", "t")
      ).toThrow();

      database.exec(ChartsInitialSchemaMigration.downSql);

      const tableCount = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'charts'")
        .all();
      expect(tableCount).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe("Charts local sync queue migration artifact", () => {
  it("defines a valid SQL artifact with a stable checksum", () => {
    expect(SqlMigrationArtifactSchema.parse(ChartsLocalSyncQueueMigration)).toEqual(
      ChartsLocalSyncQueueMigration
    );
    expect(ChartsLocalSyncQueueMigration.transactional).toBe(true);
    expect(ChartsLocalSyncQueueMigration.checksum).toBe(
      calculateSqlMigrationChecksum(ChartsLocalSyncQueueMigration)
    );
  });

  it("declares the queue table and replay indexes with tenant scope", () => {
    expect(ChartsLocalSyncQueueMigration.requiredTables).toEqual([
      ...ChartsLocalSyncQueueMigrationTableNames
    ]);
    expect(ChartsLocalSyncQueueMigration.tenantScopedTables).toEqual([
      ...ChartsLocalSyncQueueMigrationTableNames
    ]);
    expect(ChartsLocalSyncQueueMigration.requiredIndexes).toEqual([
      ...ChartsLocalSyncQueueMigrationIndexNames
    ]);

    for (const table of ChartsLocalSyncQueueMigrationTableNames) {
      expect(ChartsLocalSyncQueueMigration.upSql).toContain(`CREATE TABLE ${table} (`);
    }
    for (const index of ChartsLocalSyncQueueMigrationIndexNames) {
      expect(ChartsLocalSyncQueueMigration.upSql).toContain(`CREATE INDEX ${index}`);
    }
  });

  it("enforces the queue schema version, operation, and status constraints", () => {
    expect(ChartsLocalSyncQueueMigration.upSql).toContain(
      "schema_version = 'charts-local-sync-queue.v1'"
    );
    expect(ChartsLocalSyncQueueMigration.upSql).toContain(
      "status IN ('pending', 'in-flight', 'failed', 'synced')"
    );
    expect(ChartsLocalSyncQueueMigration.upSql).toContain("'setMusicianChartPreference'");
  });

  it("is included in the ordered Charts migration list", () => {
    expect(ChartsSqlMigrations).toEqual([
      ChartsInitialSchemaMigration,
      ChartsLocalSyncQueueMigration
    ]);
  });

  it("drops every queue index and table in the rollback SQL", () => {
    for (const index of ChartsLocalSyncQueueMigrationIndexNames) {
      expect(ChartsLocalSyncQueueMigration.downSql).toContain(`DROP INDEX IF EXISTS ${index}`);
    }
    for (const table of ChartsLocalSyncQueueMigrationTableNames) {
      expect(ChartsLocalSyncQueueMigration.downSql).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });
});

describe("Charts local sync queue migration smoke", () => {
  liveIt("applies the queue table and enforces its constraints against node:sqlite", () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");
    const insertSql = `INSERT INTO charts_local_sync_queue_entries
      (tenant_id, queue_entry_id, actor_id, request_id, operation, payload_json, status, safe_error_message, attempt_count, queued_at, next_attempt_at, schema_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const payloadJson =
      '{"operation":"updateChartSource","payload":{"chartId":"chart_1","chordProSource":"[G]hi"}}';

    try {
      database.exec(ChartsLocalSyncQueueMigration.upSql);

      database
        .prepare(insertSql)
        .run(
          "tenant_1",
          "queue_entry_1",
          "actor_1",
          "request_1",
          "updateChartSource",
          payloadJson,
          "pending",
          null,
          0,
          "t",
          null,
          "charts-local-sync-queue.v1",
          "t",
          "t"
        );

      // An unknown status must be rejected by the CHECK constraint.
      expect(() =>
        database
          .prepare(insertSql)
          .run(
            "tenant_1",
            "queue_entry_bad_status",
            "actor_1",
            "request_1",
            "updateChartSource",
            payloadJson,
            "queued",
            null,
            0,
            "t",
            null,
            "charts-local-sync-queue.v1",
            "t",
            "t"
          )
      ).toThrow();

      // A failed entry without a safe error message must be rejected.
      expect(() =>
        database
          .prepare(insertSql)
          .run(
            "tenant_1",
            "queue_entry_bad_failed",
            "actor_1",
            "request_1",
            "updateChartSource",
            payloadJson,
            "failed",
            null,
            1,
            "t",
            null,
            "charts-local-sync-queue.v1",
            "t",
            "t"
          )
      ).toThrow();

      // Backoff metadata is only valid on failed entries.
      expect(() =>
        database
          .prepare(insertSql)
          .run(
            "tenant_1",
            "queue_entry_bad_backoff",
            "actor_1",
            "request_1",
            "updateChartSource",
            payloadJson,
            "pending",
            null,
            0,
            "t",
            "later",
            "charts-local-sync-queue.v1",
            "t",
            "t"
          )
      ).toThrow();

      database.exec(ChartsLocalSyncQueueMigration.downSql);

      const remaining = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'charts_local_sync_queue_entries'"
        )
        .all();
      expect(remaining).toEqual([]);
    } finally {
      database.close();
    }
  });
});
