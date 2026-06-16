import { z } from "zod";

export const MigrationStateSchema = z.enum(["pending", "applied", "failed", "rolled-back"]);

export const MigrationRecordSchema = z.object({
  appliedAt: z.string().datetime().optional(),
  checksum: z.string().min(1),
  migrationId: z.string().min(1),
  state: MigrationStateSchema
});

export const SqlMigrationArtifactSchema = z
  .object({
    auditTables: z.array(z.string().min(1)),
    checksum: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/u),
    description: z.string().min(1),
    downSql: z.string().min(1),
    migrationId: z.string().min(1),
    requiredIndexes: z.array(z.string().min(1)),
    requiredTables: z.array(z.string().min(1)).min(1),
    tenantScopedTables: z.array(z.string().min(1)).min(1),
    transactional: z.boolean(),
    upSql: z.string().min(1)
  })
  .strict()
  .superRefine((artifact, context) => {
    const requiredTables = new Set(artifact.requiredTables);

    for (const tenantScopedTable of artifact.tenantScopedTables) {
      if (!requiredTables.has(tenantScopedTable)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tenant-scoped tables must be included in requiredTables.",
          path: ["tenantScopedTables"]
        });
      }
    }

    for (const auditTable of artifact.auditTables) {
      if (!requiredTables.has(auditTable)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Audit tables must be included in requiredTables.",
          path: ["auditTables"]
        });
      }
    }
  });

export type MigrationState = z.infer<typeof MigrationStateSchema>;
export type MigrationRecord = z.infer<typeof MigrationRecordSchema>;
export type SqlMigrationArtifact = z.infer<typeof SqlMigrationArtifactSchema>;
export interface SqlMigrationArtifactInput {
  readonly auditTables: readonly string[];
  readonly description: string;
  readonly downSql: string;
  readonly migrationId: string;
  readonly requiredIndexes: readonly string[];
  readonly requiredTables: readonly string[];
  readonly tenantScopedTables: readonly string[];
  readonly transactional: boolean;
  readonly upSql: string;
}

export interface MigrationRegistry {
  readonly list: () => Promise<readonly MigrationRecord[]>;
}

export const calculateSqlMigrationChecksum = (
  artifact: Pick<
    SqlMigrationArtifact,
    "description" | "downSql" | "migrationId" | "transactional" | "upSql"
  >
): string => {
  const checksumSource = [
    artifact.migrationId,
    artifact.description,
    artifact.transactional ? "transactional" : "non-transactional",
    artifact.upSql,
    artifact.downSql
  ].join("\n--- migration-checksum-boundary ---\n");

  let hash = 0x811c9dc5;

  for (let index = 0; index < checksumSource.length; index += 1) {
    hash ^= checksumSource.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const defineSqlMigrationArtifact = (
  artifact: SqlMigrationArtifactInput
): SqlMigrationArtifact =>
  SqlMigrationArtifactSchema.parse({
    ...artifact,
    checksum: calculateSqlMigrationChecksum(artifact)
  });

export const createStaticMigrationRegistry = (
  records: readonly MigrationRecord[]
): MigrationRegistry => {
  const parsedRecords = records.map((record) => MigrationRecordSchema.parse(record));

  return {
    list: () => Promise.resolve(parsedRecords)
  };
};
