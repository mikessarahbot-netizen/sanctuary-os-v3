import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  PlanningReadinessInputPersistenceRecordSchema,
  PlanningReadinessPersistenceRecordSchema,
  type PlanningReadinessInputPersistenceRecord,
  type PlanningReadinessPersistenceRecord,
  type PlanningReadinessPersistenceRepository
} from "./planning-repository-contracts.js";
import { RepositoryMutationIntentSchema } from "./repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export interface PlanningReadinessSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
  };
}

const NonEmptyStringSchema = z.string().min(1);

const LoadPlanningReadinessInputQuerySchema = z
  .object({
    requestId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    transaction: z
      .object({
        transactionId: NonEmptyStringSchema
      })
      .optional()
  })
  .strict();

const SavePlanningReadinessResultCommandSchema = z
  .object({
    actorId: NonEmptyStringSchema,
    intent: RepositoryMutationIntentSchema.optional(),
    requestId: NonEmptyStringSchema,
    result: PlanningReadinessPersistenceRecordSchema,
    serviceId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    transaction: z
      .object({
        transactionId: NonEmptyStringSchema
      })
      .optional()
  })
  .strict()
  .superRefine((command, context) => {
    if (command.result.tenantId !== command.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning readiness result tenant mismatch.",
        path: ["result", "tenantId"]
      });
    }

    if (command.result.serviceId !== command.serviceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning readiness result service mismatch.",
        path: ["result", "serviceId"]
      });
    }
  });

