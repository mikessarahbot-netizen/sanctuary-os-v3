import { describe, expect, it, vi } from "vitest";
import type { PlanningReadinessResult } from "../../domain/index.js";
import {
  createPlanningQueryService,
  ListPlanningServicesQuerySchema,
  ListPlanningServiceTemplatesQuerySchema,
  ListPlanningSongLibraryQuerySchema,
  type PlanningServiceTemplateRecord,
  type PlanningSongLibraryItemRecord,
  type PlanningQueryRepository
} from "./queries.js";
import type { PlanningAssignmentRecord, PlanningServiceRecord } from "./commands.js";

const serviceRecord: PlanningServiceRecord = {
  serviceId: "service_1",
  serviceTypeId: "type_sunday",
  startsAt: "2026-06-21T14:00:00.000Z",
  status: "scheduled",
  tenantId: "tenant_1",
  title: "Sunday Worship"
};

const assignmentRecord: PlanningAssignmentRecord = {
  assignmentId: "assignment_1",
  personId: "person_1",
  roleId: "role_vocal",
  serviceId: "service_1",
  status: "confirmed",
  tenantId: "tenant_1"
};

const readinessRecord: PlanningReadinessResult = {
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

const serviceTemplateRecord: PlanningServiceTemplateRecord = {
  description: "Default Sunday flow.",
  serviceTemplateId: "template_sunday",
  serviceTypeId: "type_sunday",
  tenantId: "tenant_1",
  title: "Sunday Worship Template"
};

const songLibraryItemRecord: PlanningSongLibraryItemRecord = {
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

const createRepository = (
  overrides: Partial<PlanningQueryRepository> = {}
): PlanningQueryRepository => ({
  getService: () => Promise.resolve(serviceRecord),
  getServiceReadiness: () => Promise.resolve(readinessRecord),
  listServiceAssignments: () => Promise.resolve([assignmentRecord]),
  listServices: () => Promise.resolve([serviceRecord]),
  listServiceTemplates: () => Promise.resolve([serviceTemplateRecord]),
  listSongLibrary: () => Promise.resolve([songLibraryItemRecord]),
  ...overrides
});

describe("Planning query schemas", () => {
  it("validates service list filters before repository access", () => {
    expect(() =>
      ListPlanningServicesQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          filter: {
            startsAtOrAfter: "not-a-date"
          }
        },
        requestId: "request_1"
      })
    ).toThrow();

    expect(() =>
      ListPlanningServicesQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          filter: {
            startsAtOrAfter: "2026-06-22T00:00:00.000Z",
            startsBefore: "2026-06-21T00:00:00.000Z"
          }
        },
        requestId: "request_1"
      })
    ).toThrow("Service filter startsAtOrAfter must be before startsBefore.");

    expect(
      ListPlanningServicesQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          filter: {
            startsAtOrAfter: "2026-06-21T00:00:00.000Z",
            status: "scheduled"
          }
        },
        requestId: "request_1"
      }).input.filter?.status
    ).toBe("scheduled");
  });

  it("validates service template query input before repository access", () => {
    expect(() =>
      ListPlanningServiceTemplatesQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: ""
        },
        requestId: "request_1"
      })
    ).toThrow();

    expect(
      ListPlanningServiceTemplatesQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_1"
      }).input.serviceTypeId
    ).toBe("type_sunday");
  });

  it("validates song library search input before repository access", () => {
    expect(() =>
      ListPlanningSongLibraryQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            limit: 0,
            query: "open"
          }
        },
        requestId: "request_1"
      })
    ).toThrow();

    expect(() =>
      ListPlanningSongLibraryQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {}
        },
        requestId: "request_1"
      })
    ).toThrow("Song library search requires query, serviceTypeId, or key.");

    expect(
      ListPlanningSongLibraryQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            key: "G",
            query: "open"
          }
        },
        requestId: "request_1"
      }).input.searchInput.limit
    ).toBeUndefined();
  });
});

