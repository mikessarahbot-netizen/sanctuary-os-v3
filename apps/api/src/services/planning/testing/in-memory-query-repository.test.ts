import { describe, expect, it } from "vitest";
import type {
  PlanningAssignmentPersistenceRecord,
  PlanningReadinessPersistenceRecord,
  PlanningServicePersistenceRecord,
  PlanningServiceTemplatePersistenceRecord,
  PlanningSongLibraryItemPersistenceRecord
} from "@sanctuary-os/db";
import { createPlanningQueryService } from "../queries.js";
import { createInMemoryPlanningQueryRepositoryAdapter } from "./in-memory-query-repository.js";

const serviceRecord: PlanningServicePersistenceRecord = {
  serviceId: "service_1",
  serviceTypeId: "type_sunday",
  startsAt: "2026-06-21T14:00:00.000Z",
  status: "scheduled",
  tenantId: "tenant_1",
  title: "Sunday Worship"
};

const otherTenantServiceRecord: PlanningServicePersistenceRecord = {
  ...serviceRecord,
  serviceId: "service_2",
  tenantId: "tenant_2",
  title: "Other Tenant Worship"
};

const assignmentRecord: PlanningAssignmentPersistenceRecord = {
  assignmentId: "assignment_1",
  personId: "person_1",
  roleId: "role_vocal",
  serviceId: "service_1",
  status: "confirmed",
  tenantId: "tenant_1"
};

const readinessRecord: PlanningReadinessPersistenceRecord = {
  band: "ready",
  checks: [
    {
      code: "required-roles",
      label: "Required roles assigned",
      maxScore: 25,
      score: 25
    }
  ],
  readinessScore: 100,
  recommendedActions: [],
  risks: [],
  serviceId: "service_1",
  strengths: ["Required roles assigned is complete."],
  tenantId: "tenant_1"
};

const serviceTemplateRecord: PlanningServiceTemplatePersistenceRecord = {
  description: "Default Sunday flow.",
  serviceTemplateId: "template_sunday",
  serviceTypeId: "type_sunday",
  tenantId: "tenant_1",
  title: "Sunday Worship Template"
};

const songLibraryItemRecord: PlanningSongLibraryItemPersistenceRecord = {
  artist: "Sanctuary Collective",
  availableKeys: ["G", "A"],
  ccliReportingAllowed: true,
  ccliSongNumber: "123456",
  defaultKey: "G",
  energy: "medium",
  hasArrangements: true,
  hasCharts: true,
  isBannedOrPaused: false,
  lastUsedAt: "2026-06-07T14:00:00.000Z",
  songId: "song_1",
  tenantId: "tenant_1",
  tempoBpm: 76,
  title: "Open The Gates",
  usageCount: 6
};

const pausedSongLibraryItemRecord: PlanningSongLibraryItemPersistenceRecord = {
  ...songLibraryItemRecord,
  isBannedOrPaused: true,
  songId: "song_paused",
  title: "Paused Song"
};

const createSeededAdapter = () =>
  createInMemoryPlanningQueryRepositoryAdapter({
    assignments: [assignmentRecord],
    readinessResults: [readinessRecord],
    serviceTemplates: [serviceTemplateRecord],
    services: [serviceRecord, otherTenantServiceRecord],
    songLibraryItems: [songLibraryItemRecord, pausedSongLibraryItemRecord]
  });

describe("createInMemoryPlanningQueryRepositoryAdapter", () => {
  it("exercises Planning query service reads through tenant-scoped persistence contracts", async () => {
    const adapter = createSeededAdapter();
    const service = createPlanningQueryService({
      planningRepository: adapter.repository
    });
    const actor = {
      actorId: "actor_1",
      roles: ["worship_leader" as const],
      tenantId: "tenant_1"
    };

    await expect(
      service.services({
        actor,
        input: {
          filter: {
            serviceTypeId: "type_sunday",
            startsAtOrAfter: "2026-06-20T00:00:00.000Z",
            startsBefore: "2026-06-22T00:00:00.000Z",
            status: "scheduled"
          }
        },
        requestId: "request_services"
      })
    ).resolves.toEqual([serviceRecord]);

    await expect(
      service.service({
        actor,
        input: {
          serviceId: "service_1"
        },
        requestId: "request_service"
      })
    ).resolves.toEqual(serviceRecord);

    await expect(
      service.serviceAssignments({
        actor,
        input: {
          serviceId: "service_1"
        },
        requestId: "request_assignments"
      })
    ).resolves.toEqual([assignmentRecord]);

    await expect(
      service.serviceReadiness({
        actor,
        input: {
          serviceId: "service_1"
        },
        requestId: "request_readiness"
      })
    ).resolves.toEqual(readinessRecord);

    await expect(
      service.serviceTemplates({
        actor,
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).resolves.toEqual([serviceTemplateRecord]);

    await expect(
      service.songLibrary({
        actor,
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            key: "G",
            limit: 5,
            query: "open"
          }
        },
        requestId: "request_songs"
      })
    ).resolves.toEqual([songLibraryItemRecord]);

    expect(adapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listServices",
        requestId: "request_services",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "getService",
        requestId: "request_service",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listServiceAssignments",
        requestId: "request_assignments",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "getServiceReadiness",
        requestId: "request_readiness",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listServiceTemplates",
        requestId: "request_templates",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listSongLibrary",
        requestId: "request_songs",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("returns tenant-local misses without leaking cross-tenant records", async () => {
    const adapter = createSeededAdapter();
    const service = createPlanningQueryService({
      planningRepository: adapter.repository
    });
    const actor = {
      actorId: "actor_2",
      roles: ["viewer" as const],
      tenantId: "tenant_1"
    };

    await expect(
      service.service({
        actor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_missing_service"
      })
    ).resolves.toBeNull();

    await expect(
      service.serviceAssignments({
        actor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_missing_assignments"
      })
    ).resolves.toEqual([]);

    await expect(
      service.serviceReadiness({
        actor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_missing_readiness"
      })
    ).resolves.toBeNull();
  });

  it("Zod-validates DB persistence operation shapes at the adapter boundary", async () => {
    const adapter = createSeededAdapter();

    await expect(
      adapter.repository.listServices({
        input: {
          filter: {
            startsAtOrAfter: "not-a-date"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_invalid_services",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
  });
});
