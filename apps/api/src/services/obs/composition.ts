import { z } from "zod";
import {
  ObsInitialSchemaMigration,
  createObsCommandSqlRepository,
  createObsQuerySqlRepository,
  createSqliteMigrationRunner,
  type MigrationRunStep,
  type ObsCommandPersistenceRepository,
  type ObsQueryPersistenceRepository,
  type ObsSqlExecutor,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { ObsAiSuggestionPort } from "./ai-suggest.js";
import type { ObsControlPort } from "./control-port.js";
import type { ObsDispatchErrorClassifier } from "./error-classifier.js";
import {
  createInMemoryObsServicesAdapter,
  type InMemoryObsServiceDependencies,
  type InMemoryObsServicesAdapter
} from "./in-memory.js";
import {
  createPersistenceBackedObsServicesAdapter,
  type PersistenceBackedObsServiceIds,
  type PersistenceBackedObsServicesAdapter
} from "./persistence.js";

export const ObsPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const ObsPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const ObsPersistenceSelectionConfigSchema = z
  .object({
    environment: ObsPersistenceEnvironmentSchema.default("development"),
    mode: ObsPersistenceModeSchema.optional()
  })
  .strict();

export type ObsPersistenceEnvironment = z.infer<
  typeof ObsPersistenceEnvironmentSchema
>;
export type ObsPersistenceMode = z.infer<typeof ObsPersistenceModeSchema>;
export type ObsPersistenceSelectionConfig = z.infer<
  typeof ObsPersistenceSelectionConfigSchema
>;
export type ObsPersistenceSelectionConfigInput = z.input<
  typeof ObsPersistenceSelectionConfigSchema
>;

export interface ObsPersistenceRepositories {
  readonly commandRepository: ObsCommandPersistenceRepository;
  readonly queryRepository: ObsQueryPersistenceRepository;
}

export interface ObsSqlPersistenceDependencies {
  readonly aiSuggestionPort?: ObsAiSuggestionPort;
  readonly clock: () => string;
  readonly controlPort?: ObsControlPort;
  readonly errorClassifier?: ObsDispatchErrorClassifier;
  readonly executor: ObsSqlExecutor;
  readonly ids?: Partial<PersistenceBackedObsServiceIds>;
}

export interface ObsPersistenceSelectionDependencies {
  readonly inMemory?: InMemoryObsServiceDependencies;
  readonly sql?: ObsSqlPersistenceDependencies;
}

export type ObsPersistenceSelection =
  | {
      readonly inMemoryAdapter: InMemoryObsServicesAdapter;
      readonly mode: "in-memory";
      readonly servicesAdapter: InMemoryObsServicesAdapter;
    }
  | (ObsPersistenceRepositories & {
      readonly mode: "sql";
      readonly servicesAdapter: PersistenceBackedObsServicesAdapter;
    });

export interface ObsSqliteMigrationDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

/**
 * Apply the OBS schema to a SQLite database via the shared migration runner,
 * mirroring how the charts/play/community SQLite paths bring their schema up
 * before the SQL repositories run. Idempotent: already-applied migrations are
 * skipped. There is intentionally no local-sync-queue migration — OBS output
 * actions are deliberately online-only (a replayed start-stream after a network
 * gap could take a service live unattended).
 */
export const migrateObsSqliteSchema = (
  dependencies: ObsSqliteMigrationDependencies
): Promise<readonly MigrationRunStep[]> =>
  createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  }).applyPending([ObsInitialSchemaMigration]);

export const resolveObsPersistenceMode = (
  rawConfig: ObsPersistenceSelectionConfigInput = {}
): ObsPersistenceMode => {
  const config = ObsPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createObsPersistenceSelection = (
  rawConfig: ObsPersistenceSelectionConfigInput = {},
  dependencies: ObsPersistenceSelectionDependencies = {}
): ObsPersistenceSelection => {
  const mode = resolveObsPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlObsPersistenceSelection(dependencies.sql)
    : createInMemoryObsPersistenceSelection(dependencies.inMemory);
};

const createInMemoryObsPersistenceSelection = (
  dependencies: InMemoryObsServiceDependencies = {}
): ObsPersistenceSelection => {
  const adapter = createInMemoryObsServicesAdapter(dependencies);

  return {
    inMemoryAdapter: adapter,
    mode: "in-memory",
    servicesAdapter: adapter
  };
};

const createSqlObsPersistenceSelection = (
  dependencies: ObsSqlPersistenceDependencies | undefined
): ObsPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error("OBS SQL persistence dependencies are required for sql mode.");
  }

  const commandRepository = createObsCommandSqlRepository({
    clock: dependencies.clock,
    executor: dependencies.executor
  });
  const queryRepository = createObsQuerySqlRepository({
    executor: dependencies.executor
  });

  return {
    commandRepository,
    mode: "sql",
    queryRepository,
    servicesAdapter: createPersistenceBackedObsServicesAdapter({
      clock: dependencies.clock,
      commandRepository,
      queryRepository,
      ...(dependencies.aiSuggestionPort !== undefined
        ? { aiSuggestionPort: dependencies.aiSuggestionPort }
        : {}),
      ...(dependencies.controlPort !== undefined
        ? { controlPort: dependencies.controlPort }
        : {}),
      ...(dependencies.errorClassifier !== undefined
        ? { errorClassifier: dependencies.errorClassifier }
        : {}),
      ...(dependencies.ids !== undefined ? { ids: dependencies.ids } : {})
    })
  };
};
