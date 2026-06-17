import { z } from "zod";
import {
  AddChartAnnotationPersistenceInputSchema,
  ChartsPersistenceReadOptionsSchema,
  ChartsPersistenceWriteOptionsSchema,
  RemoveChartAnnotationPersistenceInputSchema,
  SaveChartArrangementPersistenceInputSchema,
  SaveChartPersistenceInputSchema,
  SetMusicianChartPreferencePersistenceInputSchema,
  UpdateChartAnnotationPersistenceInputSchema,
  UpdateChartSourcePersistenceInputSchema,
  type ChartsPersistenceReadOptions,
  type ChartsPersistenceWriteOptions
} from "./charts-repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

/**
 * The local sync queue stores the validated payload of a non-destructive Charts
 * mutation so it can be replayed when connectivity returns. Each queued
 * operation reuses the command repository's input schema as its payload, so the
 * stored record can never drift from what the online command path accepts. The
 * destructive `removeChartAnnotation` is intentionally excluded from the offline
 * queue — the Charts plan only queues non-destructive edits, and deletions
 * require explicit online intent and audit metadata.
 */
export const ChartsLocalSyncQueueStorageSchemaVersionSchema = z.literal(
  "charts-local-sync-queue.v1"
);

export const ChartsLocalSyncQueuedSaveChartOperationPersistenceSchema = z
  .object({
    operation: z.literal("saveChart"),
    payload: SaveChartPersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedUpdateChartSourceOperationPersistenceSchema = z
  .object({
    operation: z.literal("updateChartSource"),
    payload: UpdateChartSourcePersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedSaveChartArrangementOperationPersistenceSchema = z
  .object({
    operation: z.literal("saveChartArrangement"),
    payload: SaveChartArrangementPersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedSetMusicianChartPreferenceOperationPersistenceSchema = z
  .object({
    operation: z.literal("setMusicianChartPreference"),
    payload: SetMusicianChartPreferencePersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedAddChartAnnotationOperationPersistenceSchema = z
  .object({
    operation: z.literal("addChartAnnotation"),
    payload: AddChartAnnotationPersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedUpdateChartAnnotationOperationPersistenceSchema = z
  .object({
    operation: z.literal("updateChartAnnotation"),
    payload: UpdateChartAnnotationPersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedRemoveChartAnnotationOperationPersistenceSchema = z
  .object({
    operation: z.literal("removeChartAnnotation"),
    payload: RemoveChartAnnotationPersistenceInputSchema
  })
  .strict();

export const ChartsLocalSyncQueuedOperationPersistenceSchema = z.discriminatedUnion("operation", [
  ChartsLocalSyncQueuedSaveChartOperationPersistenceSchema,
  ChartsLocalSyncQueuedUpdateChartSourceOperationPersistenceSchema,
  ChartsLocalSyncQueuedSaveChartArrangementOperationPersistenceSchema,
  ChartsLocalSyncQueuedSetMusicianChartPreferenceOperationPersistenceSchema,
  ChartsLocalSyncQueuedAddChartAnnotationOperationPersistenceSchema,
  ChartsLocalSyncQueuedUpdateChartAnnotationOperationPersistenceSchema,
  ChartsLocalSyncQueuedRemoveChartAnnotationOperationPersistenceSchema
]);

export const ChartsLocalSyncQueueOperationKindSchema = z.enum([
  "saveChart",
  "updateChartSource",
  "saveChartArrangement",
  "setMusicianChartPreference",
  "addChartAnnotation",
  "updateChartAnnotation",
  "removeChartAnnotation"
]);

export const ChartsLocalSyncQueueStatusPersistenceSchema = z.enum([
  "pending",
  "in-flight",
  "failed",
  "synced"
]);

/**
 * The chart the queued operation targets. Most Charts operations key off a
 * `chartId`; arrangement saves key off the `songRef`/`arrangementRef` pair and
 * carry no `chartId`, so the entry stores the resolvable references rather than
 * forcing a `chartId` that some operations do not have.
 */

/**
 * Not every queued payload carries `tenantId`/`chartId` (e.g. `updateChartSource`
 * and `removeChartAnnotation` omit `tenantId`), so these helpers read the field
 * union-safely without widening the discriminated union to `any`.
 */
const readPayloadTenantId = (
  payload: ChartsLocalSyncQueuedOperationPersistence["payload"]
): string | undefined => ("tenantId" in payload ? payload.tenantId : undefined);

const readPayloadChartId = (
  payload: ChartsLocalSyncQueuedOperationPersistence["payload"]
): string | undefined => ("chartId" in payload ? payload.chartId : undefined);

export const ChartsLocalSyncQueueEntryPersistenceRecordSchema = z
  .object({
    actorId: NonEmptyStringSchema,
    attemptCount: NonNegativeIntegerSchema,
    chartId: OptionalNonEmptyStringSchema,
    createdAt: IsoDateTimeStringSchema,
    lastAttemptedAt: IsoDateTimeStringSchema.optional(),
    nextAttemptAt: IsoDateTimeStringSchema.optional(),
    operation: ChartsLocalSyncQueuedOperationPersistenceSchema,
    queuedAt: IsoDateTimeStringSchema,
    queueEntryId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    safeErrorMessage: OptionalNonEmptyStringSchema,
    schemaVersion: ChartsLocalSyncQueueStorageSchemaVersionSchema,
    status: ChartsLocalSyncQueueStatusPersistenceSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((entry, context) => {
    const payloadTenantId = readPayloadTenantId(entry.operation.payload);

    if (payloadTenantId !== undefined && payloadTenantId !== entry.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync queued operation tenant must match entry tenant.",
        path: ["operation", "payload", "tenantId"]
      });
    }

    const payloadChartId = readPayloadChartId(entry.operation.payload);

    if (
      entry.chartId !== undefined &&
      payloadChartId !== undefined &&
      payloadChartId !== entry.chartId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync queued operation chart must match the entry chart.",
        path: ["operation", "payload", "chartId"]
      });
    }

    if (entry.status === "failed" && entry.safeErrorMessage === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync failed entries require a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.status !== "failed" && entry.safeErrorMessage !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync safe error messages are allowed only on failed entries.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.lastAttemptedAt !== undefined && entry.attemptCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync attempted entries must record an attempt count.",
        path: ["attemptCount"]
      });
    }

    if (entry.nextAttemptAt !== undefined && entry.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync next-attempt backoff is allowed only on failed entries.",
        path: ["nextAttemptAt"]
      });
    }
  });

const chartsLocalSyncQueueAllowedTransitions: ReadonlyMap<
  z.infer<typeof ChartsLocalSyncQueueStatusPersistenceSchema>,
  readonly z.infer<typeof ChartsLocalSyncQueueStatusPersistenceSchema>[]
> = new Map([
  ["pending", ["in-flight"]],
  ["in-flight", ["pending", "synced", "failed"]],
  ["failed", ["pending"]],
  ["synced", []]
]);

const isChartsLocalSyncQueueStatusTransitionPersistenceAllowed = (
  from: z.infer<typeof ChartsLocalSyncQueueStatusPersistenceSchema>,
  to: z.infer<typeof ChartsLocalSyncQueueStatusPersistenceSchema>
): boolean => chartsLocalSyncQueueAllowedTransitions.get(from)?.includes(to) ?? false;

export const ChartsLocalSyncQueueStatusTransitionPersistenceSchema = z
  .object({
    from: ChartsLocalSyncQueueStatusPersistenceSchema,
    safeReason: OptionalNonEmptyStringSchema,
    to: ChartsLocalSyncQueueStatusPersistenceSchema,
    transitionedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((transition, context) => {
    if (!isChartsLocalSyncQueueStatusTransitionPersistenceAllowed(transition.from, transition.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync queue status transition is not allowed.",
        path: ["to"]
      });
    }
  });

export const ChartsLocalSyncQueueEntryMutationResultSchema = z
  .object({
    entry: ChartsLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict();

export const EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    entry: ChartsLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.entry.status !== "pending") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync enqueue requires pending status.",
        path: ["entry", "status"]
      });
    }

    if (input.entry.attemptCount !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync enqueue requires a zero attempt count.",
        path: ["entry", "attemptCount"]
      });
    }
  });

export const GetChartsLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema
  })
  .strict();

