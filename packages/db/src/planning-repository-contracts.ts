import { z } from "zod";
import { RepositoryWriteOptionsSchema, type RepositoryWriteOptions } from "./repository-contracts.js";

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

export type PlanningServicePersistenceStatus = z.infer<
  typeof PlanningServicePersistenceStatusSchema
>;
export type PlanningServiceItemPersistenceType = z.infer<
  typeof PlanningServiceItemPersistenceTypeSchema
>;
export type PlanningAssignmentPersistenceStatus = z.infer<
  typeof PlanningAssignmentPersistenceStatusSchema
>;
export type PlanningPersistenceConfirmationIntent = z.infer<
  typeof PlanningPersistenceConfirmationIntentSchema
>;
export type PlanningServicePersistenceRecord = z.infer<
  typeof PlanningServicePersistenceRecordSchema
>;
export type PlanningServiceItemPersistenceRecord = z.infer<
  typeof PlanningServiceItemPersistenceRecordSchema
>;
export type PlanningAssignmentPersistenceRecord = z.infer<
  typeof PlanningAssignmentPersistenceRecordSchema
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
