import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const PresenterTenantIdSchema = NonEmptyStringSchema.brand<"PresenterTenantId">();
export const PresenterPresentationIdSchema =
  NonEmptyStringSchema.brand<"PresenterPresentationId">();
export const PresenterSlideIdSchema = NonEmptyStringSchema.brand<"PresenterSlideId">();
export const PresenterSlideBlockIdSchema =
  NonEmptyStringSchema.brand<"PresenterSlideBlockId">();
export const PresenterScripturePassageIdSchema =
  NonEmptyStringSchema.brand<"PresenterScripturePassageId">();
export const PresenterMediaCueIdSchema = NonEmptyStringSchema.brand<"PresenterMediaCueId">();
export const PresenterOutputTargetIdSchema =
  NonEmptyStringSchema.brand<"PresenterOutputTargetId">();
export const PresenterOutputWindowIdSchema =
  NonEmptyStringSchema.brand<"PresenterOutputWindowId">();
export const PresenterLocalSyncQueueEntryIdSchema =
  NonEmptyStringSchema.brand<"PresenterLocalSyncQueueEntryId">();
export const PresenterThemeIdSchema = NonEmptyStringSchema.brand<"PresenterThemeId">();
export const PresenterServiceIdSchema = NonEmptyStringSchema.brand<"PresenterServiceId">();
export const PresenterServiceItemIdSchema =
  NonEmptyStringSchema.brand<"PresenterServiceItemId">();
export const PresenterMediaAssetRefSchema =
  NonEmptyStringSchema.brand<"PresenterMediaAssetRef">();

export const ScriptureVerseSchema = z
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

export const ScripturePassageSchema = z
  .object({
    displayGrouping: z.enum(["continuous", "by-verse", "by-paragraph"]),
    passageId: PresenterScripturePassageIdSchema,
    referenceText: NonEmptyStringSchema,
    tenantId: PresenterTenantIdSchema,
    translationRef: NonEmptyStringSchema,
    verses: z.array(ScriptureVerseSchema).min(1)
  })
  .strict();

const SlideBlockBaseSchema = z
  .object({
    blockId: PresenterSlideBlockIdSchema
  })
  .strict();

export const TextSlideBlockSchema = SlideBlockBaseSchema.extend({
  alignment: z.enum(["left", "center", "right"]).default("center"),
  kind: z.literal("text"),
  text: NonEmptyStringSchema,
  textStyle: z.enum(["heading", "body", "caption"]).default("body")
}).strict();

export const ScriptureSlideBlockSchema = SlideBlockBaseSchema.extend({
  displayStyle: z.enum(["reference-and-text", "text-only", "reference-only"]),
  kind: z.literal("scripture"),
  passage: ScripturePassageSchema
}).strict();

export const LyricSlideBlockSchema = SlideBlockBaseSchema.extend({
  ccliSongNumber: NonEmptyStringSchema.optional(),
  kind: z.literal("lyric"),
  songRefId: NonEmptyStringSchema.optional(),
  text: NonEmptyStringSchema
}).strict();

export const ImageSlideBlockSchema = SlideBlockBaseSchema.extend({
  altText: NonEmptyStringSchema,
  fit: z.enum(["contain", "cover"]).default("cover"),
  kind: z.literal("image"),
  mediaAssetRef: PresenterMediaAssetRefSchema
}).strict();

export const VideoSlideBlockSchema = SlideBlockBaseSchema.extend({
  kind: z.literal("video"),
  mediaAssetRef: PresenterMediaAssetRefSchema,
  playback: z.enum(["manual", "auto-muted"]).default("manual"),
  posterAssetRef: PresenterMediaAssetRefSchema.optional()
}).strict();

export const LowerThirdSlideBlockSchema = SlideBlockBaseSchema.extend({
  kind: z.literal("lower-third"),
  primaryText: NonEmptyStringSchema,
  secondaryText: NonEmptyStringSchema.optional()
}).strict();

