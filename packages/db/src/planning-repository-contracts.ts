import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema,
  type RepositoryReadOptions,
  type RepositoryWriteOptions
} from "./repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningServicePersistenceStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "canceled"
]);

export const PlanningServiceItemPersistenceTypeSchema = z.enum([
  "song",
  "scripture",
  "prayer",
  "announcement",
  "message",
  "media",
  "other"
]);

export const PlanningAssignmentPersistenceStatusSchema = z.enum([
  "pending",
  "confirmed",
  "declined"
]);

export const PlanningReadinessPersistenceBandSchema = z.enum([
  "blocked",
  "needs-attention",
  "ready"
]);

export const PlanningPersistenceConfirmationIntentSchema = z.object({
  confirmed: z.literal(true),
  reason: NonEmptyStringSchema
});

export const PlanningServicePersistenceRecordSchema = z.object({
  serviceId: NonEmptyStringSchema,
  serviceTypeId: NonEmptyStringSchema,
  startsAt: z.string().datetime().optional(),
  status: PlanningServicePersistenceStatusSchema,
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningServiceTemplatePersistenceRecordSchema = z.object({
  description: OptionalNonEmptyStringSchema,
  serviceTemplateId: NonEmptyStringSchema,
  serviceTypeId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningServiceItemPersistenceRecordSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  notes: OptionalNonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  serviceItemId: NonEmptyStringSchema,
  songId: OptionalNonEmptyStringSchema,
  sortOrder: z.number().int().nonnegative(),
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  type: PlanningServiceItemPersistenceTypeSchema
});

export const PlanningAssignmentPersistenceRecordSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  personId: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  status: PlanningAssignmentPersistenceStatusSchema,
  tenantId: NonEmptyStringSchema
});

export const PlanningReadinessPersistenceCheckSchema = z.object({
  code: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  maxScore: z.number().int().positive(),
  score: z.number().int().nonnegative()
});

export const PlanningReadinessPersistenceRecordSchema = z.object({
  band: PlanningReadinessPersistenceBandSchema,
  checks: z.array(PlanningReadinessPersistenceCheckSchema),
  readinessScore: z.number().int().min(0).max(100),
  recommendedActions: z.array(NonEmptyStringSchema),
  risks: z.array(NonEmptyStringSchema),
  serviceId: NonEmptyStringSchema,
  strengths: z.array(NonEmptyStringSchema),
  tenantId: NonEmptyStringSchema
});

export const PlanningServicesPersistenceFilterInputSchema = z.object({
  serviceTypeId: OptionalNonEmptyStringSchema,
  startsAtOrAfter: z.string().datetime().optional(),
  startsBefore: z.string().datetime().optional(),
  status: PlanningServicePersistenceStatusSchema.optional()
});

export const ListPlanningServicesPersistenceInputSchema = z.object({
  filter: PlanningServicesPersistenceFilterInputSchema.optional()
});

export const GetPlanningServicePersistenceInputSchema = z.object({
  serviceId: NonEmptyStringSchema
});

export const ListPlanningServiceTemplatesPersistenceInputSchema = z.object({
  serviceTypeId: NonEmptyStringSchema
});

export const ListPlanningServiceAssignmentsPersistenceInputSchema = z.object({
  serviceId: NonEmptyStringSchema
});

export const GetPlanningServiceReadinessPersistenceInputSchema = z.object({
  serviceId: NonEmptyStringSchema
});

export const CreatePlanningServicePersistenceInputSchema = z.object({
  serviceTypeId: NonEmptyStringSchema,
  startsAt: z.string().datetime().optional(),
  title: NonEmptyStringSchema
});

export const UpdatePlanningServicePersistenceInputSchema = z.object({
  confirmationIntent: PlanningPersistenceConfirmationIntentSchema.optional(),
  serviceId: NonEmptyStringSchema,
  serviceTypeId: OptionalNonEmptyStringSchema,
  startsAt: z.string().datetime().optional(),
  status: PlanningServicePersistenceStatusSchema.optional(),
  title: OptionalNonEmptyStringSchema
});

export const AddPlanningServiceItemPersistenceInputSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  notes: OptionalNonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  songId: OptionalNonEmptyStringSchema,
  title: NonEmptyStringSchema,
  type: PlanningServiceItemPersistenceTypeSchema
});

export const UpdatePlanningServiceItemPersistenceInputSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  notes: OptionalNonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  serviceItemId: NonEmptyStringSchema,
  songId: OptionalNonEmptyStringSchema,
  title: OptionalNonEmptyStringSchema,
  type: PlanningServiceItemPersistenceTypeSchema.optional()
});

