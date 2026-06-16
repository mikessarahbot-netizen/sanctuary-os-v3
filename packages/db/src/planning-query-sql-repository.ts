import { z } from "zod";
import {
  GetPlanningServicePersistenceOperationSchema,
  GetPlanningServiceReadinessPersistenceOperationSchema,
  ListPlanningServiceAssignmentsPersistenceOperationSchema,
  ListPlanningServicesPersistenceOperationSchema,
  ListPlanningServiceTemplatesPersistenceOperationSchema,
  ListPlanningSongLibraryPersistenceOperationSchema,
  PlanningAssignmentPersistenceRecordSchema,
  PlanningReadinessPersistenceRecordSchema,
  PlanningServicePersistenceRecordSchema,
  PlanningServiceTemplatePersistenceRecordSchema,
  PlanningSongLibraryItemPersistenceRecordSchema,
  type GetPlanningServicePersistenceOperation,
  type GetPlanningServiceReadinessPersistenceOperation,
  type ListPlanningServiceAssignmentsPersistenceOperation,
  type ListPlanningServiceTemplatesPersistenceOperation,
  type ListPlanningServicesPersistenceOperation,
  type ListPlanningSongLibraryPersistenceOperation,
  type PlanningAssignmentPersistenceRecord,
  type PlanningReadinessPersistenceRecord,
  type PlanningServicePersistenceRecord,
  type PlanningServiceQueryPersistenceRepository,
  type PlanningServiceTemplatePersistenceRecord,
  type PlanningSongLibraryItemPersistenceRecord
} from "./planning-repository-contracts.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlStatement,
  PlanningSqlRow,
  PlanningSqlValue
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

export type PlanningServiceQuerySqlRepositorySlice =
  PlanningServiceQueryPersistenceRepository;

export interface PlanningQuerySqlRepositoryDependencies {
  readonly executor: PlanningSqlExecutor;
}

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
  .transform((row): PlanningServicePersistenceRecord =>
    PlanningServicePersistenceRecordSchema.parse({
      serviceId: row.service_id,
      serviceTypeId: row.service_type_id,
      ...(row.starts_at !== undefined && row.starts_at !== null
        ? { startsAt: row.starts_at }
        : {}),
      status: row.status,
      tenantId: row.tenant_id,
      title: row.title
    })
  );

const PlanningServiceTemplateSqlRowSchema = z
  .object({
    description: z.string().min(1).nullable().optional(),
    service_template_id: z.string().min(1),
    service_type_id: z.string().min(1),
    tenant_id: z.string().min(1),
    title: z.string().min(1)
  })
  .strict()
  .transform((row): PlanningServiceTemplatePersistenceRecord =>
    PlanningServiceTemplatePersistenceRecordSchema.parse({
      ...(row.description !== undefined && row.description !== null
        ? { description: row.description }
        : {}),
      serviceTemplateId: row.service_template_id,
      serviceTypeId: row.service_type_id,
      tenantId: row.tenant_id,
      title: row.title
    })
  );