export const SlideBlockSchema = z.discriminatedUnion("kind", [
  TextSlideBlockSchema,
  ScriptureSlideBlockSchema,
  LyricSlideBlockSchema,
  ImageSlideBlockSchema,
  VideoSlideBlockSchema,
  LowerThirdSlideBlockSchema
]);

export const SlideSchema = z
  .object({
    backgroundRef: PresenterMediaAssetRefSchema.optional(),
    blocks: z.array(SlideBlockSchema).min(1),
    layout: z.enum(["title", "content", "scripture", "lyrics", "media", "lower-third"]),
    notes: NonEmptyStringSchema.optional(),
    order: NonNegativeIntegerSchema,
    presentationId: PresenterPresentationIdSchema,
    serviceItemId: PresenterServiceItemIdSchema.optional(),
    slideId: PresenterSlideIdSchema,
    tenantId: PresenterTenantIdSchema,
    timingHintSeconds: z.number().int().positive().optional(),
    title: NonEmptyStringSchema.optional()
  })
  .strict();

export const MediaCueSchema = z
  .object({
    label: NonEmptyStringSchema,
    mediaAssetRef: PresenterMediaAssetRefSchema,
    mediaCueId: PresenterMediaCueIdSchema,
    playbackHint: z.enum(["manual", "auto-start", "loop", "hold-last-frame"]),
    presentationId: PresenterPresentationIdSchema,
    slideId: PresenterSlideIdSchema,
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const OutputTargetSchema = z
  .object({
    confidenceOutputEnabled: z.boolean().default(false),
    displayName: NonEmptyStringSchema,
    outputTargetId: PresenterOutputTargetIdSchema,
    safeBlanked: z.boolean().default(true),
    tenantId: PresenterTenantIdSchema,
    targetKind: z.enum(["main", "confidence", "stage-display"]),
    windowRef: NonEmptyStringSchema
  })
  .strict();

export const PresenterThemeSchema = z
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
    tenantId: PresenterTenantIdSchema,
    themeId: PresenterThemeIdSchema,
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

export const PresentationSchema = z
  .object({
    createdAt: IsoDateTimeStringSchema,
    mediaCues: z.array(MediaCueSchema).default([]),
    presentationId: PresenterPresentationIdSchema,
    serviceId: PresenterServiceIdSchema.optional(),
    slides: z.array(SlideSchema).min(1),
    tenantId: PresenterTenantIdSchema,
    theme: PresenterThemeSchema,
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
          message: "Slide tenant must match presentation tenant.",
          path: ["slides", index, "tenantId"]
        });
      }

      if (slide.presentationId !== presentation.presentationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Slide presentation must match parent presentation.",
          path: ["slides", index, "presentationId"]
        });
      }

      if (slideIds.has(slide.slideId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Slide IDs must be unique within a presentation.",
          path: ["slides", index, "slideId"]
        });
      }

      slideIds.add(slide.slideId);
    });

    if (presentation.theme.tenantId !== presentation.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Theme tenant must match presentation tenant.",
        path: ["theme", "tenantId"]
      });
    }

    presentation.mediaCues.forEach((cue, index) => {
      if (cue.tenantId !== presentation.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Media cue tenant must match presentation tenant.",
          path: ["mediaCues", index, "tenantId"]
        });
      }

      if (cue.presentationId !== presentation.presentationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Media cue presentation must match parent presentation.",
          path: ["mediaCues", index, "presentationId"]
        });
      }

      if (!slideIds.has(cue.slideId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Media cue must reference an existing slide.",
          path: ["mediaCues", index, "slideId"]
        });
      }
    });
  });

