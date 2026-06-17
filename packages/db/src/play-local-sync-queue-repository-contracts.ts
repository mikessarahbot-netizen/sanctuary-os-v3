import { z } from "zod";
import {
  AddPlayCuePersistenceInputSchema,
  PlayPersistenceReadOptionsSchema,
  PlayPersistenceWriteOptionsSchema,
  ReorderPlaySectionsPersistenceInputSchema,
  SavePadLayerPersistenceInputSchema,
  SavePlayArrangementPersistenceInputSchema,
  SavePlaySectionPersistenceInputSchema,
  SaveTrackSetPersistenceInputSchema,
  SetPlaybackStatePersistenceInputSchema,
  UpdatePlayCuePersistenceInputSchema,
  UpdateTrackSetMembersPersistenceInputSchema,
  type PlayPersistenceReadOptions,
  type PlayPersistenceWriteOptions
} from "./play-repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

/**
 * The local sync queue stores the validated payload of a non-destructive Play
 * mutation so it can be replayed when connectivity returns. Each queued
 * operation reuses the command repository's input schema as its payload, so the
 * stored record can never drift from what the online command path accepts. The
 * destructive `removePlayCue` is intentionally excluded from the offline
 * queue — the Play plan only queues non-destructive edits, and deletions
 * require explicit online intent and audit metadata.
 */
export const PlayLocalSyncQueueStorageSchemaVersionSchema = z.literal(
  "play-local-sync-queue.v1"
);

