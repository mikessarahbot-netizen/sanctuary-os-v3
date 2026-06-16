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

export const PlanningSongEnergyPersistenceSchema = z.enum(["low", "medium", "high"]);

export const PlanningCcliUsageTypePersistenceSchema = z.enum([
  "service",
  "rehearsal",
  "livestream"
]);

export const PlanningCcliUsageReportingStatusPersistenceSchema = z.enum([
  "pending",
  "reported",
  "skipped"
]);

export const PlanningRehearsalAssetTypePersistenceSchema = z.enum([
  "chart",
  "audio",
  "video",
  "document",
  "other"
]);

export const PlanningRehearsalReadinessSignalPersistenceSchema = z.enum([
  "ready",
  "needs-practice",
  "blocked"
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

export const PlanningSongLibraryItemPersistenceRecordSchema = z.object({
  artist: OptionalNonEmptyStringSchema,
  availableKeys: z.array(NonEmptyStringSchema),
  ccliReportingAllowed: z.boolean(),
  ccliSongNumber: OptionalNonEmptyStringSchema,
  defaultKey: OptionalNonEmptyStringSchema,
  energy: PlanningSongEnergyPersistenceSchema.optional(),
  hasArrangements: z.boolean(),
  hasCharts: z.boolean(),
  isBannedOrPaused: z.boolean(),
  lastUsedAt: z.string().datetime().optional(),
  songId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema,
  tempoBpm: z.number().int().positive().optional(),
  title: NonEmptyStringSchema,
  usageCount: z.number().int().nonnegative()
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

export const PlanningCcliUsageLogPersistenceRecordSchema = z
  .object({
    ccliSongNumber: OptionalNonEmptyStringSchema,
    ccliUsageLogId: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    reportingStatus: PlanningCcliUsageReportingStatusPersistenceSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema,
    songId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    usageType: PlanningCcliUsageTypePersistenceSchema,
    usedAt: z.string().datetime()
  })
  .strict();

export const PlanningRehearsalAssetVisibilityPersistenceRecordSchema = z
  .object({
    assetId: NonEmptyStringSchema,
    assetType: PlanningRehearsalAssetTypePersistenceSchema,
    isVisible: z.boolean(),
    rehearsalAssetVisibilityId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    updatedAt: z.string().datetime(),
    visibleToRoleIds: z.array(NonEmptyStringSchema).min(1)
  })
  .strict();

export const PlanningRehearsalAcknowledgementPersistenceRecordSchema = z
  .object({
    acknowledgedAt: z.string().datetime(),
    assetId: NonEmptyStringSchema,
    assignmentId: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    personId: NonEmptyStringSchema,
    readinessSignal: PlanningRehearsalReadinessSignalPersistenceSchema,
    rehearsalAcknowledgementId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

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

export const PlanningSongLibrarySearchPersistenceInputSchema = z
  .object({
    includeBannedOrPaused: z.boolean().optional(),
    key: OptionalNonEmptyStringSchema,
    limit: z.number().int().min(1).max(50).optional(),
    query: OptionalNonEmptyStringSchema,
    serviceTypeId: OptionalNonEmptyStringSchema
  })
  .superRefine((input, context) => {
    if (
      input.query === undefined &&
      input.serviceTypeId === undefined &&
      input.key === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Song library search requires query, serviceTypeId, or key.",
        path: ["query"]
      });
    }
  });

export const ListPlanningSongLibraryPersistenceInputSchema = z.object({
  searchInput: PlanningSongLibrarySearchPersistenceInputSchema
});

export const ListPlanningServiceAssignmentsPersistenceInputSchema = z.object({
  serviceId: NonEmptyStringSchema
});

export const GetPlanningServiceReadinessPersistenceInputSchema = z.object({
  serviceId: NonEmptyStringSchema
});

export const ListPlanningCcliUsageLogsPersistenceInputSchema = z
  .object({
    reportingStatus: PlanningCcliUsageReportingStatusPersistenceSchema.optional(),
    serviceId: NonEmptyStringSchema
  })
  .strict();

export const ListPlanningRehearsalAssetVisibilityPersistenceInputSchema = z
  .object({
    serviceId: NonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema
  })
  .strict();

export const ListPlanningRehearsalAcknowledgementsPersistenceInputSchema = z
  .object({
    assetId: OptionalNonEmptyStringSchema,
    assignmentId: OptionalNonEmptyStringSchema,
    personId: OptionalNonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema
  })
  .strict();

export const CreatePlanningServicePersistenceInputSchema = z.object({
  serviceTypeId: NonEmptyStringSchema,
  startsAt: z.string().datetime().optional(),
  title: NonEmptyStringSchema
});

export const DuplicatePlanningServiceFromTemplatePersistenceInputSchema = z.object({
  serviceTemplateId: NonEmptyStringSchema,
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

export const RecordPlanningCcliUsagePersistenceInputSchema = z
  .object({
    ccliSongNumber: OptionalNonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: OptionalNonEmptyStringSchema,
    songId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    usageType: PlanningCcliUsageTypePersistenceSchema,
    usedAt: z.string().datetime()
  })
  .strict();

export const SetPlanningRehearsalAssetVisibilityPersistenceInputSchema = z
  .object({
    assetId: NonEmptyStringSchema,
    assetType: PlanningRehearsalAssetTypePersistenceSchema,
    isVisible: z.boolean(),
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    updatedAt: z.string().datetime(),
    visibleToRoleIds: z.array(NonEmptyStringSchema).min(1)
  })
  .strict();

export const RecordPlanningRehearsalAcknowledgementPersistenceInputSchema = z
  .object({
    acknowledgedAt: z.string().datetime(),
    assetId: NonEmptyStringSchema,
    assignmentId: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    personId: NonEmptyStringSchema,
    readinessSignal: PlanningRehearsalReadinessSignalPersistenceSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema
  })
  .strict();

export const CreatePlanningServicePersistenceOperationSchema = z.object({
  input: CreatePlanningServicePersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const DuplicatePlanningServiceFromTemplatePersistenceOperationSchema = z.object({
  input: DuplicatePlanningServiceFromTemplatePersistenceInputSchema,
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

export const RecordPlanningCcliUsagePersistenceOperationSchema = z.object({
  input: RecordPlanningCcliUsagePersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema = z.object({
  input: SetPlanningRehearsalAssetVisibilityPersistenceInputSchema,
  options: RepositoryWriteOptionsSchema
});

export const RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema =
  z.object({
    input: RecordPlanningRehearsalAcknowledgementPersistenceInputSchema,
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

export const ListPlanningSongLibraryPersistenceOperationSchema = z.object({
  input: ListPlanningSongLibraryPersistenceInputSchema,
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

export const ListPlanningCcliUsageLogsPersistenceOperationSchema = z.object({
  input: ListPlanningCcliUsageLogsPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema = z.object({
  input: ListPlanningRehearsalAssetVisibilityPersistenceInputSchema,
  options: RepositoryReadOptionsSchema
});

export const ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema =
  z.object({
    input: ListPlanningRehearsalAcknowledgementsPersistenceInputSchema,
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
export type PlanningSongEnergyPersistence = z.infer<
  typeof PlanningSongEnergyPersistenceSchema
>;
export type PlanningCcliUsageTypePersistence = z.infer<
  typeof PlanningCcliUsageTypePersistenceSchema
>;
export type PlanningCcliUsageReportingStatusPersistence = z.infer<
  typeof PlanningCcliUsageReportingStatusPersistenceSchema
>;
export type PlanningRehearsalAssetTypePersistence = z.infer<
  typeof PlanningRehearsalAssetTypePersistenceSchema
>;
export type PlanningRehearsalReadinessSignalPersistence = z.infer<
  typeof PlanningRehearsalReadinessSignalPersistenceSchema
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
export type PlanningSongLibraryItemPersistenceRecord = z.infer<
  typeof PlanningSongLibraryItemPersistenceRecordSchema
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
export type PlanningCcliUsageLogPersistenceRecord = z.infer<
  typeof PlanningCcliUsageLogPersistenceRecordSchema
>;
export type PlanningRehearsalAssetVisibilityPersistenceRecord = z.infer<
  typeof PlanningRehearsalAssetVisibilityPersistenceRecordSchema
>;
export type PlanningRehearsalAcknowledgementPersistenceRecord = z.infer<
  typeof PlanningRehearsalAcknowledgementPersistenceRecordSchema
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
export type PlanningSongLibrarySearchPersistenceInput = z.infer<
  typeof PlanningSongLibrarySearchPersistenceInputSchema
>;
export type ListPlanningSongLibraryPersistenceInput = z.infer<
  typeof ListPlanningSongLibraryPersistenceInputSchema
>;
export type ListPlanningServiceAssignmentsPersistenceInput = z.infer<
  typeof ListPlanningServiceAssignmentsPersistenceInputSchema
>;
export type GetPlanningServiceReadinessPersistenceInput = z.infer<
  typeof GetPlanningServiceReadinessPersistenceInputSchema
>;
export type ListPlanningCcliUsageLogsPersistenceInput = z.infer<
  typeof ListPlanningCcliUsageLogsPersistenceInputSchema
>;
export type ListPlanningRehearsalAssetVisibilityPersistenceInput = z.infer<
  typeof ListPlanningRehearsalAssetVisibilityPersistenceInputSchema
>;
export type ListPlanningRehearsalAcknowledgementsPersistenceInput = z.infer<
  typeof ListPlanningRehearsalAcknowledgementsPersistenceInputSchema
>;
export type CreatePlanningServicePersistenceInput = z.infer<
  typeof CreatePlanningServicePersistenceInputSchema
>;
export type DuplicatePlanningServiceFromTemplatePersistenceInput = z.infer<
  typeof DuplicatePlanningServiceFromTemplatePersistenceInputSchema
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
export type RecordPlanningCcliUsagePersistenceInput = z.infer<
  typeof RecordPlanningCcliUsagePersistenceInputSchema
>;
export type SetPlanningRehearsalAssetVisibilityPersistenceInput = z.infer<
  typeof SetPlanningRehearsalAssetVisibilityPersistenceInputSchema
>;
export type RecordPlanningRehearsalAcknowledgementPersistenceInput = z.infer<
  typeof RecordPlanningRehearsalAcknowledgementPersistenceInputSchema
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
export type DuplicatePlanningServiceFromTemplatePersistenceOperation =
  PlanningPersistenceOperation<DuplicatePlanningServiceFromTemplatePersistenceInput>;
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
export type RecordPlanningCcliUsagePersistenceOperation =
  PlanningPersistenceOperation<RecordPlanningCcliUsagePersistenceInput>;
export type SetPlanningRehearsalAssetVisibilityPersistenceOperation =
  PlanningPersistenceOperation<SetPlanningRehearsalAssetVisibilityPersistenceInput>;
export type RecordPlanningRehearsalAcknowledgementPersistenceOperation =
  PlanningPersistenceOperation<RecordPlanningRehearsalAcknowledgementPersistenceInput>;
export type ListPlanningServicesPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServicesPersistenceInput>;
export type GetPlanningServicePersistenceOperation =
  PlanningReadPersistenceOperation<GetPlanningServicePersistenceInput>;
export type ListPlanningServiceTemplatesPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServiceTemplatesPersistenceInput>;
export type ListPlanningSongLibraryPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningSongLibraryPersistenceInput>;
export type ListPlanningServiceAssignmentsPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningServiceAssignmentsPersistenceInput>;
export type GetPlanningServiceReadinessPersistenceOperation =
  PlanningReadPersistenceOperation<GetPlanningServiceReadinessPersistenceInput>;
export type ListPlanningCcliUsageLogsPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningCcliUsageLogsPersistenceInput>;
export type ListPlanningRehearsalAssetVisibilityPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningRehearsalAssetVisibilityPersistenceInput>;
export type ListPlanningRehearsalAcknowledgementsPersistenceOperation =
  PlanningReadPersistenceOperation<ListPlanningRehearsalAcknowledgementsPersistenceInput>;

export interface PlanningCcliUsageLogPersistenceRepository {
  readonly recordCcliUsage: (
    operation: RecordPlanningCcliUsagePersistenceOperation
  ) => Promise<PlanningCcliUsageLogPersistenceRecord>;
  readonly listCcliUsageLogs: (
    operation: ListPlanningCcliUsageLogsPersistenceOperation
  ) => Promise<readonly PlanningCcliUsageLogPersistenceRecord[]>;
}

export interface PlanningRehearsalAssetVisibilityPersistenceRepository {
  readonly setRehearsalAssetVisibility: (
    operation: SetPlanningRehearsalAssetVisibilityPersistenceOperation
  ) => Promise<PlanningRehearsalAssetVisibilityPersistenceRecord>;
  readonly listRehearsalAssetVisibility: (
    operation: ListPlanningRehearsalAssetVisibilityPersistenceOperation
  ) => Promise<readonly PlanningRehearsalAssetVisibilityPersistenceRecord[]>;
}

export interface PlanningRehearsalAcknowledgementPersistenceRepository {
  readonly recordRehearsalAcknowledgement: (
    operation: RecordPlanningRehearsalAcknowledgementPersistenceOperation
  ) => Promise<PlanningRehearsalAcknowledgementPersistenceRecord>;
  readonly listRehearsalAcknowledgements: (
    operation: ListPlanningRehearsalAcknowledgementsPersistenceOperation
  ) => Promise<readonly PlanningRehearsalAcknowledgementPersistenceRecord[]>;
}

export interface PlanningServiceCommandPersistenceRepository {
  readonly createService: (
    operation: CreatePlanningServicePersistenceOperation
  ) => Promise<PlanningServicePersistenceRecord>;
  readonly duplicateServiceFromTemplate: (
    operation: DuplicatePlanningServiceFromTemplatePersistenceOperation
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
  readonly listSongLibrary: (
    operation: ListPlanningSongLibraryPersistenceOperation
  ) => Promise<readonly PlanningSongLibraryItemPersistenceRecord[]>;
  readonly listServiceAssignments: (
    operation: ListPlanningServiceAssignmentsPersistenceOperation
  ) => Promise<readonly PlanningAssignmentPersistenceRecord[]>;
  readonly getServiceReadiness: (
    operation: GetPlanningServiceReadinessPersistenceOperation
  ) => Promise<PlanningReadinessPersistenceRecord | null>;
}
