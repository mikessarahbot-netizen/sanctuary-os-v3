import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  CleanupPresenterLocalSyncQueueEntriesPersistenceOperationSchema,
  CleanupPresenterLocalSyncQueueEntriesPersistenceResultSchema,
  CountPresenterLocalSyncQueueEntriesByStatusPersistenceOperationSchema,
  EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema,
  GetPresenterLocalSyncQueueEntryPersistenceOperationSchema,
  ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperationSchema,
  MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema,
  MarkPresenterLocalSyncQueueEntryFailedPersistenceOperationSchema,
  PresenterLocalSyncQueueEntryMutationResultSchema,
  PresenterLocalSyncQueueEntryPersistenceRecordSchema,
  PresenterLocalSyncQueueStatusCountsSchema,
  PresenterLocalSyncQueueStatusPersistenceSchema,
  TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema,
  listPresenterLocalSyncQueueEntriesReadyForReplay,
  type CleanupPresenterLocalSyncQueueEntriesPersistenceOperation,
  type CleanupPresenterLocalSyncQueueEntriesPersistenceResult,
  type CountPresenterLocalSyncQueueEntriesByStatusPersistenceOperation,
  type EnqueuePresenterLocalSyncQueueEntryPersistenceOperation,
  type GetPresenterLocalSyncQueueEntryPersistenceOperation,
  type ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperation,
  type MarkPresenterLocalSyncQueueEntryConflictPersistenceOperation,
  type MarkPresenterLocalSyncQueueEntryFailedPersistenceOperation,
  type PresenterLocalSyncQueueEntryMutationResult,
  type PresenterLocalSyncQueueEntryPersistenceRecord,
  type PresenterLocalSyncQueuePersistenceRepository,
  type PresenterLocalSyncQueueStatusCounts,
  type PresenterLocalSyncQueueStatusPersistence,
  type TransitionPresenterLocalSyncQueueEntryPersistenceOperation
} from "./presenter-repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

/**
 * Local sync queue storage only needs to issue parameterized statements. The
 * SQLite-compatible adapter keeps every mutation to a single statement (using
 * RETURNING), so it never needs to open its own transaction; callers may still
 * supply one through the operation options to compose larger units of work.
 */
export type PresenterLocalSyncQueueSqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface PresenterLocalSyncQueueSqlRepositoryDependencies {
  readonly executor: PresenterLocalSyncQueueSqlExecutor;
}

const localSyncQueueColumns = `
  tenant_id,
  queue_entry_id,
  presentation_id,
  actor_id,
  request_id,
  base_revision,
  operation,
  payload_json,
  status,
  conflict_json,
  safe_error_message,
  attempt_count,
  queued_at,
  last_attempted_at,
  schema_version,
  created_at,
  updated_at
`.trim();

