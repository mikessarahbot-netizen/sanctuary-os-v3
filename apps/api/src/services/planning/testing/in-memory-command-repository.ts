import type {
  PlanningAssignmentPersistenceRecord,
  PlanningServiceCommandPersistenceRepository,
  PlanningServiceItemPersistenceRecord,
  PlanningServicePersistenceRecord,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  AddPlanningServiceItemPersistenceOperationSchema,
  AssignPlanningVolunteerPersistenceOperationSchema,
  CreatePlanningServicePersistenceOperationSchema,
  ReorderPlanningServiceItemsPersistenceOperationSchema,
  UpdatePlanningAssignmentStatusPersistenceOperationSchema,
  UpdatePlanningServiceItemPersistenceOperationSchema,
  UpdatePlanningServicePersistenceOperationSchema
} from "@sanctuary-os/db";

export type InMemoryPlanningCommandOperationName =
  | "addServiceItem"
  | "assignVolunteer"
  | "createService"
  | "reorderServiceItems"
  | "updateAssignmentStatus"
  | "updateService"
  | "updateServiceItem";

export interface RecordedInMemoryPlanningCommandOperation {
  readonly actorId: string;
  readonly intent: RepositoryMutationIntent;
  readonly operationName: InMemoryPlanningCommandOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPlanningCommandRepositoryAdapter {
  readonly repository: PlanningServiceCommandPersistenceRepository;
  readonly readAssignments: () => readonly PlanningAssignmentPersistenceRecord[];
  readonly readOperations: () => readonly RecordedInMemoryPlanningCommandOperation[];
  readonly readServiceItems: (
    serviceId: string
  ) => readonly PlanningServiceItemPersistenceRecord[];
  readonly readServices: () => readonly PlanningServicePersistenceRecord[];
}

interface ParsedRepositoryWriteOptions {
  readonly context: {
    readonly actorId?: string | undefined;
    readonly requestId: string;
    readonly tenantId: string;
  };
  readonly intent: RepositoryMutationIntent;
  readonly transaction?: { readonly transactionId: string } | undefined;
}

export const createInMemoryPlanningCommandRepositoryAdapter =
  (): InMemoryPlanningCommandRepositoryAdapter => {
    const services = new Map<string, PlanningServicePersistenceRecord>();
    const serviceItems = new Map<string, PlanningServiceItemPersistenceRecord>();
    const assignments = new Map<string, PlanningAssignmentPersistenceRecord>();
    const operations: RecordedInMemoryPlanningCommandOperation[] = [];

    let nextServiceNumber = 1;
    let nextServiceItemNumber = 1;
    let nextAssignmentNumber = 1;

    const recordOperation = (
      operationName: InMemoryPlanningCommandOperationName,
      options: ParsedRepositoryWriteOptions
    ): void => {
      const actorId = options.context.actorId;

      if (actorId === undefined) {
        throw new Error("Planning command write context requires an actor ID.");
      }

      operations.push({
        actorId,
        intent: options.intent,
        operationName,
        requestId: options.context.requestId,
        tenantId: options.context.tenantId
      });
    };

    const findTenantService = (
      serviceId: string,
      tenantId: string
    ): PlanningServicePersistenceRecord => {
      const service = services.get(serviceId);

      if (service === undefined || service.tenantId !== tenantId) {
        throw new Error("Planning service not found for tenant.");
      }

      return service;
    };

    const repository: PlanningServiceCommandPersistenceRepository = {
      addServiceItem: (rawOperation): Promise<PlanningServiceItemPersistenceRecord> => {
        const operation = AddPlanningServiceItemPersistenceOperationSchema.parse(rawOperation);
        recordOperation("addServiceItem", operation.options);
        findTenantService(operation.input.serviceId, operation.options.context.tenantId);

        const existingItems = [...serviceItems.values()].filter(
          (serviceItem) =>
            serviceItem.serviceId === operation.input.serviceId &&
            serviceItem.tenantId === operation.options.context.tenantId
        );
        const serviceItem: PlanningServiceItemPersistenceRecord = {
          ...operation.input,
          serviceItemId: `item_${String(nextServiceItemNumber)}`,
          sortOrder: existingItems.length,
          tenantId: operation.options.context.tenantId
        };
        nextServiceItemNumber += 1;
        serviceItems.set(serviceItem.serviceItemId, serviceItem);

        return Promise.resolve(serviceItem);
      },

      assignVolunteer: (rawOperation): Promise<PlanningAssignmentPersistenceRecord> => {
        const operation = AssignPlanningVolunteerPersistenceOperationSchema.parse(rawOperation);
        recordOperation("assignVolunteer", operation.options);
        findTenantService(operation.input.serviceId, operation.options.context.tenantId);

        const assignment: PlanningAssignmentPersistenceRecord = {
          ...operation.input,
          assignmentId: `assignment_${String(nextAssignmentNumber)}`,
          status: "pending",
          tenantId: operation.options.context.tenantId
        };
        nextAssignmentNumber += 1;
        assignments.set(assignment.assignmentId, assignment);

        return Promise.resolve(assignment);
      },

      createService: (rawOperation): Promise<PlanningServicePersistenceRecord> => {
        const operation = CreatePlanningServicePersistenceOperationSchema.parse(rawOperation);
        recordOperation("createService", operation.options);

        const service: PlanningServicePersistenceRecord = {
          ...operation.input,
          serviceId: `service_${String(nextServiceNumber)}`,
          status: "draft",
          tenantId: operation.options.context.tenantId
        };
        nextServiceNumber += 1;
        services.set(service.serviceId, service);

        return Promise.resolve(service);
      },

      reorderServiceItems: (
        rawOperation
      ): Promise<readonly PlanningServiceItemPersistenceRecord[]> => {
        const operation = ReorderPlanningServiceItemsPersistenceOperationSchema.parse(rawOperation);
        recordOperation("reorderServiceItems", operation.options);
        findTenantService(operation.input.serviceId, operation.options.context.tenantId);

        const reorderedItems = operation.input.orderedServiceItemIds.map(
          (serviceItemId, sortOrder): PlanningServiceItemPersistenceRecord => {
            const serviceItem = serviceItems.get(serviceItemId);

            if (
              serviceItem === undefined ||
              serviceItem.serviceId !== operation.input.serviceId ||
              serviceItem.tenantId !== operation.options.context.tenantId
            ) {
              throw new Error("Planning service item not found for tenant.");
            }

            const reorderedServiceItem = {
              ...serviceItem,
              sortOrder
            };
            serviceItems.set(serviceItemId, reorderedServiceItem);

            return reorderedServiceItem;
          }
        );

        return Promise.resolve(reorderedItems);
      },

      updateAssignmentStatus: (
        rawOperation
      ): Promise<PlanningAssignmentPersistenceRecord> => {
        const operation =
          UpdatePlanningAssignmentStatusPersistenceOperationSchema.parse(rawOperation);
        recordOperation("updateAssignmentStatus", operation.options);
        findTenantService(operation.input.serviceId, operation.options.context.tenantId);

        const assignment = assignments.get(operation.input.assignmentId);

        if (
          assignment === undefined ||
          assignment.serviceId !== operation.input.serviceId ||
          assignment.tenantId !== operation.options.context.tenantId
        ) {
          throw new Error("Planning assignment not found for tenant.");
        }

        const updatedAssignment = {
          ...assignment,
          status: operation.input.status
        };
        assignments.set(updatedAssignment.assignmentId, updatedAssignment);

        return Promise.resolve(updatedAssignment);
      },

      updateService: (rawOperation): Promise<PlanningServicePersistenceRecord> => {
        const operation = UpdatePlanningServicePersistenceOperationSchema.parse(rawOperation);
        recordOperation("updateService", operation.options);

        const service = findTenantService(
          operation.input.serviceId,
          operation.options.context.tenantId
        );
        const updatedService: PlanningServicePersistenceRecord = {
          ...service,
          ...(operation.input.serviceTypeId !== undefined
            ? { serviceTypeId: operation.input.serviceTypeId }
            : {}),
          ...(operation.input.startsAt !== undefined ? { startsAt: operation.input.startsAt } : {}),
          ...(operation.input.status !== undefined ? { status: operation.input.status } : {}),
          ...(operation.input.title !== undefined ? { title: operation.input.title } : {})
        };
        services.set(updatedService.serviceId, updatedService);

        return Promise.resolve(updatedService);
      },

      updateServiceItem: (
        rawOperation
      ): Promise<PlanningServiceItemPersistenceRecord> => {
        const operation = UpdatePlanningServiceItemPersistenceOperationSchema.parse(rawOperation);
        recordOperation("updateServiceItem", operation.options);
        findTenantService(operation.input.serviceId, operation.options.context.tenantId);

        const serviceItem = serviceItems.get(operation.input.serviceItemId);

        if (
          serviceItem === undefined ||
          serviceItem.serviceId !== operation.input.serviceId ||
          serviceItem.tenantId !== operation.options.context.tenantId
        ) {
          throw new Error("Planning service item not found for tenant.");
        }

        const updatedServiceItem: PlanningServiceItemPersistenceRecord = {
          ...serviceItem,
          ...(operation.input.durationMinutes !== undefined
            ? { durationMinutes: operation.input.durationMinutes }
            : {}),
          ...(operation.input.notes !== undefined ? { notes: operation.input.notes } : {}),
          ...(operation.input.songId !== undefined ? { songId: operation.input.songId } : {}),
          ...(operation.input.title !== undefined ? { title: operation.input.title } : {}),
          ...(operation.input.type !== undefined ? { type: operation.input.type } : {})
        };
        serviceItems.set(updatedServiceItem.serviceItemId, updatedServiceItem);

        return Promise.resolve(updatedServiceItem);
      }
    };

    return {
      readAssignments: () => [...assignments.values()],
      readOperations: () => [...operations],
      readServiceItems: (serviceId) =>
        [...serviceItems.values()]
          .filter((serviceItem) => serviceItem.serviceId === serviceId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      readServices: () => [...services.values()],
      repository
    };
  };