describe("createPlanningQueryService", () => {
  it("tenant-scopes service list reads through the actor and repository boundary", async () => {
    const listServices = vi.fn<PlanningQueryRepository["listServices"]>(() =>
      Promise.resolve([serviceRecord])
    );
    const service = createPlanningQueryService({
      planningRepository: createRepository({ listServices })
    });

    await expect(
      service.services({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          filter: {
            serviceTypeId: "type_sunday",
            status: "scheduled"
          }
        },
        requestId: "request_1"
      })
    ).resolves.toEqual([serviceRecord]);

    expect(listServices).toHaveBeenCalledWith({
      input: {
        filter: {
          serviceTypeId: "type_sunday",
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
    });
  });

  it("rejects actors without Planning query roles before persistence", async () => {
    const getService = vi.fn<PlanningQueryRepository["getService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const service = createPlanningQueryService({
      planningRepository: createRepository({ getService })
    });

    await expect(
      service.service({
        actor: {
          actorId: "actor_1",
          roles: ["super_admin"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_1"
      })
    ).rejects.toThrow("Actor is not allowed to read planning services.");

    expect(getService).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant service records returned by persistence", async () => {
    const service = createPlanningQueryService({
      planningRepository: createRepository({
        getService: () =>
          Promise.resolve({
            ...serviceRecord,
            tenantId: "tenant_2"
          })
      })
    });

    await expect(
      service.service({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_1"
      })
    ).rejects.toThrow("Planning service query tenant mismatch.");
  });

  it("tenant-scopes service template reads through the actor and repository boundary", async () => {
    const listServiceTemplates = vi.fn<
      PlanningQueryRepository["listServiceTemplates"]
    >(() => Promise.resolve([serviceTemplateRecord]));
    const service = createPlanningQueryService({
      planningRepository: createRepository({ listServiceTemplates })
    });

    await expect(
      service.serviceTemplates({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).resolves.toEqual([serviceTemplateRecord]);

    expect(listServiceTemplates).toHaveBeenCalledWith({
      input: {
        serviceTypeId: "type_sunday"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_templates",
          tenantId: "tenant_1"
        }
      }
    });
  });

  it("rejects service template reads from actors without Planning query roles", async () => {
    const listServiceTemplates = vi.fn<
      PlanningQueryRepository["listServiceTemplates"]
    >(() => Promise.resolve([serviceTemplateRecord]));
    const service = createPlanningQueryService({
      planningRepository: createRepository({ listServiceTemplates })
    });

    await expect(
      service.serviceTemplates({
        actor: {
          actorId: "actor_1",
          roles: ["super_admin"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).rejects.toThrow("Actor is not allowed to read planning services.");

    expect(listServiceTemplates).not.toHaveBeenCalled();
  });

  it("returns empty service template lists without treating them as misses", async () => {
    const service = createPlanningQueryService({
      planningRepository: createRepository({
        listServiceTemplates: () => Promise.resolve([])
      })
    });

    await expect(
      service.serviceTemplates({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).resolves.toEqual([]);
  });

  it("rejects service template records outside tenant or requested service type", async () => {
    const tenantMismatchService = createPlanningQueryService({
      planningRepository: createRepository({
        listServiceTemplates: () =>
          Promise.resolve([
            {
              ...serviceTemplateRecord,
              tenantId: "tenant_2"
            }
          ])
      })
    });

    await expect(
      tenantMismatchService.serviceTemplates({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).rejects.toThrow("Planning service template query tenant mismatch.");

    const serviceTypeMismatchService = createPlanningQueryService({
      planningRepository: createRepository({
        listServiceTemplates: () =>
          Promise.resolve([
            {
              ...serviceTemplateRecord,
              serviceTypeId: "type_midweek"
            }
          ])
      })
    });

    await expect(
      serviceTypeMismatchService.serviceTemplates({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          serviceTypeId: "type_sunday"
        },
        requestId: "request_templates"
      })
    ).rejects.toThrow("Planning service template query service type mismatch.");
  });

  it("tenant-scopes song library searches through the actor and repository boundary", async () => {
    const listSongLibrary = vi.fn<PlanningQueryRepository["listSongLibrary"]>(() =>
      Promise.resolve([songLibraryItemRecord])
    );
    const service = createPlanningQueryService({
      planningRepository: createRepository({ listSongLibrary })
    });

    await expect(
      service.songLibrary({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            key: "G",
            limit: 10,
            query: "open",
            serviceTypeId: "type_sunday"
          }
        },
        requestId: "request_songs"
      })
    ).resolves.toEqual([songLibraryItemRecord]);

    expect(listSongLibrary).toHaveBeenCalledWith({
      input: {
        searchInput: {
          includeBannedOrPaused: false,
          key: "G",
          limit: 10,
          query: "open",
          serviceTypeId: "type_sunday"
        }
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_songs",
          tenantId: "tenant_1"
        }
      }
    });
  });

  it("rejects song library searches from actors without Planning query roles", async () => {
    const listSongLibrary = vi.fn<PlanningQueryRepository["listSongLibrary"]>(() =>
      Promise.resolve([songLibraryItemRecord])
    );
    const service = createPlanningQueryService({
      planningRepository: createRepository({ listSongLibrary })
    });

    await expect(
      service.songLibrary({
        actor: {
          actorId: "actor_1",
          roles: ["super_admin"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            query: "open"
          }
        },
        requestId: "request_songs"
      })
    ).rejects.toThrow("Actor is not allowed to read planning services.");

    expect(listSongLibrary).not.toHaveBeenCalled();
  });

  it("returns empty song library search results without treating them as misses", async () => {
    const service = createPlanningQueryService({
      planningRepository: createRepository({
        listSongLibrary: () => Promise.resolve([])
      })
    });

    await expect(
      service.songLibrary({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            serviceTypeId: "type_sunday"
          }
        },
        requestId: "request_songs"
      })
    ).resolves.toEqual([]);
  });

  it("rejects song library records outside tenant or paused visibility scope", async () => {
    const tenantMismatchService = createPlanningQueryService({
      planningRepository: createRepository({
        listSongLibrary: () =>
          Promise.resolve([
            {
              ...songLibraryItemRecord,
              tenantId: "tenant_2"
            }
          ])
      })
    });

    await expect(
      tenantMismatchService.songLibrary({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            query: "open"
          }
        },
        requestId: "request_songs"
      })
    ).rejects.toThrow("Planning song library query tenant mismatch.");

    const pausedMismatchService = createPlanningQueryService({
      planningRepository: createRepository({
        listSongLibrary: () =>
          Promise.resolve([
            {
              ...songLibraryItemRecord,
              isBannedOrPaused: true
            }
          ])
      })
    });

    await expect(
      pausedMismatchService.songLibrary({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          searchInput: {
            query: "open"
          }
        },
        requestId: "request_songs"
      })
    ).rejects.toThrow("Planning song library query returned paused song.");
  });

  it("rejects assignment and readiness records outside the requested service", async () => {
    const service = createPlanningQueryService({
      planningRepository: createRepository({
        getServiceReadiness: () =>
          Promise.resolve({
            ...readinessRecord,
            serviceId: "service_2"
          }),
        listServiceAssignments: () =>
          Promise.resolve([
            {
              ...assignmentRecord,
              serviceId: "service_2"
            }
          ])
      })
    });

    await expect(
      service.serviceAssignments({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_assignments"
      })
    ).rejects.toThrow("Planning assignment query service mismatch.");

    await expect(
      service.serviceReadiness({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_readiness"
      })
    ).rejects.toThrow("Planning readiness query service mismatch.");
  });

  it("returns null when nullable service and readiness lookups miss", async () => {
    const service = createPlanningQueryService({
      planningRepository: createRepository({
        getService: () => Promise.resolve(null),
        getServiceReadiness: () => Promise.resolve(null)
      })
    });

    const query = {
      actor: {
        actorId: "actor_1",
        roles: ["viewer" as const],
        tenantId: "tenant_1"
      },
      input: {
        serviceId: "service_missing"
      },
      requestId: "request_1"
    };

    await expect(service.service(query)).resolves.toBeNull();
    await expect(service.serviceReadiness(query)).resolves.toBeNull();
  });
});
