import { z } from "zod";
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
  PlayLocalSyncQueueStatusPersistenceSchema,
  PrunePlayLocalSyncQueueEntriesPersistenceOperationSchema,
  PrunePlayLocalSyncQueueEntriesPersistenceResultSchema,
  RequeuePlayLocalSyncQueueEntryPersistenceOperationSchema,
  type CountPlayLocalSyncQueueEntriesByStatusPersistenceOperation,
  type EnqueuePlayLocalSyncQueueEntryPersistenceOperation,
  type GetPlayLocalSyncQueueEntryPersistenceOperation,
  type ListPendingPlayLocalSyncQueueEntriesPersistenceOperation,
  type MarkPlayLocalSyncQueueEntryFailedPersistenceOperation,
  type MarkPlayLocalSyncQueueEntryInFlightPersistenceOperation,
  type MarkPlayLocalSyncQueueEntrySyncedPersistenceOperation,
  type PlayLocalSyncQueueEntryMutationResult,
  type PlayLocalSyncQueueEntryPersistenceRecord,
  type PlayLocalSyncQueuePersistenceRepository,
  type PlayLocalSyncQueueStatusCounts,
  type PlayLocalSyncQueueStatusPersistence,
  type PrunePlayLocalSyncQueueEntriesPersistenceOperation,
  type PrunePlayLocalSyncQueueEntriesPersistenceResult,
  type RequeuePlayLocalSyncQueueEntryPersistenceOperation
} from "./play-local-sync-queue-repository-contracts.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

/**
 * The Play local sync queue store only needs to issue parameterized statements.
 * Every mutation is a single statement (using RETURNING), so it never opens its
 * own transaction; callers may still supply one through the operation options to
 * compose larger units of work. The injected executor is the SQLite-compatible
 * adapter, exactly like the Play command repository.
 */
export type PlayLocalSyncQueueSqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface PlayLocalSyncQueueSqlRepositoryDependencies {
  readonly executor: PlayLocalSyncQueueSqlExecutor;
}

const localSyncQueueColumns = `
  tenant_id,
  queue_entry_id,
  track_set_id,
  actor_id,
  request_id,
  operation,
  payload_json,
  status,
  safe_error_message,
  attempt_count,
  queued_at,
  last_attempted_at,
  next_attempt_at,
  schema_version,
  created_at,
  updated_at
`.trim();

/**
 * Deterministic JSON serialization with recursively sorted object keys so that
 * stored payloads are byte-stable regardless of the key order produced upstream.
 * Stability matters for queue comparisons and for any future checksum or
 * idempotency tooling layered on top of the stored rows.
 */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((element) => canonicalize(element));
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = canonicalize((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
};

const canonicalJsonStringify = (value: unknown): string => JSON.stringify(canonicalize(value));

const parseJsonColumn = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Play local sync queue payload_json is not valid JSON.");
  }
};

const PlayLocalSyncQueueEntrySqlRowSchema = z
  .object({
    actor_id: z.string().min(1),
    attempt_count: z.number().int().nonnegative(),
    created_at: z.string().datetime(),
    last_attempted_at: z.string().datetime().nullable().optional(),
    next_attempt_at: z.string().datetime().nullable().optional(),
    operation: z.string().min(1),
    payload_json: z.string().min(1),
    queue_entry_id: z.string().min(1),
    queued_at: z.string().datetime(),
    request_id: z.string().min(1),
    safe_error_message: z.string().min(1).nullable().optional(),
    schema_version: z.string().min(1),
    status: z.string().min(1),
    tenant_id: z.string().min(1),
    track_set_id: z.string().min(1).nullable().optional(),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row, context): PlayLocalSyncQueueEntryPersistenceRecord => {
    const storedPayload = parseJsonColumn(row.payload_json);

    if (
      storedPayload === null ||
      typeof storedPayload !== "object" ||
      Array.isArray(storedPayload) ||
      (storedPayload as Record<string, unknown>).operation !== row.operation
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Play local sync queue operation column must match the stored operation payload.",
        path: ["payload_json"]
      });

      return z.NEVER;
    }

    return PlayLocalSyncQueueEntryPersistenceRecordSchema.parse({
      actorId: row.actor_id,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      ...(row.last_attempted_at !== undefined && row.last_attempted_at !== null
        ? { lastAttemptedAt: row.last_attempted_at }
        : {}),
      ...(row.next_attempt_at !== undefined && row.next_attempt_at !== null
        ? { nextAttemptAt: row.next_attempt_at }
        : {}),
      operation: storedPayload,
      queuedAt: row.queued_at,
      queueEntryId: row.queue_entry_id,
      requestId: row.request_id,
      ...(row.safe_error_message !== undefined && row.safe_error_message !== null
        ? { safeErrorMessage: row.safe_error_message }
        : {}),
      schemaVersion: row.schema_version,
      status: row.status,
      tenantId: row.tenant_id,
      ...(row.track_set_id !== undefined && row.track_set_id !== null
        ? { trackSetId: row.track_set_id }
        : {}),
      updatedAt: row.updated_at
    });
  });

