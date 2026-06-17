import { z } from "zod";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";
import {
  PresenterOutputStateSchema,
  PresenterSlideGroupSchema,
  PresenterSlideSchema,
  type PresenterOutputState,
  type PresenterPresentation,
  type PresenterSlide,
  type PresenterSlideGroup,
  type PresenterStyleTemplate
} from "../../domain/index.js";

const NonEmptyStringSchema = z.string().min(1);

export const PresenterReadRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
]);

export const PresenterWriteRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export const PresenterServiceOperationContextSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

export const PresenterMutationIntentSchema = z.enum([
  "create",
  "update",
  "destructive-confirmed"
]);

export const PresenterServiceIdInputSchema = z
  .object({
    serviceId: NonEmptyStringSchema
  })
  .strict();

export const PresenterPresentationIdInputSchema = z
  .object({
    presentationId: NonEmptyStringSchema
  })
  .strict();

export const GetPresentationForServiceQuerySchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterServiceIdInputSchema
  }).strict();

export const GetPresentationQuerySchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterPresentationIdInputSchema
  }).strict();

export const ListPresenterStyleTemplatesQuerySchema =
  PresenterServiceOperationContextSchema.extend({
    input: z
      .object({
        serviceTypeId: NonEmptyStringSchema.optional()
      })
      .strict()
      .default({})
  }).strict();

export const GetPresenterOutputStateQuerySchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterPresentationIdInputSchema
  }).strict();

export const CreatePresentationFromServiceCommandSchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterServiceIdInputSchema.extend({
      styleTemplateId: NonEmptyStringSchema.optional(),
      title: NonEmptyStringSchema.optional()
    }).strict(),
    intent: z.literal("create")
  }).strict();

export const UpdateSlideGroupCommandSchema =
  PresenterServiceOperationContextSchema.extend({
    input: z
      .object({
        presentationId: NonEmptyStringSchema,
        slideGroup: PresenterSlideGroupSchema
      })
      .strict(),
    intent: z.literal("update")
  }).strict();

export const UpdateSlideCommandSchema = PresenterServiceOperationContextSchema.extend({
  input: z
    .object({
      presentationId: NonEmptyStringSchema,
      slide: PresenterSlideSchema,
      slideGroupId: NonEmptyStringSchema
    })
    .strict(),
  intent: z.literal("update")
}).strict();

export const ReorderSlidesCommandSchema = PresenterServiceOperationContextSchema.extend({
  input: z
    .object({
      orderedSlideIds: z.array(NonEmptyStringSchema).min(1),
      presentationId: NonEmptyStringSchema,
      slideGroupId: NonEmptyStringSchema
    })
    .strict(),
  intent: z.literal("update")
}).strict();

export const ApplyPresenterStyleTemplateCommandSchema =
  PresenterServiceOperationContextSchema.extend({
    input: z
      .object({
        presentationId: NonEmptyStringSchema,
        styleTemplateId: NonEmptyStringSchema
      })
      .strict(),
    intent: z.literal("update")
  }).strict();

export const SetPresenterOutputStateCommandSchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterOutputStateSchema,
    intent: z.literal("update")
  }).strict();

export const DeletePresentationCommandSchema =
  PresenterServiceOperationContextSchema.extend({
    input: PresenterPresentationIdInputSchema.extend({
      confirmationReason: NonEmptyStringSchema
    }).strict(),
    intent: z.literal("destructive-confirmed")
  }).strict();

export const PresenterCommandSchema = z.discriminatedUnion("commandName", [
  z
    .object({
      commandName: z.literal("createPresentationFromService"),
      operation: CreatePresentationFromServiceCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("updateSlideGroup"),
      operation: UpdateSlideGroupCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("updateSlide"),
      operation: UpdateSlideCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("reorderSlides"),
      operation: ReorderSlidesCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("applyPresenterStyleTemplate"),
      operation: ApplyPresenterStyleTemplateCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("setPresenterOutputState"),
      operation: SetPresenterOutputStateCommandSchema
    })
    .strict(),
  z
    .object({
      commandName: z.literal("deletePresentation"),
      operation: DeletePresentationCommandSchema
    })
    .strict()
]);

export type PresenterServiceOperationContext = z.infer<
  typeof PresenterServiceOperationContextSchema
>;
export type PresenterMutationIntent = z.infer<typeof PresenterMutationIntentSchema>;
export type GetPresentationForServiceQuery = z.infer<
  typeof GetPresentationForServiceQuerySchema
>;
export type GetPresentationQuery = z.infer<typeof GetPresentationQuerySchema>;
export type ListPresenterStyleTemplatesQuery = z.infer<
  typeof ListPresenterStyleTemplatesQuerySchema
>;
export type GetPresenterOutputStateQuery = z.infer<
  typeof GetPresenterOutputStateQuerySchema
>;
export type CreatePresentationFromServiceCommand = z.infer<
  typeof CreatePresentationFromServiceCommandSchema
>;
export type UpdateSlideGroupCommand = z.infer<typeof UpdateSlideGroupCommandSchema>;
export type UpdateSlideCommand = z.infer<typeof UpdateSlideCommandSchema>;
export type ReorderSlidesCommand = z.infer<typeof ReorderSlidesCommandSchema>;
export type ApplyPresenterStyleTemplateCommand = z.infer<
  typeof ApplyPresenterStyleTemplateCommandSchema
>;
export type SetPresenterOutputStateCommand = z.infer<
  typeof SetPresenterOutputStateCommandSchema
>;
export type DeletePresentationCommand = z.infer<
  typeof DeletePresentationCommandSchema
>;
export type PresenterCommand = z.infer<typeof PresenterCommandSchema>;

export interface PresenterQueryService {
  readonly getPresentation: (
    query: GetPresentationQuery
  ) => Promise<PresenterPresentation | null>;
  readonly getPresentationForService: (
    query: GetPresentationForServiceQuery
  ) => Promise<PresenterPresentation | null>;
  readonly getPresenterOutputState: (
    query: GetPresenterOutputStateQuery
  ) => Promise<PresenterOutputState | null>;
  readonly listPresenterStyleTemplates: (
    query: ListPresenterStyleTemplatesQuery
  ) => Promise<readonly PresenterStyleTemplate[]>;
}

export interface PresenterCommandService {
  readonly applyPresenterStyleTemplate: (
    command: ApplyPresenterStyleTemplateCommand
  ) => Promise<PresenterPresentation>;
  readonly createPresentationFromService: (
    command: CreatePresentationFromServiceCommand
  ) => Promise<PresenterPresentation>;
  readonly deletePresentation: (
    command: DeletePresentationCommand
  ) => Promise<{ readonly presentationId: string }>;
  readonly reorderSlides: (
    command: ReorderSlidesCommand
  ) => Promise<PresenterPresentation>;
  readonly setPresenterOutputState: (
    command: SetPresenterOutputStateCommand
  ) => Promise<PresenterOutputState>;
  readonly updateSlide: (command: UpdateSlideCommand) => Promise<PresenterSlide>;
  readonly updateSlideGroup: (
    command: UpdateSlideGroupCommand
  ) => Promise<PresenterSlideGroup>;
}
