import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema,
  type RepositoryReadOptions
} from "./repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime();
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const PresenterPersistenceWriteOptionsSchema =
  RepositoryWriteOptionsSchema.superRefine((options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter persistence writes require actor audit metadata.",
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

const PresenterSlideBlockPersistenceBaseSchema = z
  .object({
    blockId: NonEmptyStringSchema
  })
  .strict();

export const PresenterTextSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
    alignment: z.enum(["left", "center", "right"]).default("center"),
    kind: z.literal("text"),
    text: NonEmptyStringSchema,
    textStyle: z.enum(["heading", "body", "caption"]).default("body")
  }).strict();

export const PresenterScriptureSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
    displayStyle: z.enum(["reference-and-text", "text-only", "reference-only"]),
    kind: z.literal("scripture"),
    passage: PresenterScripturePassagePersistenceRecordSchema
  }).strict();

export const PresenterLyricSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
    ccliSongNumber: OptionalNonEmptyStringSchema,
    kind: z.literal("lyric"),
    songRefId: OptionalNonEmptyStringSchema,
    text: NonEmptyStringSchema
  }).strict();

export const PresenterImageSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
    altText: NonEmptyStringSchema,
    fit: z.enum(["contain", "cover"]).default("cover"),
    kind: z.literal("image"),
    mediaAssetRef: NonEmptyStringSchema
  }).strict();

export const PresenterVideoSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
    kind: z.literal("video"),
    mediaAssetRef: NonEmptyStringSchema,
    playback: z.enum(["manual", "auto-muted"]).default("manual"),
    posterAssetRef: OptionalNonEmptyStringSchema
  }).strict();

export const PresenterLowerThirdSlideBlockPersistenceRecordSchema =
  PresenterSlideBlockPersistenceBaseSchema.extend({
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
          message: "Slide IDs must be unique within a persisted presentation.",
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
          message: "Media cue must reference an existing persisted slide.",
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

export const CreatePresenterPresentationPersistenceInputSchema =
  PresenterPresentationPersistenceRecordSchema;

export const UpdatePresenterPresentationPersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    serviceId: OptionalNonEmptyStringSchema,
    title: OptionalNonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const SavePresenterThemePersistenceInputSchema =
  PresenterThemePersistenceRecordSchema;

export const AddPresenterSlidePersistenceInputSchema = z
  .object({
    afterSlideId: OptionalNonEmptyStringSchema,
    presentationId: NonEmptyStringSchema,
    slide: PresenterSlidePersistenceRecordSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const UpdatePresenterSlidePersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    slide: PresenterSlidePersistenceRecordSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ReorderPresenterSlidesPersistenceInputSchema = z
  .object({
    orderedSlideIds: z.array(NonEmptyStringSchema).min(1),
    presentationId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.orderedSlideIds).size !== input.orderedSlideIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter persistence slide order cannot contain duplicate slide IDs.",
        path: ["orderedSlideIds"]
      });
    }
  });