export const ListPendingChartsLocalSyncQueueEntriesPersistenceInputSchema = z
  .object({
    chartId: OptionalNonEmptyStringSchema,
    limit: PositiveIntegerSchema.optional()
  })
  .strict();

export const MarkChartsLocalSyncQueueEntryInFlightPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: ChartsLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "in-flight") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync in-flight updates must transition to in-flight.",
        path: ["transition", "to"]
      });
    }
  });

export const MarkChartsLocalSyncQueueEntrySyncedPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: ChartsLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "synced") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync synced updates must transition to synced.",
        path: ["transition", "to"]
      });
    }
  });

export const MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema = z
  .object({
    nextAttemptAt: IsoDateTimeStringSchema.optional(),
    queueEntryId: NonEmptyStringSchema,
    safeErrorMessage: NonEmptyStringSchema,
    transition: ChartsLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync failure updates must transition to failed.",
        path: ["transition", "to"]
      });
    }
  });

export const RequeueChartsLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: ChartsLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "pending") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts local sync requeue updates must transition to pending.",
        path: ["transition", "to"]
      });
    }
  });

export const PruneChartsLocalSyncQueueEntriesPersistenceInputSchema = z
  .object({
    olderThan: IsoDateTimeStringSchema
  })
  .strict();

