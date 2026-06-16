import { describe, expect, it } from "vitest";
import {
  CreatePlanningServicePersistenceOperationSchema,
  DuplicatePlanningServiceFromTemplatePersistenceOperationSchema,
  ListPlanningSongLibraryPersistenceOperationSchema,
  ListPlanningServicesPersistenceOperationSchema,
  ListPlanningServiceTemplatesPersistenceOperationSchema,
  ListPlanningCcliUsageLogsPersistenceOperationSchema,
  ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema,
  ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema,
  RecordPlanningCcliUsagePersistenceOperationSchema,
  RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema,
  RepositoryWriteOptionsSchema,
  SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema,
  UpdatePlanningServicePersistenceOperationSchema,
  type PlanningCcliUsageLogPersistenceRecord,
  type PlanningReadinessPersistenceRecord,
  type PlanningRehearsalAcknowledgementPersistenceRecord,
  type PlanningRehearsalAssetVisibilityPersistenceRecord,
  type PlanningServicePersistenceRecord,
  type PlanningServiceTemplatePersistenceRecord,
  type PlanningSongLibraryItemPersistenceRecord
} from "./index.js";
import type {
  PlanningCcliUsageLogPersistenceRepository,
  PlanningRehearsalAcknowledgementPersistenceRepository,
  PlanningRehearsalAssetVisibilityPersistenceRepository,
  PlanningServiceCommandPersistenceRepository,
  PlanningServiceQueryPersistenceRepository
} from "./index.js";

const serviceRecord: PlanningServicePersistenceRecord = {
  serviceId: "service_1",
  serviceTypeId: "sunday",
  status: "draft",
  tenantId: "tenant_1",
  title: "Sunday Service"
};

