import { z } from "zod";
import type {
  CreatePlanningServicePersistenceOperation,
  DuplicatePlanningServiceFromTemplatePersistenceOperation,
  PlanningServiceCommandPersistenceRepository,
  PlanningServicePersistenceRecord,
  UpdatePlanningServicePersistenceOperation
} from "./planning-repository-contracts.js";
import {
  CreatePlanningServicePersistenceOperationSchema,
  DuplicatePlanningServiceFromTemplatePersistenceOperationSchema,
  PlanningServicePersistenceRecordSchema,
  UpdatePlanningServicePersistenceOperationSchema
} from "./planning-repository-contracts.js";
import type { RepositoryWriteOptions } from "./repository-contracts.js";
import type { TransactionBoundary, TransactionHandle } from "./transactions.js";

const SqlServiceRowSchema = z
  .object({
    service_id: z.string().min(1),
    service_type_id: z.string().min(1),
    starts_at: z.string().datetime().nullable(),
    status: z.enum(["draft", "scheduled", "published", "canceled"]),
    tenant_id: z.string().min(1),
    title: z.string().min(1)
  })
  .strict();

const SqlTemplateRowSchema = z
  .object({
    service_type_id: z.string().min(1)
  })
  .strict();

export type PlanningSqlCommandAdapterErrorCode =
  | "confirmation-required"
  | "not-found"
  | "not-implemented"
  | "validation-failed";

export class PlanningSqlCommandAdapterError extends Error {
  readonly code: PlanningSqlCommandAdapterErrorCode;

  constructor(code: PlanningSqlCommandAdapterErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PlanningSqlCommandAdapterError";
  }
}

export interface PlanningSqlQueryRequest {
  readonly parameters: readonly unknown[];
  readonly sql: string;
  readonly transaction?: TransactionHandle;
}

export interface PlanningSqlQueryResult {
  readonly rows: readonly Record<string, unknown>[];
}

export interface PlanningSqlExecutor {
  readonly query: (request: PlanningSqlQueryRequest) => Promise<PlanningSqlQueryResult>;
}

export interface PlanningSqlIdGenerator {
  readonly nextAuditLogId: () => string;
  readonly nextServiceId: () => string;
}

export interface PlanningSqlCommandRepositoryOptions {
  readonly clock: () => Date;
  readonly executor: PlanningSqlExecutor;
  readonly idGenerator: PlanningSqlIdGenerator;
  readonly transactionBoundary?: TransactionBoundary;
}

type PlanningSqlCommandOperationName =
  | "createService"
  | "duplicateServiceFromTemplate"
  | "updateService";

interface AuditLogInput {
  readonly confirmationReason?: string;
  readonly operationName: PlanningSqlCommandOperationName;
  readonly options: RepositoryWriteOptions;
  readonly targetAggregateId: string;
  readonly timestamp: string;
}

interface SqlParameterBuilder {
  readonly parameters: readonly unknown[];
  readonly push: (value: unknown) => string;
}

const createSqlParameterBuilder = (initialParameters: readonly unknown[]): SqlParameterBuilder => {
  const parameters: unknown[] = [...initialParameters];

  return {
    get parameters(): readonly unknown[] {
      return parameters;
    },
    push: (value: unknown): string => {
      parameters.push(value);

      return `$${String(parameters.length)}`;
    }
  };
};

const normalizeServiceRow = (row: Record<string, unknown>): PlanningServicePersistenceRecord => {
  const parsedRow = SqlServiceRowSchema.parse(row);

  return PlanningServicePersistenceRecordSchema.parse({
    serviceId: parsedRow.service_id,
    serviceTypeId: parsedRow.service_type_id,
    ...(parsedRow.starts_at === null ? {} : { startsAt: parsedRow.starts_at }),
    status: parsedRow.status,
    tenantId: parsedRow.tenant_id,
    title: parsedRow.title
  });
};

const getRequiredServiceRow = (
  result: PlanningSqlQueryResult,
  message: string
): PlanningServicePersistenceRecord => {
  const row = result.rows[0];

  if (row === undefined) {
    throw new PlanningSqlCommandAdapterError("not-found", message);
  }

  return normalizeServiceRow(row);
};

const normalizeValidationFailure = (error: unknown): never => {
  if (error instanceof z.ZodError) {
    throw new PlanningSqlCommandAdapterError(
      "validation-failed",
      "Planning command SQL adapter received invalid persistence input."
    );
  }

  throw error;
};

