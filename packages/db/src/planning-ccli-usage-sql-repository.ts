import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  ListPlanningCcliUsageLogsPersistenceOperationSchema,
  PlanningCcliUsageLogPersistenceRecordSchema,
  RecordPlanningCcliUsagePersistenceOperationSchema,
  type ListPlanningCcliUsageLogsPersistenceOperation,
  type PlanningCcliUsageLogPersistenceRecord,
  type PlanningCcliUsageLogPersistenceRepository,
  type RecordPlanningCcliUsagePersistenceOperation
} from "./planning-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export interface PlanningCcliUsageSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
    readonly ccliUsageLogId: () => string;
  };
}

const PlanningCcliUsageLogSqlRowSchema = z
  .object({
    ccli_song_number: z.string().min(1).nullable().optional(),
    ccli_usage_log_id: z.string().min(1),
    notes: z.string().min(1).nullable().optional(),
    reporting_status: z.enum(["pending", "reported", "skipped"]),
    service_id: z.string().min(1),
    service_item_id: z.string().min(1).nullable().optional(),
    song_id: z.string().min(1),
    tenant_id: z.string().min(1),
    title: z.string().min(1),
    usage_type: z.enum(["service", "rehearsal", "livestream"]),
    used_at: z.string().datetime()
  })
  .strict()
  .transform((row): PlanningCcliUsageLogPersistenceRecord =>
    PlanningCcliUsageLogPersistenceRecordSchema.parse({
      ...(row.ccli_song_number !== undefined && row.ccli_song_number !== null
        ? { ccliSongNumber: row.ccli_song_number }
        : {}),
      ccliUsageLogId: row.ccli_usage_log_id,
      ...(row.notes !== undefined && row.notes !== null ? { notes: row.notes } : {}),
      reportingStatus: row.reporting_status,
      serviceId: row.service_id,
      ...(row.service_item_id !== undefined && row.service_item_id !== null
        ? { serviceItemId: row.service_item_id }
        : {}),
      songId: row.song_id,
      tenantId: row.tenant_id,
      title: row.title,
      usageType: row.usage_type,
      usedAt: row.used_at
    })
  );

const firstRow = (
  resultRows: readonly PlanningSqlRow[],
  errorMessage: string
): PlanningSqlRow => {
  const row = resultRows[0];

  if (row === undefined) {
    throw new Error(errorMessage);
  }

  return row;
};

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const runWithWriteTransaction = async <Result>(
  executor: PlanningSqlExecutor,
  suppliedTransaction: TransactionHandle | undefined,
  operation: (transaction: TransactionHandle) => Promise<Result>
): Promise<Result> => {
  if (suppliedTransaction !== undefined) {
    return operation(suppliedTransaction);
  }

  return executor.runInTransaction(operation);
};

const insertAuditLog = async (
  dependencies: PlanningCcliUsageSqlRepositoryDependencies,
  transaction: TransactionHandle,
  audit: {
    readonly actorId: string | undefined;
    readonly createdAt: string;
    readonly intent: RepositoryMutationIntent;
    readonly operationName: string;
    readonly requestId: string;
    readonly targetAggregateId: string;
    readonly tenantId: string;
  }
): Promise<void> => {
  await dependencies.executor.query({
    name: "planning.audit.insert",
    parameters: [
      audit.tenantId,
      dependencies.ids.auditLogId(),
      audit.actorId ?? null,
      audit.requestId,
      audit.operationName,
      audit.intent,
      audit.targetAggregateId,
      null,
      audit.createdAt
    ],
    sql: `
INSERT INTO planning_audit_log (
  tenant_id,
  audit_log_id,
  actor_id,
  request_id,
  operation_name,
  mutation_intent,
  target_aggregate_id,
  confirmation_reason,
  created_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`.trim(),
    transaction
  });
};

export const createPlanningCcliUsageSqlRepository = (
  dependencies: PlanningCcliUsageSqlRepositoryDependencies
): PlanningCcliUsageLogPersistenceRepository => ({
  listCcliUsageLogs: async (
    rawOperation: ListPlanningCcliUsageLogsPersistenceOperation
  ): Promise<readonly PlanningCcliUsageLogPersistenceRecord[]> => {
    const operation = ListPlanningCcliUsageLogsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "planning.ccli_usage.list_for_service",
      parameters: [
        operation.options.context.tenantId,
        operation.input.serviceId,
        operation.input.reportingStatus ?? null
      ],
      sql: `
SELECT
  tenant_id,
  ccli_usage_log_id,
  service_id,
  service_item_id,
  song_id,
  title,
  ccli_song_number,
  usage_type,
  reporting_status,
  used_at,
  notes
FROM planning_ccli_usage_logs
WHERE tenant_id = $1
  AND service_id = $2
  AND ($3::text IS NULL OR reporting_status = $3)
ORDER BY used_at DESC, ccli_usage_log_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlanningCcliUsageLogSqlRowSchema).parse(result.rows);
  },

  recordCcliUsage: async (
    rawOperation: RecordPlanningCcliUsagePersistenceOperation
  ): Promise<PlanningCcliUsageLogPersistenceRecord> => {
    const operation = RecordPlanningCcliUsagePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const ccliUsageLogId = dependencies.ids.ccliUsageLogId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningCcliUsageLogPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.ccli_usage.record",
          parameters: [
            operation.options.context.tenantId,
            ccliUsageLogId,
            operation.input.serviceId,
            operation.input.serviceItemId ?? null,
            operation.input.songId,
            operation.input.title,
            operation.input.ccliSongNumber ?? null,
            operation.input.usageType,
            "pending",
            operation.input.usedAt,
            operation.input.notes ?? null,
            now,
            now
          ],
          sql: `
INSERT INTO planning_ccli_usage_logs (
  tenant_id,
  ccli_usage_log_id,
  service_id,
  service_item_id,
  song_id,
  title,
  ccli_song_number,
  usage_type,
  reporting_status,
  used_at,
  notes,
  created_at,
  updated_at
)
SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
WHERE EXISTS (
  SELECT 1
  FROM planning_services service
  WHERE service.tenant_id = $1
    AND service.service_id = $3
)
  AND (
    $4::text IS NULL
    OR EXISTS (
      SELECT 1
      FROM planning_service_items service_item
      WHERE service_item.tenant_id = $1
        AND service_item.service_id = $3
        AND service_item.service_item_id = $4
    )
  )
RETURNING
  tenant_id,
  ccli_usage_log_id,
  service_id,
  service_item_id,
  song_id,
  title,
  ccli_song_number,
  usage_type,
  reporting_status,
  used_at,
  notes
`.trim(),
          transaction
        });
        const usageLog = PlanningCcliUsageLogSqlRowSchema.parse(
          firstRow(result.rows, "Planning CCLI usage record returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "recordCcliUsage",
          requestId: operation.options.context.requestId,
          targetAggregateId: usageLog.ccliUsageLogId,
          tenantId: operation.options.context.tenantId
        });

        return usageLog;
      }
    );
  }
});
