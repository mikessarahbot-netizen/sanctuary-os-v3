import { describe, expect, it, vi } from "vitest";
import {
  createPlanningRehearsalAcknowledgementService,
  ListPlanningRehearsalAcknowledgementsQuerySchema,
  RecordPlanningRehearsalAcknowledgementCommandSchema,
  type PlanningRehearsalAcknowledgementRecord,
  type PlanningRehearsalAcknowledgementRepository
} from "./rehearsal-acknowledgements.js";

const acknowledgementRecord: PlanningRehearsalAcknowledgementRecord = {
  acknowledgedAt: "2026-06-21T15:00:00.000Z",
  assetId: "asset_chart_1",
  assignmentId: "assignment_1",
  notes: "Reviewed chart and ready for rehearsal.",
  personId: "person_1",
  readinessSignal: "ready",
  rehearsalAcknowledgementId: "rehearsal_ack_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1"
};

const createRepository = (
  overrides: Partial<PlanningRehearsalAcknowledgementRepository> = {}
): PlanningRehearsalAcknowledgementRepository => ({
  listRehearsalAcknowledgements: () => Promise.resolve([acknowledgementRecord]),
  recordRehearsalAcknowledgement: () => Promise.resolve(acknowledgementRecord),
  ...overrides
});

describe("Planning rehearsal acknowledgement schemas", () => {
  it("validates record and list input without accepting raw media payloads", () => {
    expect(
      RecordPlanningRehearsalAcknowledgementCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          notes: "Reviewed chart and ready for rehearsal.",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack"
      }).input.readinessSignal
    ).toBe("ready");

    expect(
      ListPlanningRehearsalAcknowledgementsQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          assignmentId: "assignment_1",
          personId: "person_1",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack_list"
      }).input.personId
    ).toBe("person_1");

    expect(() =>
      RecordPlanningRehearsalAcknowledgementCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          fileBytes: "raw-media-does-not-belong-in-this-boundary",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack"
      })
    ).toThrow();
  });
});

describe("createPlanningRehearsalAcknowledgementService", () => {
  it("records acknowledgement through a tenant-scoped create operation", async () => {
    const recordRehearsalAcknowledgement = vi.fn<
      PlanningRehearsalAcknowledgementRepository["recordRehearsalAcknowledgement"]
    >(() => Promise.resolve(acknowledgementRecord));
    const service = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({ recordRehearsalAcknowledgement })
    });

    await expect(
      service.recordAcknowledgement({
        actor: {
          actorId: "actor_1",
          roles: ["musician"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          notes: "Reviewed chart and ready for rehearsal.",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack"
      })
    ).resolves.toEqual(acknowledgementRecord);

    expect(recordRehearsalAcknowledgement).toHaveBeenCalledWith({
      input: {
        acknowledgedAt: "2026-06-21T15:00:00.000Z",
        assetId: "asset_chart_1",
        assignmentId: "assignment_1",
        notes: "Reviewed chart and ready for rehearsal.",
        personId: "person_1",
        readinessSignal: "ready",
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_rehearsal_ack",
          tenantId: "tenant_1"
        },
        intent: "create"
      }
    });
  });

  it("lists acknowledgements through a tenant-scoped read operation", async () => {
    const listRehearsalAcknowledgements = vi.fn<
      PlanningRehearsalAcknowledgementRepository["listRehearsalAcknowledgements"]
    >(() => Promise.resolve([acknowledgementRecord]));
    const service = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({ listRehearsalAcknowledgements })
    });

    await expect(
      service.listAcknowledgements({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          assignmentId: "assignment_1",
          personId: "person_1",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack_list"
      })
    ).resolves.toEqual([acknowledgementRecord]);

    expect(listRehearsalAcknowledgements).toHaveBeenCalledWith({
      input: {
        assignmentId: "assignment_1",
        personId: "person_1",
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_rehearsal_ack_list",
          tenantId: "tenant_1"
        }
      }
    });
  });

  it("rejects actors without Planning acknowledgement roles before repository calls", async () => {
    const recordRehearsalAcknowledgement = vi.fn<
      PlanningRehearsalAcknowledgementRepository["recordRehearsalAcknowledgement"]
    >(() => Promise.resolve(acknowledgementRecord));
    const service = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({ recordRehearsalAcknowledgement })
    });

    await expect(
      service.recordAcknowledgement({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack"
      })
    ).rejects.toThrow(
      "Actor is not allowed to record Planning rehearsal acknowledgements."
    );

    expect(recordRehearsalAcknowledgement).not.toHaveBeenCalled();
  });

  it("rejects acknowledgement records outside tenant, service, assignment, or person scope", async () => {
    const tenantMismatchService = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({
        recordRehearsalAcknowledgement: () =>
          Promise.resolve({
            ...acknowledgementRecord,
            tenantId: "tenant_2"
          })
      })
    });

    await expect(
      tenantMismatchService.recordAcknowledgement({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_rehearsal_ack"
      })
    ).rejects.toThrow("Planning rehearsal acknowledgement tenant mismatch.");

    const serviceMismatchService = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({
        listRehearsalAcknowledgements: () =>
          Promise.resolve([
            {
              ...acknowledgementRecord,
              serviceId: "service_2"
            }
          ])
      })
    });

    await expect(
      serviceMismatchService.listAcknowledgements({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_rehearsal_ack_list"
      })
    ).rejects.toThrow("Planning rehearsal acknowledgement service mismatch.");

    const assignmentMismatchService =
      createPlanningRehearsalAcknowledgementService({
        planningRepository: createRepository({
          listRehearsalAcknowledgements: () =>
            Promise.resolve([
              {
                ...acknowledgementRecord,
                assignmentId: "assignment_2"
              }
            ])
        })
      });

    await expect(
      assignmentMismatchService.listAcknowledgements({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          assignmentId: "assignment_1",
          serviceId: "service_1"
        },
        requestId: "request_rehearsal_ack_list"
      })
    ).rejects.toThrow("Planning rehearsal acknowledgement assignment mismatch.");

    const personMismatchService = createPlanningRehearsalAcknowledgementService({
      planningRepository: createRepository({
        listRehearsalAcknowledgements: () =>
          Promise.resolve([
            {
              ...acknowledgementRecord,
              personId: "person_2"
            }
          ])
      })
    });

    await expect(
      personMismatchService.listAcknowledgements({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          personId: "person_1",
          serviceId: "service_1"
        },
        requestId: "request_rehearsal_ack_list"
      })
    ).rejects.toThrow("Planning rehearsal acknowledgement person mismatch.");
  });
});
