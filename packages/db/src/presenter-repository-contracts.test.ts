import { describe, expect, it } from "vitest";
import {
  AddPresenterSlidePersistenceOperationSchema,
  CleanupPresenterLocalSyncQueueEntriesPersistenceOperationSchema,
  EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema,
  GetPresenterLocalSyncQueueEntryPersistenceOperationSchema,
  ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperationSchema,
  MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema,
  MarkPresenterLocalSyncQueueEntryFailedPersistenceOperationSchema,
  GetPresenterPresentationPersistenceOperationSchema,
  ListPresenterOutputTargetsPersistenceOperationSchema,
  PresenterPersistenceReadOptionsSchema,
  PresenterPersistenceWriteOptionsSchema,
  PresenterLocalSyncQueueEntryPersistenceRecordSchema,
  PresenterLocalSyncQueueEntryMutationResultSchema,
  PresenterLocalSyncQueueStatusTransitionPersistenceSchema,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  ReorderPresenterSlidesPersistenceOperationSchema,
  SavePresenterPresentationPersistenceOperationSchema,
  SavePresenterThemePersistenceOperationSchema,
  SetPresenterOutputTargetPersistenceOperationSchema,
  TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema,
  listPresenterLocalSyncQueueEntriesReadyForReplay,
  type PresenterCommandPersistenceRepository,
  type PresenterLocalSyncQueueEntryPersistenceRecord,
  type PresenterLocalSyncQueuePersistenceRepository,
  type PresenterPresentationPersistenceRecord,
  type PresenterQueryPersistenceRepository
} from "./index.js";

const writeOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_1",
    tenantId: "tenant_1"
  },
  intent: "update" as const
};

const readOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId: "tenant_1"
  }
};

const theme = {
  colors: {
    background: "#101820",
    lowerThirdBackground: "#000000",
    lowerThirdText: "#ffffff",
    text: "#f7f7f2"
  },
  lowerThird: {
    maxLines: 2,
    placement: "bottom-center"
  },
  name: "Sunday Standard",
  spacing: {
    blockGap: 24,
    slidePadding: 72
  },
  tenantId: "tenant_1",
  themeId: "theme_1",
  typography: {
    baseFontSize: 48,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter Display",
    lineHeight: 1.2
  }
} as const;

const slide = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_1",
      kind: "text",
      text: "Welcome",
      textStyle: "heading"
    }
  ],
  layout: "title",
  order: 0,
  presentationId: "presentation_1",
  slideId: "slide_1",
  tenantId: "tenant_1",
  title: "Welcome"
} as const;

const outputTarget = {
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display-main"
} as const;

const presentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    createdAt: "2026-06-21T14:00:00.000Z",
    mediaCues: [],
    presentationId: "presentation_1",
    serviceId: "service_1",
    slides: [slide],
    tenantId: "tenant_1",
    theme,
    title: "Sunday Worship",
    updatedAt: "2026-06-21T14:05:00.000Z"
  });

const queuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord =
  PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
    actorId: "actor_1",
    attemptCount: 0,
    baseRevision: "rev_1",
    createdAt: "2026-06-21T14:06:00.000Z",
    operation: {
      operation: "updatePresentation",
      payload: {
        presentationId: "presentation_1",
        title: "Sunday Worship Updated"
      }
    },
    presentationId: "presentation_1",
    queuedAt: "2026-06-21T14:06:00.000Z",
    queueEntryId: "queue_1",
    requestId: "request_queue_1",
    schemaVersion: "presenter-local-sync-queue.v1",
    status: "queued",
    tenantId: "tenant_1",
    updatedAt: "2026-06-21T14:06:00.000Z"
  });

const replayingTransition = {
  from: "queued",
  to: "replaying",
  transitionedAt: "2026-06-21T14:07:00.000Z"
} as const;

const conflictDetail = {
  conflictKind: "stale-presentation",
  localBaseRevision: "rev_1",
  safeMessage: "The presentation changed on another device.",
  serverRevision: "rev_2"
} as const;