export const PlayLocalSyncQueuedSaveTrackSetOperationPersistenceSchema = z
  .object({
    operation: z.literal("saveTrackSet"),
    payload: SaveTrackSetPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedUpdateTrackSetMembersOperationPersistenceSchema = z
  .object({
    operation: z.literal("updateTrackSetMembers"),
    payload: UpdateTrackSetMembersPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedSavePlayArrangementOperationPersistenceSchema = z
  .object({
    operation: z.literal("savePlayArrangement"),
    payload: SavePlayArrangementPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedSavePlaySectionOperationPersistenceSchema = z
  .object({
    operation: z.literal("savePlaySection"),
    payload: SavePlaySectionPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedReorderPlaySectionsOperationPersistenceSchema = z
  .object({
    operation: z.literal("reorderPlaySections"),
    payload: ReorderPlaySectionsPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedAddPlayCueOperationPersistenceSchema = z
  .object({
    operation: z.literal("addPlayCue"),
    payload: AddPlayCuePersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedUpdatePlayCueOperationPersistenceSchema = z
  .object({
    operation: z.literal("updatePlayCue"),
    payload: UpdatePlayCuePersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedSavePadLayerOperationPersistenceSchema = z
  .object({
    operation: z.literal("savePadLayer"),
    payload: SavePadLayerPersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedSetPlaybackStateOperationPersistenceSchema = z
  .object({
    operation: z.literal("setPlaybackState"),
    payload: SetPlaybackStatePersistenceInputSchema
  })
  .strict();

export const PlayLocalSyncQueuedOperationPersistenceSchema = z.discriminatedUnion("operation", [
  PlayLocalSyncQueuedSaveTrackSetOperationPersistenceSchema,
  PlayLocalSyncQueuedUpdateTrackSetMembersOperationPersistenceSchema,
  PlayLocalSyncQueuedSavePlayArrangementOperationPersistenceSchema,
  PlayLocalSyncQueuedSavePlaySectionOperationPersistenceSchema,
  PlayLocalSyncQueuedReorderPlaySectionsOperationPersistenceSchema,
  PlayLocalSyncQueuedAddPlayCueOperationPersistenceSchema,
  PlayLocalSyncQueuedUpdatePlayCueOperationPersistenceSchema,
  PlayLocalSyncQueuedSavePadLayerOperationPersistenceSchema,
  PlayLocalSyncQueuedSetPlaybackStateOperationPersistenceSchema
]);

export const PlayLocalSyncQueueOperationKindSchema = z.enum([
  "saveTrackSet",
  "updateTrackSetMembers",
  "savePlayArrangement",
  "savePlaySection",
  "reorderPlaySections",
  "addPlayCue",
  "updatePlayCue",
  "savePadLayer",
  "setPlaybackState"
]);

export const PlayLocalSyncQueueStatusPersistenceSchema = z.enum([
  "pending",
  "in-flight",
  "failed",
  "synced"
]);

/**
 * The track set the queued operation targets. Most Play operations key off a
 * `trackSetId`; arrangement, section, reorder, and pad-layer saves key off the
 * arrangement/pad references and carry no `trackSetId`, so the entry stores the
 * resolvable reference rather than forcing a `trackSetId` that some operations
 * do not have.
 */

/**
 * Not every queued payload carries `tenantId`/`trackSetId` (e.g.
 * `updateTrackSetMembers` and `reorderPlaySections` omit `tenantId`), so these
 * helpers read the field union-safely without widening the discriminated union
 * to `any`.
 */
const readPayloadTenantId = (
  payload: PlayLocalSyncQueuedOperationPersistence["payload"]
): string | undefined => ("tenantId" in payload ? payload.tenantId : undefined);

const readPayloadTrackSetId = (
  payload: PlayLocalSyncQueuedOperationPersistence["payload"]
): string | undefined => ("trackSetId" in payload ? payload.trackSetId : undefined);

export const PlayLocalSyncQueueEntryPersistenceRecordSchema = z
  .object({
    actorId: NonEmptyStringSchema,
    attemptCount: NonNegativeIntegerSchema,
    createdAt: IsoDateTimeStringSchema,
    lastAttemptedAt: IsoDateTimeStringSchema.optional(),
    nextAttemptAt: IsoDateTimeStringSchema.optional(),
    operation: PlayLocalSyncQueuedOperationPersistenceSchema,
    queuedAt: IsoDateTimeStringSchema,
    queueEntryId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    safeErrorMessage: OptionalNonEmptyStringSchema,
    schemaVersion: PlayLocalSyncQueueStorageSchemaVersionSchema,
    status: PlayLocalSyncQueueStatusPersistenceSchema,
    tenantId: NonEmptyStringSchema,
    trackSetId: OptionalNonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((entry, context) => {
    const payloadTenantId = readPayloadTenantId(entry.operation.payload);

    if (payloadTenantId !== undefined && payloadTenantId !== entry.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync queued operation tenant must match entry tenant.",
        path: ["operation", "payload", "tenantId"]
      });
    }

    const payloadTrackSetId = readPayloadTrackSetId(entry.operation.payload);

    if (
      entry.trackSetId !== undefined &&
      payloadTrackSetId !== undefined &&
      payloadTrackSetId !== entry.trackSetId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync queued operation track set must match the entry track set.",
        path: ["operation", "payload", "trackSetId"]
      });
    }

    if (entry.status === "failed" && entry.safeErrorMessage === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync failed entries require a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.status !== "failed" && entry.safeErrorMessage !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync safe error messages are allowed only on failed entries.",
        path: ["safeErrorMessage"]
      });
    }

    if (entry.lastAttemptedAt !== undefined && entry.attemptCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync attempted entries must record an attempt count.",
        path: ["attemptCount"]
      });
    }

    if (entry.nextAttemptAt !== undefined && entry.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync next-attempt backoff is allowed only on failed entries.",
        path: ["nextAttemptAt"]
      });
    }
  });

const playLocalSyncQueueAllowedTransitions: ReadonlyMap<
  z.infer<typeof PlayLocalSyncQueueStatusPersistenceSchema>,
  readonly z.infer<typeof PlayLocalSyncQueueStatusPersistenceSchema>[]
> = new Map([
  ["pending", ["in-flight"]],
  ["in-flight", ["pending", "synced", "failed"]],
  ["failed", ["pending"]],
  ["synced", []]
]);

const isPlayLocalSyncQueueStatusTransitionPersistenceAllowed = (
  from: z.infer<typeof PlayLocalSyncQueueStatusPersistenceSchema>,
  to: z.infer<typeof PlayLocalSyncQueueStatusPersistenceSchema>
): boolean => playLocalSyncQueueAllowedTransitions.get(from)?.includes(to) ?? false;

export const PlayLocalSyncQueueStatusTransitionPersistenceSchema = z
  .object({
    from: PlayLocalSyncQueueStatusPersistenceSchema,
    safeReason: OptionalNonEmptyStringSchema,
    to: PlayLocalSyncQueueStatusPersistenceSchema,
    transitionedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((transition, context) => {
    if (!isPlayLocalSyncQueueStatusTransitionPersistenceAllowed(transition.from, transition.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync queue status transition is not allowed.",
        path: ["to"]
      });
    }
  });

export const PlayLocalSyncQueueEntryMutationResultSchema = z
  .object({
    entry: PlayLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict();

export const EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    entry: PlayLocalSyncQueueEntryPersistenceRecordSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.entry.status !== "pending") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync enqueue requires pending status.",
        path: ["entry", "status"]
      });
    }

    if (input.entry.attemptCount !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync enqueue requires a zero attempt count.",
        path: ["entry", "attemptCount"]
      });
    }
  });

export const GetPlayLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema
  })
  .strict();

export const ListPendingPlayLocalSyncQueueEntriesPersistenceInputSchema = z
  .object({
    limit: PositiveIntegerSchema.optional(),
    trackSetId: OptionalNonEmptyStringSchema
  })
  .strict();

export const MarkPlayLocalSyncQueueEntryInFlightPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: PlayLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "in-flight") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync in-flight updates must transition to in-flight.",
        path: ["transition", "to"]
      });
    }
  });

