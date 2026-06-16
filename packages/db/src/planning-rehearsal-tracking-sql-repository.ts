import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema,
  ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema,
  PlanningRehearsalAcknowledgementPersistenceRecordSchema,
  PlanningRehearsalAssetVisibilityPersistenceRecordSchema,
  RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema,
  SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema,
  type ListPlanningRehearsalAcknowledgementsPersistenceOperation,
  type ListPlanningRehearsalAssetVisibilityPersistenceOperation,
  type PlanningRehearsalAcknowledgementPersistenceRecord,
  type PlanningRehearsalAcknowledgementPersistenceRepository,
  type PlanningRehearsalAssetVisibilityPersistenceRecord,
  type PlanningRehearsalAssetVisibilityPersistenceRepository,
  type RecordPlanningRehearsalAcknowledgementPersistenceOperation,
  type SetPlanningRehearsalAssetVisibilityPersistenceOperation
} from "./planning-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export interface PlanningRehearsalTrackingSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
    readonly rehearsalAcknowledgementId: () => string;
    readonly rehearsalAssetVisibilityId: () => string;
  };
}

export type PlanningRehearsalTrackingSqlRepository =
  PlanningRehearsalAcknowledgementPersistenceRepository &
    PlanningRehearsalAssetVisibilityPersistenceRepository;

const PlanningRehearsalAssetVisibilitySqlRowSchema = z
  .object({
    asset_id: z.string().min(1),
    asset_type: z.enum(["chart", "audio", "video", "document", "other"]),
    is_visible: z.boolean(),
    rehearsal_asset_visibility_id: z.string().min(1),
    service_id: z.string().min(1),
    service_item_id: z.string().min(1),
    tenant_id: z.string().min(1),
    title: z.string().min(1),
    updated_at: z.string().datetime(),
    visible_to_role_ids: z.array(z.string().min(1)).min(1)
  })
  .strict()
  .transform((row): PlanningRehearsalAssetVisibilityPersistenceRecord =>
    PlanningRehearsalAssetVisibilityPersistenceRecordSchema.parse({
      assetId: row.asset_id,
      assetType: row.asset_type,
      isVisible: row.is_visible,
      rehearsalAssetVisibilityId: row.rehearsal_asset_visibility_id,
      serviceId: row.service_id,
      serviceItemId: row.service_item_id,
      tenantId: row.tenant_id,
      title: row.title,
      updatedAt: row.updated_at,
      visibleToRoleIds: row.visible_to_role_ids
    })
  );

