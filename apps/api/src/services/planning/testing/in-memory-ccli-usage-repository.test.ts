import { describe, expect, it } from "vitest";
import type { PlanningCcliUsageLogPersistenceRecord } from "@sanctuary-os/db";
import { createPlanningCcliUsageService } from "../ccli-usage.js";
import { createInMemoryPlanningCcliUsageRepositoryAdapter } from "./in-memory-ccli-usage-repository.js";

const usageLogRecord: PlanningCcliUsageLogPersistenceRecord = {
  ccliSongNumber: "123456",
  ccliUsageLogId: "ccli_seed_1",
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

const reportedUsageLogRecord: PlanningCcliUsageLogPersistenceRecord = {
  ...usageLogRecord,
  ccliUsageLogId: "ccli_seed_2",
  reportingStatus: "reported",
  usedAt: "2026-06-21T14:05:00.000Z"
};

const otherTenantUsageLogRecord: PlanningCcliUsageLogPersistenceRecord = {
  ...usageLogRecord,
  ccliUsageLogId: "ccli_seed_3",
  tenantId: "tenant_2"
};

const actor = {
  actorId: "actor_1",
  roles: ["worship_leader" as const],
  tenantId: "tenant_1"
};

const createSeededAdapter = () =>
  createInMemoryPlanningCcliUsageRepositoryAdapter({
    usageLogs: [usageLogRecord, reportedUsageLogRecord, otherTenantUsageLogRecord]
  });

describe("createInMemoryPlanningCcliUsageRepositoryAdapter", () => {
  it("exercises CCLI usage services through tenant-scoped persistence contracts", async () => {
    const adapter = createSeededAdapter();
    const service = createPlanningCcliUsageService({
      planningRepository: adapter.repository
    });

    await expect(
      service.listUsageLogs({
        actor,
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestId: "request_ccli_list"
      })
    ).resolves.toEqual([usageLogRecord]);

    await expect(
      service.recordUsage({
        actor,
        input: {
          ccliSongNumber: "654321",
          notes: "Livestream archive usage.",
          serviceId: "service_1",
          serviceItemId: "item_2",
          songId: "song_2",
          title: "Mercy Like Morning",
          usageType: "livestream",
          usedAt: "2026-06-21T15:00:00.000Z"
        },
        requestId: "request_ccli_record"
      })
    ).resolves.toEqual({
      ccliSongNumber: "654321",
      ccliUsageLogId: "ccli_log_4",
      notes: "Livestream archive usage.",
      reportingStatus: "pending",
      serviceId: "service_1",
      serviceItemId: "item_2",
      songId: "song_2",
      tenantId: "tenant_1",
      title: "Mercy Like Morning",
      usageType: "livestream",
      usedAt: "2026-06-21T15:00:00.000Z"
    });

    expect(adapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listCcliUsageLogs",
        requestId: "request_ccli_list",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        intent: "create",
        operationName: "recordCcliUsage",
        requestId: "request_ccli_record",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("returns tenant-local empty reads without leaking cross-tenant CCLI usage logs", async () => {
    const adapter = createSeededAdapter();
    const service = createPlanningCcliUsageService({
      planningRepository: adapter.repository
    });

    await expect(
      service.listUsageLogs({
        actor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_ccli_empty"
      })
    ).resolves.toEqual([]);
  });

  it("Zod-validates DB persistence operation shapes at the adapter boundary", async () => {
    const adapter = createSeededAdapter();
    const malformedOperation = {
      input: {
        ccliSongNumber: "123456",
        serviceId: "service_1",
        songId: "song_1",
        title: "Open The Gates",
        usageType: "service",
        usedAt: "not-a-date"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_invalid_ccli",
          tenantId: "tenant_1"
        },
        intent: "create"
      }
    } as unknown as Parameters<typeof adapter.repository.recordCcliUsage>[0];

    await expect(
      adapter.repository.recordCcliUsage(malformedOperation)
    ).rejects.toThrow();
  });
});
