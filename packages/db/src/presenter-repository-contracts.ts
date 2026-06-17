import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema
} from "./repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime();
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const PresenterPersistenceReadOptionsSchema = RepositoryReadOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter persistence read operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const PresenterPersistenceWriteOptionsSchema =
  RepositoryWriteOptionsSchema.superRefine((options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter persistence write operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  });

export const PresenterScriptureVersePersistenceRecordSchema = z
  .object({
    chapter: z.number().int().positive(),
    text: NonEmptyStringSchema,
    verseEnd: z.number().int().positive().optional(),
    verseStart: z.number().int().positive()
  })
  .strict()
  .superRefine((verse, context) => {
    if (verse.verseEnd !== undefined && verse.verseEnd < verse.verseStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verse end must be greater than or equal to verse start.",
        path: ["verseEnd"]
      });
    }
  });

export const PresenterScripturePassagePersistenceRecordSchema = z
  .object({
    displayGrouping: z.enum(["continuous", "by-verse", "by-paragraph"]),
    passageId: NonEmptyStringSchema,
    referenceText: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    translationRef: NonEmptyStringSchema,
    verses: z.array(PresenterScriptureVersePersistenceRecordSchema).min(1)
  })
  .strict();

const PresenterSlideBlockBasePersistenceRecordSchema = z
  .object({
    blockId: NonEmptyStringSchema
  })
  .strict();

export const PresenterTextSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    alignment: z.enum(["left", "center", "right"]).default("center"),
    kind: z.literal("text"),
    text: NonEmptyStringSchema,
    textStyle: z.enum(["heading", "body", "caption"]).default("body")
  }).strict();

export const PresenterScriptureSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    displayStyle: z.enum(["reference-and-text", "text-only", "reference-only"]),
    kind: z.literal("scripture"),
    passage: PresenterScripturePassagePersistenceRecordSchema
  }).strict();

export const PresenterLyricSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    ccliSongNumber: OptionalNonEmptyStringSchema,
    kind: z.literal("lyric"),
    songRefId: OptionalNonEmptyStringSchema,
    text: NonEmptyStringSchema
  }).strict();

export const PresenterImageSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    altText: NonEmptyStringSchema,
    fit: z.enum(["contain", "cover"]).default("cover"),
    kind: z.literal("image"),
    mediaAssetRef: NonEmptyStringSchema
  }).strict();

export const PresenterVideoSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    kind: z.literal("video"),
    mediaAssetRef: NonEmptyStringSchema,
    playback: z.enum(["manual", "auto-muted"]).default("manual"),
    posterAssetRef: OptionalNonEmptyStringSchema
  }).strict();

export const PresenterLowerThirdSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockBasePersistenceRecordSchema.extend({
    kind: z.literal("lower-third"),
    primaryText: NonEmptyStringSchema,
    secondaryText: OptionalNonEmptyStringSchema
  }).strict();

export const PresenterSlideBlockPersistenceRecordSchema = z.discriminatedUnion("kind", [
  PresenterTextSlideBlockPersistenceRecordSchema,
  PresenterScriptureSlideBlockPersistenceRecordSchema,
  PresenterLyricSlideBlockPersistenceRecordSchema,
  PresenterImageSlideBlockPersistenceRecordSchema,
  PresenterVideoSlideBlockPersistenceRecordSchema,
  PresenterLowerThirdSlideBlockPersistenceRecordSchema
]);

export const PresenterSlidePersistenceRecordSchema = z
  .object({
    backgroundRef: OptionalNonEmptyStringSchema,
    blocks: z.array(PresenterSlideBlockPersistenceRecordSchema).min(1),
    layout: z.enum(["title", "content", "scripture", "lyrics", "media", "lower-third"]),
    notes: OptionalNonEmptyStringSchema,
    order: NonNegativeIntegerSchema,
    presentationId: NonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema,
    slideId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    timingHintSeconds: z.number().int().positive().optional(),
    title: OptionalNonEmptyStringSchema
  })
  .strict();

