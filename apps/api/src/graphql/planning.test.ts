import { describe, expect, it, vi } from "vitest";
import type { PlanningReadinessResult } from "../domain/planning/index.js";
import type { ApiJobStatusRecord } from "../jobs/index.js";
import type {
  PlanningCcliUsageLogRecord,
  PlanningCcliUsageService,
  PlanningAssignmentRecord,
  PlanningCommandService,
  PlanningGeneratedSetlistResult,
  PlanningQueryService,
  PlanningRehearsalAcknowledgementRecord,
  PlanningRehearsalAcknowledgementService,
  PlanningRehearsalAssetVisibilityRecord,
  PlanningRehearsalAssetVisibilityService,
  PlanningServiceItemRecord,
  PlanningServiceRecord,
  PlanningServiceTemplateRecord,
  PlanningSongLibraryItemRecord
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

const generatedSetlistResult: PlanningGeneratedSetlistResult = {
  alternatives: [],
  confidence: 0.8,
  flowAnalysis: "Builds from gathering to response.",
  generatedByActorId: "actor_1",
  humanReview: {
    gate: "ai-suggested-write",
    required: true
  },
  needsReview: true,
  persisted: false,
  recommendedSetlist: [
    {
      rationale: "Known opener.",
      songId: "song_1",
      title: "Opening Song"
    }
  ],
  requestId: "request_1",
  reviewNotes: ["Review before adding to the plan."],
  serviceId: "service_1",
  status: "suggested",
  tenantId: "tenant_1",
  usageWarnings: []
};

const ccliReportingJobStatus: ApiJobStatusRecord = {
  enqueuedAt: "2026-06-16T18:30:00.000Z",
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
  tenantId: "tenant_1",
  updatedAt: "2026-06-16T18:30:00.000Z"
};

const ccliUsageLogRecord: PlanningCcliUsageLogRecord = {
  ccliSongNumber: "123456",
  ccliUsageLogId: "ccli_log_1",
  notes: "Sunday gathering use.",
  reportingStatus: "pending",
  serviceId: "service_1",
  serviceItemId: "item_1",
  songId: "song_1",
  tenantId: "tenant_1",
  title: "Opening Song",
  usageType: "service",
  usedAt: "2026-06-21T14:05:00.000Z"
};

const rehearsalAssetVisibilityRecord: PlanningRehearsalAssetVisibilityRecord = {
  assetId: "asset_chart_1",
  assetType: "chart",
  isVisible: true,
  rehearsalAssetVisibilityId: "visibility_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1",
  title: "Opening Song Chart",
  updatedAt: "2026-06-16T18:50:00.000Z",
  visibleToRoleIds: ["role_vocal", "role_guitar"]
};

const rehearsalAcknowledgementRecord: PlanningRehearsalAcknowledgementRecord = {
  acknowledgedAt: "2026-06-16T19:05:00.000Z",
  assetId: "asset_chart_1",
  assignmentId: "assignment_1",
  notes: "Ready for Sunday.",
  personId: "person_1",
  readinessSignal: "ready",
  rehearsalAcknowledgementId: "rehearsal_ack_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1"
};

const createPlanningCcliUsageService = (
  overrides: Partial<PlanningCcliUsageService> = {}
): PlanningCcliUsageService => ({
  getReportingJobStatus: vi.fn<PlanningCcliUsageService["getReportingJobStatus"]>(() =>
    Promise.resolve(ccliReportingJobStatus)
  ),
  listUsageLogs: vi.fn<PlanningCcliUsageService["listUsageLogs"]>(() =>
    Promise.resolve([])
  ),
  recordUsage: vi.fn<PlanningCcliUsageService["recordUsage"]>(() =>
    Promise.reject(new Error("GraphQL CCLI usage record fixture is not configured."))
  ),
  scheduleReportingJob: vi.fn<PlanningCcliUsageService["scheduleReportingJob"]>(() =>
    Promise.resolve({ jobId: "job_1" })
  ),
  ...overrides
});

const createPlanningRehearsalAcknowledgementService = (
  overrides: Partial<PlanningRehearsalAcknowledgementService> = {}
): PlanningRehearsalAcknowledgementService => ({
  listAcknowledgements: vi.fn<
    PlanningRehearsalAcknowledgementService["listAcknowledgements"]
  >(() => Promise.resolve([])),
  recordAcknowledgement: vi.fn<
    PlanningRehearsalAcknowledgementService["recordAcknowledgement"]
  >(() => Promise.resolve(rehearsalAcknowledgementRecord)),
  ...overrides
});

const createPlanningRehearsalAssetVisibilityService = (
  overrides: Partial<PlanningRehearsalAssetVisibilityService> = {}
): PlanningRehearsalAssetVisibilityService => ({
  listAssetVisibility: vi.fn<
    PlanningRehearsalAssetVisibilityService["listAssetVisibility"]
  >(() => Promise.resolve([])),
  setAssetVisibility: vi.fn<
    PlanningRehearsalAssetVisibilityService["setAssetVisibility"]
  >(() => Promise.resolve(rehearsalAssetVisibilityRecord)),
  ...overrides
});

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
  duplicateServiceFromTemplate: vi.fn<
    PlanningCommandService["duplicateServiceFromTemplate"]
  >(() => Promise.resolve(serviceRecord)),
  generateSetlist: vi.fn<PlanningCommandService["generateSetlist"]>(() =>
    Promise.resolve(generatedSetlistResult)
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

const createPlanningQueryService = (
  overrides: Partial<PlanningQueryService> = {}
): PlanningQueryService => ({
  service: vi.fn<PlanningQueryService["service"]>(() => Promise.resolve(serviceRecord)),
  serviceAssignments: vi.fn<PlanningQueryService["serviceAssignments"]>(() =>
    Promise.resolve([assignmentRecord])
  ),
  serviceReadiness: vi.fn<PlanningQueryService["serviceReadiness"]>(() =>
    Promise.resolve(readinessResult)
  ),
  serviceTemplates: vi.fn<PlanningQueryService["serviceTemplates"]>(() =>
    Promise.resolve([serviceTemplateRecord])
  ),
  songLibrary: vi.fn<PlanningQueryService["songLibrary"]>(() =>
    Promise.resolve([songLibraryItemRecord])
  ),
  services: vi.fn<PlanningQueryService["services"]>(() => Promise.resolve([serviceRecord])),
  ...overrides
});

describe("planningGraphqlTypeDefs", () => {
  it("declares the planned Planning query contract placeholders", () => {
    expect(planningGraphqlTypeDefs).toContain(
      "services(filter: PlanningServicesFilterInput): [PlanningService!]!"
    );
    expect(planningGraphqlTypeDefs).toContain("service(id: ID!): PlanningService");
    expect(planningGraphqlTypeDefs).toContain("type PlanningServiceTemplate");
    expect(planningGraphqlTypeDefs).toContain(
      "serviceTemplates(serviceTypeId: ID!): [PlanningServiceTemplate!]!"
    );
    expect(planningGraphqlTypeDefs).toContain("type PlanningSongLibraryItem");
    expect(planningGraphqlTypeDefs).toContain(
      "songLibrary(searchInput: PlanningSongLibrarySearchInput!): [PlanningSongLibraryItem!]!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "serviceAssignments(serviceId: ID!): [PlanningAssignment!]!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "serviceReadiness(serviceId: ID!): PlanningReadiness"
    );
    expect(planningGraphqlTypeDefs).toContain("type ApiJobStatusRecord");
    expect(planningGraphqlTypeDefs).toContain(
      "ccliReportingJobStatus(input: CcliReportingJobStatusInput!): ApiJobStatusRecord"
    );
    expect(planningGraphqlTypeDefs).toContain("type PlanningCcliUsageLog");
    expect(planningGraphqlTypeDefs).toContain(
      "ccliUsageLogs(input: CcliUsageLogsInput!): [PlanningCcliUsageLog!]!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "type PlanningRehearsalAssetVisibility"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "rehearsalAssetVisibility(input: RehearsalAssetVisibilityInput!): [PlanningRehearsalAssetVisibility!]!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "type PlanningRehearsalAcknowledgement"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "rehearsalAcknowledgements(input: RehearsalAcknowledgementsInput!): [PlanningRehearsalAcknowledgement!]!"
    );
  });

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
    expect(planningGraphqlTypeDefs).toContain("type PlanningGeneratedSetlist");
    expect(planningGraphqlTypeDefs).toContain("type PlanningSetlistRecommendation");
    expect(planningGraphqlTypeDefs).toContain("type PlanningSetlistAlternative");
    expect(planningGraphqlTypeDefs).toContain(
      "generateSetlist(input: GenerateSetlistInput!): PlanningGeneratedSetlist!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "refreshReadinessScore(input: RefreshReadinessScoreInput!)"
    );
    expect(planningGraphqlTypeDefs).toContain("input RecordCcliUsageInput");
    expect(planningGraphqlTypeDefs).toContain(
      "recordCcliUsage(input: RecordCcliUsageInput!): PlanningCcliUsageLog!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "input SetRehearsalAssetVisibilityInput"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "setRehearsalAssetVisibility(input: SetRehearsalAssetVisibilityInput!): PlanningRehearsalAssetVisibility!"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "input RecordRehearsalAcknowledgementInput"
    );
    expect(planningGraphqlTypeDefs).toContain(
      "recordRehearsalAcknowledgement(input: RecordRehearsalAcknowledgementInput!): PlanningRehearsalAcknowledgement!"
    );
    expect(planningGraphqlTypeDefs).toContain("input ScheduleCcliReportingJobInput");
    expect(planningGraphqlTypeDefs).toContain(
      "scheduleCcliReportingJob(input: ScheduleCcliReportingJobInput!): ApiJobStatusEnqueueResult!"
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
      planningQueryService: createPlanningQueryService(),
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

  it("delegates duplicateServiceFromTemplate to the Planning command service with actor and request scope", async () => {
    const duplicatedServiceRecord: PlanningServiceRecord = {
      ...serviceRecord,
      serviceId: "service_from_template",
      startsAt: "2026-06-28T14:00:00.000Z",
      title: "Template Sunday"
    };
    const duplicateServiceFromTemplate = vi.fn<
      PlanningCommandService["duplicateServiceFromTemplate"]
    >(() => Promise.resolve(duplicatedServiceRecord));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({
        duplicateServiceFromTemplate
      }),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.duplicateServiceFromTemplate(
        undefined,
        {
          input: {
            serviceTemplateId: "template_sunday",
            startsAt: "2026-06-28T14:00:00.000Z",
            title: "Template Sunday"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_duplicate"
        }
      )
    ).resolves.toEqual(duplicatedServiceRecord);

    expect(duplicateServiceFromTemplate).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceTemplateId: "template_sunday",
        startsAt: "2026-06-28T14:00:00.000Z",
        title: "Template Sunday"
      },
      requestId: "request_duplicate"
    });
  });

  it("rejects invalid duplicateServiceFromTemplate input before delegating", async () => {
    const duplicateServiceFromTemplate = vi.fn<
      PlanningCommandService["duplicateServiceFromTemplate"]
    >(() => Promise.resolve(serviceRecord));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({
        duplicateServiceFromTemplate
      }),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.duplicateServiceFromTemplate(
        undefined,
        {
          input: {
            serviceTemplateId: "",
            startsAt: "not-a-date",
            title: ""
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(duplicateServiceFromTemplate).not.toHaveBeenCalled();
  });

  it("rejects invalid publish input before delegating to the command service", async () => {
    const updateService = vi.fn<PlanningCommandService["updateService"]>(() =>
      Promise.resolve(serviceRecord)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ updateService }),
      planningQueryService: createPlanningQueryService(),
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
      planningQueryService: createPlanningQueryService(),
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

  it("delegates generateSetlist to the Planning command service with actor and request scope", async () => {
    const generateSetlist = vi.fn<PlanningCommandService["generateSetlist"]>(() =>
      Promise.resolve({
        ...generatedSetlistResult,
        requestId: "request_setlist"
      })
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ generateSetlist }),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.generateSetlist(
        undefined,
        {
          input: {
            churchContextSummary: "Sunday gathering with a volunteer band.",
            churchPreferences: ["Keep keys congregational."],
            planningConstraints: ["No new songs this week."],
            recentUsageHistory: ["Opening Song used last month."],
            scriptureReference: "Psalm 100",
            sermonTheme: "Gratitude",
            serviceId: "service_1",
            serviceType: "Sunday Worship",
            songLibrary: [
              {
                artist: "Sanctuary Collective",
                availableKeys: ["G", "A"],
                defaultKey: "G",
                isBannedOrPaused: false,
                songId: "song_1",
                title: "Opening Song",
                usageCount: 6
              }
            ],
            targetSetLength: 1
          }
        },
        {
          ...graphqlContext,
          requestId: "request_setlist"
        }
      )
    ).resolves.toEqual({
      ...generatedSetlistResult,
      requestId: "request_setlist"
    });

    expect(generateSetlist).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        churchContextSummary: "Sunday gathering with a volunteer band.",
        churchPreferences: ["Keep keys congregational."],
        planningConstraints: ["No new songs this week."],
        recentUsageHistory: ["Opening Song used last month."],
        scriptureReference: "Psalm 100",
        sermonTheme: "Gratitude",
        serviceId: "service_1",
        serviceType: "Sunday Worship",
        songLibrary: [
          {
            artist: "Sanctuary Collective",
            availableKeys: ["G", "A"],
            defaultKey: "G",
            isBannedOrPaused: false,
            songId: "song_1",
            title: "Opening Song",
            usageCount: 6
          }
        ],
        targetSetLength: 1
      },
      requestId: "request_setlist"
    });
  });

  it("returns generated setlists as reviewable suggestions instead of persisted services", async () => {
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.generateSetlist(
        undefined,
        {
          input: {
            churchContextSummary: "Sunday gathering with a volunteer band.",
            churchPreferences: [],
            planningConstraints: [],
            recentUsageHistory: [],
            serviceId: "service_1",
            serviceType: "Sunday Worship",
            songLibrary: [
              {
                availableKeys: ["G"],
                songId: "song_1",
                title: "Opening Song"
              }
            ],
            targetSetLength: 1
          }
        },
        graphqlContext
      )
    ).resolves.toMatchObject({
      humanReview: {
        gate: "ai-suggested-write",
        required: true
      },
      needsReview: true,
      persisted: false,
      recommendedSetlist: [
        {
          songId: "song_1"
        }
      ],
      serviceId: "service_1",
      status: "suggested"
    });
  });

  it("rejects invalid generateSetlist input before delegating", async () => {
    const generateSetlist = vi.fn<PlanningCommandService["generateSetlist"]>(() =>
      Promise.resolve(generatedSetlistResult)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService({ generateSetlist }),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.generateSetlist(
        undefined,
        {
          input: {
            churchContextSummary: "",
            serviceId: "service_1",
            serviceType: "Sunday Worship",
            songLibrary: [],
            targetSetLength: 1
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(generateSetlist).not.toHaveBeenCalled();
  });

  it("delegates refreshReadinessScore to the Planning readiness service", async () => {
    const refreshReadinessScore = vi.fn<
      PlanningReadinessService["refreshReadinessScore"]
    >(() => Promise.resolve(readinessResult));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
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

  it("delegates scheduleCcliReportingJob to the Planning CCLI usage service with actor and request scope", async () => {
    const scheduleReportingJob = vi.fn<
      PlanningCcliUsageService["scheduleReportingJob"]
    >(() => Promise.resolve({ jobId: "job_1" }));
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        scheduleReportingJob
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.scheduleCcliReportingJob(
        undefined,
        {
          input: {
            reportingStatus: "pending",
            serviceId: "service_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ccli_report"
        }
      )
    ).resolves.toEqual({ jobId: "job_1" });

    expect(scheduleReportingJob).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestId: "request_ccli_report"
    });
  });

  it("delegates recordCcliUsage to the Planning CCLI usage service with actor and request scope", async () => {
    const recordUsage = vi.fn<PlanningCcliUsageService["recordUsage"]>(() =>
      Promise.resolve(ccliUsageLogRecord)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        recordUsage
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.recordCcliUsage(
        undefined,
        {
          input: {
            ccliSongNumber: "123456",
            notes: "Sunday gathering use.",
            serviceId: "service_1",
            serviceItemId: "item_1",
            songId: "song_1",
            title: "Opening Song",
            usageType: "service",
            usedAt: "2026-06-21T14:05:00.000Z"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ccli_record"
        }
      )
    ).resolves.toEqual(ccliUsageLogRecord);

    expect(recordUsage).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        ccliSongNumber: "123456",
        notes: "Sunday gathering use.",
        serviceId: "service_1",
        serviceItemId: "item_1",
        songId: "song_1",
        title: "Opening Song",
        usageType: "service",
        usedAt: "2026-06-21T14:05:00.000Z"
      },
      requestId: "request_ccli_record"
    });
  });

  it("delegates ccliUsageLogs to the Planning CCLI usage service and preserves log shape", async () => {
    const listUsageLogs = vi.fn<PlanningCcliUsageService["listUsageLogs"]>(() =>
      Promise.resolve([ccliUsageLogRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        listUsageLogs
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.ccliUsageLogs(
        undefined,
        {
          input: {
            reportingStatus: "pending",
            serviceId: "service_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ccli_list"
        }
      )
    ).resolves.toEqual([ccliUsageLogRecord]);

    expect(listUsageLogs).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestId: "request_ccli_list"
    });
  });

  it("returns empty CCLI usage log query results", async () => {
    const listUsageLogs = vi.fn<PlanningCcliUsageService["listUsageLogs"]>(() =>
      Promise.resolve([])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        listUsageLogs
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.ccliUsageLogs(
        undefined,
        {
          input: {
            serviceId: "service_without_usage"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([]);
  });

  it("delegates setRehearsalAssetVisibility to the Planning rehearsal asset visibility service with actor and request scope", async () => {
    const setAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["setAssetVisibility"]
    >(() => Promise.resolve(rehearsalAssetVisibilityRecord));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAssetVisibilityService:
        createPlanningRehearsalAssetVisibilityService({
          setAssetVisibility
        })
    });

    await expect(
      resolvers.Mutation.setRehearsalAssetVisibility(
        undefined,
        {
          input: {
            assetId: "asset_chart_1",
            assetType: "chart",
            isVisible: true,
            serviceId: "service_1",
            serviceItemId: "item_1",
            title: "Opening Song Chart",
            updatedAt: "2026-06-16T18:50:00.000Z",
            visibleToRoleIds: ["role_vocal", "role_guitar"]
          }
        },
        {
          ...graphqlContext,
          requestId: "request_visibility_set"
        }
      )
    ).resolves.toEqual(rehearsalAssetVisibilityRecord);

    expect(setAssetVisibility).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        assetId: "asset_chart_1",
        assetType: "chart",
        isVisible: true,
        serviceId: "service_1",
        serviceItemId: "item_1",
        title: "Opening Song Chart",
        updatedAt: "2026-06-16T18:50:00.000Z",
        visibleToRoleIds: ["role_vocal", "role_guitar"]
      },
      requestId: "request_visibility_set"
    });
  });

  it("delegates rehearsalAssetVisibility to the Planning rehearsal asset visibility service and preserves visibility shape", async () => {
    const listAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["listAssetVisibility"]
    >(() => Promise.resolve([rehearsalAssetVisibilityRecord]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAssetVisibilityService:
        createPlanningRehearsalAssetVisibilityService({
          listAssetVisibility
        })
    });

    await expect(
      resolvers.Query.rehearsalAssetVisibility(
        undefined,
        {
          input: {
            serviceId: "service_1",
            serviceItemId: "item_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_visibility_list"
        }
      )
    ).resolves.toEqual([rehearsalAssetVisibilityRecord]);

    expect(listAssetVisibility).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      requestId: "request_visibility_list"
    });
  });

  it("returns empty rehearsal asset visibility query results", async () => {
    const listAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["listAssetVisibility"]
    >(() => Promise.resolve([]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAssetVisibilityService:
        createPlanningRehearsalAssetVisibilityService({
          listAssetVisibility
        })
    });

    await expect(
      resolvers.Query.rehearsalAssetVisibility(
        undefined,
        {
          input: {
            serviceId: "service_without_assets"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([]);
  });

  it("rejects invalid rehearsal asset visibility input before delegating", async () => {
    const setAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["setAssetVisibility"]
    >(() => Promise.resolve(rehearsalAssetVisibilityRecord));
    const listAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["listAssetVisibility"]
    >(() => Promise.resolve([rehearsalAssetVisibilityRecord]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAssetVisibilityService:
        createPlanningRehearsalAssetVisibilityService({
          listAssetVisibility,
          setAssetVisibility
        })
    });

    await expect(
      resolvers.Mutation.setRehearsalAssetVisibility(
        undefined,
        {
          input: {
            assetId: "asset_chart_1",
            assetType: "raw_media",
            isVisible: true,
            serviceId: "service_1",
            serviceItemId: "item_1",
            title: "Opening Song Chart",
            updatedAt: "2026-06-16T18:50:00.000Z",
            visibleToRoleIds: ["role_vocal"]
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(setAssetVisibility).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.rehearsalAssetVisibility(
        undefined,
        {
          input: {
            serviceId: "",
            serviceItemId: "item_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(listAssetVisibility).not.toHaveBeenCalled();
  });

  it("propagates Planning rehearsal asset visibility service set and list errors", async () => {
    const setAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["setAssetVisibility"]
    >(() =>
      Promise.reject(
        new Error(
          "Actor is not allowed to manage Planning rehearsal asset visibility."
        )
      )
    );
    const listAssetVisibility = vi.fn<
      PlanningRehearsalAssetVisibilityService["listAssetVisibility"]
    >(() =>
      Promise.reject(new Error("Planning rehearsal asset visibility tenant mismatch."))
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAssetVisibilityService:
        createPlanningRehearsalAssetVisibilityService({
          listAssetVisibility,
          setAssetVisibility
        })
    });

    await expect(
      resolvers.Mutation.setRehearsalAssetVisibility(
        undefined,
        {
          input: {
            assetId: "asset_chart_1",
            assetType: "chart",
            isVisible: true,
            serviceId: "service_1",
            serviceItemId: "item_1",
            title: "Opening Song Chart",
            updatedAt: "2026-06-16T18:50:00.000Z",
            visibleToRoleIds: ["role_vocal"]
          }
        },
        graphqlContext
      )
    ).rejects.toThrow(
      "Actor is not allowed to manage Planning rehearsal asset visibility."
    );

    await expect(
      resolvers.Query.rehearsalAssetVisibility(
        undefined,
        {
          input: {
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Planning rehearsal asset visibility tenant mismatch.");
  });

  it("delegates recordRehearsalAcknowledgement to the Planning rehearsal acknowledgement service with actor and request scope", async () => {
    const recordAcknowledgement = vi.fn<
      PlanningRehearsalAcknowledgementService["recordAcknowledgement"]
    >(() => Promise.resolve(rehearsalAcknowledgementRecord));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAcknowledgementService:
        createPlanningRehearsalAcknowledgementService({
          recordAcknowledgement
        })
    });

    await expect(
      resolvers.Mutation.recordRehearsalAcknowledgement(
        undefined,
        {
          input: {
            acknowledgedAt: "2026-06-16T19:05:00.000Z",
            assetId: "asset_chart_1",
            assignmentId: "assignment_1",
            notes: "Ready for Sunday.",
            personId: "person_1",
            readinessSignal: "ready",
            serviceId: "service_1",
            serviceItemId: "item_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ack_record"
        }
      )
    ).resolves.toEqual(rehearsalAcknowledgementRecord);

    expect(recordAcknowledgement).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        acknowledgedAt: "2026-06-16T19:05:00.000Z",
        assetId: "asset_chart_1",
        assignmentId: "assignment_1",
        notes: "Ready for Sunday.",
        personId: "person_1",
        readinessSignal: "ready",
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      requestId: "request_ack_record"
    });
  });

  it("delegates rehearsalAcknowledgements to the Planning rehearsal acknowledgement service and preserves acknowledgement shape", async () => {
    const listAcknowledgements = vi.fn<
      PlanningRehearsalAcknowledgementService["listAcknowledgements"]
    >(() => Promise.resolve([rehearsalAcknowledgementRecord]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAcknowledgementService:
        createPlanningRehearsalAcknowledgementService({
          listAcknowledgements
        })
    });

    await expect(
      resolvers.Query.rehearsalAcknowledgements(
        undefined,
        {
          input: {
            assetId: "asset_chart_1",
            assignmentId: "assignment_1",
            personId: "person_1",
            serviceId: "service_1",
            serviceItemId: "item_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ack_list"
        }
      )
    ).resolves.toEqual([rehearsalAcknowledgementRecord]);

    expect(listAcknowledgements).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        assetId: "asset_chart_1",
        assignmentId: "assignment_1",
        personId: "person_1",
        serviceId: "service_1",
        serviceItemId: "item_1"
      },
      requestId: "request_ack_list"
    });
  });

  it("returns empty rehearsal acknowledgement query results", async () => {
    const listAcknowledgements = vi.fn<
      PlanningRehearsalAcknowledgementService["listAcknowledgements"]
    >(() => Promise.resolve([]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAcknowledgementService:
        createPlanningRehearsalAcknowledgementService({
          listAcknowledgements
        })
    });

    await expect(
      resolvers.Query.rehearsalAcknowledgements(
        undefined,
        {
          input: {
            serviceId: "service_without_acknowledgements"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([]);
  });

  it("rejects invalid rehearsal acknowledgement input before delegating", async () => {
    const recordAcknowledgement = vi.fn<
      PlanningRehearsalAcknowledgementService["recordAcknowledgement"]
    >(() => Promise.resolve(rehearsalAcknowledgementRecord));
    const listAcknowledgements = vi.fn<
      PlanningRehearsalAcknowledgementService["listAcknowledgements"]
    >(() => Promise.resolve([rehearsalAcknowledgementRecord]));
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAcknowledgementService:
        createPlanningRehearsalAcknowledgementService({
          listAcknowledgements,
          recordAcknowledgement
        })
    });

    await expect(
      resolvers.Mutation.recordRehearsalAcknowledgement(
        undefined,
        {
          input: {
            acknowledgedAt: "2026-06-16T19:05:00.000Z",
            assetId: "asset_chart_1",
            assignmentId: "assignment_1",
            personId: "person_1",
            readinessSignal: "unreviewed",
            serviceId: "service_1",
            serviceItemId: "item_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(recordAcknowledgement).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.rehearsalAcknowledgements(
        undefined,
        {
          input: {
            personId: "person_1",
            serviceId: ""
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(listAcknowledgements).not.toHaveBeenCalled();
  });

  it("propagates Planning rehearsal acknowledgement service record and list errors", async () => {
    const recordAcknowledgement = vi.fn<
      PlanningRehearsalAcknowledgementService["recordAcknowledgement"]
    >(() =>
      Promise.reject(
        new Error(
          "Actor is not allowed to record Planning rehearsal acknowledgements."
        )
      )
    );
    const listAcknowledgements = vi.fn<
      PlanningRehearsalAcknowledgementService["listAcknowledgements"]
    >(() =>
      Promise.reject(new Error("Planning rehearsal acknowledgement tenant mismatch."))
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService(),
      planningRehearsalAcknowledgementService:
        createPlanningRehearsalAcknowledgementService({
          listAcknowledgements,
          recordAcknowledgement
        })
    });

    await expect(
      resolvers.Mutation.recordRehearsalAcknowledgement(
        undefined,
        {
          input: {
            acknowledgedAt: "2026-06-16T19:05:00.000Z",
            assetId: "asset_chart_1",
            assignmentId: "assignment_1",
            personId: "person_1",
            readinessSignal: "ready",
            serviceId: "service_1",
            serviceItemId: "item_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow(
      "Actor is not allowed to record Planning rehearsal acknowledgements."
    );

    await expect(
      resolvers.Query.rehearsalAcknowledgements(
        undefined,
        {
          input: {
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Planning rehearsal acknowledgement tenant mismatch.");
  });

  it("delegates ccliReportingJobStatus to the Planning CCLI usage service and preserves status shape", async () => {
    const getReportingJobStatus = vi.fn<
      PlanningCcliUsageService["getReportingJobStatus"]
    >(() =>
      Promise.resolve({
        ...ccliReportingJobStatus,
        safeErrorMessage: "CCLI reporting is temporarily unavailable.",
        status: "failed",
        updatedAt: "2026-06-16T18:45:00.000Z"
      })
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        getReportingJobStatus
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.ccliReportingJobStatus(
        undefined,
        {
          input: {
            jobId: "job_1"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_ccli_status"
        }
      )
    ).resolves.toEqual({
      ...ccliReportingJobStatus,
      safeErrorMessage: "CCLI reporting is temporarily unavailable.",
      status: "failed",
      updatedAt: "2026-06-16T18:45:00.000Z"
    });

    expect(getReportingJobStatus).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        jobId: "job_1"
      },
      requestId: "request_ccli_status"
    });
  });

  it("returns null for missing CCLI reporting job status lookups", async () => {
    const getReportingJobStatus = vi.fn<
      PlanningCcliUsageService["getReportingJobStatus"]
    >(() => Promise.resolve(null));
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        getReportingJobStatus
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.ccliReportingJobStatus(
        undefined,
        {
          input: {
            jobId: "job_missing"
          }
        },
        graphqlContext
      )
    ).resolves.toBeNull();
  });

  it("rejects invalid CCLI reporting job input before delegating", async () => {
    const scheduleReportingJob = vi.fn<
      PlanningCcliUsageService["scheduleReportingJob"]
    >(() => Promise.resolve({ jobId: "job_1" }));
    const getReportingJobStatus = vi.fn<
      PlanningCcliUsageService["getReportingJobStatus"]
    >(() => Promise.resolve(ccliReportingJobStatus));
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        getReportingJobStatus,
        scheduleReportingJob
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.scheduleCcliReportingJob(
        undefined,
        {
          input: {
            reportingStatus: "reported",
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(scheduleReportingJob).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.ccliReportingJobStatus(
        undefined,
        {
          input: {
            jobId: ""
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(getReportingJobStatus).not.toHaveBeenCalled();
  });

  it("rejects invalid CCLI usage log input before delegating", async () => {
    const recordUsage = vi.fn<PlanningCcliUsageService["recordUsage"]>(() =>
      Promise.resolve(ccliUsageLogRecord)
    );
    const listUsageLogs = vi.fn<PlanningCcliUsageService["listUsageLogs"]>(() =>
      Promise.resolve([ccliUsageLogRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        listUsageLogs,
        recordUsage
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.recordCcliUsage(
        undefined,
        {
          input: {
            credentials: "secret-token",
            serviceId: "service_1",
            songId: "song_1",
            title: "Opening Song",
            usageType: "service",
            usedAt: "2026-06-21T14:05:00.000Z"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(recordUsage).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.ccliUsageLogs(
        undefined,
        {
          input: {
            reportingStatus: "pending",
            serviceId: ""
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(listUsageLogs).not.toHaveBeenCalled();
  });

  it("propagates Planning CCLI usage service record and list errors", async () => {
    const recordUsage = vi.fn<PlanningCcliUsageService["recordUsage"]>(() =>
      Promise.reject(new Error("Actor is not allowed to manage Planning CCLI usage logs."))
    );
    const listUsageLogs = vi.fn<PlanningCcliUsageService["listUsageLogs"]>(() =>
      Promise.reject(new Error("Planning CCLI usage log tenant mismatch."))
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        listUsageLogs,
        recordUsage
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.recordCcliUsage(
        undefined,
        {
          input: {
            serviceId: "service_1",
            songId: "song_1",
            title: "Opening Song",
            usageType: "service",
            usedAt: "2026-06-21T14:05:00.000Z"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Actor is not allowed to manage Planning CCLI usage logs.");

    await expect(
      resolvers.Query.ccliUsageLogs(
        undefined,
        {
          input: {
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Planning CCLI usage log tenant mismatch.");
  });

  it("propagates unconfigured Planning CCLI usage service errors", async () => {
    const scheduleReportingJob = vi.fn<
      PlanningCcliUsageService["scheduleReportingJob"]
    >(() =>
      Promise.reject(
        new Error("Planning CCLI reporting job dispatcher is not configured.")
      )
    );
    const getReportingJobStatus = vi.fn<
      PlanningCcliUsageService["getReportingJobStatus"]
    >(() =>
      Promise.reject(
        new Error("Planning CCLI reporting job status reader is not configured.")
      )
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCcliUsageService: createPlanningCcliUsageService({
        getReportingJobStatus,
        scheduleReportingJob
      }),
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService(),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Mutation.scheduleCcliReportingJob(
        undefined,
        {
          input: {
            serviceId: "service_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Planning CCLI reporting job dispatcher is not configured.");

    await expect(
      resolvers.Query.ccliReportingJobStatus(
        undefined,
        {
          input: {
            jobId: "job_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow(
      "Planning CCLI reporting job status reader is not configured."
    );
  });

  it("delegates services query to the Planning query service with actor and request scope", async () => {
    const services = vi.fn<PlanningQueryService["services"]>(() =>
      Promise.resolve([serviceRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ services }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.services(
        undefined,
        {
          filter: {
            serviceTypeId: "type_sunday",
            status: "scheduled"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([serviceRecord]);

    expect(services).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        filter: {
          serviceTypeId: "type_sunday",
          status: "scheduled"
        }
      },
      requestId: "request_1"
    });
  });

  it("delegates serviceTemplates query to the Planning query service with actor and request scope", async () => {
    const serviceTemplates = vi.fn<PlanningQueryService["serviceTemplates"]>(() =>
      Promise.resolve([serviceTemplateRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ serviceTemplates }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.serviceTemplates(
        undefined,
        {
          serviceTypeId: "type_sunday"
        },
        {
          ...graphqlContext,
          requestId: "request_templates"
        }
      )
    ).resolves.toEqual([serviceTemplateRecord]);

    expect(serviceTemplates).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceTypeId: "type_sunday"
      },
      requestId: "request_templates"
    });
  });

  it("returns empty service template query results", async () => {
    const serviceTemplates = vi.fn<PlanningQueryService["serviceTemplates"]>(() =>
      Promise.resolve([])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ serviceTemplates }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.serviceTemplates(
        undefined,
        {
          serviceTypeId: "type_sunday"
        },
        graphqlContext
      )
    ).resolves.toEqual([]);
  });

  it("delegates songLibrary query to the Planning query service with actor and request scope", async () => {
    const songLibrary = vi.fn<PlanningQueryService["songLibrary"]>(() =>
      Promise.resolve([songLibraryItemRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ songLibrary }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.songLibrary(
        undefined,
        {
          searchInput: {
            includeBannedOrPaused: true,
            key: "G",
            limit: 10,
            query: "open",
            serviceTypeId: "type_sunday"
          }
        },
        {
          ...graphqlContext,
          requestId: "request_songs"
        }
      )
    ).resolves.toEqual([songLibraryItemRecord]);

    expect(songLibrary).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        searchInput: {
          includeBannedOrPaused: true,
          key: "G",
          limit: 10,
          query: "open",
          serviceTypeId: "type_sunday"
        }
      },
      requestId: "request_songs"
    });
  });

  it("returns empty song library query results", async () => {
    const songLibrary = vi.fn<PlanningQueryService["songLibrary"]>(() =>
      Promise.resolve([])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ songLibrary }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.songLibrary(
        undefined,
        {
          searchInput: {
            query: "missing"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([]);
  });

  it("delegates service assignment and readiness queries to the Planning query service", async () => {
    const serviceAssignments = vi.fn<PlanningQueryService["serviceAssignments"]>(() =>
      Promise.resolve([assignmentRecord])
    );
    const serviceReadiness = vi.fn<PlanningQueryService["serviceReadiness"]>(() =>
      Promise.resolve(readinessResult)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({
        serviceAssignments,
        serviceReadiness
      }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.serviceAssignments(
        undefined,
        {
          serviceId: "service_1"
        },
        graphqlContext
      )
    ).resolves.toEqual([assignmentRecord]);

    await expect(
      resolvers.Query.serviceReadiness(
        undefined,
        {
          serviceId: "service_1"
        },
        graphqlContext
      )
    ).resolves.toEqual(readinessResult);

    expect(serviceAssignments).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1"
      },
      requestId: "request_1"
    });
    expect(serviceReadiness).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1"
      },
      requestId: "request_1"
    });
  });

  it("returns nullable service and readiness query results", async () => {
    const service = vi.fn<PlanningQueryService["service"]>(() => Promise.resolve(null));
    const serviceReadiness = vi.fn<PlanningQueryService["serviceReadiness"]>(() =>
      Promise.resolve(null)
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({ service, serviceReadiness }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.service(
        undefined,
        {
          id: "service_missing"
        },
        graphqlContext
      )
    ).resolves.toBeNull();
    await expect(
      resolvers.Query.serviceReadiness(
        undefined,
        {
          serviceId: "service_missing"
        },
        graphqlContext
      )
    ).resolves.toBeNull();
  });

  it("rejects invalid Planning query input before delegating", async () => {
    const services = vi.fn<PlanningQueryService["services"]>(() =>
      Promise.resolve([serviceRecord])
    );
    const serviceTemplates = vi.fn<PlanningQueryService["serviceTemplates"]>(() =>
      Promise.resolve([serviceTemplateRecord])
    );
    const songLibrary = vi.fn<PlanningQueryService["songLibrary"]>(() =>
      Promise.resolve([songLibraryItemRecord])
    );
    const resolvers = createPlanningGraphqlResolvers({
      planningCommandService: createPlanningCommandService(),
      planningQueryService: createPlanningQueryService({
        serviceTemplates,
        services,
        songLibrary
      }),
      planningReadinessService: createPlanningReadinessService()
    });

    await expect(
      resolvers.Query.services(
        undefined,
        {
          filter: {
            startsAtOrAfter: "not-a-date"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(services).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.serviceTemplates(
        undefined,
        {
          serviceTypeId: ""
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(serviceTemplates).not.toHaveBeenCalled();

    await expect(
      resolvers.Query.songLibrary(
        undefined,
        {
          searchInput: {}
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(songLibrary).not.toHaveBeenCalled();
  });
});
