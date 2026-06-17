import { describe, expect, it } from "vitest";
import {
  ChartsInitialMigrationIndexNames,
  ChartsInitialMigrationTableNames,
  ChartsInitialSchemaMigration,
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