export const PresenterMediaCuePersistenceRecordSchema = z
  .object({
    label: NonEmptyStringSchema,
    mediaAssetRef: NonEmptyStringSchema,
    mediaCueId: NonEmptyStringSchema,
    playbackHint: z.enum(["manual", "auto-start", "loop", "hold-last-frame"]),
    presentationId: NonEmptyStringSchema,
    slideId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export const PresenterOutputTargetPersistenceRecordSchema = z
  .object({
    confidenceOutputEnabled: z.boolean().default(false),
    displayName: NonEmptyStringSchema,
    outputTargetId: NonEmptyStringSchema,
    safeBlanked: z.boolean().default(true),
    targetKind: z.enum(["main", "confidence", "stage-display"]),
    tenantId: NonEmptyStringSchema,
    windowRef: NonEmptyStringSchema
  })
  .strict();

export const PresenterThemePersistenceRecordSchema = z
  .object({
    colors: z
      .object({
        background: HexColorSchema,
        lowerThirdBackground: HexColorSchema,
        lowerThirdText: HexColorSchema,
        text: HexColorSchema
      })
      .strict(),
    lowerThird: z
      .object({
        maxLines: z.number().int().positive().max(3),
        placement: z.enum(["bottom-left", "bottom-center", "bottom-right"])
      })
      .strict(),
    name: NonEmptyStringSchema,
    spacing: z
      .object({
        blockGap: z.number().int().nonnegative(),
        slidePadding: z.number().int().nonnegative()
      })
      .strict(),
    tenantId: NonEmptyStringSchema,
    themeId: NonEmptyStringSchema,
    typography: z
      .object({
        baseFontSize: z.number().int().positive(),
        bodyFontFamily: NonEmptyStringSchema,
        headingFontFamily: NonEmptyStringSchema,
        lineHeight: z.number().positive()
      })
      .strict()
  })
  .strict();

export const PresenterPresentationPersistenceRecordSchema = z
  .object({
    createdAt: IsoDateTimeStringSchema,
    mediaCues: z.array(PresenterMediaCuePersistenceRecordSchema).default([]),
    presentationId: NonEmptyStringSchema,
    serviceId: OptionalNonEmptyStringSchema,
    slides: z.array(PresenterSlidePersistenceRecordSchema).min(1),
    tenantId: NonEmptyStringSchema,
    theme: PresenterThemePersistenceRecordSchema,
    title: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((presentation, context) => {
    const slideIds = new Set<string>();

    presentation.slides.forEach((slide, index) => {
      if (slide.tenantId !== presentation.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter slide tenant must match presentation tenant.",
          path: ["slides", index, "tenantId"]
        });
      }

      if (slide.presentationId !== presentation.presentationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter slide presentation must match parent presentation.",
          path: ["slides", index, "presentationId"]
        });
      }

      if (slideIds.has(slide.slideId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter slide IDs must be unique within a presentation.",
          path: ["slides", index, "slideId"]
        });
      }

      slideIds.add(slide.slideId);
    });

    if (presentation.theme.tenantId !== presentation.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter theme tenant must match presentation tenant.",
        path: ["theme", "tenantId"]
      });
    }

    presentation.mediaCues.forEach((cue, index) => {
      if (cue.tenantId !== presentation.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter media cue tenant must match presentation tenant.",
          path: ["mediaCues", index, "tenantId"]
        });
      }

      if (cue.presentationId !== presentation.presentationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter media cue presentation must match parent presentation.",
          path: ["mediaCues", index, "presentationId"]
        });
      }

      if (!slideIds.has(cue.slideId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Presenter media cue must reference an existing slide.",
          path: ["mediaCues", index, "slideId"]
        });
      }
    });
  });

export const PresenterPresentationsPersistenceFilterInputSchema = z
  .object({
    serviceId: OptionalNonEmptyStringSchema
  })
  .strict();

export const ListPresenterPresentationsPersistenceInputSchema = z
  .object({
    filter: PresenterPresentationsPersistenceFilterInputSchema.optional()
  })
  .strict();

export const GetPresenterPresentationPersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema
  })
  .strict();

export const GetPresenterPresentationForServicePersistenceInputSchema = z
  .object({
    serviceId: NonEmptyStringSchema
  })
  .strict();

