import type {
  PlanningRehearsalAcknowledgementPersistenceRecord,
  PlanningRehearsalAcknowledgementPersistenceRepository,
  PlanningRehearsalAssetVisibilityPersistenceRecord,
  PlanningRehearsalAssetVisibilityPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema,
  ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema,
  PlanningRehearsalAcknowledgementPersistenceRecordSchema,
  PlanningRehearsalAssetVisibilityPersistenceRecordSchema,
  RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema,
  SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema
} from "@sanctuary-os/db";

export type InMemoryPlanningRehearsalTrackingOperationName =
  | "listRehearsalAcknowledgements"
  | "listRehearsalAssetVisibility"
  | "recordRehearsalAcknowledgement"
  | "setRehearsalAssetVisibility";

export interface RecordedInMemoryPlanningRehearsalTrackingOperation {
  readonly actorId?: string | undefined;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryPlanningRehearsalTrackingOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPlanningRehearsalTrackingRepositorySeed {
  readonly acknowledgements?: readonly PlanningRehearsalAcknowledgementPersistenceRecord[];
  readonly assetVisibility?: readonly PlanningRehearsalAssetVisibilityPersistenceRecord[];
}

export interface InMemoryPlanningRehearsalTrackingRepositoryAdapter {
  readonly readAcknowledgements: () => readonly PlanningRehearsalAcknowledgementPersistenceRecord[];
  readonly readAssetVisibility: () => readonly PlanningRehearsalAssetVisibilityPersistenceRecord[];
  readonly readOperations: () => readonly RecordedInMemoryPlanningRehearsalTrackingOperation[];
  readonly repository: PlanningRehearsalAcknowledgementPersistenceRepository &
    PlanningRehearsalAssetVisibilityPersistenceRepository;
}

interface PlanningRehearsalTrackingContext {
  readonly actorId?: string | undefined;
  readonly requestId: string;
  readonly tenantId: string;
}

export const createInMemoryPlanningRehearsalTrackingRepositoryAdapter = (
  seed: InMemoryPlanningRehearsalTrackingRepositorySeed = {}
): InMemoryPlanningRehearsalTrackingRepositoryAdapter => {
  const assetVisibility = new Map(
    (seed.assetVisibility ?? []).map((rawVisibility) => {
      const visibility =
        PlanningRehearsalAssetVisibilityPersistenceRecordSchema.parse(rawVisibility);
      return [visibility.rehearsalAssetVisibilityId, visibility] as const;
    })
  );
  const acknowledgements = new Map(
    (seed.acknowledgements ?? []).map((rawAcknowledgement) => {
      const acknowledgement =
        PlanningRehearsalAcknowledgementPersistenceRecordSchema.parse(
          rawAcknowledgement
        );
      return [acknowledgement.rehearsalAcknowledgementId, acknowledgement] as const;
    })
  );
  const operations: RecordedInMemoryPlanningRehearsalTrackingOperation[] = [];

  let nextVisibilityNumber = assetVisibility.size + 1;
  let nextAcknowledgementNumber = acknowledgements.size + 1;

  const recordOperation = (
    operationName: InMemoryPlanningRehearsalTrackingOperationName,
    context: PlanningRehearsalTrackingContext,
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

  const findExistingVisibilityId = (
    input: Readonly<{
      assetId: string;
      serviceId: string;
      serviceItemId: string;
    }>,
    tenantId: string
  ): string | undefined =>
    [...assetVisibility.values()].find(
      (visibility) =>
        visibility.assetId === input.assetId &&
        visibility.serviceId === input.serviceId &&
        visibility.serviceItemId === input.serviceItemId &&
        visibility.tenantId === tenantId
    )?.rehearsalAssetVisibilityId;

  const repository: PlanningRehearsalAcknowledgementPersistenceRepository &
    PlanningRehearsalAssetVisibilityPersistenceRepository = {
    listRehearsalAcknowledgements: (
      rawOperation
    ): Promise<readonly PlanningRehearsalAcknowledgementPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema.parse(
            rawOperation
          );
        recordOperation(
          "listRehearsalAcknowledgements",
          operation.options.context
        );

        return [...acknowledgements.values()].filter((acknowledgement) => {
          if (acknowledgement.tenantId !== operation.options.context.tenantId) {
            return false;
          }

          if (acknowledgement.serviceId !== operation.input.serviceId) {
            return false;
          }

          if (
            operation.input.serviceItemId !== undefined &&
            acknowledgement.serviceItemId !== operation.input.serviceItemId
          ) {
            return false;
          }

          if (
            operation.input.assetId !== undefined &&
            acknowledgement.assetId !== operation.input.assetId
          ) {
            return false;
          }

          if (
            operation.input.assignmentId !== undefined &&
            acknowledgement.assignmentId !== operation.input.assignmentId
          ) {
            return false;
          }

          if (
            operation.input.personId !== undefined &&
            acknowledgement.personId !== operation.input.personId
          ) {
            return false;
          }

          return true;
        });
      }),

    listRehearsalAssetVisibility: (
      rawOperation
    ): Promise<readonly PlanningRehearsalAssetVisibilityPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse(
            rawOperation
          );
        recordOperation(
          "listRehearsalAssetVisibility",
          operation.options.context
        );

        return [...assetVisibility.values()].filter((visibility) => {
          if (visibility.tenantId !== operation.options.context.tenantId) {
            return false;
          }

          if (visibility.serviceId !== operation.input.serviceId) {
            return false;
          }

          if (
            operation.input.serviceItemId !== undefined &&
            visibility.serviceItemId !== operation.input.serviceItemId
          ) {
            return false;
          }

          return true;
        });
      }),

    recordRehearsalAcknowledgement: (
      rawOperation
    ): Promise<PlanningRehearsalAcknowledgementPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema.parse(
            rawOperation
          );
        recordOperation(
          "recordRehearsalAcknowledgement",
          operation.options.context,
          operation.options.intent
        );

        const acknowledgement =
          PlanningRehearsalAcknowledgementPersistenceRecordSchema.parse({
            ...operation.input,
            rehearsalAcknowledgementId: `rehearsal_ack_${String(
              nextAcknowledgementNumber
            )}`,
            tenantId: operation.options.context.tenantId
          });
        nextAcknowledgementNumber += 1;
        acknowledgements.set(
          acknowledgement.rehearsalAcknowledgementId,
          acknowledgement
        );

        return acknowledgement;
      }),

    setRehearsalAssetVisibility: (
      rawOperation
    ): Promise<PlanningRehearsalAssetVisibilityPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse(
            rawOperation
          );
        recordOperation(
          "setRehearsalAssetVisibility",
          operation.options.context,
          operation.options.intent
        );

        const existingVisibilityId = findExistingVisibilityId(
          operation.input,
          operation.options.context.tenantId
        );
        const rehearsalAssetVisibilityId =
          existingVisibilityId ?? `visibility_${String(nextVisibilityNumber)}`;

        if (existingVisibilityId === undefined) {
          nextVisibilityNumber += 1;
        }

        const visibility =
          PlanningRehearsalAssetVisibilityPersistenceRecordSchema.parse({
            ...operation.input,
            rehearsalAssetVisibilityId,
            tenantId: operation.options.context.tenantId
          });
        assetVisibility.set(visibility.rehearsalAssetVisibilityId, visibility);

        return visibility;
      })
  };

  return {
    readAcknowledgements: () => [...acknowledgements.values()],
    readAssetVisibility: () => [...assetVisibility.values()],
    readOperations: () => [...operations],
    repository
  };
};
