import { describe, expect, it } from "vitest";
import {
  PresenterInitialMigrationIndexNames,
  PresenterInitialMigrationTableNames,
  PresenterInitialSchemaMigration,
  PresenterLocalSyncQueueMigration,
  PresenterLocalSyncQueueMigrationIndexNames,
  PresenterLocalSyncQueueMigrationTableNames,
  PresenterSqlMigrations,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

const sqlContains = (sql: string, expected: string): boolean =>
  sql.toLowerCase().includes(expected.toLowerCase());

describe("Presenter SQL migrations", () => {
  it("defines the initial Presenter migration as a valid SQL artifact", () => {
    expect(SqlMigrationArtifactSchema.parse(PresenterInitialSchemaMigration)).toEqual(
      PresenterInitialSchemaMigration
    );
    expect(PresenterInitialSchemaMigration.transactional).toBe(true);
    expect(PresenterInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(PresenterInitialSchemaMigration)
    );
  });

  it("covers all initial Presenter table groups with tenant scope", () => {
    expect(PresenterInitialSchemaMigration.requiredTables).toEqual([
      ...PresenterInitialMigrationTableNames
    ]);
    expect(PresenterInitialSchemaMigration.tenantScopedTables).toEqual([
      ...PresenterInitialMigrationTableNames
    ]);

    for (const tableName of PresenterInitialMigrationTableNames) {
      expect(
        sqlContains(PresenterInitialSchemaMigration.upSql, `CREATE TABLE ${tableName}`)
      ).toBe(true);
    }

    expect(
      PresenterInitialSchemaMigration.upSql.match(/tenant_id TEXT NOT NULL/gu)?.length
    ).toBeGreaterThanOrEqual(PresenterInitialMigrationTableNames.length);
  });

  it("declares core Presenter indexes in metadata and SQL", () => {
    expect(PresenterInitialSchemaMigration.requiredIndexes).toEqual([
      ...PresenterInitialMigrationIndexNames
    ]);

    for (const indexName of PresenterInitialMigrationIndexNames) {
      expect(
        sqlContains(PresenterInitialSchemaMigration.upSql, `CREATE INDEX ${indexName}`)
      ).toBe(true);
    }
  });

  it("stores media references and structured slide/theme data without raw media or vendor fields", () => {
    expect(sqlContains(PresenterInitialSchemaMigration.upSql, "media_asset_ref TEXT NOT NULL")).toBe(
      true
    );
    expect(sqlContains(PresenterInitialSchemaMigration.upSql, "payload JSONB NOT NULL")).toBe(
      true
    );
    expect(sqlContains(PresenterInitialSchemaMigration.upSql, "typography JSONB NOT NULL")).toBe(
      true
    );

    for (const forbidden of ["raw_media", "rawMediaPayload", "obs", "credential", "token"]) {
      expect(PresenterInitialSchemaMigration.upSql.toLowerCase()).not.toContain(
        forbidden.toLowerCase()
      );
    }
  });

  it("includes mutation audit metadata and rollback SQL for every table", () => {
    expect(PresenterInitialSchemaMigration.auditTables).toEqual(["presenter_audit_log"]);

    for (const auditColumn of [
      "actor_id TEXT",
      "request_id TEXT NOT NULL",
      "operation_name TEXT NOT NULL",
      "mutation_intent TEXT NOT NULL",
      "target_aggregate_id TEXT",
      "confirmation_reason TEXT",
      "created_at TIMESTAMPTZ NOT NULL"
    ]) {
      expect(sqlContains(PresenterInitialSchemaMigration.upSql, auditColumn)).toBe(true);
    }

    for (const tableName of PresenterInitialMigrationTableNames) {
      expect(
        sqlContains(PresenterInitialSchemaMigration.downSql, `DROP TABLE IF EXISTS ${tableName}`)
      ).toBe(true);
    }
  });

  it("defines the Presenter local sync queue migration as a valid SQL artifact", () => {
    expect(SqlMigrationArtifactSchema.parse(PresenterLocalSyncQueueMigration)).toEqual(
      PresenterLocalSyncQueueMigration
    );
    expect(PresenterLocalSyncQueueMigration.transactional).toBe(true);
    expect(PresenterLocalSyncQueueMigration.checksum).toBe(
      calculateSqlMigrationChecksum(PresenterLocalSyncQueueMigration)
    );
    expect(PresenterSqlMigrations).toEqual([
      PresenterInitialSchemaMigration,
      PresenterLocalSyncQueueMigration
    ]);
  });

  it("creates the local sync queue table with required storage columns and tenant scope", () => {
    expect(PresenterLocalSyncQueueMigration.requiredTables).toEqual([
      ...PresenterLocalSyncQueueMigrationTableNames
    ]);
    expect(PresenterLocalSyncQueueMigration.tenantScopedTables).toEqual([
      ...PresenterLocalSyncQueueMigrationTableNames
    ]);
    expect(PresenterLocalSyncQueueMigration.auditTables).toEqual([]);

    expect(
      sqlContains(
        PresenterLocalSyncQueueMigration.upSql,
        "CREATE TABLE presenter_local_sync_queue_entries"
      )
    ).toBe(true);

    for (const column of [
      "tenant_id TEXT NOT NULL",
      "queue_entry_id TEXT NOT NULL",
      "presentation_id TEXT NOT NULL",
      "actor_id TEXT NOT NULL",
      "request_id TEXT NOT NULL",
      "base_revision TEXT NOT NULL",
      "operation TEXT NOT NULL",
      "payload_json TEXT NOT NULL",
      "status TEXT NOT NULL",
      "conflict_json TEXT",
      "safe_error_message TEXT",
      "attempt_count INTEGER NOT NULL DEFAULT 0",
      "queued_at TEXT NOT NULL",
      "last_attempted_at TEXT",
      "schema_version TEXT NOT NULL",
      "created_at TEXT NOT NULL",
      "updated_at TEXT NOT NULL",
      "PRIMARY KEY (tenant_id, queue_entry_id)"
    ]) {
      expect(sqlContains(PresenterLocalSyncQueueMigration.upSql, column)).toBe(true);
    }
  });

  it("declares local sync queue status, operation, schema version, and retry constraints", () => {
    for (const expected of [
      "CHECK (attempt_count >= 0)",
      "CHECK (payload_json <> '')",
      "CHECK (schema_version = 'presenter-local-sync-queue.v1')",
      "'updatePresentation'",
      "'addSlide'",
      "'updateSlide'",
      "'reorderSlides'",
      "'applyPresenterTheme'",
      "'setOutputTarget'",
      "'queued'",
      "'replaying'",
      "'synced'",
      "'conflict'",
      "'failed'",
      "'cancelled'",
      "status = 'conflict' AND conflict_json IS NOT NULL",
      "status = 'failed' AND safe_error_message IS NOT NULL",
      "last_attempted_at IS NULL",
      "OR attempt_count > 0"
    ]) {
      expect(sqlContains(PresenterLocalSyncQueueMigration.upSql, expected)).toBe(true);
    }
  });

  it("declares local sync queue replay, status, and request indexes", () => {
    expect(PresenterLocalSyncQueueMigration.requiredIndexes).toEqual([
      ...PresenterLocalSyncQueueMigrationIndexNames
    ]);

    for (const indexName of PresenterLocalSyncQueueMigrationIndexNames) {
      expect(
        sqlContains(PresenterLocalSyncQueueMigration.upSql, `CREATE INDEX ${indexName}`)
      ).toBe(true);
    }

    expect(
      sqlContains(
        PresenterLocalSyncQueueMigration.upSql,
        "ON presenter_local_sync_queue_entries (\n    tenant_id,\n    presentation_id,\n    status,\n    queued_at,\n    queue_entry_id\n  )"
      )
    ).toBe(true);
    expect(
      sqlContains(
        PresenterLocalSyncQueueMigration.upSql,
        "ON presenter_local_sync_queue_entries (tenant_id, status, updated_at)"
      )
    ).toBe(true);
    expect(
      sqlContains(
        PresenterLocalSyncQueueMigration.upSql,
        "ON presenter_local_sync_queue_entries (tenant_id, request_id)"
      )
    ).toBe(true);
  });

  it("keeps local sync queue SQL portable and free of adapter or secret payload fields", () => {
    for (const forbidden of [
      "jsonb",
      "timestamptz",
      "auth0",
      "credential",
      "token",
      "raw_media",
      "rawMediaPayload",
      "obs",
      "stream",
      "tauri",
      "graphql"
    ]) {
      expect(PresenterLocalSyncQueueMigration.upSql.toLowerCase()).not.toContain(
        forbidden.toLowerCase()
      );
    }
  });

  it("declares rollback SQL for local sync queue indexes and table", () => {
    for (const indexName of PresenterLocalSyncQueueMigrationIndexNames) {
      expect(
        sqlContains(PresenterLocalSyncQueueMigration.downSql, `DROP INDEX IF EXISTS ${indexName}`)
      ).toBe(true);
    }

    for (const tableName of PresenterLocalSyncQueueMigrationTableNames) {
      expect(
        sqlContains(PresenterLocalSyncQueueMigration.downSql, `DROP TABLE IF EXISTS ${tableName}`)
      ).toBe(true);
    }
  });
});