export const ListPresenterThemesPersistenceInputSchema = z
  .object({
    filter: z
      .object({
        query: OptionalNonEmptyStringSchema
      })
      .strict()
      .optional()
  })
  .strict();

export const ListPresenterOutputTargetsPersistenceInputSchema = z
  .object({
    presentationId: OptionalNonEmptyStringSchema
  })
  .strict();

export const SavePresenterPresentationPersistenceInputSchema =
  PresenterPresentationPersistenceRecordSchema;

export const SavePresenterThemePersistenceInputSchema =
  PresenterThemePersistenceRecordSchema;

export const SetPresenterOutputTargetPersistenceInputSchema = z
  .object({
    outputTarget: PresenterOutputTargetPersistenceRecordSchema,
    presentationId: NonEmptyStringSchema
  })
  .strict();

export const AddPresenterSlidePersistenceInputSchema = z
  .object({
    afterSlideId: OptionalNonEmptyStringSchema,
    presentationId: NonEmptyStringSchema,
    slide: PresenterSlidePersistenceRecordSchema
  })
  .strict();

export const UpdatePresenterSlidePersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    slide: PresenterSlidePersistenceRecordSchema
  })
  .strict();

export const ReorderPresenterSlidesPersistenceInputSchema = z
  .object({
    orderedSlideIds: z.array(NonEmptyStringSchema).min(1),
    presentationId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.orderedSlideIds).size !== input.orderedSlideIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter slide order cannot contain duplicate slide IDs.",
        path: ["orderedSlideIds"]
      });
    }
  });

export const RemovePresenterSlidePersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    slideId: NonEmptyStringSchema
  })
  .strict();

export const PresenterLocalSyncQueueStorageSchemaVersionSchema = z.literal(
  "presenter-local-sync-queue.v1"
);