export const PresenterLoadedRunModeStateSchema = z
  .object({
    activeSlideId: PresenterSlideIdSchema,
    confidenceOutputEnabled: z.boolean(),
    loadedAt: IsoDateTimeStringSchema,
    outputBlanked: z.boolean(),
    outputTargets: z.array(OutputTargetSchema),
    presentation: PresentationSchema,
    tenantId: PresenterTenantIdSchema
  })
  .strict()
  .superRefine((state, context) => {
    if (state.tenantId !== state.presentation.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Run-mode tenant must match loaded presentation tenant.",
        path: ["tenantId"]
      });
    }

    const activeSlideExists = state.presentation.slides.some(
      (slide) => slide.slideId === state.activeSlideId
    );

    if (!activeSlideExists) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active slide must exist in the loaded presentation.",
        path: ["activeSlideId"]
      });
    }

    state.outputTargets.forEach((target, index) => {
      if (target.tenantId !== state.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Output target tenant must match run-mode tenant.",
          path: ["outputTargets", index, "tenantId"]
        });
      }
    });
  });

export const LoadPresentationActionSchema = z
  .object({
    action: z.literal("loadPresentation"),
    loadedAt: IsoDateTimeStringSchema,
    outputTargets: z.array(OutputTargetSchema).default([]),
    presentation: PresentationSchema,
    tenantId: PresenterTenantIdSchema
  })
  .strict()
  .superRefine((action, context) => {
    if (action.tenantId !== action.presentation.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Load action tenant must match presentation tenant.",
        path: ["tenantId"]
      });
    }

    action.outputTargets.forEach((target, index) => {
      if (target.tenantId !== action.tenantId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Output target tenant must match load action tenant.",
          path: ["outputTargets", index, "tenantId"]
        });
      }
    });
  });

export const GoToSlideActionSchema = z
  .object({
    action: z.literal("goToSlide"),
    slideId: PresenterSlideIdSchema,
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const NextSlideActionSchema = z
  .object({
    action: z.literal("nextSlide"),
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const PreviousSlideActionSchema = z
  .object({
    action: z.literal("previousSlide"),
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const BlankOutputActionSchema = z
  .object({
    action: z.literal("blankOutput"),
    reason: NonEmptyStringSchema.optional(),
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const RestoreOutputActionSchema = z
  .object({
    action: z.literal("restoreOutput"),
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const ToggleConfidenceOutputActionSchema = z
  .object({
    action: z.literal("toggleConfidenceOutput"),
    enabled: z.boolean(),
    tenantId: PresenterTenantIdSchema
  })
  .strict();

export const PresenterRunModeActionSchema = z.union([
  LoadPresentationActionSchema,
  GoToSlideActionSchema,
  NextSlideActionSchema,
  PreviousSlideActionSchema,
  BlankOutputActionSchema,
  RestoreOutputActionSchema,
  ToggleConfidenceOutputActionSchema
]);

export const PresenterDesktopOutputWindowSchema = z
  .object({
    confidenceOutputEligible: z.boolean().default(false),
    displayName: NonEmptyStringSchema,
    failureReason: NonEmptyStringSchema.optional(),
    lastHealthCheckAt: IsoDateTimeStringSchema.optional(),
    lifecycleState: z.enum(["registered", "visible", "hidden", "failed"]),
    outputRole: z.enum(["main", "confidence", "stage-display"]),
    outputTargetId: PresenterOutputTargetIdSchema,
    safeBlanked: z.boolean(),
    tenantId: PresenterTenantIdSchema,
    windowId: PresenterOutputWindowIdSchema,
    windowRef: NonEmptyStringSchema
  })
  .strict()
  .superRefine((window, context) => {
    if (window.outputRole === "main" && window.confidenceOutputEligible) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Main output windows cannot be confidence-output eligible.",
        path: ["confidenceOutputEligible"]
      });
    }

    if (window.lifecycleState === "failed" && window.failureReason === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed output windows must include a failure reason.",
        path: ["failureReason"]
      });
    }

    if (window.lifecycleState === "failed" && !window.safeBlanked) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed output windows must remain safe blanked.",
        path: ["safeBlanked"]
      });
    }
  });

export const PresenterDesktopRunModeStatusSchema = z
  .object({
    apiConnectionState: z.enum(["online", "degraded", "offline"]),
    lastApiReachableAt: IsoDateTimeStringSchema.optional(),
    localPlaybackReady: z.boolean(),
    offlineSince: IsoDateTimeStringSchema.optional(),
    pendingSyncQueueSize: NonNegativeIntegerSchema,
    syncState: z.enum(["synced", "queued", "conflict", "failed"])
  })
  .strict()
  .superRefine((status, context) => {
    if (status.apiConnectionState === "offline" && status.offlineSince === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Offline run mode status must include when offline mode began.",
        path: ["offlineSince"]
      });
    }

    if (status.pendingSyncQueueSize > 0 && status.syncState === "synced") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued local changes cannot be marked synced.",
        path: ["syncState"]
      });
    }

    if (status.pendingSyncQueueSize === 0 && status.syncState === "queued") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued sync state requires pending local changes.",
        path: ["pendingSyncQueueSize"]
      });
    }
  });

