import { z } from "zod";
import {
  DatabaseConnectionConfigSchema,
  createInMemoryPresenterPersistenceRepositoryAdapter,
  createPostgreSqlPlanningExecutor,
  createPresenterCommandSqlRepository,
  createPresenterQuerySqlRepository,
  type InMemoryPresenterPersistenceRepositoryAdapter,
  type InMemoryPresenterPersistenceRepositorySeed,
  type PlanningSqlExecutor,
  type PostgreSqlPlanningQueryClient,
  type PostgreSqlPlanningTransactionPool,
  type PresenterCommandPersistenceRepository,
  type PresenterQueryPersistenceRepository
} from "@sanctuary-os/db";

export const PresenterPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const PresenterPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const PresenterPersistenceSelectionConfigSchema = z
  .object({
    environment: PresenterPersistenceEnvironmentSchema.default("development"),
    mode: PresenterPersistenceModeSchema.optional()
  })
  .strict();

export const PresenterPersistenceRuntimeConfigSchema = z
  .object({
    database: DatabaseConnectionConfigSchema.default({
      connectionName: "presenter-primary",
      runtime: "postgresql",
      urlEnvVar: "SANCTUARY_OS_DATABASE_URL"
    }),
    environment: PresenterPersistenceEnvironmentSchema.default("development"),
    mode: PresenterPersistenceModeSchema.optional()
  })
  .strict()
  .superRefine((config, context): void => {
    const mode =
      config.mode ?? (config.environment === "production" ? "sql" : "in-memory");

    if (mode === "sql" && config.database.runtime !== "postgresql") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter SQL persistence requires PostgreSQL runtime.",
        path: ["database", "runtime"]
      });
    }
  });

export type PresenterPersistenceEnvironment = z.infer<
  typeof PresenterPersistenceEnvironmentSchema
>;
export type PresenterPersistenceMode = z.infer<typeof PresenterPersistenceModeSchema>;
export type PresenterPersistenceSelectionConfig = z.infer<
  typeof PresenterPersistenceSelectionConfigSchema
>;
export type PresenterPersistenceSelectionConfigInput = z.input<
  typeof PresenterPersistenceSelectionConfigSchema
>;
export type PresenterPersistenceRuntimeConfig = z.infer<
  typeof PresenterPersistenceRuntimeConfigSchema
>;
export type PresenterPersistenceRuntimeConfigInput = z.input<
  typeof PresenterPersistenceRuntimeConfigSchema
>;

export interface PresenterPersistenceRepositories {
  readonly commandRepository: PresenterCommandPersistenceRepository;
  readonly mode: PresenterPersistenceMode;
  readonly queryRepository: PresenterQueryPersistenceRepository;
}

export interface PresenterInMemoryPersistenceSeeds {
  readonly repository?: InMemoryPresenterPersistenceRepositorySeed;
}

export interface PresenterSqlPersistenceIds {
  readonly auditLogId: () => string;
}

export interface PresenterSqlPersistenceDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: PresenterSqlPersistenceIds;
}

export interface PresenterPostgreSqlPersistenceRuntimeDependencies {
  readonly clock: () => string;
  readonly ids: PresenterSqlPersistenceIds;
  readonly queryClient: PostgreSqlPlanningQueryClient;
  readonly transactionId?: () => string;
  readonly transactionPool: PostgreSqlPlanningTransactionPool;
}

export type PresenterPersistenceSelection =
  | (PresenterPersistenceRepositories & {
      readonly inMemoryAdapter: InMemoryPresenterPersistenceRepositoryAdapter;
      readonly mode: "in-memory";
    })
  | (PresenterPersistenceRepositories & {
      readonly mode: "sql";
    });

export interface PresenterPersistenceSelectionDependencies {
  readonly inMemorySeeds?: PresenterInMemoryPersistenceSeeds;
  readonly sql?: PresenterSqlPersistenceDependencies;
}

export const parsePresenterPersistenceRuntimeConfig = (
  rawConfig: PresenterPersistenceRuntimeConfigInput = {}
): PresenterPersistenceRuntimeConfig =>
  PresenterPersistenceRuntimeConfigSchema.parse(rawConfig);

