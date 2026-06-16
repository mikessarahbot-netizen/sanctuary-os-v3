import { z } from "zod";
import {
  createPlanningCcliUsageSqlRepository,
  createPlanningReadinessSqlRepository,
  createPlanningRehearsalTrackingSqlRepository,
  createPlanningServiceCommandSqlRepository,
  createPlanningServiceQuerySqlRepository,
  type PlanningCcliUsageLogPersistenceRepository,
  type PlanningReadinessPersistenceRepository,
  type PlanningRehearsalAcknowledgementPersistenceRepository,
  type PlanningRehearsalAssetVisibilityPersistenceRepository,
  type PlanningServiceCommandPersistenceRepository,
  type PlanningServiceQueryPersistenceRepository,
  type PlanningSqlExecutor
} from "@sanctuary-os/db";
import {
  createInMemoryPlanningCcliUsageRepositoryAdapter,
  type InMemoryPlanningCcliUsageRepositoryAdapter,
  type InMemoryPlanningCcliUsageRepositorySeed
} from "./testing/in-memory-ccli-usage-repository.js";
import {
  createInMemoryPlanningCommandRepositoryAdapter,
  type InMemoryPlanningCommandRepositoryAdapter
} from "./testing/in-memory-command-repository.js";
import {
  createInMemoryPlanningQueryRepositoryAdapter,
  type InMemoryPlanningQueryRepositoryAdapter,
  type InMemoryPlanningQueryRepositorySeed
} from "./testing/in-memory-query-repository.js";
import {
  createInMemoryPlanningReadinessRepositoryAdapter,
  type InMemoryPlanningReadinessRepositoryAdapter,
  type InMemoryPlanningReadinessRepositorySeed
} from "./testing/in-memory-readiness-repository.js";
import {
  createInMemoryPlanningRehearsalTrackingRepositoryAdapter,
  type InMemoryPlanningRehearsalTrackingRepositoryAdapter,
  type InMemoryPlanningRehearsalTrackingRepositorySeed
} from "./testing/in-memory-rehearsal-tracking-repository.js";

export const PlanningPersistenceEnvironmentSchema = z.enum([
  "development",
  "production",
  "test"
]);

export const PlanningPersistenceModeSchema = z.enum(["in-memory", "sql"]);

export const PlanningPersistenceSelectionConfigSchema = z
  .object({
    environment: PlanningPersistenceEnvironmentSchema.default("development"),
    mode: PlanningPersistenceModeSchema.optional()
  })
  .strict();

export type PlanningPersistenceEnvironment = z.infer<
  typeof PlanningPersistenceEnvironmentSchema
>;
export type PlanningPersistenceMode = z.infer<typeof PlanningPersistenceModeSchema>;
export type PlanningPersistenceSelectionConfig = z.infer<
  typeof PlanningPersistenceSelectionConfigSchema
>;
export type PlanningPersistenceSelectionConfigInput = z.input<
  typeof PlanningPersistenceSelectionConfigSchema
>;

export interface PlanningReadinessPersistenceRepositoryWithLookup
  extends PlanningReadinessPersistenceRepository,
    Pick<PlanningServiceQueryPersistenceRepository, "getServiceReadiness"> {}

export interface PlanningPersistenceRepositories {
  readonly ccliUsageRepository: PlanningCcliUsageLogPersistenceRepository;
  readonly commandRepository: PlanningServiceCommandPersistenceRepository;
  readonly mode: PlanningPersistenceMode;
  readonly queryRepository: PlanningServiceQueryPersistenceRepository;
  readonly readinessRepository: PlanningReadinessPersistenceRepositoryWithLookup;
  readonly rehearsalTrackingRepository: PlanningRehearsalAcknowledgementPersistenceRepository &
    PlanningRehearsalAssetVisibilityPersistenceRepository;
}

export interface PlanningInMemoryPersistenceSeeds {
  readonly ccliUsage?: InMemoryPlanningCcliUsageRepositorySeed;
  readonly query?: InMemoryPlanningQueryRepositorySeed;
  readonly readiness?: InMemoryPlanningReadinessRepositorySeed;
  readonly rehearsalTracking?: InMemoryPlanningRehearsalTrackingRepositorySeed;
}

export interface PlanningInMemoryPersistenceAdapters {
  readonly ccliUsage: InMemoryPlanningCcliUsageRepositoryAdapter;
  readonly command: InMemoryPlanningCommandRepositoryAdapter;
  readonly query: InMemoryPlanningQueryRepositoryAdapter;
  readonly readiness: InMemoryPlanningReadinessRepositoryAdapter;
  readonly rehearsalTracking: InMemoryPlanningRehearsalTrackingRepositoryAdapter;
}