const parseCreateServiceOperation = (
  operation: CreatePlanningServicePersistenceOperation
): CreatePlanningServicePersistenceOperation => {
  try {
    CreatePlanningServicePersistenceOperationSchema.parse(operation);

    return operation;
  } catch (error) {
    return normalizeValidationFailure(error);
  }
};

const parseDuplicateServiceOperation = (
  operation: DuplicatePlanningServiceFromTemplatePersistenceOperation
): DuplicatePlanningServiceFromTemplatePersistenceOperation => {
  try {
    DuplicatePlanningServiceFromTemplatePersistenceOperationSchema.parse(operation);

    return operation;
  } catch (error) {
    return normalizeValidationFailure(error);
  }
};

const parseUpdateServiceOperation = (
  operation: UpdatePlanningServicePersistenceOperation
): UpdatePlanningServicePersistenceOperation => {
  try {
    UpdatePlanningServicePersistenceOperationSchema.parse(operation);

    return operation;
  } catch (error) {
    return normalizeValidationFailure(error);
  }
};

const ensureDestructiveConfirmation = (
  operation: UpdatePlanningServicePersistenceOperation
): void => {
  if (operation.input.status !== "published" && operation.input.status !== "canceled") {
    return;
  }

  if (
    operation.options.intent !== "destructive-confirmed" ||
    operation.input.confirmationIntent === undefined
  ) {
    throw new PlanningSqlCommandAdapterError(
      "confirmation-required",
      "Publishing or canceling a Planning service requires destructive-confirmed intent and confirmation reason."
    );
  }
};

const withTransaction = (
  request: Omit<PlanningSqlQueryRequest, "transaction">,
  transaction?: TransactionHandle
): PlanningSqlQueryRequest =>
  transaction === undefined
    ? request
    : {
        ...request,
        transaction
      };

