import { describe, expect, it } from "vitest";
import {
  PlayInitialMigrationIndexNames,
  PlayInitialMigrationTableNames,
  PlayInitialSchemaMigration,
  PlaySqlMigrations,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

describe("Play initial migration artifact", () => {
  it("defines a valid SQL artifact with a stable checksum", () => {
    expect(SqlMigrationArtifactSchema.parse(PlayInitialSchemaMigration)).toEqual(
      PlayInitialSchemaMigration
    );
    expect(PlayInitialSchemaMigration.transactional).toBe(true);
    expect(PlayInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(PlayInitialSchemaMigration)
    );
    expect(PlayInitialSchemaMigration.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
  });

  it("declares the play tables and indexes with tenant scope", () => {
    expect(PlayInitialSchemaMigration.requiredTables).toEqual([
      ...PlayInitialMigrationTableNames
    ]);
    expect(PlayInitialSchemaMigration.requiredIndexes).toEqual([
      ...PlayInitialMigrationIndexNames
    ]);
    expect(PlayInitialSchemaMigration.tenantScopedTables).toEqual([
      ...PlayInitialMigrationTableNames
    ]);
  });

  it("creates each table and index in the forward SQL", () => {
    for (const table of PlayInitialMigrationTableNames) {
      expect(PlayInitialSchemaMigration.upSql).toContain(`CREATE TABLE ${table} (`);
    }
    for (const index of PlayInitialMigrationIndexNames) {
      expect(PlayInitialSchemaMigration.upSql).toContain(`CREATE INDEX ${index}`);
    }
  });

  it("enforces the schema version, enum, boolean, and bounds constraints", () => {
    expect(PlayInitialSchemaMigration.upSql).toContain("schema_version = 'play.v1'");
    expect(PlayInitialSchemaMigration.upSql).toContain("tempo_bpm > 0");
    expect(PlayInitialSchemaMigration.upSql).toContain("length_bars >= 0");
    expect(PlayInitialSchemaMigration.upSql).toContain("click_enabled_default IN (0, 1)");
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "kind IN ('intro', 'verse', 'prechorus', 'chorus', 'bridge', 'instrumental', 'tag', 'outro', 'other')"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "action IN ('play', 'stop', 'jump', 'pad-change', 'click-toggle')"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain("fire_mode IN ('manual', 'auto')");
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "action <> 'jump' OR target_section_ref IS NOT NULL"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "action <> 'pad-change' OR pad_layer_ref IS NOT NULL"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain("gain >= 0 AND gain <= 1");
    expect(PlayInitialSchemaMigration.upSql).toContain("loop IN (0, 1)");
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "transport_status IN ('stopped', 'playing', 'paused')"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain("position_beats >= 0");
    expect(PlayInitialSchemaMigration.upSql).toContain("click_enabled IN (0, 1)");
  });

  it("leads every table primary key with tenant_id", () => {
    expect(PlayInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, track_set_id)");
    expect(PlayInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, arrangement_ref)"
    );
    expect(PlayInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, section_id)");
    expect(PlayInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, cue_id)");
    expect(PlayInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, pad_layer_ref)");
  });

  it("drops every index and table in the rollback SQL", () => {
    for (const index of PlayInitialMigrationIndexNames) {
      expect(PlayInitialSchemaMigration.downSql).toContain(`DROP INDEX IF EXISTS ${index}`);
    }
    for (const table of PlayInitialMigrationTableNames) {
      expect(PlayInitialSchemaMigration.downSql).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("is included in the ordered Play migration list", () => {
    expect(PlaySqlMigrations).toEqual([PlayInitialSchemaMigration]);
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

describe("Play initial migration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("applies, enforces constraints, and rolls back against node:sqlite", () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(PlayInitialSchemaMigration.upSql);

      database
        .prepare(
          `INSERT INTO track_sets (tenant_id, track_set_id, song_id, default_key, tempo_bpm, track_refs_json, schema_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("tenant_1", "track_set_1", "song_1", "G", 120, "[]", "play.v1", "t", "t");

      // An unknown schema version must be rejected by the CHECK constraint.
      expect(() =>
        database
          .prepare(
            `INSERT INTO track_sets (tenant_id, track_set_id, song_id, default_key, tempo_bpm, track_refs_json, schema_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run("tenant_1", "track_set_bad", "song_1", "G", 120, "[]", "play.v2", "t", "t")
      ).toThrow();

      // A jump cue without a target section ref must be rejected.
      expect(() =>
        database
          .prepare(
            `INSERT INTO play_cues (tenant_id, cue_id, track_set_id, section_id, marker_offset_beats, label, action, fire_mode, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run("tenant_1", "cue_bad_jump", "track_set_1", "section_1", 0, "Jump", "jump", "manual", "t", "t")
      ).toThrow();

      // A pad layer with an out-of-range gain must be rejected.
      expect(() =>
        database
          .prepare(
            `INSERT INTO pad_layers (tenant_id, pad_layer_ref, pad_key, pad_media_ref, gain, loop, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run("tenant_1", "pad_bad_gain", "G", "media_1", 1.5, 1, "t")
      ).toThrow();

      database.exec(PlayInitialSchemaMigration.downSql);

      const tableCount = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'track_sets'")
        .all();
      expect(tableCount).toEqual([]);
    } finally {
      database.close();
    }
  });
});