export const RemovePresenterSlidePersistenceInputSchema = z
  .object({
    confirmationIntent: z
      .object({
        confirmed: z.literal(true),
        reason: NonEmptyStringSchema
      })
      .strict(),
    presentationId: NonEmptyStringSchema,
    slideId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ApplyPresenterThemePersistenceInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema,
    themeId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const SetPresenterOutputTargetPersistenceInputSchema = z
  .object({
    outputTarget: PresenterOutputTargetPersistenceRecordSchema,
    presentationId: NonEmptyStringSchema
  })
  .strict();

export const CreatePresenterPresentationPersistenceOperationSchema = z
  .object({
    input: CreatePresenterPresentationPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .superRefine((operation, context) => {
    addTenantMismatchIssue(operation.input.tenantId, operation.options.context.tenantId, context);
  });

export const UpdatePresenterPresentationPersistenceOperationSchema = z.object({
  input: UpdatePresenterPresentationPersistenceInputSchema,
  options: PresenterPersistenceWriteOptionsSchema
});

export const SavePresenterThemePersistenceOperationSchema = z
  .object({
    input: SavePresenterThemePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .superRefine((operation, context) => {
    addTenantMismatchIssue(operation.input.tenantId, operation.options.context.tenantId, context);
  });

export const AddPresenterSlidePersistenceOperationSchema = z
  .object({
    input: AddPresenterSlidePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .superRefine((operation, context) => {
    addTenantMismatchIssue(
      operation.input.slide.tenantId,
      operation.options.context.tenantId,
      context
    );

    if (operation.input.slide.presentationId !== operation.input.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slide presentation must match operation presentation.",
        path: ["input", "slide", "presentationId"]
      });
    }
  });

export const UpdatePresenterSlidePersistenceOperationSchema = z
  .object({
    input: UpdatePresenterSlidePersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .superRefine((operation, context) => {
    addTenantMismatchIssue(
      operation.input.slide.tenantId,
      operation.options.context.tenantId,
      context
    );

    if (operation.input.slide.presentationId !== operation.input.presentationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slide presentation must match operation presentation.",
        path: ["input", "slide", "presentationId"]
      });
    }
  });

export const ReorderPresenterSlidesPersistenceOperationSchema = z.object({
  input: ReorderPresenterSlidesPersistenceInputSchema,
  options: PresenterPersistenceWriteOptionsSchema
});

export const RemovePresenterSlidePersistenceOperationSchema = z.object({
  input: RemovePresenterSlidePersistenceInputSchema,
  options: PresenterPersistenceWriteOptionsSchema
});

export const ApplyPresenterThemePersistenceOperationSchema = z.object({
  input: ApplyPresenterThemePersistenceInputSchema,
  options: PresenterPersistenceWriteOptionsSchema
});

export const SetPresenterOutputTargetPersistenceOperationSchema = z
  .object({
    input: SetPresenterOutputTargetPersistenceInputSchema,
    options: PresenterPersistenceWriteOptionsSchema
  })
  .superRefine((operation, context) => {
    addTenantMismatchIssue(
      operation.input.outputTarget.tenantId,
      operation.options.context.tenantId,
      context
    );
  });

export const ListPresenterPresentationsPersistenceOperationSchema = z.object({
  input: ListPresenterPresentationsPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const GetPresenterPresentationPersistenceOperationSchema = z.object({
  input: GetPresenterPresentationPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const GetPresenterPresentationForServicePersistenceOperationSchema = z.object({
  input: GetPresenterPresentationForServicePersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPresenterThemesPersistenceOperationSchema = z.object({
  input: ListPresenterThemesPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPresenterOutputTargetsPersistenceOperationSchema = z.object({
  input: ListPresenterOutputTargetsPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export type PresenterPersistenceWriteOptions = z.infer<
  typeof PresenterPersistenceWriteOptionsSchema
>;
export type PresenterScriptureVersePersistenceRecord = z.infer<
  typeof PresenterScriptureVersePersistenceRecordSchema
>;
export type PresenterScripturePassagePersistenceRecord = z.infer<
  typeof PresenterScripturePassagePersistenceRecordSchema
>;
export type PresenterSlideBlockPersistenceRecord = z.infer<
  typeof PresenterSlideBlockPersistenceRecordSchema
>;
export type PresenterSlidePersistenceRecord = z.infer<
  typeof PresenterSlidePersistenceRecordSchema
>;
export type PresenterMediaCuePersistenceRecord = z.infer<
  typeof PresenterMediaCuePersistenceRecordSchema
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
export type CreatePresenterPresentationPersistenceInput = z.infer<
  typeof CreatePresenterPresentationPersistenceInputSchema
>;
export type UpdatePresenterPresentationPersistenceInput = z.infer<
  typeof UpdatePresenterPresentationPersistenceInputSchema
>;
export type SavePresenterThemePersistenceInput = z.infer<
  typeof SavePresenterThemePersistenceInputSchema
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
export type ApplyPresenterThemePersistenceInput = z.infer<
  typeof ApplyPresenterThemePersistenceInputSchema
>;
export type SetPresenterOutputTargetPersistenceInput = z.infer<
  typeof SetPresenterOutputTargetPersistenceInputSchema
>;

export interface PresenterPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PresenterPersistenceWriteOptions;
}

export interface PresenterReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: RepositoryReadOptions;
}

export type CreatePresenterPresentationPersistenceOperation =
  PresenterPersistenceOperation<CreatePresenterPresentationPersistenceInput>;
export type UpdatePresenterPresentationPersistenceOperation =
  PresenterPersistenceOperation<UpdatePresenterPresentationPersistenceInput>;
export type SavePresenterThemePersistenceOperation =
  PresenterPersistenceOperation<SavePresenterThemePersistenceInput>;
export type AddPresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<AddPresenterSlidePersistenceInput>;
export type UpdatePresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<UpdatePresenterSlidePersistenceInput>;
export type ReorderPresenterSlidesPersistenceOperation =
  PresenterPersistenceOperation<ReorderPresenterSlidesPersistenceInput>;
export type RemovePresenterSlidePersistenceOperation =
  PresenterPersistenceOperation<RemovePresenterSlidePersistenceInput>;
export type ApplyPresenterThemePersistenceOperation =
  PresenterPersistenceOperation<ApplyPresenterThemePersistenceInput>;
export type SetPresenterOutputTargetPersistenceOperation =
  PresenterPersistenceOperation<SetPresenterOutputTargetPersistenceInput>;
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

export interface PresenterCommandPersistenceRepository {
  readonly createPresentation: (
    operation: CreatePresenterPresentationPersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord>;
  readonly updatePresentation: (
    operation: UpdatePresenterPresentationPersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord>;
  readonly savePresenterTheme: (
    operation: SavePresenterThemePersistenceOperation
  ) => Promise<PresenterThemePersistenceRecord>;
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
  readonly applyPresenterTheme: (
    operation: ApplyPresenterThemePersistenceOperation
  ) => Promise<PresenterPresentationPersistenceRecord>;
  readonly setOutputTarget: (
    operation: SetPresenterOutputTargetPersistenceOperation
  ) => Promise<PresenterOutputTargetPersistenceRecord>;
}

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

const addTenantMismatchIssue = (
  recordTenantId: string,
  operationTenantId: string,
  context: z.RefinementCtx
): void => {
  if (recordTenantId !== operationTenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Presenter persistence record tenant must match operation tenant.",
      path: ["input", "tenantId"]
    });
  }
};
