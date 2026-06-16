import { describe, expect, it, vi } from "vitest";
import type { ApiEventEnvelope } from "../../events/index.js";
import {
  createPlanningCommandService,
  ReorderPlanningServiceItemsCommandSchema,
  UpdatePlanningServiceCommandSchema,
  type PlanningAssignmentRecord,
  type PlanningCommandRepository,
  type PlanningServiceItemRecord,
  type PlanningServiceRecord
} from "./commands.js";

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
        actorId: "actor_1",
        requestId: "request_1",
        tenantId: "tenant_1"
      })
    );
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
});