const PlayLocalSyncQueueStatusCountRowSchema = z
  .object({
    count: z.number().int().nonnegative(),
    status: PlayLocalSyncQueueStatusPersistenceSchema
  })
  .strict();

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const mapEntryRow = (
  expectedTenantId: string,
  row: PlanningSqlRow
): PlayLocalSyncQueueEntryPersistenceRecord => {
  const entry = PlayLocalSyncQueueEntrySqlRowSchema.parse(row);

  if (entry.tenantId !== expectedTenantId) {
    throw new Error("Play local sync queue row tenant mismatch.");
  }

  return entry;
};

const parseOptionalEntryRow = (
  expectedTenantId: string,
  rows: readonly PlanningSqlRow[]
): PlayLocalSyncQueueEntryPersistenceRecord | null => {
  const row = rows[0];

  return row === undefined ? null : mapEntryRow(expectedTenantId, row);
};

const requireMutatedEntryRow = (
  expectedTenantId: string,
  result: PlanningSqlQueryResult,
  errorMessage: string
): PlayLocalSyncQueueEntryMutationResult => {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(errorMessage);
  }

  return PlayLocalSyncQueueEntryMutationResultSchema.parse({
    entry: mapEntryRow(expectedTenantId, row)
  });
};

export const createPlayLocalSyncQueueSqlRepository = (
  dependencies: PlayLocalSyncQueueSqlRepositoryDependencies
): PlayLocalSyncQueuePersistenceRepository => ({
  enqueue: async (
    rawOperation: EnqueuePlayLocalSyncQueueEntryPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const operation =
      EnqueuePlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const entry = operation.input.entry;

    if (entry.tenantId !== operation.options.context.tenantId) {
      throw new Error("Play local sync queue entry tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.local_sync_queue.enqueue",
      parameters: [
        entry.tenantId,
        entry.queueEntryId,
        entry.trackSetId ?? null,
        entry.actorId,
        entry.requestId,
        entry.operation.operation,
        canonicalJsonStringify(entry.operation),
        entry.status,
        entry.safeErrorMessage ?? null,
        entry.attemptCount,
        entry.queuedAt,
        entry.lastAttemptedAt ?? null,
        entry.nextAttemptAt ?? null,
        entry.schemaVersion,
        entry.createdAt,
        entry.updatedAt
      ],
      sql: `
INSERT INTO play_local_sync_queue_entries (
  ${localSyncQueueColumns}
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PlayLocalSyncQueueEntryMutationResultSchema.parse({ entry });
  },

  getById: async (
    rawOperation: GetPlayLocalSyncQueueEntryPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryPersistenceRecord | null> => {
    const operation = GetPlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.get_by_id",
      parameters: [operation.options.context.tenantId, operation.input.queueEntryId],
      sql: `
SELECT ${localSyncQueueColumns}
FROM play_local_sync_queue_entries
WHERE tenant_id = ?
  AND queue_entry_id = ?
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalEntryRow(operation.options.context.tenantId, result.rows);
  },

  listPending: async (
    rawOperation: ListPendingPlayLocalSyncQueueEntriesPersistenceOperation
  ): Promise<readonly PlayLocalSyncQueueEntryPersistenceRecord[]> => {
    const operation =
      ListPendingPlayLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
    const trackSetId = operation.input.trackSetId ?? null;
    const limit = operation.input.limit ?? null;
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.list_pending",
      parameters: [operation.options.context.tenantId, trackSetId, trackSetId, limit, limit],
      sql: `
SELECT ${localSyncQueueColumns}
FROM play_local_sync_queue_entries
WHERE tenant_id = ?
  AND status = 'pending'
  AND (? IS NULL OR track_set_id = ?)
ORDER BY queued_at, queue_entry_id
LIMIT CASE WHEN ? IS NULL THEN -1 ELSE ? END
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return result.rows.map((row) => mapEntryRow(operation.options.context.tenantId, row));
  },

  markInFlight: async (
    rawOperation: MarkPlayLocalSyncQueueEntryInFlightPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const operation =
      MarkPlayLocalSyncQueueEntryInFlightPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.mark_in_flight",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE play_local_sync_queue_entries
SET status = ?,
    attempt_count = attempt_count + 1,
    last_attempted_at = ?,
    next_attempt_at = NULL,
    safe_error_message = NULL,
    updated_at = ?
WHERE tenant_id = ?
  AND queue_entry_id = ?
  AND status = ?
RETURNING ${localSyncQueueColumns}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return requireMutatedEntryRow(
      operation.options.context.tenantId,
      result,
      "Play local sync queue in-flight transition did not match a tenant-scoped entry."
    );
  },

  markSynced: async (
    rawOperation: MarkPlayLocalSyncQueueEntrySyncedPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const operation =
      MarkPlayLocalSyncQueueEntrySyncedPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.mark_synced",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE play_local_sync_queue_entries
SET status = ?,
    next_attempt_at = NULL,
    safe_error_message = NULL,
    updated_at = ?
WHERE tenant_id = ?
  AND queue_entry_id = ?
  AND status = ?
RETURNING ${localSyncQueueColumns}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return requireMutatedEntryRow(
      operation.options.context.tenantId,
      result,
      "Play local sync queue sync transition did not match a tenant-scoped entry."
    );
  },

  markFailed: async (
    rawOperation: MarkPlayLocalSyncQueueEntryFailedPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const operation =
      MarkPlayLocalSyncQueueEntryFailedPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.mark_failed",
      parameters: [
        operation.input.transition.to,
        operation.input.safeErrorMessage,
        operation.input.nextAttemptAt ?? null,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE play_local_sync_queue_entries
SET status = ?,
    safe_error_message = ?,
    next_attempt_at = ?,
    updated_at = ?
WHERE tenant_id = ?
  AND queue_entry_id = ?
  AND status = ?
RETURNING ${localSyncQueueColumns}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return requireMutatedEntryRow(
      operation.options.context.tenantId,
      result,
      "Play local sync queue failure transition did not match a tenant-scoped entry."
    );
  },

  requeue: async (
    rawOperation: RequeuePlayLocalSyncQueueEntryPersistenceOperation
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const operation =
      RequeuePlayLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.requeue",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE play_local_sync_queue_entries
SET status = ?,
    next_attempt_at = NULL,
    safe_error_message = NULL,
    updated_at = ?
WHERE tenant_id = ?
  AND queue_entry_id = ?
  AND status = ?
RETURNING ${localSyncQueueColumns}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return requireMutatedEntryRow(
      operation.options.context.tenantId,
      result,
      "Play local sync queue requeue transition did not match a tenant-scoped entry."
    );
  },

  pruneSynced: async (
    rawOperation: PrunePlayLocalSyncQueueEntriesPersistenceOperation
  ): Promise<PrunePlayLocalSyncQueueEntriesPersistenceResult> => {
    const operation =
      PrunePlayLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.prune_synced",
      parameters: [operation.options.context.tenantId, operation.input.olderThan],
      sql: `
DELETE FROM play_local_sync_queue_entries
WHERE tenant_id = ?
  AND status = 'synced'
  AND updated_at < ?
RETURNING queue_entry_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PrunePlayLocalSyncQueueEntriesPersistenceResultSchema.parse({
      removedCount: result.rows.length
    });
  },

  countByStatus: async (
    rawOperation: CountPlayLocalSyncQueueEntriesByStatusPersistenceOperation
  ): Promise<PlayLocalSyncQueueStatusCounts> => {
    const operation =
      CountPlayLocalSyncQueueEntriesByStatusPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.local_sync_queue.count_by_status",
      parameters: [operation.options.context.tenantId],
      sql: `
SELECT status, COUNT(*) AS count
FROM play_local_sync_queue_entries
WHERE tenant_id = ?
GROUP BY status
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });
    const counts: Record<PlayLocalSyncQueueStatusPersistence, number> = {
      failed: 0,
      "in-flight": 0,
      pending: 0,
      synced: 0
    };

    for (const row of result.rows) {
      const parsedRow = PlayLocalSyncQueueStatusCountRowSchema.parse(row);
      counts[parsedRow.status] = parsedRow.count;
    }

    return PlayLocalSyncQueueStatusCountsSchema.parse({
      failed: counts.failed,
      inFlight: counts["in-flight"],
      pending: counts.pending,
      synced: counts.synced
    });
  }
});
