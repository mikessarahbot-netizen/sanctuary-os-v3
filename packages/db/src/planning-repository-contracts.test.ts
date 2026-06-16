import { describe, expect, it } from "vitest";
import {
  CreatePlanningServicePersistenceOperationSchema,
  RepositoryWriteOptionsSchema,
  UpdatePlanningServicePersistenceOperationSchema,
  type PlanningServicePersistenceRecord
} from "./index.js";
import type { PlanningServiceCommandPersistenceRepository } from "./index.js";

const serviceRecord: PlanningServicePersistenceRecord = {
  serviceId: "service_1",
  serviceTypeId: "sunday",
  status: "draft",
  tenantId: "tenant_1",
  title: "Sunday Service"
};

describe("Planning repository contracts", () => {
  it("validates tenant-scoped write options for Planning persistence operations", () => {
    const options = RepositoryWriteOptionsSchema.parse({
      context: {
        actorId: "actor_1",
        requestId: "request_1",
        tenantId: "tenant_1"
      },
      intent: "create"
    });

    expect(options.context.tenantId).toBe("tenant_1");
    expect(options.intent).toBe("create");
  });

  it("validates create and destructive update operation shapes", () => {
    expect(
      CreatePlanningServicePersistenceOperationSchema.parse({
        input: {
          serviceTypeId: "sunday",
          title: "Sunday Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      }).options.intent
    ).toBe("create");

    expect(
      UpdatePlanningServicePersistenceOperationSchema.parse({
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Planner confirmed canceling the service."
          },
          serviceId: "service_1",
          status: "canceled"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          },
          intent: "destructive-confirmed"
        }
      }).options.intent
    ).toBe("destructive-confirmed");
  });

  it("defines an adapter-free Planning persistence repository interface", async () => {
    const repository: PlanningServiceCommandPersistenceRepository = {
      addServiceItem: (operation) =>
        Promise.resolve({
          serviceId: operation.input.serviceId,
          serviceItemId: "item_1",
          sortOrder: 0,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title,
          type: operation.input.type
        }),
      assignVolunteer: (operation) =>
        Promise.resolve({
          assignmentId: "assignment_1",
          personId: operation.input.personId,
          roleId: operation.input.roleId,
          serviceId: operation.input.serviceId,
          status: "pending",
          tenantId: operation.options.context.tenantId
        }),
      createService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceTypeId: operation.input.serviceTypeId,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title
        }),
      reorderServiceItems: (operation) =>
        Promise.resolve([
          {
            serviceId: operation.input.serviceId,
            serviceItemId: operation.input.orderedServiceItemIds[0] ?? "item_1",
            sortOrder: 0,
            tenantId: operation.options.context.tenantId,
            title: "Opening Song",
            type: "song"
          }
        ]),
      updateAssignmentStatus: (operation) =>
        Promise.resolve({
          assignmentId: operation.input.assignmentId,
          personId: "person_1",
          roleId: "role_vocal",
          serviceId: operation.input.serviceId,
          status: operation.input.status,
          tenantId: operation.options.context.tenantId
        }),
      updateService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceId: operation.input.serviceId,
          status: operation.input.status ?? serviceRecord.status,
          tenantId: operation.options.context.tenantId
        }),
      updateServiceItem: (operation) =>
        Promise.resolve({
          serviceId: operation.input.serviceId,
          serviceItemId: operation.input.serviceItemId,
          sortOrder: 0,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title ?? "Opening Song",
          type: operation.input.type ?? "song"
        })
    };

    await expect(
      repository.createService({
        input: {
          serviceTypeId: "sunday",
          title: "Sunday Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual(serviceRecord);
  });
});
