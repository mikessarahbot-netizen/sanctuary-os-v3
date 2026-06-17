import { z } from "zod";
import {
  PlayInitialSchemaMigration,
  createPlayCommandSqlRepository,
  createPlayQuerySqlRepository,
  createSqliteMigrationRunner,
  type MigrationRunStep,
  type PlayCommandPersistenceRepository,
  type PlayQueryPersistenceRepository,
  type PlaySqlExecutor,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import {
  createInMemoryPlayServicesAdapter,
  type InMemoryPlayServiceDependencies,
  type InMemoryPlayServicesAdapter
} from "./in-memory.js";
import {
  createPersistenceBackedPlayServicesAdapter,
  type PersistenceBackedPlayServiceIds,
  type PersistenceBackedPlayServicesAdapter
} from "./persistence.js";

export const PlayPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const PlayPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const PlayPersistenceSelectionConfigSchema = z
  .object({
    environment: PlayPersistenceEnvironmentSchema.default("development"),
    mode: PlayPersistenceModeSchema.optional()
  })
  .strict();

export type PlayPersistenceEnvironment = z.infer<
  typeof PlayPersistenceEnvironmentSchema
>;
export type PlayPersistenceMode = z.infer<typeof PlayPersistenceModeSchema>;
export type PlayPersistenceSelectionConfig = z.infer<
  typeof PlayPersistenceSelectionConfigSchema
>;
export type PlayPersistenceSelectionConfigInput = z.input<
  typeof PlayPersistenceSelectionConfigSchema
>;

export interface PlayPersistenceRepositories {
  readonly commandRepository: PlayCommandPersistenceRepository;
  readonly queryRepository: PlayQueryPersistenceRepository;
}

export interface PlaySqlPersistenceDependencies {
  readonly clock: () => string;
  readonly executor: PlaySqlExecutor;
  readonly ids?: Partial<PersistenceBackedPlayServiceIds>;
}

export interface PlayPersistenceSelectionDependencies {
  readonly inMemory?: InMemoryPlayServiceDependencies;
  readonly sql?: PlaySqlPersistenceDependencies;
}

export type PlayPersistenceSelection =
  | {
      readonly inMemoryAdapter: InMemoryPlayServicesAdapter;
      readonly mode: "in-memory";
      readonly servicesAdapter: InMemoryPlayServicesAdapter;
    }
  | (PlayPersistenceRepositories & {
      readonly mode: "sql";
      readonly servicesAdapter: PersistenceBackedPlayServicesAdapter;
    });

export interface PlaySqliteMigrationDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

/**
 * Apply the Play schema to a SQLite database via the shared migration runner,
 * mirroring how the charts/presenter SQLite paths bring their schema up before
 * the SQL repositories run. Idempotent: already-applied migrations are skipped.
 */
export const migratePlaySqliteSchema = (
  dependencies: PlaySqliteMigrationDependencies
): Promise<readonly MigrationRunStep[]> =>
  createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  }).applyPending([PlayInitialSchemaMigration]);

export const resolvePlayPersistenceMode = (
  rawConfig: PlayPersistenceSelectionConfigInput = {}
): PlayPersistenceMode => {
  const config = PlayPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createPlayPersistenceSelection = (
  rawConfig: PlayPersistenceSelectionConfigInput = {},
  dependencies: PlayPersistenceSelectionDependencies = {}
): PlayPersistenceSelection => {
  const mode = resolvePlayPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlPlayPersistenceSelection(dependencies.sql)
    : createInMemoryPlayPersistenceSelection(dependencies.inMemory);
};

const createInMemoryPlayPersistenceSelection = (
  dependencies: InMemoryPlayServiceDependencies = {}
): PlayPersistenceSelection => {
  const adapter = createInMemoryPlayServicesAdapter(dependencies);

  return {
    inMemoryAdapter: adapter,
    mode: "in-memory",
    servicesAdapter: adapter
  };
};

const createSqlPlayPersistenceSelection = (
  dependencies: PlaySqlPersistenceDependencies | undefined
): PlayPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error("Play SQL persistence dependencies are required for sql mode.");
  }

  const commandRepository = createPlayCommandSqlRepository({
    clock: dependencies.clock,
    executor: dependencies.executor
  });
  const queryRepository = createPlayQuerySqlRepository({
    executor: dependencies.executor
  });

  return {
    commandRepository,
    mode: "sql",
    queryRepository,
    servicesAdapter: createPersistenceBackedPlayServicesAdapter({
      clock: dependencies.clock,
      commandRepository,
      queryRepository,
      ...(dependencies.ids !== undefined ? { ids: dependencies.ids } : {})
    })
  };
};