export const ReorderPlanningServiceItemsPersistenceInputSchema = z.object({
  orderedServiceItemIds: z.array(NonEmptyStringSchema).min(1),
  serviceId: NonEmptyStringSchema
});

export const AssignPlanningVolunteerPersistenceInputSchema = z.object({
  personId: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema,
  serviceId: NonEmptyStringSchema
});

export const UpdatePlanningAssignmentStatusPersistenceInputSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  status: PlanningAssignmentPersistenceStatusSchema
});

export const CreatePlanningServicePersistenceOperationSchema = z.object({
  input: CreatePlanningServicePersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const UpdatePlanningServicePersistenceOperationSchema = z.object({
  input: UpdatePlanningServicePersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const AddPlanningServiceItemPersistenceOperationSchema = z.object({
  input: AddPlanningServiceItemPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const UpdatePlanningServiceItemPersistenceOperationSchema = z.object({
  input: UpdatePlanningServiceItemPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const ReorderPlanningServiceItemsPersistenceOperationSchema = z.object({
  input: ReorderPlanningServiceItemsPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const AssignPlanningVolunteerPersistenceOperationSchema = z.object({
  input: AssignPlanningVolunteerPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const UpdatePlanningAssignmentStatusPersistenceOperationSchema = z.object({
  input: UpdatePlanningAssignmentStatusPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const ListPlanningServicesPersistenceOperationSchema = z.object({
  input: ListPlanningServicesPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const GetPlanningServicePersistenceOperationSchema = z.object({
  input: GetPlanningServicePersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPlanningServiceTemplatesPersistenceOperationSchema = z.object({
  input: ListPlanningServiceTemplatesPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPlanningServiceAssignmentsPersistenceOperationSchema = z.object({
  input: ListPlanningServiceAssignmentsPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const GetPlanningServiceReadinessPersistenceOperationSchema = z.object({
  input: GetPlanningServiceReadinessPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export type PlanningServicePersistenceStatus = z.infer<
  typeof PlanningServicePersistenceStatusSchema
>;
export type PlanningServiceItemPersistenceType = z.infer<
  typeof PlanningServiceItemPersistenceTypeSchema
>;
export type PlanningAssignmentPersistenceStatus = z.infer<
  typeof PlanningAssignmentPersistenceStatusSchema
>;
export type PlanningReadinessPersistenceBand = z.infer<
  typeof PlanningReadinessPersistenceBandSchema
>;
export type PlanningPersistenceConfirmationIntent = z.infer<
  typeof PlanningPersistenceConfirmationIntentSchema
>;
export type PlanningServicePersistenceRecord = z.infer<
  typeof PlanningServicePersistenceRecordSchema
>;
export type PlanningServiceTemplatePersistenceRecord = z.infer<
  typeof PlanningServiceTemplatePersistenceRecordSchema
>;
export type PlanningServiceItemPersistenceRecord = z.infer<
  typeof PlanningServiceItemPersistenceRecordSchema
>;
export type PlanningAssignmentPersistenceRecord = z.infer<
  typeof PlanningAssignmentPersistenceRecordSchema
>;
export type PlanningReadinessPersistenceCheck = z.infer<
  typeof PlanningReadinessPersistenceCheckSchema
>;
export type PlanningReadinessPersistenceRecord = z.infer<
  typeof PlanningReadinessPersistenceRecordSchema
>;
export type PlanningServicesPersistenceFilterInput = z.infer<
  typeof PlanningServicesPersistenceFilterInputSchema
>;
export type ListPlanningServicesPersistenceInput = z.infer<
  typeof ListPlanningServicesPersistenceInputSchema
>;
export type GetPlanningServicePersistenceInput = z.infer<
  typeof GetPlanningServicePersistenceInputSchema
>;
export type ListPlanningServiceTemplatesPersistenceInput = z.infer<
  typeof ListPlanningServiceTemplatesPersistenceInputSchema
>;
export type ListPlanningServiceAssignmentsPersistenceInput = z.infer<
  typeof ListPlanningServiceAssignmentsPersistenceInputSchema
>;
export type GetPlanningServiceReadinessPersistenceInput = z.infer<
  typeof GetPlanningServiceReadinessPersistenceInputSchema
>;
export type CreatePlanningServicePersistenceInput = z.infer<
  typeof CreatePlanningServicePersistenceInputSchema
>;
export type UpdatePlanningServicePersistenceInput = z.infer<
  typeof UpdatePlanningServicePersistenceInputSchema
>;
export type AddPlanningServiceItemPersistenceInput = z.infer<
  typeof AddPlanningServiceItemPersistenceInputSchema
>;
export type UpdatePlanningServiceItemPersistenceInput = z.infer<
  typeof UpdatePlanningServiceItemPersistenceInputSchema
>;
export type ReorderPlanningServiceItemsPersistenceInput = z.infer<
  typeof ReorderPlanningServiceItemsPersistenceInputSchema
>;
export type AssignPlanningVolunteerPersistenceInput = z.infer<
  typeof AssignPlanningVolunteerPersistenceInputSchema
>;
export type UpdatePlanningAssignmentStatusPersistenceInput = z.infer<
  typeof UpdatePlanningAssignmentStatusPersistenceInputSchema
>;

export interface PlanningPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: RepositoryWriteOptions;
}

export interface PlanningReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: RepositoryReadOptions;
}

export type CreatePlanningServicePersistenceOperation =
  PlanningPersistenceOperation<CreatePlanningServicePersistenceInput>;
export type UpdatePlanningServicePersistenceOperation =
  PlanningPersistenceOperation<UpdatePlanningServicePersistenceInput>;
export type AddPlanningServiceItemPersistenceOperation =
  PlanningPersistenceOperation<AddPlanningServiceItemPersistenceInput>;
export type UpdatePlanningServiceItemPersistenceOperation =
  PlanningPersistenceOperation<UpdatePlanningServiceItemPersistenceInput>;
export type ReorderPlanningServiceItemsPersistenceOperation =
  PlanningPersistenceOperation<ReorderPlanningServiceItemsPersistenceInput>;
export type AssignPlanningVolunteerPersistenceOperation =
  PlanningPersistenceOperation<AssignPlanningVolunteerPersistenceInput>;
export type UpdatePlanningAssignmentStatusPersistenceOperation =
  PlanningPersistenceOperation<UpdatePlanningAssignmentStatusPersistenceInput>;
export type ListPlanningServicesPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServicesPersistenceInput>;
export type GetPlanningServicePersistenceOperation =
  PlanningReadPersistenceOperation<GetPlanningServicePersistenceInput>;
export type ListPlanningServiceTemplatesPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServiceTemplatesPersistenceInput>;
export type ListPlanningServiceAssignmentsPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServiceAssignmentsPersistenceInput>;
export type GetPlanningServiceReadinessPersistenceOperation =
  PlanningReadPersistenceOperation<GetPlanningServiceReadinessPersistenceInput>;

export interface PlanningServiceCommandPersistenceRepository {
  readonly createService: (
    operation: CreatePlanningServicePersistenceOperation
  ) => Promise<PlanningServicePersistenceRecord>;
  readonly updateService: (
    operation: UpdatePlanningServicePersistenceOperation
  ) => Promise<PlanningServicePersistenceRecord>;
  readonly addServiceItem: (
    operation: AddPlanningServiceItemPersistenceOperation
  ) => Promise<PlanningServiceItemPersistenceRecord>;
  readonly updateServiceItem: (
    operation: UpdatePlanningServiceItemPersistenceOperation
  ) => Promise<PlanningServiceItemPersistenceRecord>;
  readonly reorderServiceItems: (
    operation: ReorderPlanningServiceItemsPersistenceOperation
  ) => Promise<readonly PlanningServiceItemPersistenceRecord[]>;
  readonly assignVolunteer: (
    operation: AssignPlanningVolunteerPersistenceOperation
  ) => Promise<PlanningAssignmentPersistenceRecord>;
  readonly updateAssignmentStatus: (
    operation: UpdatePlanningAssignmentStatusPersistenceOperation
  ) => Promise<PlanningAssignmentPersistenceRecord>;
}

export interface PlanningServiceQueryPersistenceRepository {
  readonly listServices: (
    operation: ListPlanningServicesPersistenceOperation
  ) => Promise<readonly PlanningServicePersistenceRecord[]>;
  readonly getService: (
    operation: GetPlanningServicePersistenceOperation
  ) => Promise<PlanningServicePersistenceRecord | null>;
  readonly listServiceTemplates: (
    operation: ListPlanningServiceTemplatesPersistenceOperation
  ) => Promise<readonly PlanningServiceTemplatePersistenceRecord[]>;
  readonly listServiceAssignments: (
    operation: ListPlanningServiceAssignmentsPersistenceOperation
  ) => Promise<readonly PlanningAssignmentPersistenceRecord[]>;
  readonly getServiceReadiness: (
    operation: GetPlanningServiceReadinessPersistenceOperation
  ) => Promise<PlanningReadinessPersistenceRecord | null>;
}
