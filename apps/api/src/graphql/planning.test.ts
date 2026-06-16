import { describe, expect, it, vi } from "vitest";
import type { PlanningReadinessResult } from "../domain/planning/index.js";
import type {
  PlanningAssignmentRecord,
  PlanningCommandService,
  PlanningServiceItemRecord,
  PlanningServiceRecord
} from "../services/planning/index.js";
import type { PlanningReadinessService } from "../services/planning/index.js";
import {
  createPlanningGraphqlResolvers,
  planningGraphqlTypeDefs,
  type PlanningGraphqlContext
} from "./planning.js";

const graphqlContext: PlanningGraphqlContext = {
  actor: {
    actorId: "actor_1",
    roles: ["worship_leader"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
};

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

const readinessResult: PlanningReadinessResult = {
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

const createPlanningCommandService = (
  overrides: Partial<PlanningCommandService> = {}
): PlanningCommandService => ({
  addServiceItem: vi.fn<PlanningCommandService["addServiceItem"]>(() =>
    Promise.resolve(serviceItemRecord)
  ),
  assignVolunteer: vi.fn<PlanningCommandService["assignVolunteer"]>(() =>
    Promise.resolve(assignmentRecord)
  ),
  createService: vi.fn<PlanningCommandService["createService"]>(() =>
    Promise.resolve(serviceRecord)
  ),
  reorderServiceItems: vi.fn<PlanningCommandService["reorderServiceItems"]>(() =>
    Promise.resolve([serviceItemRecord])
  ),
  updateAssignmentStatus: vi.fn<PlanningCommandService["updateAssignmentStatus"]>(() =>
    Promise.resolve({
      ...assignmentRecord,
      status: "confirmed"
    })
  ),
  updateService: vi.fn<PlanningCommandService["updateService"]>(() =>
    Promise.resolve(serviceRecord)
  ),
  updateServiceItem: vi.fn<PlanningCommandService["updateServiceItem"]>(() =>
    Promise.resolve(serviceItemRecord)
  ),
  ...overrides
});

const createPlanningReadinessService = (
  overrides: Partial<PlanningReadinessService> = {}
): PlanningReadinessService => ({
  refreshReadinessScore: vi.fn<PlanningReadinessService["refreshReadinessScore"]>(() =>
    Promise.resolve(readinessResult)
  ),
  ...overrides
});

describe("planningGraphqlTypeDefs", () => {
  it("declares the planned Planning mutation contract placeholders", () => {
    expect(planningGraphqlTypeDefs).toContain("createService(input: CreateServiceInput!)");
    expect(planningGraphqlTypeDefs).toContain("updateService(input: UpdateServiceInput!)");
    expect(planningGraphqlTypeDefs).toContain(
      "duplicateServiceFromTemplate(input: DuplicateServiceFromTemplateInput!)"
    );
    expect(planningGraphqlTypeDefs).toContain("addServiceItem(input: AddServiceItemInput!)");
    expect(planningGraphqlTypeDefs).toContain(
      "updateServiceItem(input: UpdateServiceItemInput!)"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "reorderServiceItems(input: ReorderServiceItemsInput!)"
    );
    expect(planningGraphqlTypeDefs).toContain("assignVolunteer(input: AssignVolunteerInput!)");
    expect(planningGraphqlTypeDefs).toContain(
      "updateAssignmentStatus(input: UpdateAssignmentStatusInput!)"
    );
    expect(planningGraphqlTypeDefs).toContain("generateSetlist(input: GenerateSetlistInput!)");
    expect(planningGraphqlTypeDefs).toContain(
      "refreshReadinessScore(input: RefreshReadinessScoreInput!)"
    );
  });
});

describe("createPlanningGraphqlResolvers", () => {
  it("delegates createService to the Planning command service with actor and request scope", async () => {
    const createService = vi.fn<PlanningCommandService["createService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ createService }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.createService(
        undefined,
        {
          input: {
            serviceTypeId: "type_sunday",
            startsAt: "2026-06-21T14:00:00.000Z",
            title: "Sunday Worship"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(serviceRecord);

    expect(createService).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceTypeId: "type_sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        title: "Sunday Worship"
      },
      requestId: "request_1"
    });
  });

  it("rejects invalid publish input before delegating to the command service", async () => {
    const updateService = vi.fn<PlanningCommandService["updateService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ updateService }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.updateService(
        undefined,
        {
          input: {
            serviceId: "service_1",
            status: "published"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Publishing or canceling a service requires explicit confirmation intent.");

    expect(updateService).not.toHaveBeenCalled();
  });

  it("delegates reorderServiceItems with validated non-duplicated service item IDs", async () => {
    const reorderServiceItems = vi.fn<PlanningCommandService["reorderServiceItems"]>(() =>
      Promise.resolve([serviceItemRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ reorderServiceItems }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.reorderServiceItems(
        undefined,
        {
          input: {
            orderedServiceItemIds: ["item_2", "item_1"],
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([serviceItemRecord]);

    expect(reorderServiceItems).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        orderedServiceItemIds: ["item_2", "item_1"],
        serviceId: "service_1"
      },
      requestId: "request_1"
    });
  });

  it("delegates refreshReadinessScore to the Planning readiness service", async () => {
    const refreshReadinessScore = vi.fn<
      PlanningReadinessService["refreshReadinessScore"]
    >(() => Promise.resolve(readinessResult));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningReadinessService: createPlanningReadinessService({ refreshReadinessScore })
    });

    await expect(
      resolvers.Mutation.refreshReadinessScore(
        undefined,
        {
          input: {
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(readinessResult);

    expect(refreshReadinessScore).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      requestId: "request_1",
      serviceId: "service_1"
    });
  });
});
