import { describe, expect, it, vi } from "vitest";
import {
  createPlanningRehearsalAssetVisibilityService,
  ListPlanningRehearsalAssetVisibilityQuerySchema,
  SetPlanningRehearsalAssetVisibilityCommandSchema,
  type PlanningRehearsalAssetVisibilityRecord,
  type PlanningRehearsalAssetVisibilityRepository
} from "./rehearsal-assets.js";

const visibilityRecord: PlanningRehearsalAssetVisibilityRecord = {
  assetId: "asset_chart_1",
  assetType: "chart",
  isVisible: true,
  rehearsalAssetVisibilityId: "visibility_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1",
  title: "Open The Gates Chart",
  updatedAt: "2026-06-21T14:30:00.000Z",
  visibleToRoleIds: ["role_vocal", "role_guitar"]
};

const createRepository = (
  overrides: Partial<PlanningRehearsalAssetVisibilityRepository> = {}
): PlanningRehearsalAssetVisibilityRepository => ({
  listRehearsalAssetVisibility: () => Promise.resolve([visibilityRecord]),
  setRehearsalAssetVisibility: () => Promise.resolve(visibilityRecord),
  ...overrides
});

describe("Planning rehearsal asset visibility schemas", () => {
  it("validates set and list input without accepting raw media payloads", () => {
    expect(
      SetPlanningRehearsalAssetVisibilityCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T14:30:00.000Z",
          visibleToRoleIds: ["role_vocal"]
        },
        requestId: "request_visibility"
      }).input.assetType
    ).toBe("chart");

    expect(
      ListPlanningRehearsalAssetVisibilityQuerySchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_visibility_list"
      }).input.serviceItemId
    ).toBe("item_1");

    expect(() =>
      SetPlanningRehearsalAssetVisibilityCommandSchema.parse({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          fileBytes: "raw-media-does-not-belong-in-this-boundary",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T14:30:00.000Z",
          visibleToRoleIds: ["role_vocal"]
        },
        requestId: "request_visibility"
      })
    ).toThrow();
  });
});

describe("createPlanningRehearsalAssetVisibilityService", () => {
  it("sets rehearsal asset visibility through a tenant-scoped update operation", async () => {
    const setRehearsalAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityRepository["setRehearsalAssetVisibility"]
    >(() => Promise.resolve(visibilityRecord));
    const service = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({ setRehearsalAssetVisibility })
    });

    await expect(
      service.setAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["worship_leader"],
          tenantId: "tenant_1"
        },
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T14:30:00.000Z",
          visibleToRoleIds: ["role_vocal", "role_guitar"]
        },
        requestId: "request_visibility"
      })
    ).resolves.toEqual(visibilityRecord);

    expect(setRehearsalAssetVisibility).toHaveBeenCalledWith({
      input: {
        assetId: "asset_chart_1",
        assetType: "chart",
        isVisible: true,
        serviceId: "service_1",
        serviceItemId: "item_1",
        title: "Open The Gates Chart",
        updatedAt: "2026-06-21T14:30:00.000Z",
        visibleToRoleIds: ["role_vocal", "role_guitar"]
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_visibility",
          tenantId: "tenant_1"
        },
        intent: "update"
      }
    });
  });

  it("lists rehearsal asset visibility through a tenant-scoped read operation", async () => {
    const listRehearsalAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityRepository["listRehearsalAssetVisibility"]
    >(() => Promise.resolve([visibilityRecord]));
    const service = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({ listRehearsalAssetVisibility })
    });

    await expect(
      service.listAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_visibility_list"
      })
    ).resolves.toEqual([visibilityRecord]);

    expect(listRehearsalAssetVisibility).toHaveBeenCalledWith({
      input: {
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_visibility_list",
          tenantId: "tenant_1"
        }
      }
    });
  });

  it("rejects actors without Planning visibility roles before repository calls", async () => {
    const setRehearsalAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityRepository["setRehearsalAssetVisibility"]
    >(() => Promise.resolve(visibilityRecord));
    const service = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({ setRehearsalAssetVisibility })
    });

    await expect(
      service.setAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T14:30:00.000Z",
          visibleToRoleIds: ["role_vocal"]
        },
        requestId: "request_visibility"
      })
    ).rejects.toThrow(
      "Actor is not allowed to manage Planning rehearsal asset visibility."
    );

    expect(setRehearsalAssetVisibility).not.toHaveBeenCalled();
  });

  it("rejects rehearsal asset visibility records outside tenant, service, or item scope", async () => {
    const tenantMismatchService = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({
        setRehearsalAssetVisibility: () =>
          Promise.resolve({
            ...visibilityRecord,
            tenantId: "tenant_2"
          })
      })
    });

    await expect(
      tenantMismatchService.setAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T14:30:00.000Z",
          visibleToRoleIds: ["role_vocal"]
        },
        requestId: "request_visibility"
      })
    ).rejects.toThrow("Planning rehearsal asset visibility tenant mismatch.");

    const serviceMismatchService = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({
        listRehearsalAssetVisibility: () =>
          Promise.resolve([
            {
              ...visibilityRecord,
              serviceId: "service_2"
            }
          ])
      })
    });

    await expect(
      serviceMismatchService.listAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1"
        },
        requestId: "request_visibility_list"
      })
    ).rejects.toThrow("Planning rehearsal asset visibility service mismatch.");

    const itemMismatchService = createPlanningRehearsalAssetVisibilityService({
      planningRepository: createRepository({
        listRehearsalAssetVisibility: () =>
          Promise.resolve([
            {
              ...visibilityRecord,
              serviceItemId: "item_2"
            }
          ])
      })
    });

    await expect(
      itemMismatchService.listAssetVisibility({
        actor: {
          actorId: "actor_1",
          roles: ["musician"],
          tenantId: "tenant_1"
        },
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_visibility_list"
      })
    ).rejects.toThrow(
      "Planning rehearsal asset visibility service item mismatch."
    );
  });
});
