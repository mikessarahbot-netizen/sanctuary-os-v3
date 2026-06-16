import { z } from "zod";
import {
  AddPlanningServiceItemPersistenceOperationSchema,
  AssignPlanningVolunteerPersistenceOperationSchema,
  CreatePlanningServicePersistenceOperationSchema,
  DuplicatePlanningServiceFromTemplatePersistenceOperationSchema,
  PlanningAssignmentPersistenceRecordSchema,
  PlanningServiceItemPersistenceRecordSchema,
  PlanningServicePersistenceRecordSchema,
  ReorderPlanningServiceItemsPersistenceOperationSchema,
  UpdatePlanningAssignmentStatusPersistenceOperationSchema,
  UpdatePlanningServiceItemPersistenceOperationSchema,
  UpdatePlanningServicePersistenceOperationSchema,
  type AddPlanningServiceItemPersistenceOperation,
  type AssignPlanningVolunteerPersistenceOperation,
  type CreatePlanningServicePersistenceOperation,
  type DuplicatePlanningServiceFromTemplatePersistenceOperation,
  type PlanningAssignmentPersistenceRecord,
  type PlanningServiceCommandPersistenceRepository,
  type PlanningServiceItemPersistenceRecord,
  type PlanningServicePersistenceRecord,
  type ReorderPlanningServiceItemsPersistenceOperation,
  type UpdatePlanningAssignmentStatusPersistenceOperation,
  type UpdatePlanningServiceItemPersistenceOperation,
  type UpdatePlanningServicePersistenceOperation
} from "./planning-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export type PlanningServiceCommandSqlRepositorySlice =
  PlanningServiceCommandPersistenceRepository;

export type PlanningSqlValue =
  | string
  | number
  | boolean
  | null
  | readonly PlanningSqlValue[]
  | { readonly [key: string]: PlanningSqlValue };
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
    readonly assignmentId: () => string;
    readonly serviceItemId: () => string;
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

const PlanningServiceItemSqlRowSchema = z
  .object({
    duration_minutes: z.number().int().positive().nullable().optional(),
    notes: z.string().min(1).nullable().optional(),
    service_id: z.string().min(1),
    service_item_id: z.string().min(1),
    song_id: z.string().min(1).nullable().optional(),
    sort_order: z.number().int().nonnegative(),
    tenant_id: z.string().min(1),
    title: z.string().min(1),
    type: z.enum(["song", "scripture", "prayer", "announcement", "message", "media", "other"])
  })
  .strict()
  .transform((row): PlanningServiceItemPersistenceRecord => {
    const record = {
      ...(row.duration_minutes !== undefined && row.duration_minutes !== null
        ? { durationMinutes: row.duration_minutes }
        : {}),
      ...(row.notes !== undefined && row.notes !== null ? { notes: row.notes } : {}),
      serviceId: row.service_id,
      serviceItemId: row.service_item_id,
      ...(row.song_id !== undefined && row.song_id !== null ? { songId: row.song_id } : {}),
      sortOrder: row.sort_order,
      tenantId: row.tenant_id,
      title: row.title,
      type: row.type
    };

    return PlanningServiceItemPersistenceRecordSchema.parse(record);
  });