const PlanningReadinessInputSqlRowSchema = z
  .object({
    assignments: PlanningReadinessInputPersistenceRecordSchema.shape.assignments,
    ccli_statuses: PlanningReadinessInputPersistenceRecordSchema.shape.ccliStatuses,
    known_blockers: PlanningReadinessInputPersistenceRecordSchema.shape.knownBlockers,
    rehearsal_acknowledgements:
      PlanningReadinessInputPersistenceRecordSchema.shape.rehearsalAcknowledgements,
    required_roles: PlanningReadinessInputPersistenceRecordSchema.shape.requiredRoles,
    service_id: z.string().min(1),
    service_items: PlanningReadinessInputPersistenceRecordSchema.shape.serviceItems,
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningReadinessInputPersistenceRecord =>
    PlanningReadinessInputPersistenceRecordSchema.parse({
      assignments: row.assignments,
      ccliStatuses: row.ccli_statuses,
      knownBlockers: row.known_blockers,
      rehearsalAcknowledgements: row.rehearsal_acknowledgements,
      requiredRoles: row.required_roles,
      serviceId: row.service_id,
      serviceItems: row.service_items,
      tenantId: row.tenant_id
    })
  );

const PlanningReadinessResultSqlRowSchema = z
  .object({
    band: z.enum(["blocked", "needs-attention", "ready"]),
    checks: PlanningReadinessPersistenceRecordSchema.shape.checks,
    readiness_score: z.number().int().min(0).max(100),
    recommended_actions: PlanningReadinessPersistenceRecordSchema.shape.recommendedActions,
    risks: PlanningReadinessPersistenceRecordSchema.shape.risks,
    service_id: z.string().min(1),
    strengths: PlanningReadinessPersistenceRecordSchema.shape.strengths,
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningReadinessPersistenceRecord =>
    PlanningReadinessPersistenceRecordSchema.parse({
      band: row.band,
      checks: row.checks,
      readinessScore: row.readiness_score,
      recommendedActions: row.recommended_actions,
      risks: row.risks,
      serviceId: row.service_id,
      strengths: row.strengths,
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
  dependencies: PlanningReadinessSqlRepositoryDependencies,
  transaction: TransactionHandle,
  audit: {
    readonly actorId: string;
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
      audit.actorId,
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

export const createPlanningReadinessSqlRepository = (
  dependencies: PlanningReadinessSqlRepositoryDependencies
): PlanningReadinessPersistenceRepository => ({
  loadReadinessInput: async (
    rawQuery
  ): Promise<PlanningReadinessInputPersistenceRecord> => {
    const query = LoadPlanningReadinessInputQuerySchema.parse(rawQuery);
    const result = await dependencies.executor.query({
      name: "planning.readiness_input.load",
      parameters: [query.tenantId, query.serviceId],
      sql: `
WITH scoped_service AS (
  SELECT tenant_id, service_id
  FROM planning_services
  WHERE tenant_id = $1
    AND service_id = $2
),
service_items AS (
  SELECT
    service_item.tenant_id,
    service_item.service_id,
    service_item.service_item_id,
    service_item.title,
    service_item.duration_minutes,
    service_item.song_id,
    COALESCE(song.has_charts, false) AS has_chart,
    COALESCE(song.ccli_reporting_allowed, false) AS requires_ccli_log
  FROM planning_service_items service_item
  JOIN scoped_service service
    ON service.tenant_id = service_item.tenant_id
   AND service.service_id = service_item.service_id
  LEFT JOIN planning_song_library_items song
    ON song.tenant_id = service_item.tenant_id
   AND song.song_id = service_item.song_id
),
assignments AS (
  SELECT assignment_id, role_id, status
  FROM planning_assignments assignment
  JOIN scoped_service service
    ON service.tenant_id = assignment.tenant_id
   AND service.service_id = assignment.service_id
),
required_roles AS (
  SELECT DISTINCT role_id
  FROM planning_assignments assignment
  JOIN scoped_service service
    ON service.tenant_id = assignment.tenant_id
   AND service.service_id = assignment.service_id
),
visible_assets AS (
  SELECT DISTINCT visibility.service_item_id
  FROM planning_rehearsal_asset_visibility visibility
  JOIN scoped_service service
    ON service.tenant_id = visibility.tenant_id
   AND service.service_id = visibility.service_id
  WHERE visibility.is_visible = true
),
ccli_statuses AS (
  SELECT
    item.service_item_id,
    CASE
      WHEN item.requires_ccli_log = false THEN 'not-required'
      WHEN EXISTS (
        SELECT 1
        FROM planning_ccli_usage_logs usage_log
        WHERE usage_log.tenant_id = item.tenant_id
          AND usage_log.service_id = item.service_id
          AND usage_log.service_item_id = item.service_item_id
          AND usage_log.reporting_status = 'reported'
      ) THEN 'current'
      WHEN EXISTS (
        SELECT 1
        FROM planning_ccli_usage_logs usage_log
        WHERE usage_log.tenant_id = item.tenant_id
          AND usage_log.service_id = item.service_id
          AND usage_log.service_item_id = item.service_item_id
          AND usage_log.reporting_status = 'skipped'
      ) THEN 'skipped'
      WHEN EXISTS (
        SELECT 1
        FROM planning_ccli_usage_logs usage_log
        WHERE usage_log.tenant_id = item.tenant_id
          AND usage_log.service_id = item.service_id
          AND usage_log.service_item_id = item.service_item_id
      ) THEN 'pending'
      ELSE 'missing'
    END AS status
  FROM service_items item
),
acknowledgements AS (
  SELECT
    acknowledgement.assignment_id,
    acknowledgement.asset_id,
    acknowledgement.person_id,
    acknowledgement.readiness_signal,
    acknowledgement.service_item_id
  FROM planning_rehearsal_acknowledgements acknowledgement
  JOIN scoped_service service
    ON service.tenant_id = acknowledgement.tenant_id
   AND service.service_id = acknowledgement.service_id
)
SELECT
  service.tenant_id,
  service.service_id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'roleId', role.role_id,
          'displayName', role.role_id
        )
        ORDER BY role.role_id
      )
      FROM required_roles role
    ),
    '[]'::jsonb
  ) AS required_roles,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'assignmentId', assignment.assignment_id,
          'roleId', assignment.role_id,
          'status', assignment.status
        )
        ORDER BY assignment.role_id, assignment.assignment_id
      )
      FROM assignments assignment
    ),
    '[]'::jsonb
  ) AS assignments,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'serviceItemId', item.service_item_id,
          'title', item.title,
          'durationMinutes', item.duration_minutes,
          'hasAttachedSong', item.song_id IS NOT NULL,
          'hasChart', item.has_chart,
          'hasCurrentCcliLog', ccli.status = 'current',
          'hasVisibleRehearsalAsset', visible.service_item_id IS NOT NULL,
          'requiresCcliLog', item.requires_ccli_log,
          'requiresRehearsalAcknowledgement', visible.service_item_id IS NOT NULL
        ))
        ORDER BY item.service_item_id
      )
      FROM service_items item
      LEFT JOIN visible_assets visible
        ON visible.service_item_id = item.service_item_id
      LEFT JOIN ccli_statuses ccli
        ON ccli.service_item_id = item.service_item_id
    ),
    '[]'::jsonb
  ) AS service_items,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'serviceItemId', ccli.service_item_id,
          'status', ccli.status
        )
        ORDER BY ccli.service_item_id
      )
      FROM ccli_statuses ccli
    ),
    '[]'::jsonb
  ) AS ccli_statuses,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'assignmentId', acknowledgement.assignment_id,
          'assetId', acknowledgement.asset_id,
          'personId', acknowledgement.person_id,
          'readinessSignal', acknowledgement.readiness_signal,
          'serviceItemId', acknowledgement.service_item_id
        ))
        ORDER BY acknowledgement.service_item_id, acknowledgement.assignment_id
      )
      FROM acknowledgements acknowledgement
    ),
    '[]'::jsonb
  ) AS rehearsal_acknowledgements,
  '[]'::jsonb AS known_blockers
FROM scoped_service service
LIMIT 1
`.trim(),
      ...optionalTransaction(query.transaction)
    });

    return PlanningReadinessInputSqlRowSchema.parse(
      firstRow(result.rows, "Planning readiness input load returned no row.")
    );
  },

  saveReadinessResult: async (rawCommand): Promise<void> => {
    const command = SavePlanningReadinessResultCommandSchema.parse(rawCommand);
    const now = dependencies.clock();
    const intent = command.intent ?? "update";

    await runWithWriteTransaction(
      dependencies.executor,
      command.transaction,
      async (transaction): Promise<void> => {
        const result = await dependencies.executor.query({
          name: "planning.readiness_result.save",
          parameters: [
            command.tenantId,
            command.serviceId,
            command.result.readinessScore,
            command.result.band,
            command.result.checks,
            command.result.risks,
            command.result.strengths,
            command.result.recommendedActions,
            now
          ],
          sql: `
INSERT INTO planning_readiness_results (
  tenant_id,
  service_id,
  readiness_score,
  band,
  checks,
  risks,
  strengths,
  recommended_actions,
  calculated_at
)
SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
WHERE EXISTS (
  SELECT 1
  FROM planning_services service
  WHERE service.tenant_id = $1
    AND service.service_id = $2
)
ON CONFLICT (tenant_id, service_id)
DO UPDATE SET
  readiness_score = EXCLUDED.readiness_score,
  band = EXCLUDED.band,
  checks = EXCLUDED.checks,
  risks = EXCLUDED.risks,
  strengths = EXCLUDED.strengths,
  recommended_actions = EXCLUDED.recommended_actions,
  calculated_at = EXCLUDED.calculated_at
RETURNING
  tenant_id,
  service_id,
  readiness_score,
  band,
  checks,
  risks,
  strengths,
  recommended_actions
`.trim(),
          transaction
        });

        const saved = PlanningReadinessResultSqlRowSchema.parse(
          firstRow(result.rows, "Planning readiness result save returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: command.actorId,
          createdAt: now,
          intent,
          operationName: "saveReadinessResult",
          requestId: command.requestId,
          targetAggregateId: saved.serviceId,
          tenantId: command.tenantId
        });
      }
    );
  }
});
