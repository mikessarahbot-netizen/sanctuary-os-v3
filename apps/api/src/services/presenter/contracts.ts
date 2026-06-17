import { z } from "zod";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import {
  MediaCueSchema,
  OutputTargetSchema,
  PresentationSchema,
  PresenterServiceIdSchema,
  PresenterThemeSchema,
  ScripturePassageSchema,
  SlideSchema,
  type MediaCue,
  type OutputTarget,
  type Presentation,
  type PresenterTheme,
  type ScripturePassage,
  type Slide
} from "../../domain/presenter/index.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

const PresenterServiceRequestSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

export const PresenterPresentationFilterSchema = z
  .object({
    serviceId: PresenterServiceIdSchema.optional()
  })
  .strict();

export const ListPresenterPresentationsQuerySchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      filter: PresenterPresentationFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetPresenterPresentationQuerySchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const GetPresenterPresentationForServiceQuerySchema =
  PresenterServiceRequestSchema.extend({
    input: z
      .object({
        serviceId: PresenterServiceIdSchema
      })
      .strict()
  }).strict();

export const ListPresenterThemesQuerySchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      filter: z
        .object({
          query: OptionalNonEmptyStringSchema
        })
        .strict()
        .optional()
    })
    .strict()
}).strict();

export const ListPresenterOutputTargetsQuerySchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema.optional()
    })
    .strict()
}).strict();

export const CreatePresentationFromServiceCommandSchema =
  PresenterServiceRequestSchema.extend({
    input: z
      .object({
        serviceId: PresenterServiceIdSchema,
        title: OptionalNonEmptyStringSchema
      })
      .strict()
  }).strict();

export const UpdatePresentationCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema,
      serviceId: PresenterServiceIdSchema.optional(),
      title: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const AddPresenterSlideCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      afterSlideId: NonEmptyStringSchema.optional(),
      presentationId: NonEmptyStringSchema,
      slide: SlideSchema.omit({
        order: true,
        presentationId: true,
        slideId: true,
        tenantId: true
      }).strict()
    })
    .strict()
}).strict();

export const UpdatePresenterSlideCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema,
      slide: SlideSchema
    })
    .strict()
}).strict();

export const ReorderPresenterSlidesCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
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
    })
}).strict();

export const RemovePresenterSlideCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      confirmationIntent: z
        .object({
          confirmed: z.literal(true),
          reason: NonEmptyStringSchema
        })
        .strict(),
      presentationId: NonEmptyStringSchema,
      slideId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ApplyPresenterThemeCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema,
      themeId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SetPresenterOutputTargetCommandSchema = PresenterServiceRequestSchema.extend({
  input: z
    .object({
      outputTarget: OutputTargetSchema,
      presentationId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export type ListPresenterPresentationsQuery = z.infer<
  typeof ListPresenterPresentationsQuerySchema
>;
export type GetPresenterPresentationQuery = z.infer<
  typeof GetPresenterPresentationQuerySchema
>;
export type GetPresenterPresentationForServiceQuery = z.infer<
  typeof GetPresenterPresentationForServiceQuerySchema
>;
export type ListPresenterThemesQuery = z.infer<typeof ListPresenterThemesQuerySchema>;
export type ListPresenterOutputTargetsQuery = z.infer<
  typeof ListPresenterOutputTargetsQuerySchema
>;
export type CreatePresentationFromServiceCommand = z.infer<
  typeof CreatePresentationFromServiceCommandSchema
>;
export type UpdatePresentationCommand = z.infer<typeof UpdatePresentationCommandSchema>;
export type AddPresenterSlideCommand = z.infer<typeof AddPresenterSlideCommandSchema>;
export type UpdatePresenterSlideCommand = z.infer<typeof UpdatePresenterSlideCommandSchema>;
export type ReorderPresenterSlidesCommand = z.infer<
  typeof ReorderPresenterSlidesCommandSchema
>;
export type RemovePresenterSlideCommand = z.infer<typeof RemovePresenterSlideCommandSchema>;
export type ApplyPresenterThemeCommand = z.infer<typeof ApplyPresenterThemeCommandSchema>;
export type SetPresenterOutputTargetCommand = z.infer<
  typeof SetPresenterOutputTargetCommandSchema
>;

export interface PresenterQueryService {
  readonly presentations: (
    query: ListPresenterPresentationsQuery
  ) => Promise<readonly Presentation[]>;
  readonly presentation: (
    query: GetPresenterPresentationQuery
  ) => Promise<Presentation | null>;
  readonly presentationForService: (
    query: GetPresenterPresentationForServiceQuery
  ) => Promise<Presentation | null>;
  readonly presenterThemes: (
    query: ListPresenterThemesQuery
  ) => Promise<readonly PresenterTheme[]>;
  readonly outputTargets: (
    query: ListPresenterOutputTargetsQuery
  ) => Promise<readonly OutputTarget[]>;
}

export interface PresenterCommandService {
  readonly createPresentationFromService: (
    command: CreatePresentationFromServiceCommand
  ) => Promise<Presentation>;
  readonly updatePresentation: (
    command: UpdatePresentationCommand
  ) => Promise<Presentation>;
  readonly addSlide: (command: AddPresenterSlideCommand) => Promise<Slide>;
  readonly updateSlide: (command: UpdatePresenterSlideCommand) => Promise<Slide>;
  readonly reorderSlides: (
    command: ReorderPresenterSlidesCommand
  ) => Promise<readonly Slide[]>;
  readonly removeSlide: (command: RemovePresenterSlideCommand) => Promise<Presentation>;
  readonly applyPresenterTheme: (
    command: ApplyPresenterThemeCommand
  ) => Promise<Presentation>;
  readonly setOutputTarget: (
    command: SetPresenterOutputTargetCommand
  ) => Promise<OutputTarget>;
}

export interface PresenterContractRecords {
  readonly mediaCue: MediaCue;
  readonly outputTarget: OutputTarget;
  readonly presentation: Presentation;
  readonly scripturePassage: ScripturePassage;
  readonly slide: Slide;
  readonly theme: PresenterTheme;
}

export const PresenterContractRecordSchemas = {
  mediaCue: MediaCueSchema,
  outputTarget: OutputTargetSchema,
  presentation: PresentationSchema,
  scripturePassage: ScripturePassageSchema,
  slide: SlideSchema,
  theme: PresenterThemeSchema
} as const;