export const PresenterOutputWindowRenderContextSchema = z
  .object({
    activeSlide: SlideSchema,
    confidenceOutputEnabled: z.boolean(),
    localStatus: PresenterDesktopRunModeStatusSchema,
    outputBlanked: z.boolean(),
    presentationId: PresenterPresentationIdSchema,
    tenantId: PresenterTenantIdSchema,
    theme: PresenterThemeSchema,
    window: PresenterDesktopOutputWindowSchema
  })
  .strict()
  .superRefine((contextValue, context) => {
    if (contextValue.window.tenantId !== contextValue.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Output window tenant must match render context tenant.",
        path: ["window", "tenantId"]
      });
    }

    if (contextValue.activeSlide.tenantId !== contextValue.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active slide tenant must match render context tenant.",
        path: ["activeSlide", "tenantId"]
      });
    }

    if (contextValue.activeSlide.presentationId !== contextValue.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active slide presentation must match render context presentation.",
        path: ["activeSlide", "presentationId"]
      });
    }

    if (contextValue.theme.tenantId !== contextValue.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Theme tenant must match render context tenant.",
        path: ["theme", "tenantId"]
      });
    }

    if (contextValue.outputBlanked && !contextValue.window.safeBlanked) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Output window must be safe blanked when run mode output is blanked.",
        path: ["window", "safeBlanked"]
      });
    }

    if (
      contextValue.window.outputRole === "confidence" &&
      !contextValue.window.confidenceOutputEligible
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confidence output windows must be marked confidence-output eligible.",
        path: ["window", "confidenceOutputEligible"]
      });
    }

    if (
      contextValue.window.outputRole === "confidence" &&
      !contextValue.confidenceOutputEnabled &&
      !contextValue.window.safeBlanked
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Disabled confidence output windows must remain safe blanked.",
        path: ["window", "safeBlanked"]
      });
    }
  });

export const QueuedUpdatePresentationOperationSchema = z
  .object({
    operation: z.literal("updatePresentation"),
    payload: z
      .object({
        presentationId: PresenterPresentationIdSchema,
        serviceId: PresenterServiceIdSchema.optional(),
        title: NonEmptyStringSchema.optional()
      })
      .strict()
  })
  .strict();

export const QueuedAddPresenterSlideOperationSchema = z
  .object({
    operation: z.literal("addSlide"),
    payload: z
      .object({
        afterSlideId: PresenterSlideIdSchema.optional(),
        presentationId: PresenterPresentationIdSchema,
        slide: SlideSchema.omit({
          order: true,
          presentationId: true,
          slideId: true,
          tenantId: true
        }).strict()
      })
      .strict()
  })
  .strict();

export const QueuedUpdatePresenterSlideOperationSchema = z
  .object({
    operation: z.literal("updateSlide"),
    payload: z
      .object({
        presentationId: PresenterPresentationIdSchema,
        slide: SlideSchema
      })
      .strict()
  })
  .strict();

