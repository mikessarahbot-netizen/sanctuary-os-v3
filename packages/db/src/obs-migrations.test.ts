import { describe, expect, it } from "vitest";
import {
  ObsInitialMigrationIndexNames,
  ObsInitialMigrationTableNames,
  ObsInitialSchemaMigration,
  ObsSqlMigrations,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

describe("OBS initial migration artifact", () => {
  it("defines a valid SQL artifact with a stable checksum", () => {
    expect(SqlMigrationArtifactSchema.parse(ObsInitialSchemaMigration)).toEqual(
      ObsInitialSchemaMigration
    );
    expect(ObsInitialSchemaMigration.transactional).toBe(true);
    expect(ObsInitialSchemaMigration.migrationId).toBe("202606170008_obs_initial_schema");
    expect(ObsInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(ObsInitialSchemaMigration)
    );
    expect(ObsInitialSchemaMigration.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
  });

  it("declares the OBS tables and indexes with tenant scope", () => {
    expect(ObsInitialSchemaMigration.requiredTables).toEqual([
      ...ObsInitialMigrationTableNames
    ]);
    expect(ObsInitialSchemaMigration.requiredIndexes).toEqual([
      ...ObsInitialMigrationIndexNames
    ]);
    expect(ObsInitialSchemaMigration.tenantScopedTables).toEqual([
      ...ObsInitialMigrationTableNames
    ]);
    // The append-only action log is the module's audit table.
    expect(ObsInitialSchemaMigration.auditTables).toEqual(["obs_action_log_entries"]);
  });

  it("creates each table and index in the forward SQL", () => {
    for (const table of ObsInitialMigrationTableNames) {
      expect(ObsInitialSchemaMigration.upSql).toContain(`CREATE TABLE ${table} (`);
    }
    for (const index of ObsInitialMigrationIndexNames) {
      expect(ObsInitialSchemaMigration.upSql).toContain(index);
    }
  });

  it("leads every table primary key with tenant_id", () => {
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, connection_profile_id)"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, scene_id)");
    expect(ObsInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, source_id)");
    expect(ObsInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, scene_item_id)");
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, action_intent_id)"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, log_entry_id)");
  });

  it("enforces the schema version and enum constraints", () => {
    expect(ObsInitialSchemaMigration.upSql).toContain("schema_version = 'obs.v1'");
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "connection_status IN ('connected', 'disconnected', 'unknown')"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "stream_status IN ('active', 'inactive', 'unknown')"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "recording_status IN ('active', 'paused', 'inactive', 'unknown')"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "kind IN ('start-stream', 'stop-stream', 'switch-scene', 'toggle-source-visibility', 'toggle-source-mute')"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "status IN ('requested', 'confirmed', 'dispatched', 'succeeded', 'failed', 'canceled')"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain("origin IN ('human', 'ai-suggested')");
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "outcome IN ('requested', 'confirmed', 'dispatched', 'succeeded', 'failed', 'canceled')"
    );
  });

  it("enforces boolean, order-hint, and per-kind target constraints", () => {
    expect(ObsInitialSchemaMigration.upSql).toContain("is_current_program_scene IN (0, 1)");
    expect(ObsInitialSchemaMigration.upSql).toContain("visible_hint IN (0, 1)");
    expect(ObsInitialSchemaMigration.upSql).toContain("affects_live_output IN (0, 1)");
    expect(ObsInitialSchemaMigration.upSql).toContain("confirmed IN (0, 1)");
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "muted_hint IS NULL OR muted_hint IN (0, 1)"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "active_hint IS NULL OR active_hint IN (0, 1)"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain("order_hint >= 0");
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "kind <> 'switch-scene' OR target_scene_ref IS NOT NULL"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "kind <> 'toggle-source-visibility' OR (target_source_ref IS NOT NULL AND target_scene_item_id IS NOT NULL AND desired_visible IS NOT NULL)"
    );
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "kind <> 'toggle-source-mute' OR (target_source_ref IS NOT NULL AND desired_muted IS NOT NULL)"
    );
  });

  it("keeps every v1 action gated as affecting live output", () => {
    // Uniform gate: no v1 OBS action may be stored as not-affecting live output.
    expect(ObsInitialSchemaMigration.upSql).toContain("affects_live_output = 1");
  });

  it("enforces the confirm-before-dispatch gate in the schema (not just the service)", () => {
    // Any status past `requested` toward dispatch requires a recorded confirmation.
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "status NOT IN ('confirmed', 'dispatched', 'succeeded') OR confirmed = 1"
    );
    // `requested` is the sole pre-confirmation status: it may not be confirmed.
    expect(ObsInitialSchemaMigration.upSql).toContain("status <> 'requested' OR confirmed = 0");
    // A confirmation requires actor + reason + timestamp.
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "confirmed_by_ref IS NOT NULL AND confirmation_reason IS NOT NULL AND confirmed_at IS NOT NULL"
    );
    // An unconfirmed intent carries no confirmation metadata.
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "confirmed_by_ref IS NULL AND confirmation_reason IS NULL AND confirmed_at IS NULL"
    );
    // The redacted failure message exists only on a failed action.
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "safe_failure_message IS NULL OR status = 'failed'"
    );
    // The action-log safe message is likewise redacted-and-failed-only.
    expect(ObsInitialSchemaMigration.upSql).toContain(
      "safe_message IS NULL OR outcome = 'failed'"
    );
  });

  it("stores OBS connections as an opaque connection_ref with no secret columns", () => {
    // Strongest no-secret posture: the connection profile holds a vault handle +
    // label + status only. No host/port/password/token/stream-key/secret column
    // exists anywhere in the DDL — structural, not a runtime check.
    expect(ObsInitialSchemaMigration.upSql).toContain("connection_ref TEXT NOT NULL");

    const forbiddenColumnPattern = /\b(host|port|password|token|stream_?key|secret)\b/iu;
    const declarationLines = ObsInitialSchemaMigration.upSql
      .split("\n")
      .filter((line) => /^\s*[a-z_]+\s+(TEXT|INTEGER|REAL)\b/u.test(line));

    expect(declarationLines.length).toBeGreaterThan(0);

    for (const line of declarationLines) {
      const columnName = line.trim().split(/\s+/u)[0] ?? "";
      expect(columnName).not.toMatch(forbiddenColumnPattern);
    }

    // Belt-and-suspenders: no secret-shaped identifier appears anywhere in the SQL.
    expect(ObsInitialSchemaMigration.upSql).not.toMatch(forbiddenColumnPattern);
  });

  it("keeps stream and recording state coarse (no telemetry columns)", () => {
    // High-frequency telemetry stays on the runtime bus, never in SQLite.
    const telemetryPattern = /\b(bitrate|fps|frame_rate|dropped_?frames?|uptime|cpu)\b/iu;
    expect(ObsInitialSchemaMigration.upSql).not.toMatch(telemetryPattern);
  });

  it("drops every index and table in the rollback SQL", () => {
    for (const index of ObsInitialMigrationIndexNames) {
      expect(ObsInitialSchemaMigration.downSql).toContain(`DROP INDEX IF EXISTS ${index}`);
    }
    for (const table of ObsInitialMigrationTableNames) {
      expect(ObsInitialSchemaMigration.downSql).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("is included in the ordered OBS migration list", () => {
    expect(ObsSqlMigrations).toEqual([ObsInitialSchemaMigration]);
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

describe("OBS initial migration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("applies, enforces constraints, and rolls back against node:sqlite", () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");
    const insertProfileSql = `INSERT INTO obs_connection_profiles
      (tenant_id, connection_profile_id, label, connection_ref, connection_status, schema_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const insertIntentSql = `INSERT INTO obs_action_intents
      (tenant_id, action_intent_id, connection_profile_id, kind, affects_live_output, status, origin, confirmed, confirmed_by_ref, confirmation_reason, confirmed_at, requested_by_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    try {
      database.exec(ObsInitialSchemaMigration.upSql);

      // A valid connection profile holding only an opaque connection_ref is accepted.
      database
        .prepare(insertProfileSql)
        .run(
          "tenant_1",
          "profile_1",
          "Main Sanctuary OBS",
          "vault://obs/profile_1",
          "connected",
          "obs.v1",
          "t",
          "t"
        );

      // A valid requested, human-origin start-stream intent (no confirmation yet) is accepted.
      database
        .prepare(insertIntentSql)
        .run(
          "tenant_1",
          "intent_1",
          "profile_1",
          "start-stream",
          1,
          "requested",
          "human",
          0,
          null,
          null,
          null,
          "actor_1",
          "t",
          "t"
        );

      // An unknown schema version must be rejected by the CHECK constraint.
      expect(() =>
        database
          .prepare(insertProfileSql)
          .run(
            "tenant_1",
            "profile_bad",
            "Bad",
            "vault://obs/profile_bad",
            "connected",
            "obs.v2",
            "t",
            "t"
          )
      ).toThrow();

      // A dispatched intent with no recorded confirmation must be rejected — the
      // human-confirmation gate is enforced in the schema, not just the service.
      expect(() =>
        database
          .prepare(insertIntentSql)
          .run(
            "tenant_1",
            "intent_bad_dispatched",
            "profile_1",
            "start-stream",
            1,
            "dispatched",
            "human",
            0,
            null,
            null,
            null,
            "actor_1",
            "t",
            "t"
          )
      ).toThrow();

      database.exec(ObsInitialSchemaMigration.downSql);

      const remaining = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'obs_connection_profiles'"
        )
        .all();
      expect(remaining).toEqual([]);
    } finally {
      database.close();
    }
  });
});
