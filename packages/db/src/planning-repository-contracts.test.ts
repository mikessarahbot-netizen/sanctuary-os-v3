import { describe, expect, it } from "vitest";
import {
  CreatePlanningServicePersistenceOperationSchema,
  ListPlanningServicesPersistenceOperationSchema,
  ListPlanningServiceTemplatesPersistenceOperationSchema,
  RepositoryWriteOptionsSchema,
  UpdatePlanningServicePersistenceOperationSchema,
  type PlanningReadinessPersistenceRecord,
  type PlanningServicePersistenceRecord,
  type PlanningServiceTemplatePersistenceRecord
} from "./index.js";
import type {
  PlanningServiceCommandPersistenceRepository,
  PlanningServiceQueryPersistenceRepository
} from "./index.js";

const serviceRecord: PlanningServicePersistenceRecord = {
  serviceId: "service_1",
  serviceTypeId: "sunday",
  status: "draft",
  tenantId: "tenant_1",
  title: "Sunday Service"
};

const serviceTemplateRecord: PlanningServiceTemplatePersistenceRecord = {
  description: "Default Sunday flow.",
  serviceTemplateId: "template_sunday",
  serviceTypeId: "sunday",
  tenantId: "tenant_1",
  title: "Sunday Worship Template"
};

const readinessRecord: PlanningReadinessPersistenceRecord = {
  band: "needs-attention",
  checks: [
    {
      code: "required-roles",
      label: "Required roles assigned",
      maxScore: 25,
      score: 15
    }
  ],
  readinessScore: 65,
  recommendedActions: ["Finish: Required roles assigned."],
  risks: ["Required roles assigned is incomplete."],
  serviceId: "service_1",
  strengths: [],
  tenantId: "tenant_1"
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

  it("validates tenant-scoped Planning read operation shapes", () => {
    expect(
      ListPlanningServicesPersistenceOperationSchema.parse({
        input: {
          filter: {
            startsAtOrAfter: "2026-06-21T00:00:00.000Z",
            status: "scheduled"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          }
        }
      }).input.filter?.status
    ).toBe("scheduled");

    expect(
      ListPlanningServiceTemplatesPersistenceOperationSchema.parse({
        input: {
          serviceTypeId: "sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          }
        }
      }).input.serviceTypeId
    ).toBe("sunday");
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

  it("defines an adapter-free Planning query persistence repository interface", async () => {
    const repository: PlanningServiceQueryPersistenceRepository = {
      getService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceId: operation.input.serviceId,
          tenantId: operation.options.context.tenantId
        }),
      getServiceReadiness: (operation) =>
        Promise.resolve({
          ...readinessRecord,
          serviceId: operation.input.serviceId,
          tenantId: operation.options.context.tenantId
        }),
      listServiceAssignments: (operation) =>
        Promise.resolve([
          {
            assignmentId: "assignment_1",
            personId: "person_1",
            roleId: "role_vocal",
            serviceId: operation.input.serviceId,
            status: "pending",
            tenantId: operation.options.context.tenantId
          }
        ]),
      listServiceTemplates: (operation) =>
        Promise.resolve([
          {
            ...serviceTemplateRecord,
            serviceTypeId: operation.input.serviceTypeId,
            tenantId: operation.options.context.tenantId
          }
        ]),
      listServices: (operation) =>
        Promise.resolve([
          {
            ...serviceRecord,
            status: operation.input.filter?.status ?? serviceRecord.status,
            tenantId: operation.options.context.tenantId
          }
        ])
    };

    await expect(
      repository.listServices({
        input: {
          filter: {
            status: "scheduled"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        ...serviceRecord,
        status: "scheduled"
      }
    ]);

    await expect(
      repository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual(readinessRecord);

    await expect(
      repository.listServiceTemplates({
        input: {
          serviceTypeId: "sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_3",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([serviceTemplateRecord]);
  });
});