const PlanningSongLibraryItemSqlRowSchema = z
  .object({
    artist: z.string().min(1).nullable().optional(),
    available_keys: z.array(z.string().min(1)),
    ccli_reporting_allowed: z.boolean(),
    ccli_song_number: z.string().min(1).nullable().optional(),
    default_key: z.string().min(1).nullable().optional(),
    energy: z.enum(["low", "medium", "high"]).nullable().optional(),
    has_arrangements: z.boolean(),
    has_charts: z.boolean(),
    is_banned_or_paused: z.boolean(),
    last_used_at: z.string().datetime().nullable().optional(),
    song_id: z.string().min(1),
    tempo_bpm: z.number().int().positive().nullable().optional(),
    tenant_id: z.string().min(1),
    title: z.string().min(1),
    usage_count: z.number().int().nonnegative()
  })
  .strict()
  .transform((row): PlanningSongLibraryItemPersistenceRecord =>
    PlanningSongLibraryItemPersistenceRecordSchema.parse({
      ...(row.artist !== undefined && row.artist !== null ? { artist: row.artist } : {}),
      availableKeys: row.available_keys,
      ccliReportingAllowed: row.ccli_reporting_allowed,
      ...(row.ccli_song_number !== undefined && row.ccli_song_number !== null
        ? { ccliSongNumber: row.ccli_song_number }
        : {}),
      ...(row.default_key !== undefined && row.default_key !== null
        ? { defaultKey: row.default_key }
        : {}),
      ...(row.energy !== undefined && row.energy !== null ? { energy: row.energy } : {}),
      hasArrangements: row.has_arrangements,
      hasCharts: row.has_charts,
      isBannedOrPaused: row.is_banned_or_paused,
      ...(row.last_used_at !== undefined && row.last_used_at !== null
        ? { lastUsedAt: row.last_used_at }
        : {}),
      songId: row.song_id,
      ...(row.tempo_bpm !== undefined && row.tempo_bpm !== null
        ? { tempoBpm: row.tempo_bpm }
        : {}),
      tenantId: row.tenant_id,
      title: row.title,
      usageCount: row.usage_count
    })
  );

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

const firstOrNull = (rows: readonly PlanningSqlRow[]): PlanningSqlRow | null => rows[0] ?? null;

const andClause = (
  clauses: string[],
  parameters: PlanningSqlValue[],
  clause: string,
  value: PlanningSqlValue
): void => {
  parameters.push(value);
  clauses.push(clause.replace("?", `$${String(parameters.length)}`));
};

const withOptionalTransaction = (
  statement: Omit<PlanningSqlStatement, "transaction">,
  transaction: TransactionHandle | undefined
): PlanningSqlStatement =>
  transaction === undefined
    ? statement
    : {
        ...statement,
        transaction
      };

