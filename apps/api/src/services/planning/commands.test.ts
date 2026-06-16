import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import type { ApiEventEnvelope } from "../../events/index.js";
import {
  createPlanningCommandService,
  DuplicatePlanningServiceFromTemplateCommandSchema,
  ReorderPlanningServiceItemsCommandSchema,
  UpdatePlanningServiceCommandSchema,
  type PlanningAssignmentRecord,
  type PlanningCommandRepository,
  type PlanningServiceItemRecord,
  type PlanningServiceRecord
} from "./commands.js";
import { createInMemoryPlanningCommandRepositoryAdapter } from "./testing/in-memory-command-repository.js";

const serviceRecord: PlanningServiceRecord = {
  serviceId: "service_1",
  serviceTypeId: "type_sunday",
  startsAt: "2026-06-21T14:00:00.000Z",
  status: "scheduled",
  tenantId: "tenant_1",
  title: "Sunday Worship"
};

const serviceItemRecord: PlanningServiceItemRecord = {
  durationMinutes: 5,
  notes: "Band only.",
  serviceId: "service_1",
  serviceItemId: "item_1",
  songId: "song_1",
  sortOrder: 0,
  tenantId: "tenant_1",
  title: "Opening Song",
  type: "song"
};

const assignmentRecord: PlanningAssignmentRecord = {
  assignmentId: "assignment_1",
  personId: "person_1",
  roleId: "role_vocal",
  serviceId: "service_1",
  status: "pending",
  tenantId: "tenant_1"
};

const createRepository = (
  overrides: Partial<PlanningCommandRepository> = {}
): PlanningCommandRepository => ({
  addServiceItem: () => Promise.resolve(serviceItemRecord),
  assignVolunteer: () => Promise.resolve(assignmentRecord),
  createService: () => Promise.resolve(serviceRecord),
  duplicateServiceFromTemplate: () =>
    Promise.resolve({
      ...serviceRecord,
      serviceId: "service_from_template",
      title: "Sunday From Template"
    }),
  reorderServiceItems: () => Promise.resolve([serviceItemRecord]),
  updateAssignmentStatus: () =>
    Promise.resolve({
      ...assignmentRecord,
      status: "confirmed"
    }),
  updateService: () => Promise.resolve(serviceRecord),
  updateServiceItem: () => Promise.resolve(serviceItemRecord),
  ...overrides
});

describe("Planning command schemas", () => {
  it("requires explicit confirmation intent before publishing or canceling a service", () => {
    expect(() =>
      UpdatePlanningServiceCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          status: "published"
        },
        requestId: "request_1"
      })
    ).toThrow("Publishing or canceling a service requires explicit confirmation intent.");

    expect(
      UpdatePlanningServiceCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Worship leader approved publishing the service plan."
          },
          serviceId: "service_1",
          status: "published"
        },
        requestId: "request_1"
      }).input.status
    ).toBe("published");
  });

  it("rejects duplicate service item IDs in reorder commands", () => {
    expect(() =>
      ReorderPlanningServiceItemsCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          orderedServiceItemIds: ["item_1", "item_1"],
          serviceId: "service_1"
        },
        requestId: "request_1"
      })
    ).toThrow("Service item order cannot contain duplicate item IDs.");
  });

  it("validates duplicate service from template input", () => {
    expect(() =>
      DuplicatePlanningServiceFromTemplateCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).toThrow();

    expect(
      DuplicatePlanningServiceFromTemplateCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      }).input.serviceTemplateId
    ).toBe("template_sunday");
  });
});