const PlanningRehearsalAcknowledgementSqlRowSchema = z
  .object({
    acknowledged_at: z.string().datetime(),
    asset_id: z.string().min(1),
    assignment_id: z.string().min(1),
    notes: z.string().min(1).nullable().optional(),
    person_id: z.string().min(1),
    readiness_signal: z.enum(["ready", "needs-practice", "blocked"]),
    rehearsal_acknowledgement_id: z.string().min(1),
    service_id: z.string().min(1),
    service_item_id: z.string().min(1),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningRehearsalAcknowledgementPersistenceRecord =>
    PlanningRehearsalAcknowledgementPersistenceRecordSchema.parse({
      acknowledgedAt: row.acknowledged_at,
      assetId: row.asset_id,
      assignmentId: row.assignment_id,
      ...(row.notes !== undefined && row.notes !== null ? { notes: row.notes } : {}),
      personId: row.person_id,
      readinessSignal: row.readiness_signal,
      rehearsalAcknowledgementId: row.rehearsal_acknowledgement_id,
      serviceId: row.service_id,
      serviceItemId: row.service_item_id,
      tenantId: row.tenant_id
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
  dependencies: PlanningRehearsalTrackingSqlRepositoryDependencies,
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

export const createPlanningRehearsalTrackingSqlRepository = (
  dependencies: PlanningRehearsalTrackingSqlRepositoryDependencies
): PlanningRehearsalTrackingSqlRepository => ({
  listRehearsalAcknowledgements: async (
    rawOperation: ListPlanningRehearsalAcknowledgementsPersistenceOperation
  ): Promise<readonly PlanningRehearsalAcknowledgementPersistenceRecord[]> => {
    const operation =
      ListPlanningRehearsalAcknowledgementsPersistenceOperationSchema.parse(
        rawOperation
      );
    const result = await dependencies.executor.query({
      name: "planning.rehearsal_acknowledgements.list_for_service",
      parameters: [
        operation.options.context.tenantId,
        operation.input.serviceId,
        operation.input.serviceItemId ?? null,
        operation.input.assignmentId ?? null,
        operation.input.personId ?? null,
        operation.input.assetId ?? null
      ],
      sql: `
SELECT
  tenant_id,
  rehearsal_acknowledgement_id,
  service_id,
  service_item_id,
  assignment_id,
  person_id,
  asset_id,
  readiness_signal,
  acknowledged_at,
  notes
FROM planning_rehearsal_acknowledgements
WHERE tenant_id = $1
  AND service_id = $2
  AND ($3::text IS NULL OR service_item_id = $3)
  AND ($4::text IS NULL OR assignment_id = $4)
  AND ($5::text IS NULL OR person_id = $5)
  AND ($6::text IS NULL OR asset_id = $6)
ORDER BY acknowledged_at DESC, rehearsal_acknowledgement_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlanningRehearsalAcknowledgementSqlRowSchema).parse(result.rows);
  },

  listRehearsalAssetVisibility: async (
    rawOperation: ListPlanningRehearsalAssetVisibilityPersistenceOperation
  ): Promise<readonly PlanningRehearsalAssetVisibilityPersistenceRecord[]> => {
    const operation =
      ListPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse(
        rawOperation
      );
    const result = await dependencies.executor.query({
      name: "planning.rehearsal_asset_visibility.list_for_service",
      parameters: [
        operation.options.context.tenantId,
        operation.input.serviceId,
        operation.input.serviceItemId ?? null
      ],
      sql: `
SELECT
  tenant_id,
  rehearsal_asset_visibility_id,
  service_id,
  service_item_id,
  asset_id,
  asset_type,
  title,
  is_visible,
  visible_to_role_ids,
  updated_at
FROM planning_rehearsal_asset_visibility
WHERE tenant_id = $1
  AND service_id = $2
  AND ($3::text IS NULL OR service_item_id = $3)
ORDER BY service_item_id, title, rehearsal_asset_visibility_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlanningRehearsalAssetVisibilitySqlRowSchema).parse(result.rows);
  },

  recordRehearsalAcknowledgement: async (
    rawOperation: RecordPlanningRehearsalAcknowledgementPersistenceOperation
  ): Promise<PlanningRehearsalAcknowledgementPersistenceRecord> => {
    const operation =
      RecordPlanningRehearsalAcknowledgementPersistenceOperationSchema.parse(
        rawOperation
      );
    const now = dependencies.clock();
    const rehearsalAcknowledgementId =
      dependencies.ids.rehearsalAcknowledgementId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningRehearsalAcknowledgementPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.rehearsal_acknowledgements.record",
          parameters: [
            operation.options.context.tenantId,
            rehearsalAcknowledgementId,
            operation.input.serviceId,
            operation.input.serviceItemId,
            operation.input.assignmentId,
            operation.input.personId,
            operation.input.assetId,
            operation.input.readinessSignal,
            operation.input.acknowledgedAt,
            operation.input.notes ?? null
          ],
          sql: `
INSERT INTO planning_rehearsal_acknowledgements (
  tenant_id,
  rehearsal_acknowledgement_id,
  service_id,
  service_item_id,
  assignment_id,
  person_id,
  asset_id,
  readiness_signal,
  acknowledged_at,
  notes
)
SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
WHERE EXISTS (
  SELECT 1
  FROM planning_services service
  WHERE service.tenant_id = $1
    AND service.service_id = $3
)
  AND EXISTS (
    SELECT 1
    FROM planning_service_items service_item
    WHERE service_item.tenant_id = $1
      AND service_item.service_id = $3
      AND service_item.service_item_id = $4
  )
  AND EXISTS (
    SELECT 1
    FROM planning_assignments assignment
    WHERE assignment.tenant_id = $1
      AND assignment.service_id = $3
      AND assignment.assignment_id = $5
      AND assignment.person_id = $6
  )
RETURNING
  tenant_id,
  rehearsal_acknowledgement_id,
  service_id,
  service_item_id,
  assignment_id,
  person_id,
  asset_id,
  readiness_signal,
  acknowledged_at,
  notes
`.trim(),
          transaction
        });
        const acknowledgement = PlanningRehearsalAcknowledgementSqlRowSchema.parse(
          firstRow(
            result.rows,
            "Planning rehearsal acknowledgement record returned no row."
          )
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "recordRehearsalAcknowledgement",
          requestId: operation.options.context.requestId,
          targetAggregateId: acknowledgement.rehearsalAcknowledgementId,
          tenantId: operation.options.context.tenantId
        });

        return acknowledgement;
      }
    );
  },

  setRehearsalAssetVisibility: async (
    rawOperation: SetPlanningRehearsalAssetVisibilityPersistenceOperation
  ): Promise<PlanningRehearsalAssetVisibilityPersistenceRecord> => {
    const operation =
      SetPlanningRehearsalAssetVisibilityPersistenceOperationSchema.parse(
        rawOperation
      );
    const now = dependencies.clock();
    const rehearsalAssetVisibilityId =
      dependencies.ids.rehearsalAssetVisibilityId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningRehearsalAssetVisibilityPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.rehearsal_asset_visibility.set",
          parameters: [
            operation.options.context.tenantId,
            rehearsalAssetVisibilityId,
            operation.input.serviceId,
            operation.input.serviceItemId,
            operation.input.assetId,
            operation.input.assetType,
            operation.input.title,
            operation.input.isVisible,
            operation.input.visibleToRoleIds,
            operation.input.updatedAt
          ],
          sql: `
WITH updated AS (
  UPDATE planning_rehearsal_asset_visibility
  SET
    asset_type = $6,
    title = $7,
    is_visible = $8,
    visible_to_role_ids = $9,
    updated_at = $10
  WHERE tenant_id = $1
    AND service_id = $3
    AND service_item_id = $4
    AND asset_id = $5
  RETURNING
    tenant_id,
    rehearsal_asset_visibility_id,
    service_id,
    service_item_id,
    asset_id,
    asset_type,
    title,
    is_visible,
    visible_to_role_ids,
    updated_at
),
inserted AS (
  INSERT INTO planning_rehearsal_asset_visibility (
    tenant_id,
    rehearsal_asset_visibility_id,
    service_id,
    service_item_id,
    asset_id,
    asset_type,
    title,
    is_visible,
    visible_to_role_ids,
    updated_at
  )
  SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
  WHERE NOT EXISTS (SELECT 1 FROM updated)
    AND EXISTS (
      SELECT 1
      FROM planning_services service
      WHERE service.tenant_id = $1
        AND service.service_id = $3
    )
    AND EXISTS (
      SELECT 1
      FROM planning_service_items service_item
      WHERE service_item.tenant_id = $1
        AND service_item.service_id = $3
        AND service_item.service_item_id = $4
    )
  RETURNING
    tenant_id,
    rehearsal_asset_visibility_id,
    service_id,
    service_item_id,
    asset_id,
    asset_type,
    title,
    is_visible,
    visible_to_role_ids,
    updated_at
)
SELECT *
FROM updated
UNION ALL
SELECT *
FROM inserted
`.trim(),
          transaction
        });
        const visibility = PlanningRehearsalAssetVisibilitySqlRowSchema.parse(
          firstRow(
            result.rows,
            "Planning rehearsal asset visibility set returned no row."
          )
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "setRehearsalAssetVisibility",
          requestId: operation.options.context.requestId,
          targetAggregateId: visibility.rehearsalAssetVisibilityId,
          tenantId: operation.options.context.tenantId
        });

        return visibility;
      }
    );
  }
});
