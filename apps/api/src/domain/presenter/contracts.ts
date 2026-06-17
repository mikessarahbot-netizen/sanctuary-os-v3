import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PresenterSlideGroupTypeSchema = z.enum([
  "service-item",
  "scripture",
  "song",
  "announcement",
  "message",
  "media",
  "custom"
]);

export const PresenterSlideBlockKindSchema = z.enum([
  "text",
  "scripture",
  "lyric",
  "announcement",
  "media-placeholder",
  "lower-third"
]);

export const PresenterMediaTypeSchema = z.enum(["image", "video"]);

export const PresenterOutputModeSchema = z.enum(["preview", "live"]);

export const PresenterStyleTokenSchema = z
  .object({
    backgroundColor: NonEmptyStringSchema,
    bodyFontFamily: NonEmptyStringSchema,
    bodyTextColor: NonEmptyStringSchema,
    headingFontFamily: NonEmptyStringSchema,
    headingTextColor: NonEmptyStringSchema,
    lowerThirdBackgroundColor: NonEmptyStringSchema.optional(),
    lowerThirdTextColor: NonEmptyStringSchema.optional(),
    safeAreaInsetPercent: z.number().min(0).max(20)
  })
  .strict();

export const PresenterStyleTemplateSchema = z
  .object({
    createdAt: z.string().datetime(),
    name: NonEmptyStringSchema,
    styleTemplateId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    tokens: PresenterStyleTokenSchema,
    updatedAt: z.string().datetime()
  })
  .strict();

export const PresenterScriptureReferenceSchema = z
  .object({
    displayText: NonEmptyStringSchema,
    passageRef: NonEmptyStringSchema,
    scriptureReferenceId: NonEmptyStringSchema,
    translationLabel: NonEmptyStringSchema,
    verseRange: NonEmptyStringSchema.optional()
  })
  .strict();

export const PresenterTextSlideBlockSchema = z
  .object({
    blockId: NonEmptyStringSchema,
    kind: z.literal("text"),
    styleRole: z.enum(["heading", "body", "caption"]).optional(),
    text: NonEmptyStringSchema
  })
  .strict();

export const PresenterScriptureSlideBlockSchema = z
  .object({
    blockId: NonEmptyStringSchema,
    kind: z.literal("scripture"),
    scripture: PresenterScriptureReferenceSchema
  })
  .strict();

export const PresenterLyricSlideBlockSchema = z
  .object({
    blockId: NonEmptyStringSchema,
    kind: z.literal("lyric"),
    songId: NonEmptyStringSchema.optional(),
    text: NonEmptyStringSchema
  })
  .strict();

export const PresenterAnnouncementSlideBlockSchema = z
  .object({
    blockId: NonEmptyStringSchema,
    kind: z.literal("announcement"),
    text: NonEmptyStringSchema
  })
  .strict();

export const PresenterMediaPlaceholderSlideBlockSchema = z
  .object({
    assetRef: NonEmptyStringSchema,
    blockId: NonEmptyStringSchema,
    kind: z.literal("media-placeholder"),
    mediaType: PresenterMediaTypeSchema,
    title: OptionalNonEmptyStringSchema
  })
  .strict();

export const PresenterLowerThirdSlideBlockSchema = z
  .object({
    blockId: NonEmptyStringSchema,
    kind: z.literal("lower-third"),
    subtitle: OptionalNonEmptyStringSchema,
    title: NonEmptyStringSchema
  })
  .strict();

export const PresenterSlideBlockSchema = z.discriminatedUnion("kind", [
  PresenterTextSlideBlockSchema,
  PresenterScriptureSlideBlockSchema,
  PresenterLyricSlideBlockSchema,
  PresenterAnnouncementSlideBlockSchema,
  PresenterMediaPlaceholderSlideBlockSchema,
  PresenterLowerThirdSlideBlockSchema
]);

export const PresenterSlideSchema = z
  .object({
    backgroundMediaRef: OptionalNonEmptyStringSchema,
    blocks: z.array(PresenterSlideBlockSchema).min(1),
    durationSeconds: z.number().int().positive().optional(),
    operatorNotes: OptionalNonEmptyStringSchema,
    slideId: NonEmptyStringSchema,
    title: OptionalNonEmptyStringSchema
  })
  .strict();