describe("Presenter repository contracts", () => {
  it("requires actor, request, and tenant scope for Presenter persistence operations", () => {
    expect(PresenterPersistenceReadOptionsSchema.parse(readOptions).context.actorId).toBe(
      "actor_1"
    );
    expect(PresenterPersistenceWriteOptionsSchema.parse(writeOptions).intent).toBe(
      "update"
    );

    expect(() =>
      PresenterPersistenceReadOptionsSchema.parse({
        context: {
          requestId: "request_read",
          tenantId: "tenant_1"
        }
      })
    ).toThrow("Presenter persistence read operations require an actor ID.");

    expect(() =>
      PresenterPersistenceWriteOptionsSchema.parse({
        context: {
          requestId: "request_write",
          tenantId: "tenant_1"
        },
        intent: "update"
      })
    ).toThrow("Presenter persistence write operations require an actor ID.");
  });

  it("validates saved presentation aggregates and tenant consistency", () => {
    expect(
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: presentation,
        options: writeOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          slides: [
            {
              ...slide,
              tenantId: "tenant_2"
            }
          ]
        },
        options: writeOptions
      })
    ).toThrow("Presenter slide tenant must match presentation tenant.");

    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          mediaCues: [
            {
              label: "Missing slide cue",
              mediaAssetRef: "asset_1",
              mediaCueId: "cue_1",
              playbackHint: "manual",
              presentationId: "presentation_1",
              slideId: "missing_slide",
              tenantId: "tenant_1"
            }
          ]
        },
        options: writeOptions
      })
    ).toThrow("Presenter media cue must reference an existing slide.");
  });

  it("validates query, theme, output target, and slide mutation operation shapes", () => {
    expect(
      GetPresenterPresentationPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(
      ListPresenterOutputTargetsPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(
      SavePresenterThemePersistenceOperationSchema.parse({
        input: theme,
        options: {
          ...writeOptions,
          intent: "create"
        }
      }).input.themeId
    ).toBe("theme_1");

    expect(
      SetPresenterOutputTargetPersistenceOperationSchema.parse({
        input: {
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      }).input.outputTarget.outputTargetId
    ).toBe("output_1");

    expect(
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: {
            ...slide,
            order: 1,
            slideId: "slide_2",
            title: "Announcements"
          }
        },
        options: writeOptions
      }).input.slide.slideId
    ).toBe("slide_2");

    expect(() =>
      ReorderPresenterSlidesPersistenceOperationSchema.parse({
        input: {
          orderedSlideIds: ["slide_1", "slide_1"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).toThrow("Presenter slide order cannot contain duplicate slide IDs.");
  });

  it("rejects raw media, OBS, vendor credential, and secret-like fields", () => {
    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          rawMediaPayload: "base64"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SetPresenterOutputTargetPersistenceOperationSchema.parse({
        input: {
          obsScene: "main",
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1",
          slide: {
            ...slide,
            bibleApiKey: "secret"
          }
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SavePresenterThemePersistenceOperationSchema.parse({
        input: {
          ...theme,
          vendorToken: "secret"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");
  });

  it("defines adapter-free Presenter persistence repository interfaces", async () => {
    const queryRepository: PresenterQueryPersistenceRepository = {
      getPresentation: (operation) =>
        Promise.resolve(
          operation.input.presentationId === presentation.presentationId ? presentation : null
        ),
      getPresentationForService: (operation) =>
        Promise.resolve(
          operation.input.serviceId === presentation.serviceId ? presentation : null
        ),
      listOutputTargets: () => Promise.resolve([outputTarget]),
      listPresenterThemes: () => Promise.resolve([theme]),
      listPresentations: (operation) =>
        Promise.resolve(
          operation.input.filter?.serviceId === undefined ||
            operation.input.filter.serviceId === presentation.serviceId
            ? [presentation]
            : []
        )
    };
    const commandRepository: PresenterCommandPersistenceRepository = {
      addSlide: (operation) => Promise.resolve(operation.input.slide),
      removeSlide: () => Promise.resolve(presentation),
      reorderSlides: (operation) =>
        Promise.resolve(
          operation.input.orderedSlideIds.map((slideId, order) =>
            PresenterSlidePersistenceRecordSchema.parse({
              ...slide,
              order,
              slideId
            })
          )
        ),
      savePresentation: (operation) => Promise.resolve(operation.input),
      savePresenterTheme: (operation) => Promise.resolve(operation.input),
      setOutputTarget: (operation) => Promise.resolve(operation.input.outputTarget),
      updateSlide: (operation) => Promise.resolve(operation.input.slide)
    };

    await expect(
      queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual(presentation);

    await expect(
      commandRepository.savePresentation({
        input: presentation,
        options: {
          ...writeOptions,
          intent: "update"
        }
      })
    ).resolves.toEqual(presentation);
  });

  it("validates Presenter local sync queue entry storage contracts", () => {
    expect(
      EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema.parse({
        input: {
          entry: queuedEntry
        },
        options: writeOptions
      }).input.entry.requestId
    ).toBe("request_queue_1");

    expect(() =>
      EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema.parse({
        input: {
          entry: {
            ...queuedEntry,
            status: "replaying"
          }
        },
        options: writeOptions
      })
    ).toThrow("Presenter local sync enqueue requires queued status.");

    expect(() =>
      PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...queuedEntry,
        operation: {
          operation: "reorderSlides",
          payload: {
            orderedSlideIds: ["slide_1", "slide_1"],
            presentationId: "presentation_1"
          }
        }
      })
    ).toThrow("Presenter local sync queued slide order cannot contain duplicate slide IDs.");

    expect(() =>
      PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...queuedEntry,
        operation: {
          operation: "updateSlide",
          payload: {
            presentationId: "presentation_1",
            slide: {
              ...slide,
              tenantId: "tenant_2"
            }
          }
        }
      })
    ).toThrow("Presenter local sync queued slide tenant must match entry tenant.");

    expect(() =>
      PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
        ...queuedEntry,
        vendorToken: "secret"
      })
    ).toThrow("Unrecognized key");
  });

  it("validates queue transitions, conflict details, failures, and cleanup operations", () => {
    expect(
      TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse({
        input: {
          queueEntryId: "queue_1",
          transition: replayingTransition
        },
        options: writeOptions
      }).input.transition.to
    ).toBe("replaying");

    expect(() =>
      PresenterLocalSyncQueueStatusTransitionPersistenceSchema.parse({
        from: "synced",
        to: "queued",
        transitionedAt: "2026-06-21T14:08:00.000Z"
      })
    ).toThrow("Presenter local sync queue status transition is not allowed.");

    expect(
      MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema.parse({
        input: {
          conflict: conflictDetail,
          queueEntryId: "queue_1",
          transition: {
            from: "replaying",
            to: "conflict",
            transitionedAt: "2026-06-21T14:08:00.000Z"
          }
        },
        options: writeOptions
      }).input.conflict.serverRevision
    ).toBe("rev_2");

    expect(() =>
      MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema.parse({
        input: {
          conflict: conflictDetail,
          queueEntryId: "queue_1",
          transition: {
            from: "replaying",
            to: "failed",
            transitionedAt: "2026-06-21T14:08:00.000Z"
          }
        },
        options: writeOptions
      })
    ).toThrow("Presenter local sync conflict updates must transition to conflict.");

    expect(
      MarkPresenterLocalSyncQueueEntryFailedPersistenceOperationSchema.parse({
        input: {
          queueEntryId: "queue_1",
          safeErrorMessage: "Could not sync this edit yet.",
          transition: {
            from: "replaying",
            to: "failed",
            transitionedAt: "2026-06-21T14:09:00.000Z"
          }
        },
        options: writeOptions
      }).input.safeErrorMessage
    ).toBe("Could not sync this edit yet.");

    expect(
      CleanupPresenterLocalSyncQueueEntriesPersistenceOperationSchema.parse({
        input: {
          olderThan: "2026-06-22T14:00:00.000Z"
        },
        options: {
          ...writeOptions,
          intent: "delete"
        }
      }).input.olderThan
    ).toBe("2026-06-22T14:00:00.000Z");
  });

  it("sorts ready queue entries and blocks later replay behind conflicts or failures", () => {
    const laterQueuedEntry = PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
      ...queuedEntry,
      operation: {
        operation: "applyPresenterTheme",
        payload: {
          presentationId: "presentation_1",
          themeId: "theme_1"
        }
      },
      queuedAt: "2026-06-21T14:09:00.000Z",
      queueEntryId: "queue_3",
      requestId: "request_queue_3",
      updatedAt: "2026-06-21T14:09:00.000Z"
    });
    const conflictedEntry = PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
      ...queuedEntry,
      conflict: conflictDetail,
      queuedAt: "2026-06-21T14:08:00.000Z",
      queueEntryId: "queue_2",
      requestId: "request_queue_2",
      status: "conflict",
      updatedAt: "2026-06-21T14:08:00.000Z"
    });
    const otherPresentationEntry = PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
      ...queuedEntry,
      operation: {
        operation: "updatePresentation",
        payload: {
          presentationId: "presentation_2",
          title: "Evening Worship"
        }
      },
      presentationId: "presentation_2",
      queuedAt: "2026-06-21T14:07:00.000Z",
      queueEntryId: "queue_4",
      requestId: "request_queue_4",
      updatedAt: "2026-06-21T14:07:00.000Z"
    });

    expect(
      listPresenterLocalSyncQueueEntriesReadyForReplay([
        laterQueuedEntry,
        otherPresentationEntry,
        conflictedEntry,
        queuedEntry
      ]).map((entry) => entry.queueEntryId)
    ).toEqual(["queue_1", "queue_4"]);

    expect(
      listPresenterLocalSyncQueueEntriesReadyForReplay(
        [laterQueuedEntry, otherPresentationEntry, conflictedEntry, queuedEntry],
        { presentationId: "presentation_1" }
      ).map((entry) => entry.queueEntryId)
    ).toEqual(["queue_1"]);
  });

  it("defines adapter-free Presenter local sync queue repository interfaces", async () => {
    const localQueueRepository: PresenterLocalSyncQueuePersistenceRepository = {
      cancel: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              status: operation.input.transition.to,
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        ),
      cleanupSyncedAndCancelled: () => Promise.resolve({ removedCount: 0 }),
      countByStatus: () =>
        Promise.resolve({
          cancelled: 0,
          conflict: 0,
          failed: 0,
          queued: 0,
          replaying: 0,
          synced: 0
        }),
      enqueue: (operation) => Promise.resolve({ entry: operation.input.entry }),
      getById: (operation) =>
        Promise.resolve(
          operation.input.queueEntryId === queuedEntry.queueEntryId ? queuedEntry : null
        ),
      listReadyForReplay: (operation) =>
        Promise.resolve(
          listPresenterLocalSyncQueueEntriesReadyForReplay([queuedEntry], operation.input)
        ),
      markConflict: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              conflict: operation.input.conflict,
              status: "conflict",
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        ),
      markFailed: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              attemptCount: 1,
              lastAttemptedAt: operation.input.transition.transitionedAt,
              safeErrorMessage: operation.input.safeErrorMessage,
              status: "failed",
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        ),
      markReplaying: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              attemptCount: queuedEntry.attemptCount + 1,
              lastAttemptedAt: operation.input.transition.transitionedAt,
              status: "replaying",
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        ),
      markSynced: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              attemptCount: 1,
              lastAttemptedAt: "2026-06-21T14:07:00.000Z",
              status: "synced",
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        ),
      requeue: (operation) =>
        Promise.resolve(
          PresenterLocalSyncQueueEntryMutationResultSchema.parse({
            entry: {
              ...queuedEntry,
              attemptCount: 1,
              lastAttemptedAt: "2026-06-21T14:07:00.000Z",
              status: "queued",
              updatedAt: operation.input.transition.transitionedAt
            }
          })
        )
    };

    await expect(
      localQueueRepository.getById(
        GetPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse({
          input: {
            queueEntryId: "queue_1"
          },
          options: readOptions
        })
      )
    ).resolves.toMatchObject({
      queueEntryId: "queue_1",
      requestId: "request_queue_1"
    });

    await expect(
      localQueueRepository.markReplaying({
        input: {
          queueEntryId: "queue_1",
          transition: replayingTransition
        },
        options: writeOptions
      })
    ).resolves.toMatchObject({
      entry: {
        attemptCount: 1,
        baseRevision: "rev_1",
        requestId: "request_queue_1",
        status: "replaying"
      }
    });

    await expect(
      localQueueRepository.listReadyForReplay(
        ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperationSchema.parse({
          input: {},
          options: readOptions
        })
      )
    ).resolves.toEqual([queuedEntry]);
  });
});
