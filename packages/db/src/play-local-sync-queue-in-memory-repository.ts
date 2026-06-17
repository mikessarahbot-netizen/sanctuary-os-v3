import {
  CountPlayLocalSyncQueueEntriesByStatusPersistenceOperationSchema,
  EnqueuePlayLocalSyncQueueEntryPersistenceOperationSchema,
  GetPlayLocalSyncQueueEntryPersistenceOperationSchema,
  ListPendingPlayLocalSyncQueueEntriesPersistenceOperationSchema,
  MarkPlayLocalSyncQueueEntryFailedPersistenceOperationSchema,
  MarkPlayLocalSyncQueueEntryInFlightPersistenceOperationSchema,
  MarkPlayLocalSyncQueueEntrySyncedPersistenceOperationSchema,
  PlayLocalSyncQueueEntryMutationResultSchema,
  PlayLocalSyncQueueEntryPersistenceRecordSchema,
  PlayLocalSyncQueueStatusCountsSchema,
  PrunePlayLocalSyncQueueEntriesPersistenceOperationSchema,
  PrunePlayLocalSyncQueueEntriesPersistenceResultSchema,
  RequeuePlayLocalSyncQueueEntryPersistenceOperationSchema,
  type PlayLocalSyncQueueEntryMutationResult,
  type PlayLocalSyncQueueEntryPersistenceRecord,
  type PlayLocalSyncQueuePersistenceRepository,
  type PlayLocalSyncQueueStatusCounts,
  type PlayLocalSyncQueueStatusPersistence,
  type PlayLocalSyncQueueStatusTransitionPersistence,
  type PrunePlayLocalSyncQueueEntriesPersistenceResult
} from "./play-local-sync-queue-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export type InMemoryPlayLocalSyncQueueOperationName =
  | "countByStatus"
  | "enqueue"
  | "getById"
  | "listPending"
  | "markFailed"
  | "markInFlight"
  | "markSynced"
  | "pruneSynced"
  | "requeue";

export interface RecordedInMemoryPlayLocalSyncQueueOperation {
  readonly actorId: string;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryPlayLocalSyncQueueOperationName;
  readonly requestId: string;
  readonly tenantId: string;
  readonly transactionId?: string | undefined;
}

export interface InMemoryPlayLocalSyncQueueRepositorySeed {
  readonly entries?: readonly PlayLocalSyncQueueEntryPersistenceRecord[];
}

export interface InMemoryPlayLocalSyncQueueRepositoryAdapter {
  readonly readEntries: () => readonly PlayLocalSyncQueueEntryPersistenceRecord[];
  readonly readOperations: () => readonly RecordedInMemoryPlayLocalSyncQueueOperation[];
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
}

interface PlayLocalSyncQueueOperationOptions {
  readonly context: {
    readonly actorId?: string | undefined;
    readonly requestId: string;
    readonly tenantId: string;
  };
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly transaction?: TransactionHandle | undefined;
}

const cloneEntry = (
  entry: PlayLocalSyncQueueEntryPersistenceRecord
): PlayLocalSyncQueueEntryPersistenceRecord =>
  PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(entry);

/**
 * Leaving a failed status drops the failure-only fields so the resulting record
 * satisfies the contract refinements (backoff and error metadata are allowed
 * only on failed entries), mirroring the SQL repository's `NULL` resets.
 */
const withoutFailureMetadata = (
  entry: PlayLocalSyncQueueEntryPersistenceRecord
): PlayLocalSyncQueueEntryPersistenceRecord => {
  const next = { ...entry };
  delete next.nextAttemptAt;
  delete next.safeErrorMessage;

  return next;
};

const entryKey = (tenantId: string, queueEntryId: string): string =>
  `${tenantId}:${queueEntryId}`;

const compareEntriesForReplay = (
  left: PlayLocalSyncQueueEntryPersistenceRecord,
  right: PlayLocalSyncQueueEntryPersistenceRecord
): number =>
  left.queuedAt.localeCompare(right.queuedAt) ||
  left.queueEntryId.localeCompare(right.queueEntryId);

/**
 * In-memory double for the Play local sync queue. It mirrors the SQLite
 * repository's tenant scoping and status-transition guards (a transition only
 * applies when the stored status matches the requested `from`), so tests can
 * exercise the queue contract without a database while staying faithful to the
 * persisted behaviour.
 */
