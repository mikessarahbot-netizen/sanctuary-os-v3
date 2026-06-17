import { z } from "zod";
import {
  ChartsInitialSchemaMigration,
  createChartsCommandSqlRepository,
  createChartsQuerySqlRepository,
  createSqliteMigrationRunner,
  type ChartsCommandPersistenceRepository,
  type ChartsQueryPersistenceRepository,
  type ChartsSqlExecutor,
  type MigrationRunStep,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import {
  createInMemoryChartsServicesAdapter,
  type InMemoryChartsServiceDependencies,
  type InMemoryChartsServicesAdapter
} from "./in-memory.js";
import {
  createPersistenceBackedChartsServicesAdapter,
  type PersistenceBackedChartsServiceIds,
  type PersistenceBackedChartsServicesAdapter
} from "./persistence.js";

export const ChartsPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const ChartsPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const ChartsPersistenceSelectionConfigSchema = z
  .object({
    environment: ChartsPersistenceEnvironmentSchema.default("development"),
    mode: ChartsPersistenceModeSchema.optional()
  })
  .strict();

export type ChartsPersistenceEnvironment = z.infer<
  typeof ChartsPersistenceEnvironmentSchema
>;
export type ChartsPersistenceMode = z.infer<typeof ChartsPersistenceModeSchema>;
export type ChartsPersistenceSelectionConfig = z.infer<
  typeof ChartsPersistenceSelectionConfigSchema
>;
export type ChartsPersistenceSelectionConfigInput = z.input<
  typeof ChartsPersistenceSelectionConfigSchema
>;

export interface ChartsPersistenceRepositories {
  readonly commandRepository: ChartsCommandPersistenceRepository;
  readonly queryRepository: ChartsQueryPersistenceRepository;
}

export interface ChartsSqlPersistenceDependencies {
  readonly clock: () => string;
  readonly executor: ChartsSqlExecutor;
  readonly ids?: Partial<PersistenceBackedChartsServiceIds>;
}

export interface ChartsPersistenceSelectionDependencies {
  readonly inMemory?: InMemoryChartsServiceDependencies;
  readonly sql?: ChartsSqlPersistenceDependencies;
}

export type ChartsPersistenceSelection =
  | {
      readonly inMemoryAdapter: InMemoryChartsServicesAdapter;
      readonly mode: "in-memory";
      readonly servicesAdapter: InMemoryChartsServicesAdapter;
    }
  | (ChartsPersistenceRepositories & {
      readonly mode: "sql";
      readonly servicesAdapter: PersistenceBackedChartsServicesAdapter;
    });

export interface ChartsSqliteMigrationDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

/**
 * Apply the Charts schema to a SQLite database via the shared migration runner,
 * mirroring how the presenter/planning SQLite paths bring their schema up before
 * the SQL repositories run. Idempotent: already-applied migrations are skipped.
 */
export const migrateChartsSqliteSchema = (
  dependencies: ChartsSqliteMigrationDependencies
): Promise<readonly MigrationRunStep[]> =>
  createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  }).applyPending([ChartsInitialSchemaMigration]);

export const resolveChartsPersistenceMode = (
  rawConfig: ChartsPersistenceSelectionConfigInput = {}
): ChartsPersistenceMode => {
  const config = ChartsPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createChartsPersistenceSelection = (
  rawConfig: ChartsPersistenceSelectionConfigInput = {},
  dependencies: ChartsPersistenceSelectionDependencies = {}
): ChartsPersistenceSelection => {
  const mode = resolveChartsPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlChartsPersistenceSelection(dependencies.sql)
    : createInMemoryChartsPersistenceSelection(dependencies.inMemory);
};

const createInMemoryChartsPersistenceSelection = (
  dependencies: InMemoryChartsServiceDependencies = {}
): ChartsPersistenceSelection => {
  const adapter = createInMemoryChartsServicesAdapter(dependencies);

  return {
    inMemoryAdapter: adapter,
    mode: "in-memory",
    servicesAdapter: adapter
  };
};

const createSqlChartsPersistenceSelection = (
  dependencies: ChartsSqlPersistenceDependencies | undefined
): ChartsPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error("Charts SQL persistence dependencies are required for sql mode.");
  }

  const commandRepository = createChartsCommandSqlRepository({
    clock: dependencies.clock,
    executor: dependencies.executor
  });
  const queryRepository = createChartsQuerySqlRepository({
    executor: dependencies.executor
  });

  return {
    commandRepository,
    mode: "sql",
    queryRepository,
    servicesAdapter: createPersistenceBackedChartsServicesAdapter({
      clock: dependencies.clock,
      commandRepository,
      queryRepository,
      ...(dependencies.ids !== undefined ? { ids: dependencies.ids } : {})
    })
  };
};
