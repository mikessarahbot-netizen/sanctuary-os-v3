import { z } from "zod";
import {
  CreatePlanningServicePersistenceOperationSchema,
  DuplicatePlanningServiceFromTemplatePersistenceOperationSchema,
  PlanningServicePersistenceRecordSchema,
  UpdatePlanningServicePersistenceOperationSchema,
  type CreatePlanningServicePersistenceOperation,
  type DuplicatePlanningServiceFromTemplatePersistenceOperation,
  type PlanningServiceCommandPersistenceRepository,
  type PlanningServicePersistenceRecord,
  type UpdatePlanningServicePersistenceOperation
} from "./planning-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export type PlanningServiceCommandSqlRepositorySlice = Pick<
  PlanningServiceCommandPersistenceRepository,
  "createService" | "duplicateServiceFromTemplate" | "updateService"
>;

export type PlanningSqlValue = string | number | boolean | null;
export type PlanningSqlRow = Readonly<Record<string, unknown>>;

export interface PlanningSqlStatement {
  readonly name: string;
  readonly parameters: readonly PlanningSqlValue[];
  readonly sql: string;
  readonly transaction?: TransactionHandle;
}

export interface PlanningSqlQueryResult {
  readonly rows: readonly PlanningSqlRow[];
}

export interface PlanningSqlExecutor {
  readonly query: (statement: PlanningSqlStatement) => Promise<PlanningSqlQueryResult>;
  readonly runInTransaction: <Result>(
    operation: (transaction: TransactionHandle) => Promise<Result>
  ) => Promise<Result>;
}

export interface PlanningCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
    readonly serviceId: () => string;
  };
}

type ParsedUpdatePlanningServicePersistenceOperation = z.infer<
  typeof UpdatePlanningServicePersistenceOperationSchema
>;

const PlanningServiceSqlRowSchema = z
  .object({
    service_id: z.string().min(1),
    service_type_id: z.string().min(1),
    starts_at: z.string().datetime().nullable().optional(),
    status: z.enum(["draft", "scheduled", "published", "canceled"]),
    tenant_id: z.string().min(1),
    title: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningServicePersistenceRecord => {
    const record = {
      serviceId: row.service_id,
      serviceTypeId: row.service_type_id,
      ...(row.starts_at !== undefined && row.starts_at !== null
        ? { startsAt: row.starts_at }
        : {}),
      status: row.status,
      tenantId: row.tenant_id,
      title: row.title
    };

    return PlanningServicePersistenceRecordSchema.parse(record);
  });

const firstRow = (
  result: PlanningSqlQueryResult,
  errorMessage: string
): PlanningSqlRow => {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(errorMessage);
  }

  return row;
};

const assertDestructiveServiceConfirmation = (
  operation: ParsedUpdatePlanningServicePersistenceOperation
): void => {
  if (operation.input.status !== "published" && operation.input.status !== "canceled") {
    return;
  }

  if (
    operation.options.intent !== "destructive-confirmed" ||
    operation.input.confirmationIntent === undefined
  ) {
    throw new Error("Planning service status change requires confirmation intent.");
  }
};

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
  dependencies: PlanningCommandSqlRepositoryDependencies,
  transaction: TransactionHandle,
  audit: {
    readonly actorId: string | undefined;
    readonly confirmationReason: string | undefined;
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
      audit.confirmationReason ?? null,
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

export const createPlanningServiceCommandSqlRepository = (
  dependencies: PlanningCommandSqlRepositoryDependencies
): PlanningServiceCommandSqlRepositorySlice => ({
  createService: async (
    rawOperation: CreatePlanningServicePersistenceOperation
  ): Promise<PlanningServicePersistenceRecord> => {
    const operation = CreatePlanningServicePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const serviceId = dependencies.ids.serviceId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningServicePersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.services.create",
          parameters: [
            operation.options.context.tenantId,
            serviceId,
            operation.input.serviceTypeId,
            operation.input.title,
            "draft",
            operation.input.startsAt ?? null,
            now,
            now
          ],
          sql: `
INSERT INTO planning_services (
  tenant_id,
  service_id,
  service_type_id,
  title,
  status,
  starts_at,
  created_at,
  updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim(),
          transaction
        });
        const service = PlanningServiceSqlRowSchema.parse(
          firstRow(result, "Planning service create returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "createService",
          requestId: operation.options.context.requestId,
          targetAggregateId: service.serviceId,
          tenantId: operation.options.context.tenantId
        });

        return service;
      }
    );
  },

  duplicateServiceFromTemplate: async (
    rawOperation: DuplicatePlanningServiceFromTemplatePersistenceOperation
  ): Promise<PlanningServicePersistenceRecord> => {
    const operation =
      DuplicatePlanningServiceFromTemplatePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const serviceId = dependencies.ids.serviceId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningServicePersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.services.duplicate_from_template",
          parameters: [
            operation.options.context.tenantId,
            serviceId,
            operation.input.serviceTemplateId,
            operation.input.title,
            operation.input.startsAt ?? null,
            "draft",
            now,
            now
          ],
          sql: `
INSERT INTO planning_services (
  tenant_id,
  service_id,
  service_type_id,
  title,
  starts_at,
  status,
  created_at,
  updated_at
)
SELECT
  template.tenant_id,
  $2,
  template.service_type_id,
  $4,
  $5,
  $6,
  $7,
  $8
FROM planning_service_templates template
WHERE template.tenant_id = $1
  AND template.service_template_id = $3
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim(),
          transaction
        });
        const service = PlanningServiceSqlRowSchema.parse(
          firstRow(result, "Planning service template duplicate returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "duplicateServiceFromTemplate",
          requestId: operation.options.context.requestId,
          targetAggregateId: service.serviceId,
          tenantId: operation.options.context.tenantId
        });

        return service;
      }
    );
  },

  updateService: async (
    rawOperation: UpdatePlanningServicePersistenceOperation
  ): Promise<PlanningServicePersistenceRecord> => {
    const operation = UpdatePlanningServicePersistenceOperationSchema.parse(rawOperation);
    assertDestructiveServiceConfirmation(operation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningServicePersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.services.update",
          parameters: [
            operation.options.context.tenantId,
            operation.input.serviceId,
            operation.input.serviceTypeId ?? null,
            operation.input.title ?? null,
            operation.input.status ?? null,
            operation.input.startsAt ?? null,
            now
          ],
          sql: `
UPDATE planning_services
SET
  service_type_id = COALESCE($3, service_type_id),
  title = COALESCE($4, title),
  status = COALESCE($5, status),
  starts_at = COALESCE($6, starts_at),
  updated_at = $7
WHERE tenant_id = $1
  AND service_id = $2
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim(),
          transaction
        });
        const service = PlanningServiceSqlRowSchema.parse(
          firstRow(result, "Planning service update returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: operation.input.confirmationIntent?.reason,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "updateService",
          requestId: operation.options.context.requestId,
          targetAggregateId: service.serviceId,
          tenantId: operation.options.context.tenantId
        });

        return service;
      }
    );
  }
});
