import { z } from "zod";
import {
  CommunityInitialSchemaMigration,
  createCommunityCommandSqlRepository,
  createCommunityQuerySqlRepository,
  createSqliteMigrationRunner,
  type CommunityCommandPersistenceRepository,
  type CommunityQueryPersistenceRepository,
  type CommunitySqlExecutor,
  type MigrationRunStep,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { CommunityAiDraftPort } from "./ai-draft.js";
import {
  createInMemoryCommunityServicesAdapter,
  type CommunicationSendPort,
  type InMemoryCommunityServiceDependencies,
  type InMemoryCommunityServicesAdapter
} from "./in-memory.js";
import {
  createPersistenceBackedCommunityServicesAdapter,
  type PersistenceBackedCommunityServiceIds,
  type PersistenceBackedCommunityServicesAdapter
} from "./persistence.js";

export const CommunityPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const CommunityPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const CommunityPersistenceSelectionConfigSchema = z
  .object({
    environment: CommunityPersistenceEnvironmentSchema.default("development"),
    mode: CommunityPersistenceModeSchema.optional()
  })
  .strict();

export type CommunityPersistenceEnvironment = z.infer<
  typeof CommunityPersistenceEnvironmentSchema
>;
export type CommunityPersistenceMode = z.infer<typeof CommunityPersistenceModeSchema>;
export type CommunityPersistenceSelectionConfig = z.infer<
  typeof CommunityPersistenceSelectionConfigSchema
>;
export type CommunityPersistenceSelectionConfigInput = z.input<
  typeof CommunityPersistenceSelectionConfigSchema
>;

export interface CommunityPersistenceRepositories {
  readonly commandRepository: CommunityCommandPersistenceRepository;
  readonly queryRepository: CommunityQueryPersistenceRepository;
}

export interface CommunitySqlPersistenceDependencies {
  readonly aiDraftPort?: CommunityAiDraftPort;
  readonly clock: () => string;
  readonly executor: CommunitySqlExecutor;
  readonly ids?: Partial<PersistenceBackedCommunityServiceIds>;
  readonly sendPort?: CommunicationSendPort;
}

export interface CommunityPersistenceSelectionDependencies {
  readonly inMemory?: InMemoryCommunityServiceDependencies;
  readonly sql?: CommunitySqlPersistenceDependencies;
}

export type CommunityPersistenceSelection =
  | {
      readonly inMemoryAdapter: InMemoryCommunityServicesAdapter;
      readonly mode: "in-memory";
      readonly servicesAdapter: InMemoryCommunityServicesAdapter;
    }
  | (CommunityPersistenceRepositories & {
      readonly mode: "sql";
      readonly servicesAdapter: PersistenceBackedCommunityServicesAdapter;
    });

export interface CommunitySqliteMigrationDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

/**
 * Apply the Community+ schema to a SQLite database via the shared migration
 * runner, mirroring how the charts/play SQLite paths bring their schema up before
 * the SQL repositories run. Idempotent: already-applied migrations are skipped.
 */
export const migrateCommunitySqliteSchema = (
  dependencies: CommunitySqliteMigrationDependencies
): Promise<readonly MigrationRunStep[]> =>
  createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  }).applyPending([CommunityInitialSchemaMigration]);

export const resolveCommunityPersistenceMode = (
  rawConfig: CommunityPersistenceSelectionConfigInput = {}
): CommunityPersistenceMode => {
  const config = CommunityPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createCommunityPersistenceSelection = (
  rawConfig: CommunityPersistenceSelectionConfigInput = {},
  dependencies: CommunityPersistenceSelectionDependencies = {}
): CommunityPersistenceSelection => {
  const mode = resolveCommunityPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlCommunityPersistenceSelection(dependencies.sql)
    : createInMemoryCommunityPersistenceSelection(dependencies.inMemory);
};

const createInMemoryCommunityPersistenceSelection = (
  dependencies: InMemoryCommunityServiceDependencies = {}
): CommunityPersistenceSelection => {
  const adapter = createInMemoryCommunityServicesAdapter(dependencies);

  return {
    inMemoryAdapter: adapter,
    mode: "in-memory",
    servicesAdapter: adapter
  };
};

const createSqlCommunityPersistenceSelection = (
  dependencies: CommunitySqlPersistenceDependencies | undefined
): CommunityPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error("Community SQL persistence dependencies are required for sql mode.");
  }

  const commandRepository = createCommunityCommandSqlRepository({
    clock: dependencies.clock,
    executor: dependencies.executor
  });
  const queryRepository = createCommunityQuerySqlRepository({
    executor: dependencies.executor
  });

  return {
    commandRepository,
    mode: "sql",
    queryRepository,
    servicesAdapter: createPersistenceBackedCommunityServicesAdapter({
      clock: dependencies.clock,
      commandRepository,
      queryRepository,
      ...(dependencies.aiDraftPort !== undefined
        ? { aiDraftPort: dependencies.aiDraftPort }
        : {}),
      ...(dependencies.ids !== undefined ? { ids: dependencies.ids } : {}),
      ...(dependencies.sendPort !== undefined ? { sendPort: dependencies.sendPort } : {})
    })
  };
};