export const PresenterLocalSyncQueuedUpdatePresentationOperationPersistenceSchema = z
  .object({
    operation: z.literal("updatePresentation"),
    payload: z
      .object({
        presentationId: NonEmptyStringSchema,
        serviceId: OptionalNonEmptyStringSchema,
        title: OptionalNonEmptyStringSchema
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedAddSlideOperationPersistenceSchema = z
  .object({
    operation: z.literal("addSlide"),
    payload: z
      .object({
        afterSlideId: OptionalNonEmptyStringSchema,
        presentationId: NonEmptyStringSchema,
        slide: PresenterSlidePersistenceRecordSchema.omit({
          order: true,
          presentationId: true,
          slideId: true,
          tenantId: true
        }).strict()
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedUpdateSlideOperationPersistenceSchema = z
  .object({
    operation: z.literal("updateSlide"),
    payload: z
      .object({
        presentationId: NonEmptyStringSchema,
        slide: PresenterSlidePersistenceRecordSchema
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedReorderSlidesOperationPersistenceSchema = z
  .object({
    operation: z.literal("reorderSlides"),
    payload: z
      .object({
        orderedSlideIds: z.array(NonEmptyStringSchema).min(1),
        presentationId: NonEmptyStringSchema
      })
      .strict()
      .superRefine((payload, context) => {
        if (new Set(payload.orderedSlideIds).size !== payload.orderedSlideIds.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Presenter local sync queued slide order cannot contain duplicate slide IDs.",
            path: ["orderedSlideIds"]
          });
        }
      })
  })
  .strict();

export const PresenterLocalSyncQueuedApplyThemeOperationPersistenceSchema = z
  .object({
    operation: z.literal("applyPresenterTheme"),
    payload: z
      .object({
        presentationId: NonEmptyStringSchema,
        themeId: NonEmptyStringSchema
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedSetOutputTargetOperationPersistenceSchema = z
  .object({
    operation: z.literal("setOutputTarget"),
    payload: z
      .object({
        outputTarget: PresenterOutputTargetPersistenceRecordSchema,
        presentationId: NonEmptyStringSchema
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedOperationPersistenceSchema = z.discriminatedUnion(
  "operation",
  [
    PresenterLocalSyncQueuedUpdatePresentationOperationPersistenceSchema,
    PresenterLocalSyncQueuedAddSlideOperationPersistenceSchema,
    PresenterLocalSyncQueuedUpdateSlideOperationPersistenceSchema,
    PresenterLocalSyncQueuedReorderSlidesOperationPersistenceSchema,
    PresenterLocalSyncQueuedApplyThemeOperationPersistenceSchema,
    PresenterLocalSyncQueuedSetOutputTargetOperationPersistenceSchema
  ]
);

export const PresenterLocalSyncQueueStatusPersistenceSchema = z.enum([
  "queued",
  "replaying",
  "synced",
  "conflict",
  "failed",
  "cancelled"
]);

export const PresenterLocalSyncConflictDetailPersistenceSchema = z
  .object({
    conflictKind: z.enum([
      "stale-presentation",
      "missing-slide",
      "theme-mismatch",
      "output-target-mismatch",
      "validation-failed",
      "authorization-failed"
    ]),
    localBaseRevision: NonEmptyStringSchema,
    safeMessage: NonEmptyStringSchema,
    serverRevision: NonEmptyStringSchema
  })
  .strict();

export const PresenterLocalSyncQueueEntryPersistenceRecordSchema = z
  .object({
    actorId: NonEmptyStringSchema,
    attemptCount: NonNegativeIntegerSchema,
    baseRevision: NonEmptyStringSchema,
    conflict: PresenterLocalSyncConflictDetailPersistenceSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    lastAttemptedAt: IsoDateTimeStringSchema.optional(),
    operation: PresenterLocalSyncQueuedOperationPersistenceSchema,
    presentationId: NonEmptyStringSchema,
    queuedAt: IsoDateTimeStringSchema,
    queueEntryId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    safeErrorMessage: OptionalNonEmptyStringSchema,
    schemaVersion: PresenterLocalSyncQueueStorageSchemaVersionSchema,
    status: PresenterLocalSyncQueueStatusPersistenceSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.operation.payload.presentationId !== entry.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queued operation presentation must match entry presentation.",
        path: ["operation", "payload", "presentationId"]
      });
    }

    if (
      entry.operation.operation === "updateSlide" &&
      entry.operation.payload.slide.presentationId !== entry.presentationId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queued slide update must target the entry presentation.",
        path: ["operation", "payload", "slide", "presentationId"]
      });
    }

    if (
      entry.operation.operation === "updateSlide" &&
      entry.operation.payload.slide.tenantId !== entry.tenantId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queued slide tenant must match entry tenant.",
        path: ["operation", "payload", "slide", "tenantId"]
      });
    }

    if (
      entry.operation.operation === "setOutputTarget" &&
      entry.operation.payload.outputTarget.tenantId !== entry.tenantId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queued output target tenant must match entry tenant.",
        path: ["operation", "payload", "outputTarget", "tenantId"]
      });
    }

    if (entry.status === "conflict" && entry.conflict === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync conflicted entries require conflict details.",
        path: ["conflict"]
      });
    }

    if (entry.status !== "conflict" && entry.conflict !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync conflict details are allowed only on conflicted entries.",
        path: ["conflict"]
      });
    }

    if (entry.status === "failed" && entry.safeErrorMessage === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync failed entries require a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.status !== "failed" && entry.safeErrorMessage !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync safe error messages are allowed only on failed entries.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.lastAttemptedAt !== undefined && entry.attemptCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync attempted entries must record an attempt count.",
        path: ["attemptCount"]
      });
    }
  });

export const PresenterLocalSyncQueueStatusTransitionPersistenceSchema = z
  .object({
    from: PresenterLocalSyncQueueStatusPersistenceSchema,
    safeReason: OptionalNonEmptyStringSchema,
    to: PresenterLocalSyncQueueStatusPersistenceSchema,
    transitionedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((transition, context) => {
    if (
      !isPresenterLocalSyncQueueStatusTransitionPersistenceAllowed(
        transition.from,
        transition.to
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queue status transition is not allowed.",
        path: ["to"]
      });
    }
  });

const presenterLocalSyncQueueAllowedTransitions: ReadonlyMap<
  z.infer<typeof PresenterLocalSyncQueueStatusPersistenceSchema>,
  readonly z.infer<typeof PresenterLocalSyncQueueStatusPersistenceSchema>[]
> = new Map([
  ["queued", ["replaying", "conflict", "failed", "cancelled"]],
  ["replaying", ["queued", "synced", "conflict", "failed"]],
  ["conflict", ["queued", "cancelled"]],
  ["failed", ["queued", "cancelled"]],
  ["synced", []],
  ["cancelled", []]
]);

const isPresenterLocalSyncQueueStatusTransitionPersistenceAllowed = (
  from: z.infer<typeof PresenterLocalSyncQueueStatusPersistenceSchema>,
  to: z.infer<typeof PresenterLocalSyncQueueStatusPersistenceSchema>
): boolean => presenterLocalSyncQueueAllowedTransitions.get(from)?.includes(to) ?? false;

export const PresenterLocalSyncQueueEntryMutationResultSchema = z
  .object({
    entry: PresenterLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict();

export const EnqueuePresenterLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    entry: PresenterLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.entry.status !== "queued") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync enqueue requires queued status.",
        path: ["entry", "status"]
      });
    }
  });

