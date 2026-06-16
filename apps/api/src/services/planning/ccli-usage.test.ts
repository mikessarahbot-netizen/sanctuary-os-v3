import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryJobDispatcher,
  type ApiJobStatusRecord,
  type JobStatusReader
} from "../../jobs/index.js";
import {
  createPlanningCcliUsageService,
  GetPlanningCcliReportingJobStatusQuerySchema,
  ListPlanningCcliUsageLogsQuerySchema,
  RecordPlanningCcliUsageCommandSchema,
  SchedulePlanningCcliReportingJobCommandSchema,
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

    expect(
      SchedulePlanningCcliReportingJobCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_report"
      }).input.reportingStatus
    ).toBe("pending");

    expect(
      GetPlanningCcliReportingJobStatusQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      }).input.jobId
    ).toBe("job_1");

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

  it("schedules CCLI reporting through a tenant-scoped async job handoff", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();
    const service = createPlanningCcliUsageService({
      jobDispatcher,
      planningRepository: createRepository()
    });

    await expect(
      service.scheduleReportingJob({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_report"
      })
    ).resolves.toEqual({ jobId: "job_1" });

    expect(jobDispatcher.readQueuedJobs()).toMatchObject([
      {
        jobId: "job_1",
        request: {
          jobType: "ccli-reporting",
          payload: {
            reportingStatus: "pending",
            serviceId: "service_1"
          },
          requestedByActorId: "actor_1",
          requestId: "request_ccli_report",
          tenantId: "tenant_1"
        },
        sequence: 1
      }
    ]);
  });

  it("looks up queued CCLI reporting job status through a tenant-scoped reader", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();
    const service = createPlanningCcliUsageService({
      jobDispatcher,
      jobStatusReader: jobDispatcher,
      planningRepository: createRepository()
    });

    await service.scheduleReportingJob({
      actor: {
        actorId: "actor_1",
        roles: ["worship_leader"],
        tenantId: "tenant_1"
      },
      input: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestId: "request_ccli_report"
    });

    await expect(
      service.getReportingJobStatus({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      })
    ).resolves.toMatchObject({
      jobId: "job_1",
      jobType: "ccli-reporting",
      payload: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestedByActorId: "actor_1",
      requestId: "request_ccli_report",
      sequence: 1,
      status: "queued",
      tenantId: "tenant_1"
    });
  });

  it("returns null for missing or cross-tenant CCLI reporting job statuses", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();
    const service = createPlanningCcliUsageService({
      jobDispatcher,
      jobStatusReader: jobDispatcher,
      planningRepository: createRepository()
    });

    await service.scheduleReportingJob({
      actor: {
        actorId: "actor_1",
        roles: ["planner"],
        tenantId: "tenant_1"
      },
      input: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestId: "request_ccli_report"
    });

    await expect(
      service.getReportingJobStatus({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_missing"
        },
        requestId: "request_ccli_status"
      })
    ).resolves.toBeNull();

    await expect(
      service.getReportingJobStatus({
        actor: {
          actorId: "actor_2",
          roles: ["planner"],
          tenantId: "tenant_2"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      })
    ).resolves.toBeNull();
  });

  it("rejects unauthorized, unconfigured, or malformed CCLI reporting job status lookups", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();
    const service = createPlanningCcliUsageService({
      jobStatusReader: jobDispatcher,
      planningRepository: createRepository()
    });

    await expect(
      service.getReportingJobStatus({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      })
    ).rejects.toThrow("Actor is not allowed to manage Planning CCLI usage logs.");

    const unconfiguredService = createPlanningCcliUsageService({
      planningRepository: createRepository()
    });

    await expect(
      unconfiguredService.getReportingJobStatus({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      })
    ).rejects.toThrow("Planning CCLI reporting job status reader is not configured.");

    const malformedStatusReader: JobStatusReader = {
      getJobStatus: () =>
        Promise.resolve({
          enqueuedAt: "2026-06-16T18:30:00.000Z",
          jobId: "job_1",
          jobType: "ccli-reporting",
          payload: {
            reportingStatus: "reported",
            serviceId: "service_1"
          },
          requestedByActorId: "actor_1",
          requestId: "request_ccli_report",
          sequence: 1,
          status: "queued",
          tenantId: "tenant_1",
          updatedAt: "2026-06-16T18:30:00.000Z"
        } as ApiJobStatusRecord)
    };
    const malformedService = createPlanningCcliUsageService({
      jobStatusReader: malformedStatusReader,
      planningRepository: createRepository()
    });

    await expect(
      malformedService.getReportingJobStatus({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          jobId: "job_1"
        },
        requestId: "request_ccli_status"
      })
    ).rejects.toThrow();
  });

  it("rejects CCLI reporting job scheduling without roles or dispatcher", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();
    const service = createPlanningCcliUsageService({
      jobDispatcher,
      planningRepository: createRepository()
    });

    await expect(
      service.scheduleReportingJob({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_report"
      })
    ).rejects.toThrow("Actor is not allowed to manage Planning CCLI usage logs.");

    expect(jobDispatcher.readQueuedJobs()).toEqual([]);

    const unconfiguredService = createPlanningCcliUsageService({
      planningRepository: createRepository()
    });

    await expect(
      unconfiguredService.scheduleReportingJob({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_report"
      })
    ).rejects.toThrow("Planning CCLI reporting job dispatcher is not configured.");
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