export const PruneChartsLocalSyncQueueEntriesPersistenceResultSchema = z
  .object({
    removedCount: NonNegativeIntegerSchema
  })
  .strict();

export type ChartsLocalSyncQueuedOperationPersistence = z.infer<
  typeof ChartsLocalSyncQueuedOperationPersistenceSchema
>;
export type ChartsLocalSyncQueueOperationKind = z.infer<
  typeof ChartsLocalSyncQueueOperationKindSchema
>;
export type ChartsLocalSyncQueueStatusPersistence = z.infer<
  typeof ChartsLocalSyncQueueStatusPersistenceSchema
>;
export type ChartsLocalSyncQueueEntryPersistenceRecord = z.infer<
  typeof ChartsLocalSyncQueueEntryPersistenceRecordSchema
>;
export type ChartsLocalSyncQueueStatusTransitionPersistence = z.infer<
  typeof ChartsLocalSyncQueueStatusTransitionPersistenceSchema
>;
export type ChartsLocalSyncQueueEntryMutationResult = z.infer<
  typeof ChartsLocalSyncQueueEntryMutationResultSchema
>;
export type EnqueueChartsLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema
>;
export type GetChartsLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof GetChartsLocalSyncQueueEntryPersistenceInputSchema
>;
export type ListPendingChartsLocalSyncQueueEntriesPersistenceInput = z.infer<
  typeof ListPendingChartsLocalSyncQueueEntriesPersistenceInputSchema
>;
export type MarkChartsLocalSyncQueueEntryInFlightPersistenceInput = z.infer<
  typeof MarkChartsLocalSyncQueueEntryInFlightPersistenceInputSchema
>;
export type MarkChartsLocalSyncQueueEntrySyncedPersistenceInput = z.infer<
  typeof MarkChartsLocalSyncQueueEntrySyncedPersistenceInputSchema
>;
export type MarkChartsLocalSyncQueueEntryFailedPersistenceInput = z.infer<
  typeof MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema
>;
export type RequeueChartsLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof RequeueChartsLocalSyncQueueEntryPersistenceInputSchema
>;
export type PruneChartsLocalSyncQueueEntriesPersistenceInput = z.infer<
  typeof PruneChartsLocalSyncQueueEntriesPersistenceInputSchema
>;
export type PruneChartsLocalSyncQueueEntriesPersistenceResult = z.infer<
  typeof PruneChartsLocalSyncQueueEntriesPersistenceResultSchema
>;

