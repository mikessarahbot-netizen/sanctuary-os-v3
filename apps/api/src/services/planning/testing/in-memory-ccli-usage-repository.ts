import type {
  PlanningCcliUsageLogPersistenceRecord,
  PlanningCcliUsageLogPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  ListPlanningCcliUsageLogsPersistenceOperationSchema,
  PlanningCcliUsageLogPersistenceRecordSchema,
  RecordPlanningCcliUsagePersistenceOperationSchema
} from "@sanctuary-os/db";

export type InMemoryPlanningCcliUsageOperationName =
  | "listCcliUsageLogs"
  | "recordCcliUsage";

export interface RecordedInMemoryPlanningCcliUsageOperation {
  readonly actorId?: string | undefined;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryPlanningCcliUsageOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPlanningCcliUsageRepositorySeed {
  readonly usageLogs?: readonly PlanningCcliUsageLogPersistenceRecord[];
}

export interface InMemoryPlanningCcliUsageRepositoryAdapter {
  readonly readOperations: () => readonly RecordedInMemoryPlanningCcliUsageOperation[];
  readonly readUsageLogs: () => readonly PlanningCcliUsageLogPersistenceRecord[];
  readonly repository: PlanningCcliUsageLogPersistenceRepository;
}

interface PlanningCcliUsageContext {
  readonly actorId?: string | undefined;
  readonly requestId: string;
  readonly tenantId: string;
}

export const createInMemoryPlanningCcliUsageRepositoryAdapter = (
  seed: InMemoryPlanningCcliUsageRepositorySeed = {}
): InMemoryPlanningCcliUsageRepositoryAdapter => {
  const usageLogs = new Map(
    (seed.usageLogs ?? []).map((rawUsageLog) => {
      const usageLog = PlanningCcliUsageLogPersistenceRecordSchema.parse(rawUsageLog);
      return [usageLog.ccliUsageLogId, usageLog] as const;
    })
  );
  const operations: RecordedInMemoryPlanningCcliUsageOperation[] = [];

  let nextUsageLogNumber = usageLogs.size + 1;

  const recordOperation = (
    operationName: InMemoryPlanningCcliUsageOperationName,
    context: PlanningCcliUsageContext,
    intent?: RepositoryMutationIntent
  ): void => {
    operations.push({
      ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
      ...(intent !== undefined ? { intent } : {}),
      operationName,
      requestId: context.requestId,
      tenantId: context.tenantId
    });
  };

  const repository: PlanningCcliUsageLogPersistenceRepository = {
    listCcliUsageLogs: (
      rawOperation
    ): Promise<readonly PlanningCcliUsageLogPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPlanningCcliUsageLogsPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listCcliUsageLogs", operation.options.context);

        return [...usageLogs.values()].filter((usageLog) => {
          if (usageLog.tenantId !== operation.options.context.tenantId) {
            return false;
          }

          if (usageLog.serviceId !== operation.input.serviceId) {
            return false;
          }

          if (
            operation.input.reportingStatus !== undefined &&
            usageLog.reportingStatus !== operation.input.reportingStatus
          ) {
            return false;
          }

          return true;
        });
      }),

    recordCcliUsage: (
      rawOperation
    ): Promise<PlanningCcliUsageLogPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          RecordPlanningCcliUsagePersistenceOperationSchema.parse(rawOperation);
        recordOperation(
          "recordCcliUsage",
          operation.options.context,
          operation.options.intent
        );

        const usageLog = PlanningCcliUsageLogPersistenceRecordSchema.parse({
          ...operation.input,
          ccliUsageLogId: `ccli_log_${String(nextUsageLogNumber)}`,
          reportingStatus: "pending",
          tenantId: operation.options.context.tenantId
        });
        nextUsageLogNumber += 1;
        usageLogs.set(usageLog.ccliUsageLogId, usageLog);

        return usageLog;
      })
  };

  return {
    readOperations: () => [...operations],
    readUsageLogs: () => [...usageLogs.values()],
    repository
  };
};