export const MarkPlayLocalSyncQueueEntrySyncedPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: PlayLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "synced") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync synced updates must transition to synced.",
        path: ["transition", "to"]
      });
    }
  });

export const MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema = z
  .object({
    nextAttemptAt: IsoDateTimeStringSchema.optional(),
    queueEntryId: NonEmptyStringSchema,
    safeErrorMessage: NonEmptyStringSchema,
    transition: PlayLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync failure updates must transition to failed.",
        path: ["transition", "to"]
      });
    }
  });

export const RequeuePlayLocalSyncQueueEntryPersistenceInputSchema = z
  .object({
    queueEntryId: NonEmptyStringSchema,
    transition: PlayLocalSyncQueueStatusTransitionPersistenceSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transition.to !== "pending") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play local sync requeue updates must transition to pending.",
        path: ["transition", "to"]
      });
    }
  });

export const PrunePlayLocalSyncQueueEntriesPersistenceInputSchema = z
  .object({
    olderThan: IsoDateTimeStringSchema
  })
  .strict();

export const PrunePlayLocalSyncQueueEntriesPersistenceResultSchema = z
  .object({
    removedCount: NonNegativeIntegerSchema
  })
  .strict();

export const PlayLocalSyncQueueStatusCountsSchema = z
  .object({
    failed: NonNegativeIntegerSchema,
    inFlight: NonNegativeIntegerSchema,
    pending: NonNegativeIntegerSchema,
    synced: NonNegativeIntegerSchema
  })
  .strict();

export const CountPlayLocalSyncQueueEntriesByStatusPersistenceInputSchema = z
  .object({})
  .strict();

export type PlayLocalSyncQueuedOperationPersistence = z.infer<
  typeof PlayLocalSyncQueuedOperationPersistenceSchema
>;
export type PlayLocalSyncQueueOperationKind = z.infer<
  typeof PlayLocalSyncQueueOperationKindSchema
>;
export type PlayLocalSyncQueueStatusPersistence = z.infer<
  typeof PlayLocalSyncQueueStatusPersistenceSchema
>;
export type PlayLocalSyncQueueEntryPersistenceRecord = z.infer<
  typeof PlayLocalSyncQueueEntryPersistenceRecordSchema
>;
export type PlayLocalSyncQueueStatusTransitionPersistence = z.infer<
  typeof PlayLocalSyncQueueStatusTransitionPersistenceSchema
>;
export type PlayLocalSyncQueueEntryMutationResult = z.infer<
  typeof PlayLocalSyncQueueEntryMutationResultSchema
>;
export type EnqueuePlayLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema
>;
export type GetPlayLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof GetPlayLocalSyncQueueEntryPersistenceInputSchema
>;
export type ListPendingPlayLocalSyncQueueEntriesPersistenceInput = z.infer<
  typeof ListPendingPlayLocalSyncQueueEntriesPersistenceInputSchema
>;
export type MarkPlayLocalSyncQueueEntryInFlightPersistenceInput = z.infer<
  typeof MarkPlayLocalSyncQueueEntryInFlightPersistenceInputSchema
>;
export type MarkPlayLocalSyncQueueEntrySyncedPersistenceInput = z.infer<
  typeof MarkPlayLocalSyncQueueEntrySyncedPersistenceInputSchema
>;
export type MarkPlayLocalSyncQueueEntryFailedPersistenceInput = z.infer<
  typeof MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema
>;
export type RequeuePlayLocalSyncQueueEntryPersistenceInput = z.infer<
  typeof RequeuePlayLocalSyncQueueEntryPersistenceInputSchema
>;
export type PrunePlayLocalSyncQueueEntriesPersistenceInput = z.infer<
  typeof PrunePlayLocalSyncQueueEntriesPersistenceInputSchema
>;
export type PrunePlayLocalSyncQueueEntriesPersistenceResult = z.infer<
  typeof PrunePlayLocalSyncQueueEntriesPersistenceResultSchema
>;
export type PlayLocalSyncQueueStatusCounts = z.infer<
  typeof PlayLocalSyncQueueStatusCountsSchema
>;
export type CountPlayLocalSyncQueueEntriesByStatusPersistenceInput = z.infer<
  typeof CountPlayLocalSyncQueueEntriesByStatusPersistenceInputSchema
>;