export const createPlanningSqlCommandRepository = ({
  clock,
  executor,
  idGenerator,
  transactionBoundary
}: PlanningSqlCommandRepositoryOptions): PlanningServiceCommandPersistenceRepository => {
  const executeWrite = async <Result>(
    options: RepositoryWriteOptions,
    write: (transaction?: TransactionHandle) => Promise<Result>
  ): Promise<Result> => {
    if (options.transaction !== undefined) {
      return write(options.transaction);
    }

    if (transactionBoundary !== undefined) {
      return transactionBoundary.runInTransaction(write);
    }

    return write();
  };

  const insertAuditLog = async (
    input: AuditLogInput,
    transaction?: TransactionHandle
  ): Promise<void> => {
    await executor.query(
      withTransaction(
        {
          parameters: [
            input.options.context.tenantId,
            idGenerator.nextAuditLogId(),
            input.options.context.actorId ?? null,
            input.options.context.requestId,
            input.operationName,
            input.options.intent,
            input.targetAggregateId,
            input.confirmationReason ?? null,
            input.timestamp
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
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`.trim()
        },
        transaction
      )
    );
  };

  const repository: PlanningServiceCommandPersistenceRepository = {
    addServiceItem: () =>
      Promise.reject(
        new PlanningSqlCommandAdapterError(
          "not-implemented",
          "SQL Planning service item writes are out of scope for this adapter slice."
        )
      ),

    assignVolunteer: () =>
      Promise.reject(
        new PlanningSqlCommandAdapterError(
          "not-implemented",
          "SQL Planning assignment writes are out of scope for this adapter slice."
        )
      ),

    createService: async (rawOperation): Promise<PlanningServicePersistenceRecord> => {
      const operation = parseCreateServiceOperation(rawOperation);

      return executeWrite(operation.options, async (transaction) => {
        const timestamp = clock().toISOString();
        const serviceId = idGenerator.nextServiceId();

        const result = await executor.query(
          withTransaction(
            {
              parameters: [
                operation.options.context.tenantId,
                serviceId,
                operation.input.serviceTypeId,
                operation.input.title,
                "draft",
                operation.input.startsAt ?? null,
                timestamp,
                timestamp
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
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim()
            },
            transaction
          )
        );
        const service = getRequiredServiceRow(
          result,
          "Created Planning service was not returned by the database."
        );

        await insertAuditLog(
          {
            operationName: "createService",
            options: operation.options,
            targetAggregateId: service.serviceId,
            timestamp
          },
          transaction
        );

        return service;
      });
    },

    duplicateServiceFromTemplate: async (
      rawOperation
    ): Promise<PlanningServicePersistenceRecord> => {
      const operation = parseDuplicateServiceOperation(rawOperation);

      return executeWrite(operation.options, async (transaction) => {
        const templateResult = await executor.query(
          withTransaction(
            {
              parameters: [
                operation.options.context.tenantId,
                operation.input.serviceTemplateId
              ],
              sql: `
SELECT service_type_id
FROM planning_service_templates
WHERE tenant_id = $1
  AND service_template_id = $2
LIMIT 1
`.trim()
            },
            transaction
          )
        );
        const templateRow = templateResult.rows[0];

        if (templateRow === undefined) {
          throw new PlanningSqlCommandAdapterError(
            "not-found",
            "Planning service template was not found for tenant."
          );
        }

        const template = SqlTemplateRowSchema.parse(templateRow);
        const timestamp = clock().toISOString();
        const serviceId = idGenerator.nextServiceId();

        const result = await executor.query(
          withTransaction(
            {
              parameters: [
                operation.options.context.tenantId,
                serviceId,
                template.service_type_id,
                operation.input.title,
                "draft",
                operation.input.startsAt ?? null,
                timestamp,
                timestamp
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
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim()
            },
            transaction
          )
        );
        const service = getRequiredServiceRow(
          result,
          "Duplicated Planning service was not returned by the database."
        );

        await insertAuditLog(
          {
            operationName: "duplicateServiceFromTemplate",
            options: operation.options,
            targetAggregateId: service.serviceId,
            timestamp
          },
          transaction
        );

        return service;
      });
    },

    reorderServiceItems: () =>
      Promise.reject(
        new PlanningSqlCommandAdapterError(
          "not-implemented",
          "SQL Planning service item reorder writes are out of scope for this adapter slice."
        )
      ),

    updateAssignmentStatus: () =>
      Promise.reject(
        new PlanningSqlCommandAdapterError(
          "not-implemented",
          "SQL Planning assignment status writes are out of scope for this adapter slice."
        )
      ),

    updateService: async (rawOperation): Promise<PlanningServicePersistenceRecord> => {
      const operation = parseUpdateServiceOperation(rawOperation);
      ensureDestructiveConfirmation(operation);

      return executeWrite(operation.options, async (transaction) => {
        const timestamp = clock().toISOString();
        const parameterBuilder = createSqlParameterBuilder([
          operation.options.context.tenantId,
          operation.input.serviceId
        ]);
        const setClauses = [`updated_at = ${parameterBuilder.push(timestamp)}`];

        if (operation.input.serviceTypeId !== undefined) {
          setClauses.push(`service_type_id = ${parameterBuilder.push(operation.input.serviceTypeId)}`);
        }

        if (operation.input.startsAt !== undefined) {
          setClauses.push(`starts_at = ${parameterBuilder.push(operation.input.startsAt)}`);
        }

        if (operation.input.status !== undefined) {
          setClauses.push(`status = ${parameterBuilder.push(operation.input.status)}`);
        }

        if (operation.input.title !== undefined) {
          setClauses.push(`title = ${parameterBuilder.push(operation.input.title)}`);
        }

        const result = await executor.query(
          withTransaction(
            {
              parameters: parameterBuilder.parameters,
              sql: `
UPDATE planning_services
SET ${setClauses.join(", ")}
WHERE tenant_id = $1
  AND service_id = $2
RETURNING tenant_id, service_id, service_type_id, title, status, starts_at
`.trim()
            },
            transaction
          )
        );
        const service = getRequiredServiceRow(
          result,
          "Planning service was not found for tenant."
        );

        await insertAuditLog(
          {
            ...(operation.input.confirmationIntent !== undefined
              ? { confirmationReason: operation.input.confirmationIntent.reason }
              : {}),
            operationName: "updateService",
            options: operation.options,
            targetAggregateId: service.serviceId,
            timestamp
          },
          transaction
        );

        return service;
      });
    },

    updateServiceItem: () =>
      Promise.reject(
        new PlanningSqlCommandAdapterError(
          "not-implemented",
          "SQL Planning service item updates are out of scope for this adapter slice."
        )
      )
  };

  return repository;
};
