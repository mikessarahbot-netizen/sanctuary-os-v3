import { z } from "zod";
import { DatabaseConnectionConfigSchema } from "./config.js";
import { createPresenterLocalSyncQueueSqlRepository } from "./presenter-local-sync-queue-sql-repository.js";
import type { PresenterLocalSyncQueuePersistenceRepository } from "./presenter-repository-contracts.js";
import { createSqliteExecutor, type SqliteDatabaseClient } from "./sqlite-executor.js";

/**
 * Composition root for the Presenter local sync queue's local (SQLite) store.
 * It mirrors the API's `createPresenterPersistenceSelectionFromRuntimeConfig`
 * but targets the desktop-local runtime: the SQLite database client is injected
 * (so this package needs no native driver), and the only persistence mode is
 * `sqlite`. Replay scheduling, Tauri commands, and event-bus wiring remain in
 * later slices that consume this selection.
 */

export const PresenterLocalSyncQueuePersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const PresenterLocalSyncQueuePersistenceModeSchema = z.enum(["sqlite"]);

export const PresenterLocalSyncQueuePersistenceRuntimeConfigSchema = z
  .object({
    database: DatabaseConnectionConfigSchema.default({
      connectionName: "presenter-local-sync-queue",
      runtime: "sqlite",
      urlEnvVar: "SANCTUARY_OS_PRESENTER_LOCAL_SYNC_QUEUE_PATH"
    }),
    environment: PresenterLocalSyncQueuePersistenceEnvironmentSchema.default("development")
  })
  .strict()
  .superRefine((config, context): void => {
    if (config.database.runtime !== "sqlite") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queue persistence requires SQLite runtime.",
        path: ["database", "runtime"]
      });
    }
  });

export type PresenterLocalSyncQueuePersistenceEnvironment = z.infer<
  typeof PresenterLocalSyncQueuePersistenceEnvironmentSchema
>;
export type PresenterLocalSyncQueuePersistenceMode = z.infer<
  typeof PresenterLocalSyncQueuePersistenceModeSchema
>;
export type PresenterLocalSyncQueuePersistenceRuntimeConfig = z.infer<
  typeof PresenterLocalSyncQueuePersistenceRuntimeConfigSchema
>;
export type PresenterLocalSyncQueuePersistenceRuntimeConfigInput = z.input<
  typeof PresenterLocalSyncQueuePersistenceRuntimeConfigSchema
>;

export interface PresenterLocalSyncQueueSqlitePersistenceRuntimeDependencies {
  readonly database: SqliteDatabaseClient;
}

export interface PresenterLocalSyncQueuePersistenceSelectionDependencies {
  readonly sqlite?: PresenterLocalSyncQueueSqlitePersistenceRuntimeDependencies;
}

export interface PresenterLocalSyncQueuePersistenceSelection {
  readonly mode: PresenterLocalSyncQueuePersistenceMode;
  readonly repository: PresenterLocalSyncQueuePersistenceRepository;
}

export const parsePresenterLocalSyncQueuePersistenceRuntimeConfig = (
  rawConfig: PresenterLocalSyncQueuePersistenceRuntimeConfigInput = {}
): PresenterLocalSyncQueuePersistenceRuntimeConfig =>
  PresenterLocalSyncQueuePersistenceRuntimeConfigSchema.parse(rawConfig);

const requireSqliteRuntimeDependencies = (
  dependencies: PresenterLocalSyncQueueSqlitePersistenceRuntimeDependencies | undefined
): PresenterLocalSyncQueueSqlitePersistenceRuntimeDependencies => {
  if (dependencies === undefined) {
    throw new Error(
      "Presenter local sync queue SQLite dependencies are required for sqlite persistence."
    );
  }

  return dependencies;
};

export const createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig = (
  rawConfig: PresenterLocalSyncQueuePersistenceRuntimeConfigInput = {},
  dependencies: PresenterLocalSyncQueuePersistenceSelectionDependencies = {}
): PresenterLocalSyncQueuePersistenceSelection => {
  const config = parsePresenterLocalSyncQueuePersistenceRuntimeConfig(rawConfig);

  if (config.database.runtime !== "sqlite") {
    throw new Error("Presenter local sync queue persistence requires SQLite runtime.");
  }

  const sqlite = requireSqliteRuntimeDependencies(dependencies.sqlite);

  return {
    mode: "sqlite",
    repository: createPresenterLocalSyncQueueSqlRepository({
      executor: createSqliteExecutor({ database: sqlite.database })
    })
  };
};
