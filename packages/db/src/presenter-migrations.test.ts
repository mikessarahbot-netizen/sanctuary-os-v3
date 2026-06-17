import { describe, expect, it } from "vitest";
import {
  PresenterInitialMigrationIndexNames,
  PresenterInitialMigrationTableNames,
  PresenterInitialSchemaMigration,
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
});