export const QueuedReorderPresenterSlidesOperationSchema = z
  .object({
    operation: z.literal("reorderSlides"),
    payload: z
      .object({
        orderedSlideIds: z.array(PresenterSlideIdSchema).min(1),
        presentationId: PresenterPresentationIdSchema
      })
      .strict()
      .superRefine((payload, context) => {
        if (new Set(payload.orderedSlideIds).size !== payload.orderedSlideIds.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Queued slide order cannot contain duplicate slide IDs.",
            path: ["orderedSlideIds"]
          });
        }
      })
  })
  .strict();

export const QueuedApplyPresenterThemeOperationSchema = z
  .object({
    operation: z.literal("applyPresenterTheme"),
    payload: z
      .object({
        presentationId: PresenterPresentationIdSchema,
        themeId: PresenterThemeIdSchema
      })
      .strict()
  })
  .strict();

export const QueuedSetPresenterOutputTargetOperationSchema = z
  .object({
    operation: z.literal("setOutputTarget"),
    payload: z
      .object({
        outputTarget: OutputTargetSchema,
        presentationId: PresenterPresentationIdSchema
      })
      .strict()
  })
  .strict();

export const PresenterLocalSyncQueuedOperationSchema = z.discriminatedUnion(
  "operation",
  [
    QueuedUpdatePresentationOperationSchema,
    QueuedAddPresenterSlideOperationSchema,
    QueuedUpdatePresenterSlideOperationSchema,
    QueuedReorderPresenterSlidesOperationSchema,
    QueuedApplyPresenterThemeOperationSchema,
    QueuedSetPresenterOutputTargetOperationSchema
  ]
);

export const PresenterLocalSyncConflictDetailSchema = z
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

export const PresenterLocalSyncQueueStatusSchema = z.enum([
  "queued",
  "replaying",
  "synced",
  "conflict",
  "failed",
  "cancelled"
]);

export const PresenterLocalSyncQueueEntrySchema = z
  .object({
    actorId: NonEmptyStringSchema,
    attemptCount: NonNegativeIntegerSchema,
    baseRevision: NonEmptyStringSchema,
    conflict: PresenterLocalSyncConflictDetailSchema.optional(),
    lastAttemptedAt: IsoDateTimeStringSchema.optional(),
    operation: PresenterLocalSyncQueuedOperationSchema,
    presentationId: PresenterPresentationIdSchema,
    queuedAt: IsoDateTimeStringSchema,
    queueEntryId: PresenterLocalSyncQueueEntryIdSchema,
    requestId: NonEmptyStringSchema,
    safeErrorMessage: NonEmptyStringSchema.optional(),
    status: PresenterLocalSyncQueueStatusSchema,
    tenantId: PresenterTenantIdSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.operation.payload.presentationId !== entry.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued operation presentation must match queue entry presentation.",
        path: ["operation", "payload", "presentationId"]
      });
    }

    if (
      entry.operation.operation === "updateSlide" &&
      entry.operation.payload.slide.presentationId !== entry.presentationId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued slide update must target the queued presentation.",
        path: ["operation", "payload", "slide", "presentationId"]
      });
    }

    if (
      entry.operation.operation === "updateSlide" &&
      entry.operation.payload.slide.tenantId !== entry.tenantId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued slide tenant must match queue entry tenant.",
        path: ["operation", "payload", "slide", "tenantId"]
      });
    }

    if (
      entry.operation.operation === "setOutputTarget" &&
      entry.operation.payload.outputTarget.tenantId !== entry.tenantId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queued output target tenant must match queue entry tenant.",
        path: ["operation", "payload", "outputTarget", "tenantId"]
      });
    }

    if (entry.status === "conflict" && entry.conflict === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conflicted queue entries must include conflict details.",
        path: ["conflict"]
      });
    }

    if (entry.status !== "conflict" && entry.conflict !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only conflicted queue entries can include conflict details.",
        path: ["conflict"]
      });
    }

    if (entry.status === "failed" && entry.safeErrorMessage === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed queue entries must include a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.status !== "failed" && entry.safeErrorMessage !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only failed queue entries can include a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.lastAttemptedAt !== undefined && entry.attemptCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Queue entries with a replay attempt timestamp must record an attempt.",
        path: ["attemptCount"]
      });
    }
  });