export const createPresenterSqlPersistenceDependenciesFromPostgreSqlRuntime = (
  rawConfig: PresenterPersistenceRuntimeConfigInput,
  dependencies: PresenterPostgreSqlPersistenceRuntimeDependencies
): PresenterSqlPersistenceDependencies => {
  const config = parsePresenterPersistenceRuntimeConfig(rawConfig);

  if (config.database.runtime !== "postgresql") {
    throw new Error("Presenter SQL persistence requires PostgreSQL runtime.");
  }

  return {
    clock: dependencies.clock,
    executor: createPostgreSqlPlanningExecutor({
      queryClient: dependencies.queryClient,
      transactionPool: dependencies.transactionPool,
      ...(dependencies.transactionId !== undefined
        ? { transactionId: dependencies.transactionId }
        : {})
    }),
    ids: dependencies.ids
  };
};

export const createPresenterPersistenceSelectionFromRuntimeConfig = (
  rawConfig: PresenterPersistenceRuntimeConfigInput = {},
  dependencies:
    | {
        readonly inMemorySeeds?: PresenterInMemoryPersistenceSeeds;
        readonly postgreSql?: PresenterPostgreSqlPersistenceRuntimeDependencies;
      }
    | undefined = {}
): PresenterPersistenceSelection => {
  const config = parsePresenterPersistenceRuntimeConfig(rawConfig);
  const selectionConfig: PresenterPersistenceSelectionConfig = {
    environment: config.environment,
    ...(config.mode !== undefined ? { mode: config.mode } : {})
  };
  const sql =
    resolvePresenterPersistenceMode(selectionConfig) === "sql"
      ? createPresenterSqlPersistenceDependenciesFromPostgreSqlRuntime(
          config,
          requirePostgreSqlRuntimeDependencies(dependencies.postgreSql)
        )
      : undefined;

  return createPresenterPersistenceSelection(selectionConfig, {
    ...(dependencies.inMemorySeeds !== undefined
      ? { inMemorySeeds: dependencies.inMemorySeeds }
      : {}),
    ...(sql !== undefined ? { sql } : {})
  });
};

export const resolvePresenterPersistenceMode = (
  rawConfig: PresenterPersistenceSelectionConfigInput = {}
): PresenterPersistenceMode => {
  const config = PresenterPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createPresenterPersistenceSelection = (
  rawConfig: PresenterPersistenceSelectionConfigInput = {},
  dependencies: PresenterPersistenceSelectionDependencies = {}
): PresenterPersistenceSelection => {
  const mode = resolvePresenterPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlPresenterPersistenceSelection(dependencies.sql)
    : createInMemoryPresenterPersistenceSelection(dependencies.inMemorySeeds);
};

const requirePostgreSqlRuntimeDependencies = (
  dependencies: PresenterPostgreSqlPersistenceRuntimeDependencies | undefined
): PresenterPostgreSqlPersistenceRuntimeDependencies => {
  if (dependencies === undefined) {
    throw new Error(
      "Presenter PostgreSQL runtime dependencies are required for SQL persistence."
    );
  }

  return dependencies;
};

const createInMemoryPresenterPersistenceSelection = (
  seeds: PresenterInMemoryPersistenceSeeds = {}
): PresenterPersistenceSelection => {
  const adapter = createInMemoryPresenterPersistenceRepositoryAdapter(
    seeds.repository
  );

  return {
    commandRepository: adapter.commandRepository,
    inMemoryAdapter: adapter,
    mode: "in-memory",
    queryRepository: adapter.queryRepository
  };
};

const createSqlPresenterPersistenceSelection = (
  dependencies: PresenterSqlPersistenceDependencies | undefined
): PresenterPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error(
      "Presenter SQL persistence dependencies are required for sql mode."
    );
  }

  return {
    commandRepository: createPresenterCommandSqlRepository({
      clock: dependencies.clock,
      executor: dependencies.executor,
      ids: {
        auditLogId: dependencies.ids.auditLogId
      }
    }),
    mode: "sql",
    queryRepository: createPresenterQuerySqlRepository({
      executor: dependencies.executor
    })
  };
};