/**
 * Deterministic JSON serialization with recursively sorted object keys so that
 * stored payloads and conflict details are byte-stable regardless of the key
 * order produced upstream. Stability matters for queue comparisons and for any
 * future checksum/idempotency tooling layered on top of the stored rows.
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

const parseJsonColumn = (raw: string, columnName: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Presenter local sync queue ${columnName} is not valid JSON.`);
  }
};

const PresenterLocalSyncQueueEntrySqlRowSchema = z
  .object({
    actor_id: z.string().min(1),
    attempt_count: z.number().int().nonnegative(),
    base_revision: z.string().min(1),
    conflict_json: z.string().min(1).nullable().optional(),
    created_at: z.string().datetime(),
    last_attempted_at: z.string().datetime().nullable().optional(),
    operation: z.string().min(1),
    payload_json: z.string().min(1),
    presentation_id: z.string().min(1),
    queue_entry_id: z.string().min(1),
    queued_at: z.string().datetime(),
    request_id: z.string().min(1),
    safe_error_message: z.string().min(1).nullable().optional(),
    schema_version: z.string().min(1),
    status: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row, context): PresenterLocalSyncQueueEntryPersistenceRecord => {
    const storedOperation = parseJsonColumn(row.payload_json, "payload_json");

    if (
      storedOperation === null ||
      typeof storedOperation !== "object" ||
      Array.isArray(storedOperation) ||
      (storedOperation as Record<string, unknown>).operation !== row.operation
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Presenter local sync queue operation column must match the stored operation payload.",
        path: ["payload_json"]
      });

      return z.NEVER;
    }

    const conflict =
      row.conflict_json === undefined || row.conflict_json === null
        ? undefined
        : parseJsonColumn(row.conflict_json, "conflict_json");

    return PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse({
      actorId: row.actor_id,
      attemptCount: row.attempt_count,
      baseRevision: row.base_revision,
      ...(conflict !== undefined ? { conflict } : {}),
      createdAt: row.created_at,
      ...(row.last_attempted_at !== undefined && row.last_attempted_at !== null
        ? { lastAttemptedAt: row.last_attempted_at }
        : {}),
      operation: storedOperation,
      presentationId: row.presentation_id,
      queuedAt: row.queued_at,
      queueEntryId: row.queue_entry_id,
      requestId: row.request_id,
      ...(row.safe_error_message !== undefined && row.safe_error_message !== null
        ? { safeErrorMessage: row.safe_error_message }
        : {}),
      schemaVersion: row.schema_version,
      status: row.status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    });
  });

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const mapEntryRow = (
  expectedTenantId: string,
  row: PlanningSqlRow
): PresenterLocalSyncQueueEntryPersistenceRecord => {
  const entry = PresenterLocalSyncQueueEntrySqlRowSchema.parse(row);

  if (entry.tenantId !== expectedTenantId) {
    throw new Error("Presenter local sync queue row tenant mismatch.");
  }

  return entry;
};

const parseOptionalEntryRow = (
  expectedTenantId: string,
  rows: readonly PlanningSqlRow[]
): PresenterLocalSyncQueueEntryPersistenceRecord | null => {
  const row = rows[0];

  return row === undefined ? null : mapEntryRow(expectedTenantId, row);
};

const requireMutatedEntryRow = (
  expectedTenantId: string,
  result: PlanningSqlQueryResult,
  errorMessage: string
): PresenterLocalSyncQueueEntryMutationResult => {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(errorMessage);
  }

  return PresenterLocalSyncQueueEntryMutationResultSchema.parse({
    entry: mapEntryRow(expectedTenantId, row)
  });
};

const PresenterLocalSyncQueueStatusCountRowSchema = z
  .object({
    count: z.number().int().nonnegative(),
    status: PresenterLocalSyncQueueStatusPersistenceSchema
  })
  .strict();

export const createPresenterLocalSyncQueueSqlRepository = (
  dependencies: PresenterLocalSyncQueueSqlRepositoryDependencies
): PresenterLocalSyncQueuePersistenceRepository => ({
  enqueue: async (
    rawOperation: EnqueuePresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      EnqueuePresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const entry = operation.input.entry;

    if (entry.tenantId !== operation.options.context.tenantId) {
      throw new Error("Presenter local sync queue entry tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "presenter.local_sync_queue.enqueue",
      parameters: [
        entry.tenantId,
        entry.queueEntryId,
        entry.presentationId,
        entry.actorId,
        entry.requestId,
        entry.baseRevision,
        entry.operation.operation,
        canonicalJsonStringify(entry.operation),
        entry.status,
        entry.conflict === undefined ? null : canonicalJsonStringify(entry.conflict),
        entry.safeErrorMessage ?? null,
        entry.attemptCount,
        entry.queuedAt,
        entry.lastAttemptedAt ?? null,
        entry.schemaVersion,
        entry.createdAt,
        entry.updatedAt
      ],
      sql: `
INSERT INTO presenter_local_sync_queue_entries (
  ${localSyncQueueColumns}
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PresenterLocalSyncQueueEntryMutationResultSchema.parse({ entry });
  },

  getById: async (
    rawOperation: GetPresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryPersistenceRecord | null> => {
    const operation =
      GetPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.get_by_id",
      parameters: [operation.options.context.tenantId, operation.input.queueEntryId],
      sql: `
SELECT ${localSyncQueueColumns}
FROM presenter_local_sync_queue_entries
WHERE tenant_id = ?
  AND queue_entry_id = ?
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalEntryRow(operation.options.context.tenantId, result.rows);
  },

  listReadyForReplay: async (
    rawOperation: ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperation
  ): Promise<readonly PresenterLocalSyncQueueEntryPersistenceRecord[]> => {
    const operation =
      ListPresenterLocalSyncQueueEntriesReadyForReplayPersistenceOperationSchema.parse(
        rawOperation
      );
    const presentationId = operation.input.presentationId ?? null;
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.list_ready_for_replay",
      parameters: [operation.options.context.tenantId, presentationId, presentationId],
      sql: `
SELECT ${localSyncQueueColumns}
FROM presenter_local_sync_queue_entries
WHERE tenant_id = ?
  AND (? IS NULL OR presentation_id = ?)
ORDER BY presentation_id, queued_at, queue_entry_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });
    const entries = result.rows.map((row) =>
      mapEntryRow(operation.options.context.tenantId, row)
    );

    return listPresenterLocalSyncQueueEntriesReadyForReplay(entries, operation.input);
  },

  markReplaying: async (
    rawOperation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.mark_replaying",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
    attempt_count = attempt_count + 1,
    last_attempted_at = ?,
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
      "Presenter local sync queue replay transition did not match a tenant-scoped entry."
    );
  },

  markSynced: async (
    rawOperation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.mark_synced",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
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
      "Presenter local sync queue sync transition did not match a tenant-scoped entry."
    );
  },

  markConflict: async (
    rawOperation: MarkPresenterLocalSyncQueueEntryConflictPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      MarkPresenterLocalSyncQueueEntryConflictPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.mark_conflict",
      parameters: [
        operation.input.transition.to,
        canonicalJsonStringify(operation.input.conflict),
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
    conflict_json = ?,
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
      "Presenter local sync queue conflict transition did not match a tenant-scoped entry."
    );
  },

  markFailed: async (
    rawOperation: MarkPresenterLocalSyncQueueEntryFailedPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      MarkPresenterLocalSyncQueueEntryFailedPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.mark_failed",
      parameters: [
        operation.input.transition.to,
        operation.input.safeErrorMessage,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
    safe_error_message = ?,
    conflict_json = NULL,
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
      "Presenter local sync queue failure transition did not match a tenant-scoped entry."
    );
  },

  requeue: async (
    rawOperation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.requeue",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
    conflict_json = NULL,
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
      "Presenter local sync queue requeue transition did not match a tenant-scoped entry."
    );
  },

  cancel: async (
    rawOperation: TransitionPresenterLocalSyncQueueEntryPersistenceOperation
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const operation =
      TransitionPresenterLocalSyncQueueEntryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.cancel",
      parameters: [
        operation.input.transition.to,
        operation.input.transition.transitionedAt,
        operation.options.context.tenantId,
        operation.input.queueEntryId,
        operation.input.transition.from
      ],
      sql: `
UPDATE presenter_local_sync_queue_entries
SET status = ?,
    conflict_json = NULL,
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
      "Presenter local sync queue cancel transition did not match a tenant-scoped entry."
    );
  },

  cleanupSyncedAndCancelled: async (
    rawOperation: CleanupPresenterLocalSyncQueueEntriesPersistenceOperation
  ): Promise<CleanupPresenterLocalSyncQueueEntriesPersistenceResult> => {
    const operation =
      CleanupPresenterLocalSyncQueueEntriesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.cleanup_synced_and_cancelled",
      parameters: [operation.options.context.tenantId, operation.input.olderThan],
      sql: `
DELETE FROM presenter_local_sync_queue_entries
WHERE tenant_id = ?
  AND status IN ('synced', 'cancelled')
  AND updated_at < ?
RETURNING queue_entry_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CleanupPresenterLocalSyncQueueEntriesPersistenceResultSchema.parse({
      removedCount: result.rows.length
    });
  },

  countByStatus: async (
    rawOperation: CountPresenterLocalSyncQueueEntriesByStatusPersistenceOperation
  ): Promise<PresenterLocalSyncQueueStatusCounts> => {
    const operation =
      CountPresenterLocalSyncQueueEntriesByStatusPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.local_sync_queue.count_by_status",
      parameters: [operation.options.context.tenantId],
      sql: `
SELECT status, COUNT(*) AS count
FROM presenter_local_sync_queue_entries
WHERE tenant_id = ?
GROUP BY status
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });
    const counts: Record<PresenterLocalSyncQueueStatusPersistence, number> = {
      cancelled: 0,
      conflict: 0,
      failed: 0,
      queued: 0,
      replaying: 0,
      synced: 0
    };

    for (const row of result.rows) {
      const parsedRow = PresenterLocalSyncQueueStatusCountRowSchema.parse(row);
      counts[parsedRow.status] = parsedRow.count;
    }

    return PresenterLocalSyncQueueStatusCountsSchema.parse(counts);
  }
});
