import type {
  PlanningAssignmentPersistenceRecord,
  PlanningReadinessPersistenceRecord,
  PlanningServicePersistenceRecord,
  PlanningServiceQueryPersistenceRepository,
  PlanningServiceTemplatePersistenceRecord,
  PlanningSongLibraryItemPersistenceRecord
} from "@sanctuary-os/db";
import {
  GetPlanningServicePersistenceOperationSchema,
  GetPlanningServiceReadinessPersistenceOperationSchema,
  ListPlanningServiceAssignmentsPersistenceOperationSchema,
  ListPlanningServicesPersistenceOperationSchema,
  ListPlanningServiceTemplatesPersistenceOperationSchema,
  ListPlanningSongLibraryPersistenceOperationSchema,
  PlanningAssignmentPersistenceRecordSchema,
  PlanningReadinessPersistenceRecordSchema,
  PlanningServicePersistenceRecordSchema,
  PlanningServiceTemplatePersistenceRecordSchema,
  PlanningSongLibraryItemPersistenceRecordSchema
} from "@sanctuary-os/db";

export type InMemoryPlanningQueryOperationName =
  | "getService"
  | "getServiceReadiness"
  | "listServiceAssignments"
  | "listServices"
  | "listServiceTemplates"
  | "listSongLibrary";

export interface RecordedInMemoryPlanningQueryOperation {
  readonly actorId?: string | undefined;
  readonly operationName: InMemoryPlanningQueryOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPlanningQueryRepositorySeed {
  readonly assignments?: readonly PlanningAssignmentPersistenceRecord[];
  readonly readinessRecords?: readonly PlanningReadinessPersistenceRecord[];
  readonly readinessResults?: readonly PlanningReadinessPersistenceRecord[];
  readonly serviceTemplates?: readonly PlanningServiceTemplatePersistenceRecord[];
  readonly services?: readonly PlanningServicePersistenceRecord[];
  readonly songLibraryItems?: readonly PlanningSongLibraryItemPersistenceRecord[];
}

export interface InMemoryPlanningQueryRepositoryAdapter {
  readonly readOperations: () => readonly RecordedInMemoryPlanningQueryOperation[];
  readonly repository: PlanningServiceQueryPersistenceRepository;
}

interface PlanningReadContext {
  readonly actorId?: string | undefined;
  readonly requestId: string;
  readonly tenantId: string;
}

export const createInMemoryPlanningQueryRepositoryAdapter = (
  seed: InMemoryPlanningQueryRepositorySeed = {}
): InMemoryPlanningQueryRepositoryAdapter => {
  const services = new Map(
    (seed.services ?? []).map((rawService) => {
      const service = PlanningServicePersistenceRecordSchema.parse(rawService);
      return [service.serviceId, service] as const;
    })
  );
  const assignments = (seed.assignments ?? []).map((assignment) =>
    PlanningAssignmentPersistenceRecordSchema.parse(assignment)
  );
  const readinessSeed = [...(seed.readinessRecords ?? []), ...(seed.readinessResults ?? [])];
  const readinessRecords = new Map(
    readinessSeed.map((rawReadiness) => {
      const readiness = PlanningReadinessPersistenceRecordSchema.parse(rawReadiness);
      return [readiness.serviceId, readiness] as const;
    })
  );
  const serviceTemplates = (seed.serviceTemplates ?? []).map((template) =>
    PlanningServiceTemplatePersistenceRecordSchema.parse(template)
  );
  const songLibraryItems = (seed.songLibraryItems ?? []).map((song) =>
    PlanningSongLibraryItemPersistenceRecordSchema.parse(song)
  );
  const operations: RecordedInMemoryPlanningQueryOperation[] = [];

  const recordOperation = (
    operationName: InMemoryPlanningQueryOperationName,
    context: PlanningReadContext
  ): void => {
    operations.push({
      ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
      operationName,
      requestId: context.requestId,
      tenantId: context.tenantId
    });
  };

  const repository: PlanningServiceQueryPersistenceRepository = {
    getService: (
      rawOperation
    ): Promise<PlanningServicePersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation = GetPlanningServicePersistenceOperationSchema.parse(rawOperation);
        recordOperation("getService", operation.options.context);

        const service = services.get(operation.input.serviceId);

        return service !== undefined && service.tenantId === operation.options.context.tenantId
          ? service
          : null;
      }),

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

    listServiceAssignments: (
      rawOperation
    ): Promise<readonly PlanningAssignmentPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPlanningServiceAssignmentsPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listServiceAssignments", operation.options.context);

        return assignments.filter(
          (assignment) =>
            assignment.tenantId === operation.options.context.tenantId &&
            assignment.serviceId === operation.input.serviceId
        );
      }),

    listServices: (
      rawOperation
    ): Promise<readonly PlanningServicePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ListPlanningServicesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listServices", operation.options.context);
        const filter = operation.input.filter;

        return [...services.values()].filter((service) => {
          if (service.tenantId !== operation.options.context.tenantId) {
            return false;
          }

          if (
            filter?.serviceTypeId !== undefined &&
            service.serviceTypeId !== filter.serviceTypeId
          ) {
            return false;
          }

          if (filter?.status !== undefined && service.status !== filter.status) {
            return false;
          }

          if (
            filter?.startsAtOrAfter !== undefined &&
            (service.startsAt === undefined || service.startsAt < filter.startsAtOrAfter)
          ) {
            return false;
          }

          if (
            filter?.startsBefore !== undefined &&
            (service.startsAt === undefined || service.startsAt >= filter.startsBefore)
          ) {
            return false;
          }

          return true;
        });
      }),

    listServiceTemplates: (
      rawOperation
    ): Promise<readonly PlanningServiceTemplatePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPlanningServiceTemplatesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listServiceTemplates", operation.options.context);

        return serviceTemplates.filter(
          (template) =>
            template.tenantId === operation.options.context.tenantId &&
            template.serviceTypeId === operation.input.serviceTypeId
        );
      }),

    listSongLibrary: (
      rawOperation
    ): Promise<readonly PlanningSongLibraryItemPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ListPlanningSongLibraryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listSongLibrary", operation.options.context);
        const { includeBannedOrPaused, key, limit, query } = operation.input.searchInput;
        const normalizedQuery = query?.toLocaleLowerCase();

        const songs = songLibraryItems.filter((song) => {
          if (song.tenantId !== operation.options.context.tenantId) {
            return false;
          }

          if (includeBannedOrPaused !== true && song.isBannedOrPaused) {
            return false;
          }

          if (key !== undefined && !song.availableKeys.includes(key)) {
            return false;
          }

          if (
            normalizedQuery !== undefined &&
            !song.title.toLocaleLowerCase().includes(normalizedQuery) &&
            !(song.artist?.toLocaleLowerCase().includes(normalizedQuery) ?? false)
          ) {
            return false;
          }

          return true;
        });

        return limit === undefined ? songs : songs.slice(0, limit);
      })
  };

  return {
    readOperations: () => [...operations],
    repository
  };
};