export const EnqueuePlayLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: EnqueuePlayLocalSyncQueueEntryPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const GetPlayLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: GetPlayLocalSyncQueueEntryPersistenceInputSchema,
    options: PlayPersistenceReadOptionsSchema
  })
  .strict();

export const ListPendingPlayLocalSyncQueueEntriesPersistenceOperationSchema = z
  .object({
    input: ListPendingPlayLocalSyncQueueEntriesPersistenceInputSchema,
    options: PlayPersistenceReadOptionsSchema
  })
  .strict();

export const MarkPlayLocalSyncQueueEntryInFlightPersistenceOperationSchema = z
  .object({
    input: MarkPlayLocalSyncQueueEntryInFlightPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkPlayLocalSyncQueueEntrySyncedPersistenceOperationSchema = z
  .object({
    input: MarkPlayLocalSyncQueueEntrySyncedPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const MarkPlayLocalSyncQueueEntryFailedPersistenceOperationSchema = z
  .object({
    input: MarkPlayLocalSyncQueueEntryFailedPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const RequeuePlayLocalSyncQueueEntryPersistenceOperationSchema = z
  .object({
    input: RequeuePlayLocalSyncQueueEntryPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const PrunePlayLocalSyncQueueEntriesPersistenceOperationSchema = z
  .object({
    input: PrunePlayLocalSyncQueueEntriesPersistenceInputSchema,
    options: PlayPersistenceWriteOptionsSchema
  })
  .strict();

export const CountPlayLocalSyncQueueEntriesByStatusPersistenceOperationSchema = z
  .object({
    input: CountPlayLocalSyncQueueEntriesByStatusPersistenceInputSchema,
    options: PlayPersistenceReadOptionsSchema
  })
  .strict();

export interface PlayLocalSyncQueueReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PlayPersistenceReadOptions;
}

export interface PlayLocalSyncQueuePersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PlayPersistenceWriteOptions;
}

export type EnqueuePlayLocalSyncQueueEntryPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<EnqueuePlayLocalSyncQueueEntryPersistenceInput>;
export type GetPlayLocalSyncQueueEntryPersistenceOperation =
  PlayLocalSyncQueueReadPersistenceOperation<GetPlayLocalSyncQueueEntryPersistenceInput>;
export type ListPendingPlayLocalSyncQueueEntriesPersistenceOperation =
  PlayLocalSyncQueueReadPersistenceOperation<ListPendingPlayLocalSyncQueueEntriesPersistenceInput>;
export type MarkPlayLocalSyncQueueEntryInFlightPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<MarkPlayLocalSyncQueueEntryInFlightPersistenceInput>;
export type MarkPlayLocalSyncQueueEntrySyncedPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<MarkPlayLocalSyncQueueEntrySyncedPersistenceInput>;
export type MarkPlayLocalSyncQueueEntryFailedPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<MarkPlayLocalSyncQueueEntryFailedPersistenceInput>;
export type RequeuePlayLocalSyncQueueEntryPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<RequeuePlayLocalSyncQueueEntryPersistenceInput>;
export type PrunePlayLocalSyncQueueEntriesPersistenceOperation =
  PlayLocalSyncQueuePersistenceOperation<PrunePlayLocalSyncQueueEntriesPersistenceInput>;
export type CountPlayLocalSyncQueueEntriesByStatusPersistenceOperation =
  PlayLocalSyncQueueReadPersistenceOperation<CountPlayLocalSyncQueueEntriesByStatusPersistenceInput>;

export interface PlayLocalSyncQueuePersistenceRepository {
  readonly enqueue: (
    operation: EnqueuePlayLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly getById: (
    operation: GetPlayLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryPersistenceRecord | null>;
  readonly listPending: (
    operation: ListPendingPlayLocalSyncQueueEntriesPersistenceOperation
  ) => Promise<readonly PlayLocalSyncQueueEntryPersistenceRecord[]>;
  readonly markInFlight: (
    operation: MarkPlayLocalSyncQueueEntryInFlightPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly markSynced: (
    operation: MarkPlayLocalSyncQueueEntrySyncedPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly markFailed: (
    operation: MarkPlayLocalSyncQueueEntryFailedPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly requeue: (
    operation: RequeuePlayLocalSyncQueueEntryPersistenceOperation
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly pruneSynced: (
    operation: PrunePlayLocalSyncQueueEntriesPersistenceOperation
  ) => Promise<PrunePlayLocalSyncQueueEntriesPersistenceResult>;
  readonly countByStatus: (
    operation: CountPlayLocalSyncQueueEntriesByStatusPersistenceOperation
  ) => Promise<PlayLocalSyncQueueStatusCounts>;
}