export const GetPresenterLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema
  })
  .strict();

export const ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInputSchema = z
  .object({
    presentationId: OptionalNonEmptyStringSchema
  })
  .strict();

export const TransitionPresenterLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: PresenterLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict();

export const MarkPresenterLocalSyncQueueEntryConflictPersistenceInputSchema = z
  .object({
    conflict: PresenterLocalSyncConflictDetailPersistenceSchema,
    queueEntryId: NonEmptyStringSchema,
    transition: PresenterLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "conflict") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync conflict updates must transition to conflict.",
        path: ["transition", "to"]
      });
    }
  });

export const MarkPresenterLocalSyncQueueEntryFailedPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    safeErrorMessage: NonEmptyStringSchema,
    transition: PresenterLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync failure updates must transition to failed.",
        path: ["transition", "to"]
      });
    }
  });

export const CleanupPresenterLocalSyncQueueEntriesPersistenceInputSchema = z
  .object({
    olderThan: IsoDateTimeStringSchema
  })
  .strict();

export const CleanupPresenterLocalSyncQueueEntriesPersistenceResultSchema = z
  .object({
    removedCount: NonNegativeIntegerSchema
  })
  .strict();

export const ListPresenterPresentationsPersistenceOperationSchema = z
  .object({
    input: ListPresenterPresentationsPersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const GetPresenterPresentationPersistenceOperationSchema = z
  .object({
    input: GetPresenterPresentationPersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const GetPresenterPresentationForServicePersistenceOperationSchema = z
  .object({
    input: GetPresenterPresentationForServicePersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const ListPresenterThemesPersistenceOperationSchema = z
  .object({
    input: ListPresenterThemesPersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const ListPresenterOutputTargetsPersistenceOperationSchema = z
  .object({
    input: ListPresenterOutputTargetsPersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const SavePresenterPresentationPersistenceOperationSchema = z
  .object({
    input: SavePresenterPresentationPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const SavePresenterThemePersistenceOperationSchema = z
  .object({
    input: SavePresenterThemePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const SetPresenterOutputTargetPersistenceOperationSchema = z
  .object({
    input: SetPresenterOutputTargetPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const AddPresenterSlidePersistenceOperationSchema = z
  .object({
    input: AddPresenterSlidePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const UpdatePresenterSlidePersistenceOperationSchema = z
  .object({
    input: UpdatePresenterSlidePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const ReorderPresenterSlidesPersistenceOperationSchema = z
  .object({
    input: ReorderPresenterSlidesPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const RemovePresenterSlidePersistenceOperationSchema = z
  .object({
    input: RemovePresenterSlidePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: EnqueuePresenterLocalSyncQueueEntryPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const GetPresenterLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: GetPresenterLocalSyncQueueEntryPersistenceInputSchema,
    options: PresenterPersistenceReadOptionsSchema
  })
  .strict();

export const ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperationSchema =
  z
    .object({
      input: ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInputSchema,
      options: PresenterPersistenceReadOptionsSchema
    })
    .strict();

export const TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: TransitionPresenterLocalSyncQueueEntryPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema = z
  .object({
    input: MarkPresenterLocalSyncQueueEntryConflictPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkPresenterLocalSyncQueueEntryFailedPersistenceOperationSchema = z
  .object({
    input: MarkPresenterLocalSyncQueueEntryFailedPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export const CleanupPresenterLocalSyncQueueEntriesPersistenceOperationSchema = z
  .object({
    input: CleanupPresenterLocalSyncQueueEntriesPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .strict();

export type PresenterPersistenceReadOptions = z.infer<
  typeof PresenterPersistenceReadOptionsSchema
>;
export type PresenterPersistenceWriteOptions = z.infer<
  typeof PresenterPersistenceWriteOptionsSchema
>;
export type PresenterSlidePersistenceRecord = z.infer<
  typeof PresenterSlidePersistenceRecordSchema
>;
export type PresenterOutputTargetPersistenceRecord = z.infer<
  typeof PresenterOutputTargetPersistenceRecordSchema
>;
export type PresenterThemePersistenceRecord = z.infer<
  typeof PresenterThemePersistenceRecordSchema
>;
export type PresenterPresentationPersistenceRecord = z.infer<
  typeof PresenterPresentationPersistenceRecordSchema
>;
export type ListPresenterPresentationsPersistenceInput = z.infer<
  typeof ListPresenterPresentationsPersistenceInputSchema
>;
export type GetPresenterPresentationPersistenceInput = z.infer<
  typeof GetPresenterPresentationPersistenceInputSchema
>;
export type GetPresenterPresentationForServicePersistenceInput = z.infer<
  typeof GetPresenterPresentationForServicePersistenceInputSchema
>;
export type ListPresenterThemesPersistenceInput = z.infer<
  typeof ListPresenterThemesPersistenceInputSchema
>;
export type ListPresenterOutputTargetsPersistenceInput = z.infer<
  typeof ListPresenterOutputTargetsPersistenceInputSchema
>;
export type SavePresenterPresentationPersistenceInput = z.infer<
  typeof SavePresenterPresentationPersistenceInputSchema
>;
export type SavePresenterThemePersistenceInput = z.infer<
  typeof SavePresenterThemePersistenceInputSchema
>;
export type SetPresenterOutputTargetPersistenceInput = z.infer<
  typeof SetPresenterOutputTargetPersistenceInputSchema
>;
export type AddPresenterSlidePersistenceInput = z.infer<
  typeof AddPresenterSlidePersistenceInputSchema
>;
export type UpdatePresenterSlidePersistenceInput = z.infer<
  typeof UpdatePresenterSlidePersistenceInputSchema
>;
export type ReorderPresenterSlidesPersistenceInput = z.infer<
  typeof ReorderPresenterSlidesPersistenceInputSchema
>;
export type RemovePresenterSlidePersistenceInput = z.infer<
  typeof RemovePresenterSlidePersistenceInputSchema
>;
export type PresenterLocalSyncQueuedOperationPersistence = z.infer<
  typeof PresenterLocalSyncQueuedOperationPersistenceSchema
>;
export type PresenterLocalSyncQueueStatusPersistence = z.infer<
  typeof PresenterLocalSyncQueueStatusPersistenceSchema
>;
export type PresenterLocalSyncConflictDetailPersistence = z.infer<
  typeof PresenterLocalSyncConflictDetailPersistenceSchema
>;
export type PresenterLocalSyncQueueEntryPersistenceRecord = z.infer<
  typeof PresenterLocalSyncQueueEntryPersistenceRecordSchema
>;
export type PresenterLocalSyncQueueStatusTransitionPersistence = z.infer<
  typeof PresenterLocalSyncQueueStatusTransitionPersistenceSchema
>;
export type PresenterLocalSyncQueueEntryMutationResult = z.infer<
  typeof PresenterLocalSyncQueueEntryMutationResultSchema
>;
export type EnqueuePresenterLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof EnqueuePresenterLocalSyncQueueEntryPersistenceInputSchema
>;
export type GetPresenterLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof GetPresenterLocalSyncQueueEntryPersistenceInputSchema
>;
export type ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInput = z.infer<
  typeof ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInputSchema
>;
export type TransitionPresenterLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof TransitionPresenterLocalSyncQueueEntryPersistenceInputSchema
>;
export type MarkPresenterLocalSyncQueueEntryConflictPersistenceInput = z.infer<
  typeof MarkPresenterLocalSyncQueueEntryConflictPersistenceInputSchema
>;
export type MarkPresenterLocalSyncQueueEntryFailedPersistenceInput = z.infer<
  typeof MarkPresenterLocalSyncQueueEntryFailedPersistenceInputSchema
>;
export type CleanupPresenterLocalSyncQueueEntriesPersistenceInput = z.infer<
  typeof CleanupPresenterLocalSyncQueueEntriesPersistenceInputSchema
>;
export type CleanupPresenterLocalSyncQueueEntriesPersistenceResult = z.infer<
  typeof CleanupPresenterLocalSyncQueueEntriesPersistenceResultSchema
>;

export interface PresenterPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PresenterPersistenceWriteOptions;
}

export interface PresenterReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PresenterPersistenceReadOptions;
}

export type ListPresenterPresentationsPersistenceOperation =
  PresenterReadPersistenceOperation<ListPresenterPresentationsPersistenceInput>;
export type GetPresenterPresentationPersistenceOperation =
  PresenterReadPersistenceOperation<GetPresenterPresentationPersistenceInput>;
export type GetPresenterPresentationForServicePersistenceOperation =
  PresenterReadPersistenceOperation<GetPresenterPresentationForServicePersistenceInput>;
export type ListPresenterThemesPersistenceOperation =
  PresenterReadPersistenceOperation<ListPresenterThemesPersistenceInput>;
export type ListPresenterOutputTargetsPersistenceOperation =
  PresenterReadPersistenceOperation<ListPresenterOutputTargetsPersistenceInput>;
export type SavePresenterPresentationPersistenceOperation =
  PresenterPersistenceOperation<SavePresenterPresentationPersistenceInput>;
export type SavePresenterThemePersistenceOperation =
  PresenterPersistenceOperation<SavePresenterThemePersistenceInput>;
export type SetPresenterOutputTargetPersistenceOperation =
  PresenterPersistenceOperation<SetPresenterOutputTargetPersistenceInput>;
export type AddPresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<AddPresenterSlidePersistenceInput>;
export type UpdatePresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<UpdatePresenterSlidePersistenceInput>;
export type ReorderPresenterSlidesPersistenceOperation =
  PresenterPersistenceOperation<ReorderPresenterSlidesPersistenceInput>;
export type RemovePresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<RemovePresenterSlidePersistenceInput>;
export type EnqueuePresenterLocalSyncQueueEntryPersistenceOperation =
  PresenterPersistenceOperation<EnqueuePresenterLocalSyncQueueEntryPersistenceInput>;
export type GetPresenterLocalSyncQueueEntryPersistenceOperation =
  PresenterReadPersistenceOperation<GetPresenterLocalSyncQueueEntryPersistenceInput>;
export type ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperation =
  PresenterReadPersistenceOperation<ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInput>;
export type TransitionPresenterLocalSyncQueueEntryPersistenceOperation =
  PresenterPersistenceOperation<TransitionPresenterLocalSyncQueueEntryPersistenceInput>;
export type MarkPresenterLocalSyncQueueEntryConflictPersistenceOperation =
  PresenterPersistenceOperation<MarkPresenterLocalSyncQueueEntryConflictPersistenceInput>;
export type MarkPresenterLocalSyncQueueEntryFailedPersistenceOperation =
  PresenterPersistenceOperation<MarkPresenterLocalSyncQueueEntryFailedPersistenceInput>;
export type CleanupPresenterLocalSyncQueueEntriesPersistenceOperation =
  PresenterPersistenceOperation<CleanupPresenterLocalSyncQueueEntriesPersistenceInput>;

export const listPresenterLocalSyncQueueEntriesReadyForReplay = (
  rawEntries: readonly unknown[],
  input: ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceInput = {}
): readonly PresenterLocalSyncQueueEntryPersistenceRecord[] => {
  const parsedEntries = z
    .array(PresenterLocalSyncQueueEntryPersistenceRecordSchema)
    .parse(rawEntries)
    .filter((entry) => input.presentationId === undefined || entry.presentationId === input.presentationId)
    .sort(comparePresenterLocalSyncQueueEntriesForReplay);
  const blockedPresentationKeys = new Set<string>();
  const readyEntries: PresenterLocalSyncQueueEntryPersistenceRecord[] = [];

  parsedEntries.forEach((entry) => {
    const presentationKey = `${entry.tenantId}:${entry.presentationId}`;

    if (blockedPresentationKeys.has(presentationKey)) {
      return;
    }

    if (entry.status === "queued") {
      readyEntries.push(entry);
      return;
    }

    if (entry.status === "conflict" || entry.status === "failed") {
      blockedPresentationKeys.add(presentationKey);
    }
  });

  return readyEntries;
};

const comparePresenterLocalSyncQueueEntriesForReplay = (
  left: PresenterLocalSyncQueueEntryPersistenceRecord,
  right: PresenterLocalSyncQueueEntryPersistenceRecord
): number =>
  left.tenantId.localeCompare(right.tenantId) ||
  left.presentationId.localeCompare(right.presentationId) ||
  left.queuedAt.localeCompare(right.queuedAt) ||
  left.queueEntryId.localeCompare(right.queueEntryId);

export interface PresenterQueryPersistenceRepository {
  readonly listPresentations: (
    operation: ListPresenterPresentationsPersistenceOperation
  ) => Promise<readonly PresenterPresentationPersistenceRecord[]>;
  readonly getPresentation: (
    operation: GetPresenterPresentationPersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord | null>;
  readonly getPresentationForService: (
    operation: GetPresenterPresentationForServicePersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord | null>;
  readonly listPresenterThemes: (
    operation: ListPresenterThemesPersistenceOperation
  ) => Promise<readonly PresenterThemePersistenceRecord[]>;
  readonly listOutputTargets: (
    operation: ListPresenterOutputTargetsPersistenceOperation
  ) => Promise<readonly PresenterOutputTargetPersistenceRecord[]>;
}

export interface PresenterCommandPersistenceRepository {
  readonly savePresentation: (
    operation: SavePresenterPresentationPersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord>;
  readonly savePresenterTheme: (
    operation: SavePresenterThemePersistenceOperation
  ) => Promise<PresenterThemePersistenceRecord>;
  readonly setOutputTarget: (
    operation: SetPresenterOutputTargetPersistenceOperation
  ) => Promise<PresenterOutputTargetPersistenceRecord>;
  readonly addSlide: (
    operation: AddPresenterSlidePersistenceOperation
  ) => Promise<PresenterSlidePersistenceRecord>;
  readonly updateSlide: (
    operation: UpdatePresenterSlidePersistenceOperation
  ) => Promise<PresenterSlidePersistenceRecord>;
  readonly reorderSlides: (
    operation: ReorderPresenterSlidesPersistenceOperation
  ) => Promise<readonly PresenterSlidePersistenceRecord[]>;
  readonly removeSlide: (
    operation: RemovePresenterSlidePersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord>;
}

export interface PresenterLocalSyncQueuePersistenceRepository {
  readonly enqueue: (
    operation: EnqueuePresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly getById: (
    operation: GetPresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryPersistenceRecord | null>;
  readonly listReadyForReplay: (
    operation: ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperation
  ) => Promise<readonly PresenterLocalSyncQueueEntryPersistenceRecord[]>;
  readonly markReplaying: (
    operation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly markSynced: (
    operation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly markConflict: (
    operation: MarkPresenterLocalSyncQueueEntryConflictPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly markFailed: (
    operation: MarkPresenterLocalSyncQueueEntryFailedPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly requeue: (
    operation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly cancel: (
    operation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly cleanupSyncedAndCancelled: (
    operation: CleanupPresenterLocalSyncQueueEntriesPersistenceOperation
  ) => Promise<CleanupPresenterLocalSyncQueueEntriesPersistenceResult>;
}