export const createInMemoryPlayLocalSyncQueueRepositoryAdapter = (
  seed: InMemoryPlayLocalSyncQueueRepositorySeed = {}
): InMemoryPlayLocalSyncQueueRepositoryAdapter => {
  const entries = new Map<string, PlayLocalSyncQueueEntryPersistenceRecord>(
    (seed.entries ?? []).map((rawEntry) => {
      const entry = cloneEntry(rawEntry);
      return [entryKey(entry.tenantId, entry.queueEntryId), entry] as const;
    })
  );
  const operations: RecordedInMemoryPlayLocalSyncQueueOperation[] = [];

  const recordOperation = (
    operationName: InMemoryPlayLocalSyncQueueOperationName,
    options: PlayLocalSyncQueueOperationOptions
  ): void => {
    if (options.context.actorId === undefined) {
      throw new Error("Play local sync queue operations require an actor ID.");
    }

    operations.push({
      actorId: options.context.actorId,
      ...(options.intent !== undefined ? { intent: options.intent } : {}),
      operationName,
      requestId: options.context.requestId,
      tenantId: options.context.tenantId,
      ...(options.transaction !== undefined
        ? { transactionId: options.transaction.transactionId }
        : {})
    });
  };

  const requireTransitionableEntry = (
    tenantId: string,
    queueEntryId: string,
    transition: PlayLocalSyncQueueStatusTransitionPersistence,
    errorMessage: string
  ): PlayLocalSyncQueueEntryPersistenceRecord => {
    const entry = entries.get(entryKey(tenantId, queueEntryId));

    if (entry === undefined || entry.tenantId !== tenantId || entry.status !== transition.from) {
      throw new Error(errorMessage);
    }

    return entry;
  };

  const repository: PlayLocalSyncQueuePersistenceRepository = {
    enqueue: (rawOperation): Promise<PlayLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          EnqueuePlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("enqueue", operation.options);
        const entry = operation.input.entry;

        if (entry.tenantId !== operation.options.context.tenantId) {
          throw new Error("Play local sync queue entry tenant must match operation tenant.");
        }

        const key = entryKey(entry.tenantId, entry.queueEntryId);

        if (entries.has(key)) {
          throw new Error("Play local sync queue entry already exists for tenant.");
        }

        entries.set(key, cloneEntry(entry));

        return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(entry) });
      }),

    getById: (rawOperation): Promise<PlayLocalSyncQueueEntryPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation =
          GetPlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("getById", operation.options);
        const entry = entries.get(
          entryKey(operation.options.context.tenantId, operation.input.queueEntryId)
        );

        return entry !== undefined && entry.tenantId === operation.options.context.tenantId
          ? cloneEntry(entry)
          : null;
      }),

    listPending: (
      rawOperation
    ): Promise<readonly PlayLocalSyncQueueEntryPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPendingPlayLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listPending", operation.options);
        const pending = [...entries.values()]
          .filter(
            (entry) =>
              entry.tenantId === operation.options.context.tenantId &&
              entry.status === "pending" &&
              (operation.input.trackSetId === undefined ||
                entry.trackSetId === operation.input.trackSetId)
          )
          .sort(compareEntriesForReplay)
          .map(cloneEntry);

        return operation.input.limit === undefined
          ? pending
          : pending.slice(0, operation.input.limit);
      }),

    markInFlight: (rawOperation): Promise<PlayLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkPlayLocalSyncQueueEntryInFlightPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markInFlight", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Play local sync queue in-flight transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...current,
          attemptCount: current.attemptCount + 1,
          lastAttemptedAt: operation.input.transition.transitionedAt,
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    markSynced: (rawOperation): Promise<PlayLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkPlayLocalSyncQueueEntrySyncedPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markSynced", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Play local sync queue sync transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...withoutFailureMetadata(current),
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    markFailed: (rawOperation): Promise<PlayLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkPlayLocalSyncQueueEntryFailedPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markFailed", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Play local sync queue failure transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...current,
          ...(operation.input.nextAttemptAt !== undefined
            ? { nextAttemptAt: operation.input.nextAttemptAt }
            : {}),
          safeErrorMessage: operation.input.safeErrorMessage,
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    requeue: (rawOperation): Promise<PlayLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          RequeuePlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("requeue", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Play local sync queue requeue transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...withoutFailureMetadata(current),
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    pruneSynced: (
      rawOperation
    ): Promise<PrunePlayLocalSyncQueueEntriesPersistenceResult> =>
      Promise.resolve().then(() => {
        const operation =
          PrunePlayLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("pruneSynced", operation.options);
        let removedCount = 0;

        for (const [key, entry] of [...entries.entries()]) {
          if (
            entry.tenantId === operation.options.context.tenantId &&
            entry.status === "synced" &&
            entry.updatedAt < operation.input.olderThan
          ) {
            entries.delete(key);
            removedCount += 1;
          }
        }

        return PrunePlayLocalSyncQueueEntriesPersistenceResultSchema.parse({ removedCount });
      }),

    countByStatus: (rawOperation): Promise<PlayLocalSyncQueueStatusCounts> =>
      Promise.resolve().then(() => {
        const operation =
          CountPlayLocalSyncQueueEntriesByStatusPersistenceOperationSchema.parse(rawOperation);
        recordOperation("countByStatus", operation.options);
        const counts: Record<PlayLocalSyncQueueStatusPersistence, number> = {
          failed: 0,
          "in-flight": 0,
          pending: 0,
          synced: 0
        };

        for (const entry of entries.values()) {
          if (entry.tenantId === operation.options.context.tenantId) {
            counts[entry.status] += 1;
          }
        }

        return PlayLocalSyncQueueStatusCountsSchema.parse({
          failed: counts.failed,
          inFlight: counts["in-flight"],
          pending: counts.pending,
          synced: counts.synced
        });
      })
  };

  return {
    readEntries: (): readonly PlayLocalSyncQueueEntryPersistenceRecord[] =>
      [...entries.values()].map(cloneEntry),
    readOperations: (): readonly RecordedInMemoryPlayLocalSyncQueueOperation[] => [...operations],
    repository
  };
};
