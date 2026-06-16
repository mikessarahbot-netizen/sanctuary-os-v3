import { describe, expect, it, vi } from "vitest";
import {
  createPlanningCcliUsageService,
  ListPlanningCcliUsageLogsQuerySchema,
  RecordPlanningCcliUsageCommandSchema,
  type PlanningCcliUsageLogRecord,
  type PlanningCcliUsageRepository
} from "./ccli-usage.js";

const usageLogRecord: PlanningCcliUsageLogRecord = {
  ccliSongNumber: "123456",
  ccliUsageLogId: "ccli_log_1",
  notes: "Congregational singing during service.",
  reportingStatus: "pending",
  serviceId: "service_1",
  serviceItemId: "item_1",
  songId: "song_1",
  tenantId: "tenant_1",
  title: "Open The Gates",
  usageType: "service",
  usedAt: "2026-06-21T14:00:00.000Z"
};

const createRepository = (
  overrides: Partial<PlanningCcliUsageRepository> = {}
): PlanningCcliUsageRepository => ({
  listCcliUsageLogs: () => Promise.resolve([usageLogRecord]),
  recordCcliUsage: () => Promise.resolve(usageLogRecord),
  ...overrides
});

describe("Planning CCLI usage schemas", () => {
  it("validates record and list input without accepting vendor credentials", () => {
    expect(
      RecordPlanningCcliUsageCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          ccliSongNumber: "123456",
          serviceId: "service_1",
          serviceItemId: "item_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z"
        },
        requestId: "request_ccli"
      }).input.usageType
    ).toBe("service");

    expect(
      ListPlanningCcliUsageLogsQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_list"
      }).input.reportingStatus
    ).toBe("pending");

    expect(() =>
      RecordPlanningCcliUsageCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z",
          vendorPassword: "never-store-this"
        },
        requestId: "request_ccli"
      })
    ).toThrow();
  });
});

describe("createPlanningCcliUsageService", () => {
  it("records CCLI usage through a tenant-scoped create operation", async () => {
    const recordCcliUsage = vi.fn<PlanningCcliUsageRepository["recordCcliUsage"]>(() =>
      Promise.resolve(usageLogRecord)
    );
    const service = createPlanningCcliUsageService({
      planningRepository: createRepository({ recordCcliUsage })
    });

    await expect(
      service.recordUsage({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          ccliSongNumber: "123456",
          notes: "Congregational singing during service.",
          serviceId: "service_1",
          serviceItemId: "item_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z"
        },
        requestId: "request_ccli"
      })
    ).resolves.toEqual(usageLogRecord);

    expect(recordCcliUsage).toHaveBeenCalledWith({
      input: {
        ccliSongNumber: "123456",
        notes: "Congregational singing during service.",
        serviceId: "service_1",
        serviceItemId: "item_1",
        songId: "song_1",
        title: "Open The Gates",
        usageType: "service",
        usedAt: "2026-06-21T14:00:00.000Z"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_ccli",
          tenantId: "tenant_1"
        },
        intent: "create"
      }
    });
  });

  it("lists CCLI usage logs through a tenant-scoped read operation", async () => {
    const listCcliUsageLogs = vi.fn<
      PlanningCcliUsageRepository["listCcliUsageLogs"]
    >(() => Promise.resolve([usageLogRecord]));
    const service = createPlanningCcliUsageService({
      planningRepository: createRepository({ listCcliUsageLogs })
    });

    await expect(
      service.listUsageLogs({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_list"
      })
    ).resolves.toEqual([usageLogRecord]);

    expect(listCcliUsageLogs).toHaveBeenCalledWith({
      input: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_ccli_list",
          tenantId: "tenant_1"
        }
      }
    });
  });

  it("rejects actors without Planning CCLI roles before repository calls", async () => {
    const recordCcliUsage = vi.fn<PlanningCcliUsageRepository["recordCcliUsage"]>(() =>
      Promise.resolve(usageLogRecord)
    );
    const service = createPlanningCcliUsageService({
      planningRepository: createRepository({ recordCcliUsage })
    });

    await expect(
      service.recordUsage({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z"
        },
        requestId: "request_ccli"
      })
    ).rejects.toThrow("Actor is not allowed to manage Planning CCLI usage logs.");

    expect(recordCcliUsage).not.toHaveBeenCalled();
  });

  it("rejects CCLI usage logs returned outside tenant, service, or status scope", async () => {
    const tenantMismatchService = createPlanningCcliUsageService({
      planningRepository: createRepository({
        recordCcliUsage: () =>
          Promise.resolve({
            ...usageLogRecord,
            tenantId: "tenant_2"
          })
      })
    });

    await expect(
      tenantMismatchService.recordUsage({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z"
        },
        requestId: "request_ccli"
      })
    ).rejects.toThrow("Planning CCLI usage log tenant mismatch.");

    const serviceMismatchService = createPlanningCcliUsageService({
      planningRepository: createRepository({
        listCcliUsageLogs: () =>
          Promise.resolve([
            {
              ...usageLogRecord,
              serviceId: "service_2"
            }
          ])
      })
    });

    await expect(
      serviceMismatchService.listUsageLogs({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_ccli_list"
      })
    ).rejects.toThrow("Planning CCLI usage log service mismatch.");

    const statusMismatchService = createPlanningCcliUsageService({
      planningRepository: createRepository({
        listCcliUsageLogs: () =>
          Promise.resolve([
            {
              ...usageLogRecord,
              reportingStatus: "reported"
            }
          ])
      })
    });

    await expect(
      statusMismatchService.listUsageLogs({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_list"
      })
    ).rejects.toThrow("Planning CCLI usage log reporting status mismatch.");
  });
});
