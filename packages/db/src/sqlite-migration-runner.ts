import { z } from "zod";
import {
  MigrationRecordSchema,
  SqlMigrationArtifactSchema,
  type MigrationRecord,
  type MigrationState,
  type SqlMigrationArtifact
} from "./migrations.js";
import type { SqliteDatabaseClient } from "./sqlite-executor.js";

/**
 * Migration application needs multi-statement DDL execution, so the runner
 * depends on a SQLite client that adds `exec` to the query-only
 * {@link SqliteDatabaseClient}. Both `node:sqlite` `DatabaseSync` and
 * `better-sqlite3` `Database` provide a compatible `exec` once wrapped, so the
 * concrete engine stays injected and unimported here.
 */
export interface SqliteMigrationDatabaseClient extends SqliteDatabaseClient {
  readonly exec: (sql: string) => void;
}

export interface SqliteMigrationRunnerDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

export interface SqliteMigrationPlanStep {
  readonly artifact: SqlMigrationArtifact;
  readonly outcome: "apply" | "skip";
}

export interface MigrationRunStep {
  readonly migrationId: string;
  readonly outcome: "applied" | "skipped";
}

export interface SqliteMigrationRunner {
  readonly applyPending: (
    migrations: readonly SqlMigrationArtifact[]
  ) => Promise<readonly MigrationRunStep[]>;
  readonly listApplied: () => Promise<readonly MigrationRecord[]>;
  readonly rollback: (migration: SqlMigrationArtifact) => Promise<MigrationRecord>;
}

export const SQLITE_MIGRATION_TRACKING_TABLE = "sanctuary_migrations";

const ensureTrackingTableSql = `
CREATE TABLE IF NOT EXISTS ${SQLITE_MIGRATION_TRACKING_TABLE} (
  migration_id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  state TEXT NOT NULL,
  applied_at TEXT
)
`.trim();

const MigrationTrackingRowSchema = z
  .object({
    applied_at: z.string().datetime().nullable().optional(),
    checksum: z.string().min(1),
    migration_id: z.string().min(1),
    state: z.string().min(1)
  })
  .strict()
  .transform((row): MigrationRecord =>
    MigrationRecordSchema.parse({
      ...(row.applied_at !== undefined && row.applied_at !== null
        ? { appliedAt: row.applied_at }
        : {}),
      checksum: row.checksum,
      migrationId: row.migration_id,
      state: row.state
    })
  );

/**
 * Pure decision step: given the already-applied records and the ordered
 * artifacts, decide whether each migration must be applied or can be skipped,
 * throwing if a previously-applied migration's checksum no longer matches its
 * artifact (drift). Engine-free so it can be unit-tested without SQLite.
 */
export const planSqliteMigrationApply = (
  appliedRecords: readonly MigrationRecord[],
  migrations: readonly SqlMigrationArtifact[]
): readonly SqliteMigrationPlanStep[] => {
  const recordsById = new Map(
    appliedRecords.map((record) => [record.migrationId, record] as const)
  );

  return migrations.map((artifact): SqliteMigrationPlanStep => {
    const record = recordsById.get(artifact.migrationId);

    if (record === undefined || record.state !== "applied") {
      return { artifact, outcome: "apply" };
    }

    if (record.checksum !== artifact.checksum) {
      throw new Error(`Migration checksum drift detected for ${artifact.migrationId}.`);
    }

    return { artifact, outcome: "skip" };
  });
};

const resolveSync = <Result>(operation: () => Result): Promise<Result> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

export const createSqliteMigrationRunner = (
  dependencies: SqliteMigrationRunnerDependencies
): SqliteMigrationRunner => {
  const { clock, database } = dependencies;

  const ensureTrackingTable = (): void => {
    database.exec(ensureTrackingTableSql);
  };

  const readAppliedRecords = (): readonly MigrationRecord[] => {
    const rows = database
      .prepare(
        `
SELECT migration_id, checksum, state, applied_at
FROM ${SQLITE_MIGRATION_TRACKING_TABLE}
ORDER BY migration_id
`.trim()
      )
      .all();

    return rows.map((row) => MigrationTrackingRowSchema.parse(row));
  };

  const recordMigration = (
    artifact: SqlMigrationArtifact,
    state: MigrationState,
    appliedAt: string | null
  ): void => {
    database
      .prepare(
        `
INSERT INTO ${SQLITE_MIGRATION_TRACKING_TABLE} (migration_id, checksum, state, applied_at)
VALUES (?, ?, ?, ?)
ON CONFLICT (migration_id) DO UPDATE SET
  checksum = excluded.checksum,
  state = excluded.state,
  applied_at = excluded.applied_at
`.trim()
      )
      .run(artifact.migrationId, artifact.checksum, state, appliedAt);
  };

  const runInOptionalTransaction = (
    transactional: boolean,
    operation: () => void
  ): void => {
    if (!transactional) {
      operation();

      return;
    }

    database.exec("BEGIN");

    try {
      operation();
      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original failure below.
      }

      throw error;
    }
  };

  return {
    applyPending: (
      migrations: readonly SqlMigrationArtifact[]
    ): Promise<readonly MigrationRunStep[]> =>
      resolveSync(() => {
        const parsed = migrations.map((migration) =>
          SqlMigrationArtifactSchema.parse(migration)
        );

        ensureTrackingTable();

        const plan = planSqliteMigrationApply(readAppliedRecords(), parsed);
        const steps: MigrationRunStep[] = [];

        for (const step of plan) {
          if (step.outcome === "skip") {
            steps.push({ migrationId: step.artifact.migrationId, outcome: "skipped" });
            continue;
          }

          runInOptionalTransaction(step.artifact.transactional, () => {
            database.exec(step.artifact.upSql);
            recordMigration(step.artifact, "applied", clock());
          });
          steps.push({ migrationId: step.artifact.migrationId, outcome: "applied" });
        }

        return steps;
      }),

    listApplied: (): Promise<readonly MigrationRecord[]> =>
      resolveSync(() => {
        ensureTrackingTable();

        return readAppliedRecords();
      }),

    rollback: (migration: SqlMigrationArtifact): Promise<MigrationRecord> =>
      resolveSync(() => {
        const artifact = SqlMigrationArtifactSchema.parse(migration);

        ensureTrackingTable();
        runInOptionalTransaction(artifact.transactional, () => {
          database.exec(artifact.downSql);
          recordMigration(artifact, "rolled-back", null);
        });

        return MigrationRecordSchema.parse({
          checksum: artifact.checksum,
          migrationId: artifact.migrationId,
          state: "rolled-back"
        });
      })
  };
};