export const createPlanningServiceQuerySqlRepository = (
  dependencies: PlanningQuerySqlRepositoryDependencies
): PlanningServiceQuerySqlRepositorySlice => ({
  getService: async (
    rawOperation: GetPlanningServicePersistenceOperation
  ): Promise<PlanningServicePersistenceRecord | null> => {
    const operation = GetPlanningServicePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
          name: "planning.services.get",
          parameters: [operation.options.context.tenantId, operation.input.serviceId],
          sql: `
SELECT tenant_id, service_id, service_type_id, title, status, starts_at
FROM planning_services
WHERE tenant_id = $1
  AND service_id = $2
`.trim()
        },
        operation.options.transaction
      )
    );
    const row = firstOrNull(result.rows);

    return row === null ? null : PlanningServiceSqlRowSchema.parse(row);
  },

  getServiceReadiness: async (
    rawOperation: GetPlanningServiceReadinessPersistenceOperation
  ): Promise<PlanningReadinessPersistenceRecord | null> => {
    const operation =
      GetPlanningServiceReadinessPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
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
`.trim()
        },
        operation.options.transaction
      )
    );
    const row = firstOrNull(result.rows);

    return row === null ? null : PlanningReadinessSqlRowSchema.parse(row);
  },

  listServiceAssignments: async (
    rawOperation: ListPlanningServiceAssignmentsPersistenceOperation
  ): Promise<readonly PlanningAssignmentPersistenceRecord[]> => {
    const operation =
      ListPlanningServiceAssignmentsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
          name: "planning.assignments.list_by_service",
          parameters: [operation.options.context.tenantId, operation.input.serviceId],
          sql: `
SELECT tenant_id, assignment_id, service_id, person_id, role_id, status
FROM planning_assignments
WHERE tenant_id = $1
  AND service_id = $2
ORDER BY role_id, person_id, assignment_id
`.trim()
        },
        operation.options.transaction
      )
    );

    return z.array(PlanningAssignmentSqlRowSchema).parse(result.rows);
  },

  listServiceTemplates: async (
    rawOperation: ListPlanningServiceTemplatesPersistenceOperation
  ): Promise<readonly PlanningServiceTemplatePersistenceRecord[]> => {
    const operation =
      ListPlanningServiceTemplatesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
          name: "planning.service_templates.list_by_service_type",
          parameters: [operation.options.context.tenantId, operation.input.serviceTypeId],
          sql: `
SELECT tenant_id, service_template_id, service_type_id, title, description
FROM planning_service_templates
WHERE tenant_id = $1
  AND service_type_id = $2
ORDER BY title, service_template_id
`.trim()
        },
        operation.options.transaction
      )
    );

    return z.array(PlanningServiceTemplateSqlRowSchema).parse(result.rows);
  },

  listServices: async (
    rawOperation: ListPlanningServicesPersistenceOperation
  ): Promise<readonly PlanningServicePersistenceRecord[]> => {
    const operation = ListPlanningServicesPersistenceOperationSchema.parse(rawOperation);
    const parameters: PlanningSqlValue[] = [operation.options.context.tenantId];
    const clauses = ["tenant_id = $1"];
    const filter = operation.input.filter;

    if (filter?.serviceTypeId !== undefined) {
      andClause(clauses, parameters, "service_type_id = ?", filter.serviceTypeId);
    }

    if (filter?.status !== undefined) {
      andClause(clauses, parameters, "status = ?", filter.status);
    }

    if (filter?.startsAtOrAfter !== undefined) {
      andClause(clauses, parameters, "starts_at >= ?", filter.startsAtOrAfter);
    }

    if (filter?.startsBefore !== undefined) {
      andClause(clauses, parameters, "starts_at < ?", filter.startsBefore);
    }

    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
          name: "planning.services.list",
          parameters,
          sql: `
SELECT tenant_id, service_id, service_type_id, title, status, starts_at
FROM planning_services
WHERE ${clauses.join("\n  AND ")}
ORDER BY starts_at NULLS LAST, title, service_id
`.trim()
        },
        operation.options.transaction
      )
    );

    return z.array(PlanningServiceSqlRowSchema).parse(result.rows);
  },

  listSongLibrary: async (
    rawOperation: ListPlanningSongLibraryPersistenceOperation
  ): Promise<readonly PlanningSongLibraryItemPersistenceRecord[]> => {
    const operation = ListPlanningSongLibraryPersistenceOperationSchema.parse(rawOperation);
    const { includeBannedOrPaused, key, limit, query } = operation.input.searchInput;
    const parameters: PlanningSqlValue[] = [operation.options.context.tenantId];
    const clauses = ["tenant_id = $1"];

    if (includeBannedOrPaused !== true) {
      clauses.push("is_banned_or_paused = FALSE");
    }

    if (query !== undefined) {
      const titleParameterIndex = parameters.length + 1;
      const artistParameterIndex = parameters.length + 2;
      parameters.push(`%${query}%`, `%${query}%`);
      clauses.push(
        `(title ILIKE $${String(titleParameterIndex)} OR artist ILIKE $${String(
          artistParameterIndex
        )})`
      );
    }

    if (key !== undefined) {
      parameters.push(key);
      clauses.push(`available_keys ? $${String(parameters.length)}`);
    }

    if (limit !== undefined) {
      parameters.push(limit);
    }

    const limitClause = limit === undefined ? "" : `\nLIMIT $${String(parameters.length)}`;
    const result = await dependencies.executor.query(
      withOptionalTransaction(
        {
          name: "planning.song_library.list",
          parameters,
          sql: `
SELECT
  tenant_id,
  song_id,
  title,
  artist,
  default_key,
  available_keys,
  ccli_song_number,
  ccli_reporting_allowed,
  energy,
  has_arrangements,
  has_charts,
  is_banned_or_paused,
  last_used_at,
  tempo_bpm,
  usage_count
FROM planning_song_library_items
WHERE ${clauses.join("\n  AND ")}
ORDER BY usage_count DESC, title, song_id${limitClause}
`.trim()
        },
        operation.options.transaction
      )
    );

    return z.array(PlanningSongLibraryItemSqlRowSchema).parse(result.rows);
  }
});
