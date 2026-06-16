import { describe, expect, it } from "vitest";
import {
  PlanningInitialMigrationIndexNames,
  PlanningInitialMigrationTableNames,
  PlanningInitialSchemaMigration,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

const sqlContains = (sql: string, expected: string): boolean =>
  sql.toLowerCase().includes(expected.toLowerCase());

describe("Planning SQL migrations", () => {
  it("defines the initial Planning migration as a valid SQL artifact", () => {
    expect(SqlMigrationArtifactSchema.parse(PlanningInitialSchemaMigration)).toEqual(
      PlanningInitialSchemaMigration
    );
    expect(PlanningInitialSchemaMigration.transactional).toBe(true);
    expect(PlanningInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(PlanningInitialSchemaMigration)
    );
  });

  it("covers all initial Planning table groups with tenant scope", () => {
    expect(PlanningInitialSchemaMigration.requiredTables).toEqual([
      ...PlanningInitialMigrationTableNames
    ]);
    expect(PlanningInitialSchemaMigration.tenantScopedTables).toEqual([
      ...PlanningInitialMigrationTableNames
    ]);

    for (const tableName of PlanningInitialMigrationTableNames) {
      expect(sqlContains(PlanningInitialSchemaMigration.upSql, `CREATE TABLE ${tableName}`)).toBe(
        true
      );
    }

    expect(
      PlanningInitialSchemaMigration.upSql.match(/tenant_id TEXT NOT NULL/gu)?.length
    ).toBe(PlanningInitialMigrationTableNames.length);
  });

  it("declares core Planning indexes in metadata and SQL", () => {
    expect(PlanningInitialSchemaMigration.requiredIndexes).toEqual([
      ...PlanningInitialMigrationIndexNames
    ]);

    for (const indexName of PlanningInitialMigrationIndexNames) {
      expect(
        sqlContains(PlanningInitialSchemaMigration.upSql, `CREATE INDEX ${indexName}`)
      ).toBe(true);
    }
  });

  it("includes mutation audit and confirmation intent columns", () => {
    expect(PlanningInitialSchemaMigration.auditTables).toEqual(["planning_audit_log"]);

    for (const auditColumn of [
      "actor_id TEXT",
      "request_id TEXT NOT NULL",
      "operation_name TEXT NOT NULL",
      "mutation_intent TEXT NOT NULL",
      "target_aggregate_id TEXT",
      "confirmation_reason TEXT",
      "created_at TIMESTAMPTZ NOT NULL"
    ]) {
      expect(sqlContains(PlanningInitialSchemaMigration.upSql, auditColumn)).toBe(true);
    }
  });

  it("declares rollback SQL for every created Planning table", () => {
    for (const tableName of PlanningInitialMigrationTableNames) {
      expect(
        sqlContains(PlanningInitialSchemaMigration.downSql, `DROP TABLE IF EXISTS ${tableName}`)
      ).toBe(true);
    }
  });
});