export const EnqueueChartsLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: EnqueueChartsLocalSyncQueueEntryPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export const GetChartsLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: GetChartsLocalSyncQueueEntryPersistenceInputSchema,
    options: ChartsPersistenceReadOptionsSchema
  })
  .strict();

export const ListPendingChartsLocalSyncQueueEntriesPersistenceOperationSchema = z
  .object({
    input: ListPendingChartsLocalSyncQueueEntriesPersistenceInputSchema,
    options: ChartsPersistenceReadOptionsSchema
  })
  .strict();

export const MarkChartsLocalSyncQueueEntryInFlightPersistenceOperationSchema = z
  .object({
    input: MarkChartsLocalSyncQueueEntryInFlightPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkChartsLocalSyncQueueEntrySyncedPersistenceOperationSchema = z
  .object({
    input: MarkChartsLocalSyncQueueEntrySyncedPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkChartsLocalSyncQueueEntryFailedPersistenceOperationSchema = z
  .object({
    input: MarkChartsLocalSyncQueueEntryFailedPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export const RequeueChartsLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: RequeueChartsLocalSyncQueueEntryPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export const PruneChartsLocalSyncQueueEntriesPersistenceOperationSchema = z
  .object({
    input: PruneChartsLocalSyncQueueEntriesPersistenceInputSchema,
    options: ChartsPersistenceWriteOptionsSchema
  })
  .strict();

export interface ChartsLocalSyncQueueReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ChartsPersistenceReadOptions;
}

export interface ChartsLocalSyncQueuePersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ChartsPersistenceWriteOptions;
}

export type EnqueueChartsLocalSyncQueueEntryPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<EnqueueChartsLocalSyncQueueEntryPersistenceInput>;
export type GetChartsLocalSyncQueueEntryPersistenceOperation =
  ChartsLocalSyncQueueReadPersistenceOperation<GetChartsLocalSyncQueueEntryPersistenceInput>;
export type ListPendingChartsLocalSyncQueueEntriesPersistenceOperation =
  ChartsLocalSyncQueueReadPersistenceOperation<ListPendingChartsLocalSyncQueueEntriesPersistenceInput>;
export type MarkChartsLocalSyncQueueEntryInFlightPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<MarkChartsLocalSyncQueueEntryInFlightPersistenceInput>;
export type MarkChartsLocalSyncQueueEntrySyncedPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<MarkChartsLocalSyncQueueEntrySyncedPersistenceInput>;
export type MarkChartsLocalSyncQueueEntryFailedPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<MarkChartsLocalSyncQueueEntryFailedPersistenceInput>;
export type RequeueChartsLocalSyncQueueEntryPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<RequeueChartsLocalSyncQueueEntryPersistenceInput>;
export type PruneChartsLocalSyncQueueEntriesPersistenceOperation =
  ChartsLocalSyncQueuePersistenceOperation<PruneChartsLocalSyncQueueEntriesPersistenceInput>;

export interface ChartsLocalSyncQueuePersistenceRepository {
  readonly enqueue: (
    operation: EnqueueChartsLocalSyncQueueEntryPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryMutationResult>;
  readonly getById: (
    operation: GetChartsLocalSyncQueueEntryPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryPersistenceRecord | null>;
  readonly listPending: (
    operation: ListPendingChartsLocalSyncQueueEntriesPersistenceOperation
  ) => Promise<readonly ChartsLocalSyncQueueEntryPersistenceRecord[]>;
  readonly markInFlight: (
    operation: MarkChartsLocalSyncQueueEntryInFlightPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryMutationResult>;
  readonly markSynced: (
    operation: MarkChartsLocalSyncQueueEntrySyncedPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryMutationResult>;
  readonly markFailed: (
    operation: MarkChartsLocalSyncQueueEntryFailedPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryMutationResult>;
  readonly requeue: (
    operation: RequeueChartsLocalSyncQueueEntryPersistenceOperation
  ) => Promise<ChartsLocalSyncQueueEntryMutationResult>;
  readonly pruneSynced: (
    operation: PruneChartsLocalSyncQueueEntriesPersistenceOperation
  ) => Promise<PruneChartsLocalSyncQueueEntriesPersistenceResult>;
}
