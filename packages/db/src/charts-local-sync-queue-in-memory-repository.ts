import {
  ChartsLocalSyncQueueEntryMutationResultSchema,
  ChartsLocalSyncQueueEntryPersistenceRecordSchema,
  EnqueueChartsLocalSyncQueueEntryPersistenceOperationSchema,
  GetChartsLocalSyncQueueEntryPersistenceOperationSchema,
  ListPendingChartsLocalSyncQueueEntriesPersistenceOperationSchema,
  MarkChartsLocalSyncQueueEntryFailedPersistenceOperationSchema,
  MarkChartsLocalSyncQueueEntryInFlightPersistenceOperationSchema,
  MarkChartsLocalSyncQueueEntrySyncedPersistenceOperationSchema,
  PruneChartsLocalSyncQueueEntriesPersistenceOperationSchema,
  PruneChartsLocalSyncQueueEntriesPersistenceResultSchema,
  RequeueChartsLocalSyncQueueEntryPersistenceOperationSchema,
  type ChartsLocalSyncQueueEntryMutationResult,
  type ChartsLocalSyncQueueEntryPersistenceRecord,
  type ChartsLocalSyncQueuePersistenceRepository,
  type ChartsLocalSyncQueueStatusTransitionPersistence,
  type PruneChartsLocalSyncQueueEntriesPersistenceResult
} from "./charts-local-sync-queue-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export type InMemoryChartsLocalSyncQueueOperationName =
  | "enqueue"
  | "getById"
  | "listPending"
  | "markFailed"
  | "markInFlight"
  | "markSynced"
  | "pruneSynced"
  | "requeue";

export interface RecordedInMemoryChartsLocalSyncQueueOperation {
  readonly actorId: string;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryChartsLocalSyncQueueOperationName;
  readonly requestId: string;
  readonly tenantId: string;
  readonly transactionId?: string | undefined;
}

export interface InMemoryChartsLocalSyncQueueRepositorySeed {
  readonly entries?: readonly ChartsLocalSyncQueueEntryPersistenceRecord[];
}

export interface InMemoryChartsLocalSyncQueueRepositoryAdapter {
  readonly readEntries: () => readonly ChartsLocalSyncQueueEntryPersistenceRecord[];
  readonly readOperations: () => readonly RecordedInMemoryChartsLocalSyncQueueOperation[];
  readonly repository: ChartsLocalSyncQueuePersistenceRepository;
}

interface ChartsLocalSyncQueueOperationOptions {
  readonly context: {
    readonly actorId?: string | undefined;
    readonly requestId: string;
    readonly tenantId: string;
  };
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly transaction?: TransactionHandle | undefined;
}

const cloneEntry = (
  entry: ChartsLocalSyncQueueEntryPersistenceRecord
): ChartsLocalSyncQueueEntryPersistenceRecord =>
  ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse(entry);

/**
 * Leaving a failed status drops the failure-only fields so the resulting record
 * satisfies the contract refinements (backoff and error metadata are allowed
 * only on failed entries), mirroring the SQL repository's `NULL` resets.
 */
const withoutFailureMetadata = (
  entry: ChartsLocalSyncQueueEntryPersistenceRecord
): ChartsLocalSyncQueueEntryPersistenceRecord => {
  const next = { ...entry };
  delete next.nextAttemptAt;
  delete next.safeErrorMessage;

  return next;
};

const entryKey = (tenantId: string, queueEntryId: string): string =>
  `${tenantId}:${queueEntryId}`;

const compareEntriesForReplay = (
  left: ChartsLocalSyncQueueEntryPersistenceRecord,
  right: ChartsLocalSyncQueueEntryPersistenceRecord
): number =>
  left.queuedAt.localeCompare(right.queuedAt) ||
  left.queueEntryId.localeCompare(right.queueEntryId);

/**
 * In-memory double for the Charts local sync queue. It mirrors the SQLite
 * repository's tenant scoping and status-transition guards (a transition only
 * applies when the stored status matches the requested `from`), so tests can
 * exercise the queue contract without a database while staying faithful to the
 * persisted behaviour.
 */