export const PresenterSlideGroupSchema = z
  .object({
    groupId: NonEmptyStringSchema,
    groupType: PresenterSlideGroupTypeSchema,
    operatorNotes: OptionalNonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema,
    slides: z.array(PresenterSlideSchema).min(1),
    title: NonEmptyStringSchema
  })
  .strict()
  .superRefine((group, context): void => {
    if (group.groupType === "service-item" && group.serviceItemId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Service-item slide groups require a serviceItemId.",
        path: ["serviceItemId"]
      });
    }
  });

export const PresenterSyncStatusSchema = z.enum([
  "synced",
  "local-only",
  "sync-pending",
  "conflict"
]);

export const PresenterPresentationSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    slideGroups: z.array(PresenterSlideGroupSchema).min(1),
    styleTemplateId: OptionalNonEmptyStringSchema,
    syncStatus: PresenterSyncStatusSchema.default("synced"),
    tenantId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    updatedAt: z.string().datetime()
  })
  .strict();

export const PresenterOutputStateSchema = z
  .object({
    blackout: z.boolean().default(false),
    currentGroupId: NonEmptyStringSchema,
    currentSlideId: NonEmptyStringSchema,
    freeze: z.boolean().default(false),
    mode: PresenterOutputModeSchema,
    presentationId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: z.string().datetime()
  })
  .strict();

export const LoadedPresenterRunStateSchema = z
  .object({
    loadedAt: z.string().datetime(),
    offlineAvailable: z.literal(true),
    outputState: PresenterOutputStateSchema,
    presentation: PresenterPresentationSchema,
    source: z.enum(["api", "local-cache"])
  })
  .strict()
  .superRefine((state, context): void => {
    if (state.outputState.tenantId !== state.presentation.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Output state tenant must match loaded presentation tenant.",
        path: ["outputState", "tenantId"]
      });
    }

    if (state.outputState.presentationId !== state.presentation.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Output state presentation must match loaded presentation.",
        path: ["outputState", "presentationId"]
      });
    }
  });

export const PresenterRunModeActionSchema = z.discriminatedUnion("actionType", [
  z
    .object({
      actionType: z.literal("loadPresentation"),
      loadedAt: z.string().datetime(),
      presentationId: NonEmptyStringSchema,
      tenantId: NonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      actionType: z.literal("goToSlide"),
      groupId: NonEmptyStringSchema,
      slideId: NonEmptyStringSchema
    })
    .strict(),
  z.object({ actionType: z.literal("nextSlide") }).strict(),
  z.object({ actionType: z.literal("previousSlide") }).strict(),
  z.object({ actionType: z.literal("blackoutOutput") }).strict(),
  z.object({ actionType: z.literal("restoreOutput") }).strict(),
  z.object({ actionType: z.literal("freezeOutput") }).strict(),
  z.object({ actionType: z.literal("unfreezeOutput") }).strict(),
  z
    .object({
      actionType: z.literal("selectOutputMode"),
      mode: PresenterOutputModeSchema
    })
    .strict()
]);

export type PresenterSlideGroupType = z.infer<typeof PresenterSlideGroupTypeSchema>;
export type PresenterSlideBlockKind = z.infer<typeof PresenterSlideBlockKindSchema>;
export type PresenterMediaType = z.infer<typeof PresenterMediaTypeSchema>;
export type PresenterOutputMode = z.infer<typeof PresenterOutputModeSchema>;
export type PresenterStyleTemplate = z.infer<typeof PresenterStyleTemplateSchema>;
export type PresenterScriptureReference = z.infer<
  typeof PresenterScriptureReferenceSchema
>;
export type PresenterSlideBlock = z.infer<typeof PresenterSlideBlockSchema>;
export type PresenterSlide = z.infer<typeof PresenterSlideSchema>;
export type PresenterSlideGroup = z.infer<typeof PresenterSlideGroupSchema>;
export type PresenterSyncStatus = z.infer<typeof PresenterSyncStatusSchema>;
export type PresenterPresentation = z.infer<typeof PresenterPresentationSchema>;
export type PresenterOutputState = z.infer<typeof PresenterOutputStateSchema>;
export type LoadedPresenterRunState = z.infer<typeof LoadedPresenterRunStateSchema>;
export type PresenterRunModeAction = z.infer<typeof PresenterRunModeActionSchema>;