const PlanningAssignmentSqlRowSchema = z
  .object({
    assignment_id: z.string().min(1),
    person_id: z.string().min(1),
    role_id: z.string().min(1),
    service_id: z.string().min(1),
    status: z.enum(["pending", "confirmed", "declined"]),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningAssignmentPersistenceRecord =>
    PlanningAssignmentPersistenceRecordSchema.parse({
      assignmentId: row.assignment_id,
      personId: row.person_id,
      roleId: row.role_id,
      serviceId: row.service_id,
      status: row.status,
      tenantId: row.tenant_id
    })
  );

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
  addServiceItem: async (
    rawOperation: AddPlanningServiceItemPersistenceOperation
  ): Promise<PlanningServiceItemPersistenceRecord> => {
    const operation = AddPlanningServiceItemPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const serviceItemId = dependencies.ids.serviceItemId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningServiceItemPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.service_items.create",
          parameters: [
            operation.options.context.tenantId,
            serviceItemId,
            operation.input.serviceId,
            operation.input.songId ?? null,
            operation.input.title,
            operation.input.type,
            operation.input.durationMinutes ?? null,
            operation.input.notes ?? null,
            now,
            now
          ],
          sql: `
INSERT INTO planning_service_items (
  tenant_id,
  service_item_id,
  service_id,
  song_id,
  title,
  type,
  sort_order,
  duration_minutes,
  notes,
  created_at,
  updated_at
)
SELECT
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  (
    SELECT COUNT(*)
    FROM planning_service_items existing_item
    WHERE existing_item.tenant_id = $1
      AND existing_item.service_id = $3
  ),
  $7,
  $8,
  $9,
  $10
WHERE EXISTS (
  SELECT 1
  FROM planning_services service
  WHERE service.tenant_id = $1
    AND service.service_id = $3
)
RETURNING
  tenant_id,
  service_item_id,
  service_id,
  song_id,
  title,
  type,
  sort_order,
  duration_minutes,
  notes
`.trim(),
          transaction
        });
        const serviceItem = PlanningServiceItemSqlRowSchema.parse(
          firstRow(result, "Planning service item create returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "addServiceItem",
          requestId: operation.options.context.requestId,
          targetAggregateId: serviceItem.serviceItemId,
          tenantId: operation.options.context.tenantId
        });

        return serviceItem;
      }
    );
  },

  assignVolunteer: async (
    rawOperation: AssignPlanningVolunteerPersistenceOperation
  ): Promise<PlanningAssignmentPersistenceRecord> => {
    const operation = AssignPlanningVolunteerPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const assignmentId = dependencies.ids.assignmentId();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningAssignmentPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.assignments.create",
          parameters: [
            operation.options.context.tenantId,
            assignmentId,
            operation.input.serviceId,
            operation.input.personId,
            operation.input.roleId,
            "pending",
            now,
            now
          ],
          sql: `
INSERT INTO planning_assignments (
  tenant_id,
  assignment_id,
  service_id,
  person_id,
  role_id,
  status,
  created_at,
  updated_at
)
SELECT $1, $2, $3, $4, $5, $6, $7, $8
WHERE EXISTS (
  SELECT 1
  FROM planning_services service
  WHERE service.tenant_id = $1
    AND service.service_id = $3
)
RETURNING tenant_id, assignment_id, service_id, person_id, role_id, status
`.trim(),
          transaction
        });
        const assignment = PlanningAssignmentSqlRowSchema.parse(
          firstRow(result, "Planning assignment create returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "assignVolunteer",
          requestId: operation.options.context.requestId,
          targetAggregateId: assignment.assignmentId,
          tenantId: operation.options.context.tenantId
        });

        return assignment;
      }
    );
  },

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

  reorderServiceItems: async (
    rawOperation: ReorderPlanningServiceItemsPersistenceOperation
  ): Promise<readonly PlanningServiceItemPersistenceRecord[]> => {
    const operation = ReorderPlanningServiceItemsPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<readonly PlanningServiceItemPersistenceRecord[]> => {
        const result = await dependencies.executor.query({
          name: "planning.service_items.reorder",
          parameters: [
            operation.options.context.tenantId,
            operation.input.serviceId,
            operation.input.orderedServiceItemIds,
            now
          ],
          sql: `
WITH requested(service_item_id, ordinal) AS (
  SELECT *
  FROM unnest($3::text[]) WITH ORDINALITY
),
existing AS (
  SELECT service_item_id
  FROM planning_service_items
  WHERE tenant_id = $1
    AND service_id = $2
),
validated AS (
  SELECT
    (SELECT COUNT(*) FROM requested) = (SELECT COUNT(*) FROM existing)
    AND NOT EXISTS (
      SELECT 1
      FROM requested
      LEFT JOIN existing USING (service_item_id)
      WHERE existing.service_item_id IS NULL
    ) AS ok
)
UPDATE planning_service_items item
SET
  sort_order = requested.ordinal - 1,
  updated_at = $4
FROM requested, validated
WHERE validated.ok
  AND item.tenant_id = $1
  AND item.service_id = $2
  AND item.service_item_id = requested.service_item_id
RETURNING
  item.tenant_id,
  item.service_item_id,
  item.service_id,
  item.song_id,
  item.title,
  item.type,
  item.sort_order,
  item.duration_minutes,
  item.notes
ORDER BY sort_order
`.trim(),
          transaction
        });
        const serviceItems = z.array(PlanningServiceItemSqlRowSchema).parse(result.rows);

        if (serviceItems.length !== operation.input.orderedServiceItemIds.length) {
          throw new Error("Planning service item reorder did not update every requested item.");
        }

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "reorderServiceItems",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.serviceId,
          tenantId: operation.options.context.tenantId
        });

        return serviceItems;
      }
    );
  },

  updateAssignmentStatus: async (
    rawOperation: UpdatePlanningAssignmentStatusPersistenceOperation
  ): Promise<PlanningAssignmentPersistenceRecord> => {
    const operation =
      UpdatePlanningAssignmentStatusPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningAssignmentPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.assignments.update_status",
          parameters: [
            operation.options.context.tenantId,
            operation.input.serviceId,
            operation.input.assignmentId,
            operation.input.status,
            now
          ],
          sql: `
UPDATE planning_assignments
SET
  status = $4,
  updated_at = $5
WHERE tenant_id = $1
  AND service_id = $2
  AND assignment_id = $3
RETURNING tenant_id, assignment_id, service_id, person_id, role_id, status
`.trim(),
          transaction
        });
        const assignment = PlanningAssignmentSqlRowSchema.parse(
          firstRow(result, "Planning assignment status update returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "updateAssignmentStatus",
          requestId: operation.options.context.requestId,
          targetAggregateId: assignment.assignmentId,
          tenantId: operation.options.context.tenantId
        });

        return assignment;
      }
    );
  },

  updateServiceItem: async (
    rawOperation: UpdatePlanningServiceItemPersistenceOperation
  ): Promise<PlanningServiceItemPersistenceRecord> => {
    const operation = UpdatePlanningServiceItemPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PlanningServiceItemPersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "planning.service_items.update",
          parameters: [
            operation.options.context.tenantId,
            operation.input.serviceId,
            operation.input.serviceItemId,
            operation.input.songId ?? null,
            operation.input.title ?? null,
            operation.input.type ?? null,
            operation.input.durationMinutes ?? null,
            operation.input.notes ?? null,
            now
          ],
          sql: `
UPDATE planning_service_items
SET
  song_id = COALESCE($4, song_id),
  title = COALESCE($5, title),
  type = COALESCE($6, type),
  duration_minutes = COALESCE($7, duration_minutes),
  notes = COALESCE($8, notes),
  updated_at = $9
WHERE tenant_id = $1
  AND service_id = $2
  AND service_item_id = $3
RETURNING
  tenant_id,
  service_item_id,
  service_id,
  song_id,
  title,
  type,
  sort_order,
  duration_minutes,
  notes
`.trim(),
          transaction
        });
        const serviceItem = PlanningServiceItemSqlRowSchema.parse(
          firstRow(result, "Planning service item update returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          confirmationReason: undefined,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "updateServiceItem",
          requestId: operation.options.context.requestId,
          targetAggregateId: serviceItem.serviceItemId,
          tenantId: operation.options.context.tenantId
        });

        return serviceItem;
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