const serviceTemplateRecord: PlanningServiceTemplatePersistenceRecord = {
  description: "Default Sunday flow.",
  serviceTemplateId: "template_sunday",
  serviceTypeId: "sunday",
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

const readinessRecord: PlanningReadinessPersistenceRecord = {
  band: "needs-attention",
  checks: [
    {
      code: "required-roles",
      label: "Required roles assigned",
      maxScore: 25,
      score: 15
    }
  ],
  readinessScore: 65,
  recommendedActions: ["Finish: Required roles assigned."],
  risks: ["Required roles assigned is incomplete."],
  serviceId: "service_1",
  strengths: [],
  tenantId: "tenant_1"
};

const ccliUsageLogRecord: PlanningCcliUsageLogPersistenceRecord = {
  ccliSongNumber: "123456",
  ccliUsageLogId: "ccli_log_1",
  reportingStatus: "pending",
  serviceId: "service_1",
  serviceItemId: "item_1",
  songId: "song_1",
  tenantId: "tenant_1",
  title: "Open The Gates",
  usageType: "service",
  usedAt: "2026-06-21T14:00:00.000Z"
};

const rehearsalAssetVisibilityRecord: PlanningRehearsalAssetVisibilityPersistenceRecord = {
  assetId: "asset_chart_1",
  assetType: "chart",
  isVisible: true,
  rehearsalAssetVisibilityId: "rehearsal_asset_visibility_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1",
  title: "Open The Gates Chart",
  updatedAt: "2026-06-21T13:00:00.000Z",
  visibleToRoleIds: ["role_vocal", "role_guitar"]
};

const rehearsalAcknowledgementRecord: PlanningRehearsalAcknowledgementPersistenceRecord = {
  acknowledgedAt: "2026-06-21T15:00:00.000Z",
  assignmentId: "assignment_1",
  assetId: "asset_chart_1",
  notes: "Reviewed chart and ready for rehearsal.",
  personId: "person_1",
  readinessSignal: "ready",
  rehearsalAcknowledgementId: "rehearsal_ack_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1"
};

describe("Planning repository contracts", () => {
  it("validates tenant-scoped write options for Planning persistence operations", () => {
    const options = RepositoryWriteOptionsSchema.parse({
      context: {
        actorId: "actor_1",
        requestId: "request_1",
        tenantId: "tenant_1"
      },
      intent: "create"
    });

    expect(options.context.tenantId).toBe("tenant_1");
    expect(options.intent).toBe("create");
  });

  it("validates create and destructive update operation shapes", () => {
    expect(
      CreatePlanningServicePersistenceOperationSchema.parse({
        input: {
          serviceTypeId: "sunday",
          title: "Sunday Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      }).options.intent
    ).toBe("create");

    expect(
      DuplicatePlanningServiceFromTemplatePersistenceOperationSchema.parse({
        input: {
          serviceTemplateId: "template_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday From Template"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_template",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      }).input.serviceTemplateId
    ).toBe("template_sunday");

    expect(
      UpdatePlanningServicePersistenceOperationSchema.parse({
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Planner confirmed canceling the service."
          },
          serviceId: "service_1",
          status: "canceled"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          },
          intent: "destructive-confirmed"
        }
      }).options.intent
    ).toBe("destructive-confirmed");
  });

  it("validates tenant-scoped Planning read operation shapes", () => {
    expect(
      ListPlanningServicesPersistenceOperationSchema.parse({
        input: {
          filter: {
            startsAtOrAfter: "2026-06-21T00:00:00.000Z",
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
      }).input.filter?.status
    ).toBe("scheduled");

    expect(
      ListPlanningServiceTemplatesPersistenceOperationSchema.parse({
        input: {
          serviceTypeId: "sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          }
        }
      }).input.serviceTypeId
    ).toBe("sunday");

    expect(
      ListPlanningSongLibraryPersistenceOperationSchema.parse({
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            key: "G",
            limit: 10,
            query: "open",
            serviceTypeId: "sunday"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_3",
            tenantId: "tenant_1"
          }
        }
      }).input.searchInput.limit
    ).toBe(10);

    expect(() =>
      ListPlanningSongLibraryPersistenceOperationSchema.parse({
        input: {
          searchInput: {
            limit: 100
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_4",
            tenantId: "tenant_1"
          }
        }
      })
    ).toThrow();
  });

  it("validates adapter-free Planning CCLI usage log operation shapes", () => {
    expect(
      RecordPlanningCcliUsagePersistenceOperationSchema.parse({
        input: {
          ccliSongNumber: "123456",
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
      }).input.usageType
    ).toBe("service");

    expect(
      ListPlanningCcliUsageLogsPersistenceOperationSchema.parse({
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
      }).input.reportingStatus
    ).toBe("pending");

    expect(() =>
      RecordPlanningCcliUsagePersistenceOperationSchema.parse({
        input: {
          ccliSongNumber: "secret-token",
          serviceId: "service_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "not-a-date"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_ccli",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).toThrow();
  });

  it("validates adapter-free Planning rehearsal asset visibility operation shapes", () => {
    expect(
      SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse({
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T13:00:00.000Z",
          visibleToRoleIds: ["role_vocal", "role_guitar"]
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_asset",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      }).input.assetType
    ).toBe("chart");

    expect(
      ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse({
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_asset_list",
            tenantId: "tenant_1"
          }
        }
      }).input.serviceItemId
    ).toBe("item_1");

    expect(() =>
      SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse({
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          rawMediaPayload: "no file bytes here",
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T13:00:00.000Z",
          visibleToRoleIds: []
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_asset",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).toThrow();
  });

  it("validates adapter-free Planning rehearsal acknowledgement operation shapes", () => {
    expect(
      RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema.parse({
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assignmentId: "assignment_1",
          assetId: "asset_chart_1",
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
      }).input.readinessSignal
    ).toBe("ready");

    expect(
      ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema.parse({
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
      }).input.assignmentId
    ).toBe("assignment_1");

    expect(() =>
      RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema.parse({
        input: {
          acknowledgedAt: "not-a-date",
          assignmentId: "assignment_1",
          mediaBlob: "no media payloads",
          personId: "person_1",
          readinessSignal: "ready",
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_ack",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).toThrow();
  });

  it("defines an adapter-free Planning persistence repository interface", async () => {
    const repository: PlanningServiceCommandPersistenceRepository = {
      addServiceItem: (operation) =>
        Promise.resolve({
          serviceId: operation.input.serviceId,
          serviceItemId: "item_1",
          sortOrder: 0,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title,
          type: operation.input.type
        }),
      assignVolunteer: (operation) =>
        Promise.resolve({
          assignmentId: "assignment_1",
          personId: operation.input.personId,
          roleId: operation.input.roleId,
          serviceId: operation.input.serviceId,
          status: "pending",
          tenantId: operation.options.context.tenantId
        }),
      createService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceTypeId: operation.input.serviceTypeId,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title
        }),
      duplicateServiceFromTemplate: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceId: "service_from_template",
          startsAt: operation.input.startsAt,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title
        }),
      reorderServiceItems: (operation) =>
        Promise.resolve([
          {
            serviceId: operation.input.serviceId,
            serviceItemId: operation.input.orderedServiceItemIds[0] ?? "item_1",
            sortOrder: 0,
            tenantId: operation.options.context.tenantId,
            title: "Opening Song",
            type: "song"
          }
        ]),
      updateAssignmentStatus: (operation) =>
        Promise.resolve({
          assignmentId: operation.input.assignmentId,
          personId: "person_1",
          roleId: "role_vocal",
          serviceId: operation.input.serviceId,
          status: operation.input.status,
          tenantId: operation.options.context.tenantId
        }),
      updateService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceId: operation.input.serviceId,
          status: operation.input.status ?? serviceRecord.status,
          tenantId: operation.options.context.tenantId
        }),
      updateServiceItem: (operation) =>
        Promise.resolve({
          serviceId: operation.input.serviceId,
          serviceItemId: operation.input.serviceItemId,
          sortOrder: 0,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title ?? "Opening Song",
          type: operation.input.type ?? "song"
        })
    };

    await expect(
      repository.createService({
        input: {
          serviceTypeId: "sunday",
          title: "Sunday Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_1",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual(serviceRecord);

    await expect(
      repository.duplicateServiceFromTemplate({
        input: {
          serviceTemplateId: "template_sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday From Template"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_template",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      ...serviceRecord,
      serviceId: "service_from_template",
      startsAt: "2026-06-21T14:00:00.000Z",
      title: "Sunday From Template"
    });
  });

  it("defines an adapter-free Planning query persistence repository interface", async () => {
    const repository: PlanningServiceQueryPersistenceRepository = {
      getService: (operation) =>
        Promise.resolve({
          ...serviceRecord,
          serviceId: operation.input.serviceId,
          tenantId: operation.options.context.tenantId
        }),
      getServiceReadiness: (operation) =>
        Promise.resolve({
          ...readinessRecord,
          serviceId: operation.input.serviceId,
          tenantId: operation.options.context.tenantId
        }),
      listServiceAssignments: (operation) =>
        Promise.resolve([
          {
            assignmentId: "assignment_1",
            personId: "person_1",
            roleId: "role_vocal",
            serviceId: operation.input.serviceId,
            status: "pending",
            tenantId: operation.options.context.tenantId
          }
        ]),
      listServiceTemplates: (operation) =>
        Promise.resolve([
          {
            ...serviceTemplateRecord,
            serviceTypeId: operation.input.serviceTypeId,
            tenantId: operation.options.context.tenantId
          }
        ]),
      listSongLibrary: (operation) =>
        Promise.resolve([
          {
            ...songLibraryItemRecord,
            title: operation.input.searchInput.query ?? songLibraryItemRecord.title,
            tenantId: operation.options.context.tenantId
          }
        ]),
      listServices: (operation) =>
        Promise.resolve([
          {
            ...serviceRecord,
            status: operation.input.filter?.status ?? serviceRecord.status,
            tenantId: operation.options.context.tenantId
          }
        ])
    };

    await expect(
      repository.listServices({
        input: {
          filter: {
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
      })
    ).resolves.toEqual([
      {
        ...serviceRecord,
        status: "scheduled"
      }
    ]);

    await expect(
      repository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_2",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual(readinessRecord);

    await expect(
      repository.listServiceTemplates({
        input: {
          serviceTypeId: "sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_3",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([serviceTemplateRecord]);

    await expect(
      repository.listSongLibrary({
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            query: "Open The Gates"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_4",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([songLibraryItemRecord]);
  });

  it("defines an adapter-free Planning CCLI usage persistence repository interface", async () => {
    const repository: PlanningCcliUsageLogPersistenceRepository = {
      listCcliUsageLogs: (operation) =>
        Promise.resolve([
          {
            ...ccliUsageLogRecord,
            reportingStatus:
              operation.input.reportingStatus ?? ccliUsageLogRecord.reportingStatus,
            serviceId: operation.input.serviceId,
            tenantId: operation.options.context.tenantId
          }
        ]),
      recordCcliUsage: (operation) =>
        Promise.resolve({
          ...ccliUsageLogRecord,
          ccliSongNumber: operation.input.ccliSongNumber,
          serviceId: operation.input.serviceId,
          serviceItemId: operation.input.serviceItemId,
          songId: operation.input.songId,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title,
          usageType: operation.input.usageType,
          usedAt: operation.input.usedAt
        })
    };

    await expect(
      repository.recordCcliUsage({
        input: {
          ccliSongNumber: "123456",
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
      })
    ).resolves.toEqual(ccliUsageLogRecord);

    await expect(
      repository.listCcliUsageLogs({
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
      })
    ).resolves.toEqual([ccliUsageLogRecord]);
  });

  it("defines an adapter-free Planning rehearsal asset visibility persistence repository interface", async () => {
    const repository: PlanningRehearsalAssetVisibilityPersistenceRepository = {
      listRehearsalAssetVisibility: (operation) =>
        Promise.resolve([
          {
            ...rehearsalAssetVisibilityRecord,
            serviceId: operation.input.serviceId,
            serviceItemId:
              operation.input.serviceItemId ?? rehearsalAssetVisibilityRecord.serviceItemId,
            tenantId: operation.options.context.tenantId
          }
        ]),
      setRehearsalAssetVisibility: (operation) =>
        Promise.resolve({
          ...rehearsalAssetVisibilityRecord,
          assetId: operation.input.assetId,
          assetType: operation.input.assetType,
          isVisible: operation.input.isVisible,
          serviceId: operation.input.serviceId,
          serviceItemId: operation.input.serviceItemId,
          tenantId: operation.options.context.tenantId,
          title: operation.input.title,
          updatedAt: operation.input.updatedAt,
          visibleToRoleIds: operation.input.visibleToRoleIds
        })
    };

    await expect(
      repository.setRehearsalAssetVisibility({
        input: {
          assetId: "asset_chart_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Chart",
          updatedAt: "2026-06-21T13:00:00.000Z",
          visibleToRoleIds: ["role_vocal", "role_guitar"]
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_asset",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).resolves.toEqual(rehearsalAssetVisibilityRecord);

    await expect(
      repository.listRehearsalAssetVisibility({
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_rehearsal_asset_list",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([rehearsalAssetVisibilityRecord]);
  });

  it("defines an adapter-free Planning rehearsal acknowledgement persistence repository interface", async () => {
    const repository: PlanningRehearsalAcknowledgementPersistenceRepository = {
      listRehearsalAcknowledgements: (operation) =>
        Promise.resolve([
          {
            ...rehearsalAcknowledgementRecord,
            assignmentId:
              operation.input.assignmentId ?? rehearsalAcknowledgementRecord.assignmentId,
            personId: operation.input.personId ?? rehearsalAcknowledgementRecord.personId,
            serviceId: operation.input.serviceId,
            serviceItemId:
              operation.input.serviceItemId ?? rehearsalAcknowledgementRecord.serviceItemId,
            tenantId: operation.options.context.tenantId
          }
        ]),
      recordRehearsalAcknowledgement: (operation) =>
        Promise.resolve({
          ...rehearsalAcknowledgementRecord,
          acknowledgedAt: operation.input.acknowledgedAt,
          assignmentId: operation.input.assignmentId,
          assetId: operation.input.assetId,
          notes: operation.input.notes,
          personId: operation.input.personId,
          readinessSignal: operation.input.readinessSignal,
          serviceId: operation.input.serviceId,
          serviceItemId: operation.input.serviceItemId,
          tenantId: operation.options.context.tenantId
        })
    };

    await expect(
      repository.recordRehearsalAcknowledgement({
        input: {
          acknowledgedAt: "2026-06-21T15:00:00.000Z",
          assignmentId: "assignment_1",
          assetId: "asset_chart_1",
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
      })
    ).resolves.toEqual(rehearsalAcknowledgementRecord);

    await expect(
      repository.listRehearsalAcknowledgements({
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
      })
    ).resolves.toEqual([rehearsalAcknowledgementRecord]);
  });
});
