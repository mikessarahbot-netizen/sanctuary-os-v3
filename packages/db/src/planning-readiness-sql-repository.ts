import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  GetPlanningServiceReadinessPersistenceOperationSchema,
  PlanningReadinessPersistenceRecordSchema,
  SavePlanningServiceReadinessPersistenceOperationSchema,
  type GetPlanningServiceReadinessPersistenceOperation,
  type PlanningReadinessPersistenceRecord,
  type PlanningReadinessPersistenceRepository,
  type PlanningServiceQueryPersistenceRepository,
  type SavePlanningServiceReadinessPersistenceOperation
} from "./planning-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export interface PlanningReadinessSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
  };
}

export type PlanningReadinessSqlRepository = PlanningReadinessPersistenceRepository &
  Pick<PlanningServiceQueryPersistenceRepository, "getServiceReadiness">;

const PlanningReadinessSqlRowSchema = z
  .object({
    band: z.enum(["blocked", "needs-attention", "ready"]),
    checks: z.array(
      z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        maxScore: z.number().int().positive(),
        score: z.number().int().nonnegative()
      })
    ),
    readiness_score: z.number().int().min(0).max(100),
    recommended_actions: z.array(z.string().min(1)),
    risks: z.array(z.string().min(1)),
    service_id: z.string().min(1),
    strengths: z.array(z.string().min(1)),
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

const assertReadinessTenantScope = (
  resultTenantId: string,
  contextTenantId: string
): void => {
  if (resultTenantId !== contextTenantId) {
    throw new Error("Planning readiness result tenant mismatch.");
  }
};

export const createPlanningReadinessSqlRepository = (
  dependencies: PlanningReadinessSqlRepositoryDependencies
): PlanningReadinessSqlRepository => ({
  getServiceReadiness: async (
    rawOperation: GetPlanningServiceReadinessPersistenceOperation
  ): Promise<PlanningReadinessPersistenceRecord | null> => {
    const operation =
      GetPlanningServiceReadinessPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "planning.readiness.get",
      parameters: [operation.options.context.tenantId, operation.input.serviceId],
      sql: `
SELECT
  tenant_id,
  service_id,
  readiness_score,
  band,
  checks,
  risks,
  strengths,
  recommended_actions
FROM planning_readiness_results
WHERE tenant_id = $1
  AND service_id = $2
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });
    const row = result.rows[0];

    return row === undefined ? null : PlanningReadinessSqlRowSchema.parse(row);
  },

  saveServiceReadiness: async (
    rawOperation: SavePlanningServiceReadinessPersistenceOperation
  ): Promise<PlanningReadinessPersistenceRecord> => {
    const operation =
      SavePlanningServiceReadinessPersistenceOperationSchema.parse(rawOperation);
    assertReadinessTenantScope(
      operation.input.tenantId,
      operation.options.context.tenantId
    );

    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningReadinessPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.readiness.save",
          parameters: [
            operation.options.context.tenantId,
            operation.input.serviceId,
            operation.input.readinessScore,
            operation.input.band,
            JSON.stringify(operation.input.checks),
            JSON.stringify(operation.input.risks),
            JSON.stringify(operation.input.strengths),
            JSON.stringify(operation.input.recommendedActions),
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
SELECT $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9
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
WHERE planning_readiness_results.tenant_id = $1
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
        const readiness = PlanningReadinessSqlRowSchema.parse(
          firstRow(result.rows, "Planning readiness save returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "saveServiceReadiness",
          requestId: operation.options.context.requestId,
          targetAggregateId: readiness.serviceId,
          tenantId: operation.options.context.tenantId
        });

        return readiness;
      }
    );
  }
});
