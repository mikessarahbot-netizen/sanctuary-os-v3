import { describe, expect, it } from "vitest";
import {
  calculateSqlMigrationChecksum,
  createStaticMigrationRegistry,
  defineSqlMigrationArtifact,
  SqlMigrationArtifactSchema
} from "./index.js";

const migrationInput = {
  auditTables: ["example_audit_log"],
  description: "Create example tables.",
  downSql: "DROP TABLE IF EXISTS example_audit_log;",
  migrationId: "202606160000_example",
  requiredIndexes: ["example_audit_log_tenant_request_idx"],
  requiredTables: ["example_audit_log"],
  tenantScopedTables: ["example_audit_log"],
  transactional: true,
  upSql: "CREATE TABLE example_audit_log (tenant_id TEXT NOT NULL);"
} as const;

describe("migration contracts", () => {
  it("defines deterministic SQL migration artifacts with checksum metadata", () => {
    const migration = defineSqlMigrationArtifact(migrationInput);

    expect(SqlMigrationArtifactSchema.parse(migration)).toEqual(migration);
    expect(migration.checksum).toBe(calculateSqlMigrationChecksum(migration));
    expect(migration.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
  });

  it("includes rollback SQL in checksum calculation", () => {
    const migration = defineSqlMigrationArtifact(migrationInput);
    const changedRollbackChecksum = calculateSqlMigrationChecksum({
      ...migration,
      downSql: "DROP TABLE IF EXISTS changed_example_audit_log;"
    });

    expect(changedRollbackChecksum).not.toBe(migration.checksum);
  });

  it("requires tenant and audit table metadata to point at required tables", () => {
    expect(() =>
      SqlMigrationArtifactSchema.parse({
        ...defineSqlMigrationArtifact(migrationInput),
        auditTables: ["missing_audit_table"]
      })
    ).toThrow("Audit tables must be included in requiredTables.");

    expect(() =>
      SqlMigrationArtifactSchema.parse({
        ...defineSqlMigrationArtifact(migrationInput),
        tenantScopedTables: ["missing_tenant_table"]
      })
    ).toThrow("Tenant-scoped tables must be included in requiredTables.");
  });

  it("creates adapter-free registries from parsed migration records", async () => {
    const registry = createStaticMigrationRegistry([
      {
        checksum: "fnv1a32:00000001",
        migrationId: "202606160000_example",
        state: "pending"
      }
    ]);

    await expect(registry.list()).resolves.toEqual([
      {
        checksum: "fnv1a32:00000001",
        migrationId: "202606160000_example",
        state: "pending"
      }
    ]);
  });
});