export interface PlanningSqlPersistenceIds {
  readonly assignmentId: () => string;
  readonly auditLogId: () => string;
  readonly ccliUsageLogId: () => string;
  readonly rehearsalAcknowledgementId: () => string;
  readonly rehearsalAssetVisibilityId: () => string;
  readonly serviceId: () => string;
  readonly serviceItemId: () => string;
}

export interface PlanningSqlPersistenceDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: PlanningSqlPersistenceIds;
}

export type PlanningPersistenceSelection =
  | (PlanningPersistenceRepositories & {
      readonly inMemoryAdapters: PlanningInMemoryPersistenceAdapters;
      readonly mode: "in-memory";
    })
  | (PlanningPersistenceRepositories & {
      readonly mode: "sql";
    });

export interface PlanningPersistenceSelectionDependencies {
  readonly inMemorySeeds?: PlanningInMemoryPersistenceSeeds;
  readonly sql?: PlanningSqlPersistenceDependencies;
}

export const resolvePlanningPersistenceMode = (
  rawConfig: PlanningPersistenceSelectionConfigInput = {}
): PlanningPersistenceMode => {
  const config = PlanningPersistenceSelectionConfigSchema.parse(rawConfig);

  if (config.mode !== undefined) {
    return config.mode;
  }

  return config.environment === "production" ? "sql" : "in-memory";
};

export const createPlanningPersistenceSelection = (
  rawConfig: PlanningPersistenceSelectionConfigInput = {},
  dependencies: PlanningPersistenceSelectionDependencies = {}
): PlanningPersistenceSelection => {
  const mode = resolvePlanningPersistenceMode(rawConfig);

  return mode === "sql"
    ? createSqlPlanningPersistenceSelection(dependencies.sql)
    : createInMemoryPlanningPersistenceSelection(dependencies.inMemorySeeds);
};

const createInMemoryPlanningPersistenceSelection = (
  seeds: PlanningInMemoryPersistenceSeeds = {}
): PlanningPersistenceSelection => {
  const command = createInMemoryPlanningCommandRepositoryAdapter();
  const query = createInMemoryPlanningQueryRepositoryAdapter(seeds.query);
  const ccliUsage = createInMemoryPlanningCcliUsageRepositoryAdapter(
    seeds.ccliUsage
  );
  const readiness = createInMemoryPlanningReadinessRepositoryAdapter(
    seeds.readiness
  );
  const rehearsalTracking = createInMemoryPlanningRehearsalTrackingRepositoryAdapter(
    seeds.rehearsalTracking
  );

  return {
    ccliUsageRepository: ccliUsage.repository,
    commandRepository: command.repository,
    inMemoryAdapters: {
      ccliUsage,
      command,
      query,
      readiness,
      rehearsalTracking
    },
    mode: "in-memory",
    queryRepository: query.repository,
    readinessRepository: readiness.repository,
    rehearsalTrackingRepository: rehearsalTracking.repository
  };
};

const createSqlPlanningPersistenceSelection = (
  dependencies: PlanningSqlPersistenceDependencies | undefined
): PlanningPersistenceSelection => {
  if (dependencies === undefined) {
    throw new Error(
      "Planning SQL persistence dependencies are required for sql mode."
    );
  }

  return {
    ccliUsageRepository: createPlanningCcliUsageSqlRepository({
      clock: dependencies.clock,
      executor: dependencies.executor,
      ids: {
        auditLogId: dependencies.ids.auditLogId,
        ccliUsageLogId: dependencies.ids.ccliUsageLogId
      }
    }),
    commandRepository: createPlanningServiceCommandSqlRepository({
      clock: dependencies.clock,
      executor: dependencies.executor,
      ids: {
        assignmentId: dependencies.ids.assignmentId,
        auditLogId: dependencies.ids.auditLogId,
        serviceId: dependencies.ids.serviceId,
        serviceItemId: dependencies.ids.serviceItemId
      }
    }),
    mode: "sql",
    queryRepository: createPlanningServiceQuerySqlRepository({
      executor: dependencies.executor
    }),
    readinessRepository: createPlanningReadinessSqlRepository({
      clock: dependencies.clock,
      executor: dependencies.executor,
      ids: {
        auditLogId: dependencies.ids.auditLogId
      }
    }),
    rehearsalTrackingRepository: createPlanningRehearsalTrackingSqlRepository({
      clock: dependencies.clock,
      executor: dependencies.executor,
      ids: {
        auditLogId: dependencies.ids.auditLogId,
        rehearsalAcknowledgementId:
          dependencies.ids.rehearsalAcknowledgementId,
        rehearsalAssetVisibilityId:
          dependencies.ids.rehearsalAssetVisibilityId
      }
    })
  };
};