export const PresenterLocalSyncQueueStatusTransitionSchema = z
  .object({
    from: PresenterLocalSyncQueueStatusSchema,
    safeReason: NonEmptyStringSchema.optional(),
    to: PresenterLocalSyncQueueStatusSchema,
    transitionedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((transition, context) => {
    if (!isPresenterLocalSyncQueueStatusTransitionAllowed(transition.from, transition.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter local sync queue status transition is not allowed.",
        path: ["to"]
      });
    }
  });

const presenterLocalSyncQueueAllowedTransitions: ReadonlyMap<
  z.infer<typeof PresenterLocalSyncQueueStatusSchema>,
  readonly z.infer<typeof PresenterLocalSyncQueueStatusSchema>[]
> = new Map([
  ["queued", ["replaying", "conflict", "failed", "cancelled"]],
  ["replaying", ["queued", "synced", "conflict", "failed"]],
  ["conflict", ["queued", "cancelled"]],
  ["failed", ["queued", "cancelled"]],
  ["synced", []],
  ["cancelled", []]
]);

const isPresenterLocalSyncQueueStatusTransitionAllowed = (
  from: z.infer<typeof PresenterLocalSyncQueueStatusSchema>,
  to: z.infer<typeof PresenterLocalSyncQueueStatusSchema>
): boolean =>
  presenterLocalSyncQueueAllowedTransitions.get(from)?.includes(to) ?? false;

export type PresenterTenantId = z.infer<typeof PresenterTenantIdSchema>;
export type PresenterPresentationId = z.infer<typeof PresenterPresentationIdSchema>;
export type PresenterSlideId = z.infer<typeof PresenterSlideIdSchema>;
export type PresenterSlideBlockId = z.infer<typeof PresenterSlideBlockIdSchema>;
export type PresenterScripturePassageId = z.infer<
  typeof PresenterScripturePassageIdSchema
>;
export type PresenterMediaCueId = z.infer<typeof PresenterMediaCueIdSchema>;
export type PresenterOutputTargetId = z.infer<typeof PresenterOutputTargetIdSchema>;
export type PresenterOutputWindowId = z.infer<typeof PresenterOutputWindowIdSchema>;
export type PresenterLocalSyncQueueEntryId = z.infer<
  typeof PresenterLocalSyncQueueEntryIdSchema
>;
export type PresenterThemeId = z.infer<typeof PresenterThemeIdSchema>;
export type PresenterServiceId = z.infer<typeof PresenterServiceIdSchema>;
export type PresenterServiceItemId = z.infer<typeof PresenterServiceItemIdSchema>;
export type PresenterMediaAssetRef = z.infer<typeof PresenterMediaAssetRefSchema>;
export type ScriptureVerse = z.infer<typeof ScriptureVerseSchema>;
export type ScripturePassage = z.infer<typeof ScripturePassageSchema>;
export type TextSlideBlock = z.infer<typeof TextSlideBlockSchema>;
export type ScriptureSlideBlock = z.infer<typeof ScriptureSlideBlockSchema>;
export type LyricSlideBlock = z.infer<typeof LyricSlideBlockSchema>;
export type ImageSlideBlock = z.infer<typeof ImageSlideBlockSchema>;
export type VideoSlideBlock = z.infer<typeof VideoSlideBlockSchema>;
export type LowerThirdSlideBlock = z.infer<typeof LowerThirdSlideBlockSchema>;
export type SlideBlock = z.infer<typeof SlideBlockSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type MediaCue = z.infer<typeof MediaCueSchema>;
export type OutputTarget = z.infer<typeof OutputTargetSchema>;
export type PresenterTheme = z.infer<typeof PresenterThemeSchema>;
export type Presentation = z.infer<typeof PresentationSchema>;
export type PresenterLoadedRunModeState = z.infer<
  typeof PresenterLoadedRunModeStateSchema
>;
export type PresenterRunModeAction = z.infer<typeof PresenterRunModeActionSchema>;
export type PresenterDesktopOutputWindow = z.infer<
  typeof PresenterDesktopOutputWindowSchema
>;
export type PresenterDesktopRunModeStatus = z.infer<
  typeof PresenterDesktopRunModeStatusSchema
>;
export type PresenterOutputWindowRenderContext = z.infer<
  typeof PresenterOutputWindowRenderContextSchema
>;
export type PresenterLocalSyncQueuedOperation = z.infer<
  typeof PresenterLocalSyncQueuedOperationSchema
>;
export type PresenterLocalSyncConflictDetail = z.infer<
  typeof PresenterLocalSyncConflictDetailSchema
>;
export type PresenterLocalSyncQueueStatus = z.infer<
  typeof PresenterLocalSyncQueueStatusSchema
>;
export type PresenterLocalSyncQueueEntry = z.infer<
  typeof PresenterLocalSyncQueueEntrySchema
>;
export type PresenterLocalSyncQueueStatusTransition = z.infer<
  typeof PresenterLocalSyncQueueStatusTransitionSchema
>;

export const parsePresentation = (rawInput: unknown): Presentation =>
  PresentationSchema.parse(rawInput);

export const parsePresenterLoadedRunModeState = (
  rawInput: unknown
): PresenterLoadedRunModeState => PresenterLoadedRunModeStateSchema.parse(rawInput);

export const parsePresenterRunModeAction = (rawInput: unknown): PresenterRunModeAction =>
  PresenterRunModeActionSchema.parse(rawInput);

export const parsePresenterDesktopOutputWindow = (
  rawInput: unknown
): PresenterDesktopOutputWindow => PresenterDesktopOutputWindowSchema.parse(rawInput);

export const parsePresenterDesktopRunModeStatus = (
  rawInput: unknown
): PresenterDesktopRunModeStatus => PresenterDesktopRunModeStatusSchema.parse(rawInput);

export const parsePresenterOutputWindowRenderContext = (
  rawInput: unknown
): PresenterOutputWindowRenderContext =>
  PresenterOutputWindowRenderContextSchema.parse(rawInput);

export const parsePresenterLocalSyncQueuedOperation = (
  rawInput: unknown
): PresenterLocalSyncQueuedOperation =>
  PresenterLocalSyncQueuedOperationSchema.parse(rawInput);

export const parsePresenterLocalSyncQueueEntry = (
  rawInput: unknown
): PresenterLocalSyncQueueEntry => PresenterLocalSyncQueueEntrySchema.parse(rawInput);

export const parsePresenterLocalSyncQueueStatusTransition = (
  rawInput: unknown
): PresenterLocalSyncQueueStatusTransition =>
  PresenterLocalSyncQueueStatusTransitionSchema.parse(rawInput);

export const sortPresenterLocalSyncQueueEntriesForReplay = (
  rawEntries: readonly unknown[]
): readonly PresenterLocalSyncQueueEntry[] =>
  z
    .array(PresenterLocalSyncQueueEntrySchema)
    .parse(rawEntries)
    .filter((entry) => entry.status === "queued")
    .sort(comparePresenterLocalSyncQueueEntriesForReplay);

const comparePresenterLocalSyncQueueEntriesForReplay = (
  left: PresenterLocalSyncQueueEntry,
  right: PresenterLocalSyncQueueEntry
): number =>
  left.tenantId.localeCompare(right.tenantId) ||
  left.presentationId.localeCompare(right.presentationId) ||
  left.queuedAt.localeCompare(right.queuedAt) ||
  left.queueEntryId.localeCompare(right.queueEntryId);
