import type {
  PlanningReadinessPersistenceRecord,
  PlanningReadinessPersistenceRepository,
  PlanningServiceQueryPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  GetPlanningServiceReadinessPersistenceOperationSchema,
  PlanningReadinessPersistenceRecordSchema,
  SavePlanningServiceReadinessPersistenceOperationSchema
} from "@sanctuary-os/db";

export type InMemoryPlanningReadinessOperationName =
  | "getServiceReadiness"
  | "saveServiceReadiness";

export interface RecordedInMemoryPlanningReadinessOperation {
  readonly actorId?: string | undefined;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryPlanningReadinessOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPlanningReadinessRepositorySeed {
  readonly readinessRecords?: readonly PlanningReadinessPersistenceRecord[];
}

export interface InMemoryPlanningReadinessRepositoryAdapter {
  readonly readOperations: () => readonly RecordedInMemoryPlanningReadinessOperation[];
  readonly readReadinessRecords: () => readonly PlanningReadinessPersistenceRecord[];
  readonly repository: PlanningReadinessPersistenceRepository &
    Pick<PlanningServiceQueryPersistenceRepository, "getServiceReadiness">;
}

interface PlanningReadinessContext {
  readonly actorId?: string | undefined;
  readonly requestId: string;
  readonly tenantId: string;
}

export const createInMemoryPlanningReadinessRepositoryAdapter = (
  seed: InMemoryPlanningReadinessRepositorySeed = {}
): InMemoryPlanningReadinessRepositoryAdapter => {
  const readinessRecords = new Map(
    (seed.readinessRecords ?? []).map((rawReadiness) => {
      const readiness = PlanningReadinessPersistenceRecordSchema.parse(rawReadiness);
      return [readiness.serviceId, readiness] as const;
    })
  );
  const operations: RecordedInMemoryPlanningReadinessOperation[] = [];

  const recordOperation = (
    operationName: InMemoryPlanningReadinessOperationName,
    context: PlanningReadinessContext,
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

  const repository: PlanningReadinessPersistenceRepository &
    Pick<PlanningServiceQueryPersistenceRepository, "getServiceReadiness"> = {
    getServiceReadiness: (
      rawOperation
    ): Promise<PlanningReadinessPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation =
          GetPlanningServiceReadinessPersistenceOperationSchema.parse(rawOperation);
        recordOperation("getServiceReadiness", operation.options.context);

        const readiness = readinessRecords.get(operation.input.serviceId);

        return readiness !== undefined &&
          readiness.tenantId === operation.options.context.tenantId
          ? readiness
          : null;
      }),

    saveServiceReadiness: (
      rawOperation
    ): Promise<PlanningReadinessPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          SavePlanningServiceReadinessPersistenceOperationSchema.parse(rawOperation);
        recordOperation(
          "saveServiceReadiness",
          operation.options.context,
          operation.options.intent
        );

        if (operation.input.tenantId !== operation.options.context.tenantId) {
          throw new Error("Planning readiness result tenant mismatch.");
        }

        const readiness = PlanningReadinessPersistenceRecordSchema.parse(
          operation.input
        );
        readinessRecords.set(readiness.serviceId, readiness);

        return readiness;
      })
  };

  return {
    readOperations: () => [...operations],
    readReadinessRecords: () => [...readinessRecords.values()],
    repository
  };
};