describe("createPlanningCommandService", () => {
  it("tenant-scopes service creation through the actor and repository boundary", async () => {
    const createService = vi.fn<PlanningCommandRepository["createService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({ createService })
    });

    await expect(
      service.createService({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday Worship"
        },
        requestId: "request_1"
      })
    ).resolves.toEqual(serviceRecord);

    expect(createService).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    );
  });

  it("tenant-scopes duplicateServiceFromTemplate through the actor and repository boundary", async () => {
    const duplicateServiceFromTemplate = vi.fn<
      PlanningCommandRepository["duplicateServiceFromTemplate"]
    >(() =>
      Promise.resolve({
        ...serviceRecord,
        serviceId: "service_from_template",
        startsAt: "2026-06-21T14:00:00.000Z",
        title: "Sunday From Template"
      })
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({ duplicateServiceFromTemplate })
    });

    await expect(
      service.duplicateServiceFromTemplate({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).resolves.toEqual({
      ...serviceRecord,
      serviceId: "service_from_template",
      startsAt: "2026-06-21T14:00:00.000Z",
      title: "Sunday From Template"
    });

    expect(duplicateServiceFromTemplate).toHaveBeenCalledWith({
      input: {
        serviceTemplateId: "template_sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        title: "Sunday From Template"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_template",
          tenantId: "tenant_1"
        },
        intent: "create"
      }
    });
  });

  it("maps confirmed service publish commands to destructive-confirmed persistence intent", async () => {
    const updateService = vi.fn<PlanningCommandRepository["updateService"]>(() =>
      Promise.resolve({
        ...serviceRecord,
        status: "published"
      })
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({ updateService })
    });

    await expect(
      service.updateService({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Ready to publish for volunteers."
          },
          serviceId: "service_1",
          status: "published"
        },
        requestId: "request_1"
      })
    ).resolves.toMatchObject({
      serviceId: "service_1",
      status: "published"
    });

    const firstCall = updateService.mock.calls[0];
    expect(firstCall).toBeDefined();

    const [operation] = firstCall as [
      Parameters<PlanningCommandRepository["updateService"]>[0]
    ];

    expect(operation).toEqual({
      input: {
        confirmationIntent: {
          confirmed: true,
          reason: "Ready to publish for volunteers."
        },
        serviceId: "service_1",
        status: "published"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_1",
          tenantId: "tenant_1"
        },
        intent: "destructive-confirmed"
      }
    });
  });

  it("rejects actors without Planning command roles before persistence", async () => {
    const createService = vi.fn<PlanningCommandRepository["createService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({ createService })
    });

    await expect(
      service.createService({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday",
          title: "Sunday Worship"
        },
        requestId: "request_1"
      })
    ).rejects.toThrow("Actor is not allowed to mutate planning services.");

    expect(createService).not.toHaveBeenCalled();
  });

  it("rejects duplicateServiceFromTemplate actors without Planning command roles", async () => {
    const duplicateServiceFromTemplate = vi.fn<
      PlanningCommandRepository["duplicateServiceFromTemplate"]
    >(() => Promise.resolve(serviceRecord));
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({ duplicateServiceFromTemplate })
    });

    await expect(
      service.duplicateServiceFromTemplate({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).rejects.toThrow("Actor is not allowed to mutate planning services.");

    expect(duplicateServiceFromTemplate).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant service records returned by persistence", async () => {
    const publishAfterCommit = vi.fn<(event: ApiEventEnvelope) => Promise<void>>(() =>
      Promise.resolve()
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit },
      planningRepository: createRepository({
        updateService: () =>
          Promise.resolve({
            ...serviceRecord,
            status: "published",
            tenantId: "tenant_2"
          })
      })
    });

    await expect(
      service.updateService({
        actor: {
          actorId: "actor_1",
          roles: ["church_admin"],
          tenantId: "tenant_1"
        },
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Admin approved publishing the plan."
          },
          serviceId: "service_1",
          status: "published"
        },
        requestId: "request_1"
      })
    ).rejects.toThrow("Planning service command tenant mismatch.");

    expect(publishAfterCommit).not.toHaveBeenCalled();
  });

  it("rejects duplicated services outside tenant or requested fields", async () => {
    const tenantMismatchService = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({
        duplicateServiceFromTemplate: () =>
          Promise.resolve({
            ...serviceRecord,
            tenantId: "tenant_2",
            title: "Sunday From Template"
          })
      })
    });

    await expect(
      tenantMismatchService.duplicateServiceFromTemplate({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).rejects.toThrow("Planning service command tenant mismatch.");

    const titleMismatchService = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({
        duplicateServiceFromTemplate: () =>
          Promise.resolve({
            ...serviceRecord,
            title: "Wrong Title"
          })
      })
    });

    await expect(
      titleMismatchService.duplicateServiceFromTemplate({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).rejects.toThrow("Planning duplicate service command title mismatch.");

    const startTimeMismatchService = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: createRepository({
        duplicateServiceFromTemplate: () =>
          Promise.resolve({
            ...serviceRecord,
            startsAt: "2026-06-22T14:00:00.000Z",
            title: "Sunday From Template"
          })
      })
    });

    await expect(
      startTimeMismatchService.duplicateServiceFromTemplate({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTemplateId: "template_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday From Template"
        },
        requestId: "request_template"
      })
    ).rejects.toThrow("Planning duplicate service command start time mismatch.");
  });

  it("publishes validated service and assignment events after command completion", async () => {
    const publishAfterCommit = vi.fn<(event: ApiEventEnvelope) => Promise<void>>(() =>
      Promise.resolve()
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit },
      planningRepository: createRepository({
        updateService: () =>
          Promise.resolve({
            ...serviceRecord,
            status: "published"
          })
      })
    });

    await service.updateService({
      actor: {
        actorId: "actor_1",
        roles: ["worship_leader"],
        tenantId: "tenant_1"
      },
      input: {
        confirmationIntent: {
          confirmed: true,
          reason: "Ready for volunteers to view."
        },
        serviceId: "service_1",
        status: "published"
      },
      requestId: "request_1"
    });

    await service.updateAssignmentStatus({
      actor: {
        actorId: "actor_1",
        roles: ["planner"],
        tenantId: "tenant_1"
      },
      input: {
        assignmentId: "assignment_1",
        serviceId: "service_1",
        status: "confirmed"
      },
      requestId: "request_2"
    });

    expect(publishAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: "service_1",
        actorId: "actor_1",
        eventType: "service.published",
        payload: {
          serviceId: "service_1",
          status: "published"
        },
        schemaVersion: "planning-service-published.v1",
        tenantId: "tenant_1"
      })
    );
    expect(publishAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: "service_1",
        actorId: "actor_1",
        eventType: "assignment.statusChanged",
        payload: {
          assignmentId: "assignment_1",
          serviceId: "service_1",
          status: "confirmed"
        },
        schemaVersion: "planning-assignment-status.v1",
        tenantId: "tenant_1"
      })
    );
  });

  it("persists a command sequence through the in-memory Planning repository adapter", async () => {
    const repositoryAdapter = createInMemoryPlanningCommandRepositoryAdapter();
    const publishAfterCommit = vi.fn<(event: ApiEventEnvelope) => Promise<void>>(() =>
      Promise.resolve()
    );
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit },
      planningRepository: repositoryAdapter.repository
    });
    const actor: AuthenticatedActor = {
      actorId: "actor_1",
      roles: ["worship_leader"],
      tenantId: "tenant_1"
    };

    const createdService = await service.createService({
      actor,
      input: {
        serviceTypeId: "type_sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        title: "Sunday Worship"
      },
      requestId: "request_create"
    });
    const duplicatedService = await service.duplicateServiceFromTemplate({
      actor,
      input: {
        serviceTemplateId: "type_midweek",
        startsAt: "2026-06-25T23:00:00.000Z",
        title: "Midweek From Template"
      },
      requestId: "request_duplicate"
    });
    const openingSong = await service.addServiceItem({
      actor,
      input: {
        durationMinutes: 5,
        serviceId: createdService.serviceId,
        songId: "song_1",
        title: "Opening Song",
        type: "song"
      },
      requestId: "request_add_song"
    });
    const welcome = await service.addServiceItem({
      actor,
      input: {
        durationMinutes: 2,
        serviceId: createdService.serviceId,
        title: "Welcome",
        type: "announcement"
      },
      requestId: "request_add_welcome"
    });
    const reorderedItems = await service.reorderServiceItems({
      actor,
      input: {
        orderedServiceItemIds: [welcome.serviceItemId, openingSong.serviceItemId],
        serviceId: createdService.serviceId
      },
      requestId: "request_reorder"
    });
    const assignment = await service.assignVolunteer({
      actor,
      input: {
        personId: "person_1",
        roleId: "role_vocal",
        serviceId: createdService.serviceId
      },
      requestId: "request_assign"
    });
    const confirmedAssignment = await service.updateAssignmentStatus({
      actor,
      input: {
        assignmentId: assignment.assignmentId,
        serviceId: createdService.serviceId,
        status: "confirmed"
      },
      requestId: "request_confirm"
    });
    const publishedService = await service.updateService({
      actor,
      input: {
        confirmationIntent: {
          confirmed: true,
          reason: "Ready for volunteers."
        },
        serviceId: createdService.serviceId,
        status: "published"
      },
      requestId: "request_publish"
    });

    expect(reorderedItems.map((serviceItem) => serviceItem.serviceItemId)).toEqual([
      welcome.serviceItemId,
      openingSong.serviceItemId
    ]);
    expect(repositoryAdapter.readServiceItems(createdService.serviceId)).toMatchObject([
      {
        serviceItemId: welcome.serviceItemId,
        sortOrder: 0,
        tenantId: "tenant_1"
      },
      {
        serviceItemId: openingSong.serviceItemId,
        sortOrder: 1,
        tenantId: "tenant_1"
      }
    ]);
    expect(confirmedAssignment).toMatchObject({
      assignmentId: assignment.assignmentId,
      status: "confirmed",
      tenantId: "tenant_1"
    });
    expect(publishedService).toMatchObject({
      serviceId: createdService.serviceId,
      status: "published",
      tenantId: "tenant_1"
    });
    expect(duplicatedService).toMatchObject({
      serviceTypeId: "type_midweek",
      startsAt: "2026-06-25T23:00:00.000Z",
      status: "draft",
      tenantId: "tenant_1",
      title: "Midweek From Template"
    });
    expect(repositoryAdapter.readOperations()).toMatchObject([
      {
        intent: "create",
        operationName: "createService",
        requestId: "request_create",
        tenantId: "tenant_1"
      },
      {
        intent: "create",
        operationName: "duplicateServiceFromTemplate",
        requestId: "request_duplicate",
        tenantId: "tenant_1"
      },
      {
        intent: "create",
        operationName: "addServiceItem",
        requestId: "request_add_song",
        tenantId: "tenant_1"
      },
      {
        intent: "create",
        operationName: "addServiceItem",
        requestId: "request_add_welcome",
        tenantId: "tenant_1"
      },
      {
        intent: "update",
        operationName: "reorderServiceItems",
        requestId: "request_reorder",
        tenantId: "tenant_1"
      },
      {
        intent: "create",
        operationName: "assignVolunteer",
        requestId: "request_assign",
        tenantId: "tenant_1"
      },
      {
        intent: "update",
        operationName: "updateAssignmentStatus",
        requestId: "request_confirm",
        tenantId: "tenant_1"
      },
      {
        intent: "destructive-confirmed",
        operationName: "updateService",
        requestId: "request_publish",
        tenantId: "tenant_1"
      }
    ]);
    expect(publishAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "assignment.statusChanged",
        tenantId: "tenant_1"
      })
    );
    expect(publishAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "service.published",
        tenantId: "tenant_1"
      })
    );
  });

  it("keeps in-memory command adapter writes tenant-scoped", async () => {
    const repositoryAdapter = createInMemoryPlanningCommandRepositoryAdapter();
    const service = createPlanningCommandService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      planningRepository: repositoryAdapter.repository
    });
    const tenantOneActor: AuthenticatedActor = {
      actorId: "actor_1",
      roles: ["planner"],
      tenantId: "tenant_1"
    };
    const tenantTwoActor: AuthenticatedActor = {
      actorId: "actor_2",
      roles: ["planner"],
      tenantId: "tenant_2"
    };

    const tenantOneService = await service.createService({
      actor: tenantOneActor,
      input: {
        serviceTypeId: "type_sunday",
        title: "Tenant One Worship"
      },
      requestId: "request_tenant_1"
    });
    const tenantTwoService = await service.createService({
      actor: tenantTwoActor,
      input: {
        serviceTypeId: "type_sunday",
        title: "Tenant Two Worship"
      },
      requestId: "request_tenant_2"
    });

    await expect(
      service.addServiceItem({
        actor: tenantTwoActor,
        input: {
          serviceId: tenantOneService.serviceId,
          title: "Cross Tenant Song",
          type: "song"
        },
        requestId: "request_cross_tenant"
      })
    ).rejects.toThrow("Planning service not found for tenant.");

    expect(repositoryAdapter.readServices()).toEqual([
      expect.objectContaining({
        serviceId: tenantOneService.serviceId,
        tenantId: "tenant_1"
      }),
      expect.objectContaining({
        serviceId: tenantTwoService.serviceId,
        tenantId: "tenant_2"
      })
    ]);
    expect(repositoryAdapter.readServiceItems(tenantTwoService.serviceId)).toEqual([]);
    expect(repositoryAdapter.readOperations()).toMatchObject([
      {
        operationName: "createService",
        tenantId: "tenant_1"
      },
      {
        operationName: "createService",
        tenantId: "tenant_2"
      },
      {
        operationName: "addServiceItem",
        tenantId: "tenant_2"
      }
    ]);
  });
});