export const createInMemoryChartsLocalSyncQueueRepositoryAdapter = (
  seed: InMemoryChartsLocalSyncQueueRepositorySeed = {}
): InMemoryChartsLocalSyncQueueRepositoryAdapter => {
  const entries = new Map<string, ChartsLocalSyncQueueEntryPersistenceRecord>(
    (seed.entries ?? []).map((rawEntry) => {
      const entry = cloneEntry(rawEntry);
      return [entryKey(entry.tenantId, entry.queueEntryId), entry] as const;
    })
  );
  const operations: RecordedInMemoryChartsLocalSyncQueueOperation[] = [];

  const recordOperation = (
    operationName: InMemoryChartsLocalSyncQueueOperationName,
    options: ChartsLocalSyncQueueOperationOptions
  ): void => {
    if (options.context.actorId === undefined) {
      throw new Error("Charts local sync queue operations require an actor ID.");
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
    transition: ChartsLocalSyncQueueStatusTransitionPersistence,
    errorMessage: string
  ): ChartsLocalSyncQueueEntryPersistenceRecord => {
    const entry = entries.get(entryKey(tenantId, queueEntryId));

    if (entry === undefined || entry.tenantId !== tenantId || entry.status !== transition.from) {
      throw new Error(errorMessage);
    }

    return entry;
  };

  const repository: ChartsLocalSyncQueuePersistenceRepository = {
    enqueue: (rawOperation): Promise<ChartsLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          EnqueueChartsLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("enqueue", operation.options);
        const entry = operation.input.entry;

        if (entry.tenantId !== operation.options.context.tenantId) {
          throw new Error("Charts local sync queue entry tenant must match operation tenant.");
        }

        const key = entryKey(entry.tenantId, entry.queueEntryId);

        if (entries.has(key)) {
          throw new Error("Charts local sync queue entry already exists for tenant.");
        }

        entries.set(key, cloneEntry(entry));

        return ChartsLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(entry) });
      }),

    getById: (rawOperation): Promise<ChartsLocalSyncQueueEntryPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation =
          GetChartsLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
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
    ): Promise<readonly ChartsLocalSyncQueueEntryPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPendingChartsLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listPending", operation.options);
        const pending = [...entries.values()]
          .filter(
            (entry) =>
              entry.tenantId === operation.options.context.tenantId &&
              entry.status === "pending" &&
              (operation.input.chartId === undefined ||
                entry.chartId === operation.input.chartId)
          )
          .sort(compareEntriesForReplay)
          .map(cloneEntry);

        return operation.input.limit === undefined
          ? pending
          : pending.slice(0, operation.input.limit);
      }),

    markInFlight: (rawOperation): Promise<ChartsLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkChartsLocalSyncQueueEntryInFlightPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markInFlight", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Charts local sync queue in-flight transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...current,
          attemptCount: current.attemptCount + 1,
          lastAttemptedAt: operation.input.transition.transitionedAt,
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return ChartsLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    markSynced: (rawOperation): Promise<ChartsLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkChartsLocalSyncQueueEntrySyncedPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markSynced", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Charts local sync queue sync transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...withoutFailureMetadata(current),
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return ChartsLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    markFailed: (rawOperation): Promise<ChartsLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          MarkChartsLocalSyncQueueEntryFailedPersistenceOperationSchema.parse(rawOperation);
        recordOperation("markFailed", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Charts local sync queue failure transition did not match a tenant-scoped entry."
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

        return ChartsLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    requeue: (rawOperation): Promise<ChartsLocalSyncQueueEntryMutationResult> =>
      Promise.resolve().then(() => {
        const operation =
          RequeueChartsLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
        recordOperation("requeue", operation.options);
        const current = requireTransitionableEntry(
          operation.options.context.tenantId,
          operation.input.queueEntryId,
          operation.input.transition,
          "Charts local sync queue requeue transition did not match a tenant-scoped entry."
        );
        const updated = cloneEntry({
          ...withoutFailureMetadata(current),
          status: operation.input.transition.to,
          updatedAt: operation.input.transition.transitionedAt
        });
        entries.set(entryKey(updated.tenantId, updated.queueEntryId), updated);

        return ChartsLocalSyncQueueEntryMutationResultSchema.parse({ entry: cloneEntry(updated) });
      }),

    pruneSynced: (
      rawOperation
    ): Promise<PruneChartsLocalSyncQueueEntriesPersistenceResult> =>
      Promise.resolve().then(() => {
        const operation =
          PruneChartsLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
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

        return PruneChartsLocalSyncQueueEntriesPersistenceResultSchema.parse({ removedCount });
      })
  };

  return {
    readEntries: (): readonly ChartsLocalSyncQueueEntryPersistenceRecord[] =>
      [...entries.values()].map(cloneEntry),
    readOperations: (): readonly RecordedInMemoryChartsLocalSyncQueueOperation[] => [...operations],
    repository
  };
};
