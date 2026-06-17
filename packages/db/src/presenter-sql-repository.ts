import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  AddPresenterSlidePersistenceOperationSchema,
  GetPresenterPresentationForServicePersistenceOperationSchema,
  GetPresenterPresentationPersistenceOperationSchema,
  ListPresenterOutputTargetsPersistenceOperationSchema,
  ListPresenterPresentationsPersistenceOperationSchema,
  ListPresenterThemesPersistenceOperationSchema,
  PresenterOutputTargetPersistenceRecordSchema,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  PresenterThemePersistenceRecordSchema,
  RemovePresenterSlidePersistenceOperationSchema,
  ReorderPresenterSlidesPersistenceOperationSchema,
  SavePresenterPresentationPersistenceOperationSchema,
  SavePresenterThemePersistenceOperationSchema,
  SetPresenterOutputTargetPersistenceOperationSchema,
  UpdatePresenterSlidePersistenceOperationSchema,
  type AddPresenterSlidePersistenceOperation,
  type GetPresenterPresentationForServicePersistenceOperation,
  type GetPresenterPresentationPersistenceOperation,
  type ListPresenterOutputTargetsPersistenceOperation,
  type ListPresenterPresentationsPersistenceOperation,
  type ListPresenterThemesPersistenceOperation,
  type PresenterCommandPersistenceRepository,
  type PresenterOutputTargetPersistenceRecord,
  type PresenterPresentationPersistenceRecord,
  type PresenterQueryPersistenceRepository,
  type PresenterSlidePersistenceRecord,
  type PresenterThemePersistenceRecord,
  type RemovePresenterSlidePersistenceOperation,
  type ReorderPresenterSlidesPersistenceOperation,
  type SavePresenterPresentationPersistenceOperation,
  type SavePresenterThemePersistenceOperation,
  type SetPresenterOutputTargetPersistenceOperation,
  type UpdatePresenterSlidePersistenceOperation
} from "./presenter-repository-contracts.js";
import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

export interface PresenterQuerySqlRepositoryDependencies {
  readonly executor: Pick<PlanningSqlExecutor, "query">;
}

export interface PresenterCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlanningSqlExecutor;
  readonly ids: {
    readonly auditLogId: () => string;
  };
}

const JsonObjectSchema = z.record(z.string(), z.unknown());
const JsonArraySchema = z.array(z.unknown());

const PresenterThemeSqlRowSchema = z
  .object({
    colors: JsonObjectSchema,
    lower_third: JsonObjectSchema,
    name: z.string().min(1),
    spacing: JsonObjectSchema,
    tenant_id: z.string().min(1),
    theme_id: z.string().min(1),
    typography: JsonObjectSchema
  })
  .strict()
  .transform((row): PresenterThemePersistenceRecord =>
    PresenterThemePersistenceRecordSchema.parse({
      colors: row.colors,
      lowerThird: row.lower_third,
      name: row.name,
      spacing: row.spacing,
      tenantId: row.tenant_id,
      themeId: row.theme_id,
      typography: row.typography
    })
  );

const PresenterOutputTargetSqlRowSchema = z
  .object({
    confidence_output_enabled: z.boolean(),
    display_name: z.string().min(1),
    output_target_id: z.string().min(1),
    safe_blanked: z.boolean(),
    target_kind: z.enum(["main", "confidence", "stage-display"]),
    tenant_id: z.string().min(1),
    window_ref: z.string().min(1)
  })
  .strict()
  .transform((row): PresenterOutputTargetPersistenceRecord =>
    PresenterOutputTargetPersistenceRecordSchema.parse({
      confidenceOutputEnabled: row.confidence_output_enabled,
      displayName: row.display_name,
      outputTargetId: row.output_target_id,
      safeBlanked: row.safe_blanked,
      targetKind: row.target_kind,
      tenantId: row.tenant_id,
      windowRef: row.window_ref
    })
  );

const PresenterSlideSqlRowSchema = z
  .object({
    background_ref: z.string().min(1).nullable().optional(),
    blocks: JsonArraySchema,
    layout: z.enum(["title", "content", "scripture", "lyrics", "media", "lower-third"]),
    notes: z.string().min(1).nullable().optional(),
    presentation_id: z.string().min(1),
    service_item_id: z.string().min(1).nullable().optional(),
    slide_id: z.string().min(1),
    sort_order: z.number().int().nonnegative(),
    tenant_id: z.string().min(1),
    timing_hint_seconds: z.number().int().positive().nullable().optional(),
    title: z.string().min(1).nullable().optional()
  })
  .strict()
  .transform((row): PresenterSlidePersistenceRecord =>
    PresenterSlidePersistenceRecordSchema.parse({
      ...(row.background_ref !== undefined && row.background_ref !== null
        ? { backgroundRef: row.background_ref }
        : {}),
      blocks: row.blocks,
      layout: row.layout,
      ...(row.notes !== undefined && row.notes !== null ? { notes: row.notes } : {}),
      order: row.sort_order,
      presentationId: row.presentation_id,
      ...(row.service_item_id !== undefined && row.service_item_id !== null
        ? { serviceItemId: row.service_item_id }
        : {}),
      slideId: row.slide_id,
      tenantId: row.tenant_id,
      ...(row.timing_hint_seconds !== undefined && row.timing_hint_seconds !== null
        ? { timingHintSeconds: row.timing_hint_seconds }
        : {}),
      ...(row.title !== undefined && row.title !== null ? { title: row.title } : {})
    })
  );

const PresenterPresentationSqlRowSchema = z
  .object({
    created_at: z.string().datetime(),
    media_cues: JsonArraySchema,
    presentation_id: z.string().min(1),
    service_id: z.string().min(1).nullable().optional(),
    slides: JsonArraySchema,
    tenant_id: z.string().min(1),
    theme: JsonObjectSchema,
    title: z.string().min(1),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row): PresenterPresentationPersistenceRecord =>
    PresenterPresentationPersistenceRecordSchema.parse({
      createdAt: row.created_at,
      mediaCues: row.media_cues,
      presentationId: row.presentation_id,
      ...(row.service_id !== undefined && row.service_id !== null
        ? { serviceId: row.service_id }
        : {}),
      slides: row.slides,
      tenantId: row.tenant_id,
      theme: row.theme,
      title: row.title,
      updatedAt: row.updated_at
    })
  );

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

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

const parseOptionalRow = <Record>(
  rowSchema: { readonly parse: (row: PlanningSqlRow) => Record },
  rows: readonly PlanningSqlRow[]
): Record | null => {
  const row = rows[0];

  return row === undefined ? null : rowSchema.parse(row);
};

const jsonParameter = (value: unknown): string => JSON.stringify(value);

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
  dependencies: PresenterCommandSqlRepositoryDependencies,
  transaction: TransactionHandle,
  audit: {
    readonly actorId: string | undefined;
    readonly confirmationReason?: string | undefined;
    readonly createdAt: string;
    readonly intent: RepositoryMutationIntent;
    readonly operationName: string;
    readonly requestId: string;
    readonly targetAggregateId: string;
    readonly tenantId: string;
  }
): Promise<void> => {
  await dependencies.executor.query({
    name: "presenter.audit.insert",
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
INSERT INTO presenter_audit_log (
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

const presentationAggregateSelectSql = `
SELECT
  presentation.tenant_id,
  presentation.presentation_id,
  presentation.service_id,
  presentation.title,
  presentation.created_at,
  presentation.updated_at,
  jsonb_build_object(
    'tenantId', theme.tenant_id,
    'themeId', theme.theme_id,
    'name', theme.name,
    'typography', theme.typography,
    'colors', theme.colors,
    'spacing', theme.spacing,
    'lowerThird', theme.lower_third
  ) AS theme,
  COALESCE(
    (
      SELECT jsonb_agg(slide_record ORDER BY (slide_record->>'order')::int)
      FROM (
        SELECT jsonb_build_object(
          'tenantId', slide.tenant_id,
          'presentationId', slide.presentation_id,
          'slideId', slide.slide_id,
          'serviceItemId', slide.service_item_id,
          'title', slide.title,
          'layout', slide.layout,
          'order', slide.sort_order,
          'backgroundRef', slide.background_ref,
          'notes', slide.notes,
          'timingHintSeconds', slide.timing_hint_seconds,
          'blocks', COALESCE(
            (
              SELECT jsonb_agg(block.payload ORDER BY block.block_order)
              FROM presenter_slide_blocks block
              WHERE block.tenant_id = slide.tenant_id
                AND block.presentation_id = slide.presentation_id
                AND block.slide_id = slide.slide_id
            ),
            '[]'::jsonb
          )
        ) AS slide_record
        FROM presenter_slides slide
        WHERE slide.tenant_id = presentation.tenant_id
          AND slide.presentation_id = presentation.presentation_id
      ) slides
    ),
    '[]'::jsonb
  ) AS slides,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'tenantId', cue.tenant_id,
          'mediaCueId', cue.media_cue_id,
          'presentationId', cue.presentation_id,
          'slideId', cue.slide_id,
          'label', cue.label,
          'mediaAssetRef', cue.media_asset_ref,
          'playbackHint', cue.playback_hint
        )
        ORDER BY cue.media_cue_id
      )
      FROM presenter_media_cues cue
      WHERE cue.tenant_id = presentation.tenant_id
        AND cue.presentation_id = presentation.presentation_id
    ),
    '[]'::jsonb
  ) AS media_cues
FROM presenter_presentations presentation
JOIN presenter_themes theme
  ON theme.tenant_id = presentation.tenant_id
 AND theme.theme_id = presentation.theme_id
`;

export const createPresenterQuerySqlRepository = (
  dependencies: PresenterQuerySqlRepositoryDependencies
): PresenterQueryPersistenceRepository => ({
  getPresentation: async (
    rawOperation: GetPresenterPresentationPersistenceOperation
  ): Promise<PresenterPresentationPersistenceRecord | null> => {
    const operation = GetPresenterPresentationPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.presentations.get",
      parameters: [operation.options.context.tenantId, operation.input.presentationId],
      sql: `
${presentationAggregateSelectSql}
WHERE presentation.tenant_id = $1
  AND presentation.presentation_id = $2
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(PresenterPresentationSqlRowSchema, result.rows);
  },

  getPresentationForService: async (
    rawOperation: GetPresenterPresentationForServicePersistenceOperation
  ): Promise<PresenterPresentationPersistenceRecord | null> => {
    const operation =
      GetPresenterPresentationForServicePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.presentations.get_for_service",
      parameters: [operation.options.context.tenantId, operation.input.serviceId],
      sql: `
${presentationAggregateSelectSql}
WHERE presentation.tenant_id = $1
  AND presentation.service_id = $2
ORDER BY presentation.updated_at DESC
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(PresenterPresentationSqlRowSchema, result.rows);
  },

  listOutputTargets: async (
    rawOperation: ListPresenterOutputTargetsPersistenceOperation
  ): Promise<readonly PresenterOutputTargetPersistenceRecord[]> => {
    const operation = ListPresenterOutputTargetsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.output_targets.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.presentationId ?? null
      ],
      sql: `
SELECT
  output_target.tenant_id,
  output_target.output_target_id,
  output_target.display_name,
  output_target.target_kind,
  output_target.window_ref,
  output_target.safe_blanked,
  output_target.confidence_output_enabled
FROM presenter_output_targets output_target
WHERE output_target.tenant_id = $1
  AND (
    $2::text IS NULL OR EXISTS (
      SELECT 1
      FROM presenter_presentation_output_targets link
      WHERE link.tenant_id = output_target.tenant_id
        AND link.output_target_id = output_target.output_target_id
        AND link.presentation_id = $2
    )
  )
ORDER BY output_target.target_kind, output_target.display_name, output_target.output_target_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PresenterOutputTargetSqlRowSchema).parse(result.rows);
  },

  listPresenterThemes: async (
    rawOperation: ListPresenterThemesPersistenceOperation
  ): Promise<readonly PresenterThemePersistenceRecord[]> => {
    const operation = ListPresenterThemesPersistenceOperationSchema.parse(rawOperation);
    const query =
      operation.input.filter?.query === undefined
        ? null
        : `%${operation.input.filter.query}%`;
    const result = await dependencies.executor.query({
      name: "presenter.themes.list",
      parameters: [operation.options.context.tenantId, query],
      sql: `
SELECT tenant_id, theme_id, name, typography, colors, spacing, lower_third
FROM presenter_themes
WHERE tenant_id = $1
  AND ($2::text IS NULL OR name ILIKE $2)
ORDER BY name, theme_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PresenterThemeSqlRowSchema).parse(result.rows);
  },

  listPresentations: async (
    rawOperation: ListPresenterPresentationsPersistenceOperation
  ): Promise<readonly PresenterPresentationPersistenceRecord[]> => {
    const operation = ListPresenterPresentationsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "presenter.presentations.list",
      parameters: [
        operation.options.context.tenantId,
        operation.input.filter?.serviceId ?? null
      ],
      sql: `
${presentationAggregateSelectSql}
WHERE presentation.tenant_id = $1
  AND ($2::text IS NULL OR presentation.service_id = $2)
ORDER BY presentation.updated_at DESC, presentation.title, presentation.presentation_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PresenterPresentationSqlRowSchema).parse(result.rows);
  }
});

export const createPresenterCommandSqlRepository = (
  dependencies: PresenterCommandSqlRepositoryDependencies
): PresenterCommandPersistenceRepository => ({
  addSlide: async (
    rawOperation: AddPresenterSlidePersistenceOperation
  ): Promise<PresenterSlidePersistenceRecord> => {
    const operation = AddPresenterSlidePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterSlidePersistenceRecord> => {
        const result = await dependencies.executor.query({
          name: "presenter.slides.add",
          parameters: [
            operation.options.context.tenantId,
            operation.input.presentationId,
            operation.input.slide.slideId,
            operation.input.afterSlideId ?? null,
            operation.input.slide.serviceItemId ?? null,
            operation.input.slide.title ?? null,
            operation.input.slide.layout,
            operation.input.slide.backgroundRef ?? null,
            operation.input.slide.notes ?? null,
            operation.input.slide.timingHintSeconds ?? null,
            jsonParameter(operation.input.slide.blocks),
            now
          ],
          sql: `
WITH target_presentation AS (
  SELECT tenant_id, presentation_id
  FROM presenter_presentations
  WHERE tenant_id = $1
    AND presentation_id = $2
),
insert_position AS (
  SELECT COALESCE(
    (
      SELECT slide.sort_order + 1
      FROM presenter_slides slide
      WHERE slide.tenant_id = $1
        AND slide.presentation_id = $2
        AND slide.slide_id = $4
    ),
    (
      SELECT COUNT(*)
      FROM presenter_slides slide
      WHERE slide.tenant_id = $1
        AND slide.presentation_id = $2
    )
  ) AS sort_order
),
shifted AS (
  UPDATE presenter_slides slide
  SET sort_order = slide.sort_order + 1,
      updated_at = $12
  FROM insert_position
  WHERE slide.tenant_id = $1
    AND slide.presentation_id = $2
    AND slide.sort_order >= insert_position.sort_order
  RETURNING slide.slide_id
),
inserted AS (
  INSERT INTO presenter_slides (
    tenant_id,
    presentation_id,
    slide_id,
    service_item_id,
    title,
    layout,
    sort_order,
    background_ref,
    notes,
    timing_hint_seconds,
    created_at,
    updated_at
  )
  SELECT
    target_presentation.tenant_id,
    target_presentation.presentation_id,
    $3,
    $5,
    $6,
    $7,
    insert_position.sort_order,
    $8,
    $9,
    $10,
    $12,
    $12
  FROM target_presentation, insert_position
  RETURNING
    tenant_id,
    presentation_id,
    slide_id,
    service_item_id,
    title,
    layout,
    sort_order,
    background_ref,
    notes,
    timing_hint_seconds
),
blocks AS (
  INSERT INTO presenter_slide_blocks (
    tenant_id,
    presentation_id,
    slide_id,
    block_id,
    kind,
    block_order,
    payload
  )
  SELECT
    inserted.tenant_id,
    inserted.presentation_id,
    inserted.slide_id,
    block_payload->>'blockId',
    block_payload->>'kind',
    block_ordinal - 1,
    block_payload
  FROM inserted,
    jsonb_array_elements($11::jsonb) WITH ORDINALITY AS block(block_payload, block_ordinal)
  RETURNING block_id
)
SELECT
  inserted.*,
  COALESCE(
    (
      SELECT jsonb_agg(block.payload ORDER BY block.block_order)
      FROM presenter_slide_blocks block
      WHERE block.tenant_id = inserted.tenant_id
        AND block.presentation_id = inserted.presentation_id
        AND block.slide_id = inserted.slide_id
    ),
    '[]'::jsonb
  ) AS blocks
FROM inserted
`.trim(),
          transaction
        });
        const slide = PresenterSlideSqlRowSchema.parse(
          firstRow(result, "Presenter slide add returned no row.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "addSlide",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return slide;
      }
    );
  },

  removeSlide: async (
    rawOperation: RemovePresenterSlidePersistenceOperation
  ): Promise<PresenterPresentationPersistenceRecord> => {
    const operation = RemovePresenterSlidePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterPresentationPersistenceRecord> => {
        await dependencies.executor.query({
          name: "presenter.slides.remove",
          parameters: [
            operation.options.context.tenantId,
            operation.input.presentationId,
            operation.input.slideId,
            now
          ],
          sql: `
WITH remaining_count AS (
  SELECT COUNT(*) AS count
  FROM presenter_slides
  WHERE tenant_id = $1
    AND presentation_id = $2
),
deleted AS (
  DELETE FROM presenter_slides slide
  USING remaining_count
  WHERE remaining_count.count > 1
    AND slide.tenant_id = $1
    AND slide.presentation_id = $2
    AND slide.slide_id = $3
  RETURNING slide.sort_order
),
removed_cues AS (
  DELETE FROM presenter_media_cues cue
  WHERE cue.tenant_id = $1
    AND cue.presentation_id = $2
    AND cue.slide_id = $3
  RETURNING cue.media_cue_id
),
renumbered AS (
  UPDATE presenter_slides slide
  SET sort_order = slide.sort_order - 1,
      updated_at = $4
  FROM deleted
  WHERE slide.tenant_id = $1
    AND slide.presentation_id = $2
    AND slide.sort_order > deleted.sort_order
  RETURNING slide.slide_id
)
UPDATE presenter_presentations
SET updated_at = $4
WHERE tenant_id = $1
  AND presentation_id = $2
  AND EXISTS (SELECT 1 FROM deleted)
`.trim(),
          transaction
        });
        const result = await dependencies.executor.query({
          name: "presenter.presentations.get_after_remove",
          parameters: [operation.options.context.tenantId, operation.input.presentationId],
          sql: `
${presentationAggregateSelectSql}
WHERE presentation.tenant_id = $1
  AND presentation.presentation_id = $2
LIMIT 1
`.trim(),
          transaction
        });
        const presentation = PresenterPresentationSqlRowSchema.parse(
          firstRow(result, "Presenter slide remove returned no presentation.")
        );

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "removeSlide",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return presentation;
      }
    );
  },

  reorderSlides: async (
    rawOperation: ReorderPresenterSlidesPersistenceOperation
  ): Promise<readonly PresenterSlidePersistenceRecord[]> => {
    const operation = ReorderPresenterSlidesPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<readonly PresenterSlidePersistenceRecord[]> => {
        const result = await dependencies.executor.query({
          name: "presenter.slides.reorder",
          parameters: [
            operation.options.context.tenantId,
            operation.input.presentationId,
            operation.input.orderedSlideIds,
            now
          ],
          sql: `
WITH requested(slide_id, ordinal) AS (
  SELECT *
  FROM unnest($3::text[]) WITH ORDINALITY
),
existing AS (
  SELECT slide_id
  FROM presenter_slides
  WHERE tenant_id = $1
    AND presentation_id = $2
),
validated AS (
  SELECT
    (SELECT COUNT(*) FROM requested) = (SELECT COUNT(*) FROM existing)
    AND NOT EXISTS (
      SELECT 1
      FROM requested
      LEFT JOIN existing USING (slide_id)
      WHERE existing.slide_id IS NULL
    ) AS ok
),
updated AS (
  UPDATE presenter_slides slide
  SET sort_order = requested.ordinal - 1,
      updated_at = $4
  FROM requested, validated
  WHERE validated.ok
    AND slide.tenant_id = $1
    AND slide.presentation_id = $2
    AND slide.slide_id = requested.slide_id
  RETURNING
    slide.tenant_id,
    slide.presentation_id,
    slide.slide_id,
    slide.service_item_id,
    slide.title,
    slide.layout,
    slide.sort_order,
    slide.background_ref,
    slide.notes,
    slide.timing_hint_seconds
)
SELECT
  updated.*,
  COALESCE(
    (
      SELECT jsonb_agg(block.payload ORDER BY block.block_order)
      FROM presenter_slide_blocks block
      WHERE block.tenant_id = updated.tenant_id
        AND block.presentation_id = updated.presentation_id
        AND block.slide_id = updated.slide_id
    ),
    '[]'::jsonb
  ) AS blocks
FROM updated
ORDER BY sort_order
`.trim(),
          transaction
        });
        const slides = z.array(PresenterSlideSqlRowSchema).parse(result.rows);

        if (slides.length !== operation.input.orderedSlideIds.length) {
          throw new Error("Presenter slide reorder did not update every requested slide.");
        }

        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "reorderSlides",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return slides;
      }
    );
  },

  savePresentation: async (
    rawOperation: SavePresenterPresentationPersistenceOperation
  ): Promise<PresenterPresentationPersistenceRecord> => {
    const operation = SavePresenterPresentationPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const presentation = operation.input;

    if (presentation.tenantId !== operation.options.context.tenantId) {
      throw new Error("Presenter presentation tenant must match operation tenant.");
    }

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterPresentationPersistenceRecord> => {
        await saveThemeRecord(dependencies, transaction, presentation.theme, now);
        await dependencies.executor.query({
          name: "presenter.presentations.upsert",
          parameters: [
            presentation.tenantId,
            presentation.presentationId,
            presentation.serviceId ?? null,
            presentation.theme.themeId,
            presentation.title,
            presentation.createdAt,
            presentation.updatedAt
          ],
          sql: `
INSERT INTO presenter_presentations (
  tenant_id,
  presentation_id,
  service_id,
  theme_id,
  title,
  created_at,
  updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (tenant_id, presentation_id)
DO UPDATE SET
  service_id = EXCLUDED.service_id,
  theme_id = EXCLUDED.theme_id,
  title = EXCLUDED.title,
  updated_at = EXCLUDED.updated_at
`.trim(),
          transaction
        });
        await replacePresentationChildren(dependencies, transaction, presentation, now);
        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "savePresentation",
          requestId: operation.options.context.requestId,
          targetAggregateId: presentation.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return PresenterPresentationPersistenceRecordSchema.parse(presentation);
      }
    );
  },

  savePresenterTheme: async (
    rawOperation: SavePresenterThemePersistenceOperation
  ): Promise<PresenterThemePersistenceRecord> => {
    const operation = SavePresenterThemePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    if (operation.input.tenantId !== operation.options.context.tenantId) {
      throw new Error("Presenter theme tenant must match operation tenant.");
    }

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterThemePersistenceRecord> => {
        await saveThemeRecord(dependencies, transaction, operation.input, now);
        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "savePresenterTheme",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.themeId,
          tenantId: operation.options.context.tenantId
        });

        return PresenterThemePersistenceRecordSchema.parse(operation.input);
      }
    );
  },

  setOutputTarget: async (
    rawOperation: SetPresenterOutputTargetPersistenceOperation
  ): Promise<PresenterOutputTargetPersistenceRecord> => {
    const operation = SetPresenterOutputTargetPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    if (operation.input.outputTarget.tenantId !== operation.options.context.tenantId) {
      throw new Error("Presenter output target tenant must match operation tenant.");
    }

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterOutputTargetPersistenceRecord> => {
        await dependencies.executor.query({
          name: "presenter.output_targets.upsert",
          parameters: [
            operation.input.outputTarget.tenantId,
            operation.input.outputTarget.outputTargetId,
            operation.input.outputTarget.displayName,
            operation.input.outputTarget.targetKind,
            operation.input.outputTarget.windowRef,
            operation.input.outputTarget.safeBlanked,
            operation.input.outputTarget.confidenceOutputEnabled,
            now,
            operation.input.presentationId
          ],
          sql: `
WITH target_presentation AS (
  SELECT tenant_id, presentation_id
  FROM presenter_presentations
  WHERE tenant_id = $1
    AND presentation_id = $9
),
upserted AS (
  INSERT INTO presenter_output_targets (
    tenant_id,
    output_target_id,
    display_name,
    target_kind,
    window_ref,
    safe_blanked,
    confidence_output_enabled,
    created_at,
    updated_at
  )
  SELECT $1, $2, $3, $4, $5, $6, $7, $8, $8
  WHERE EXISTS (SELECT 1 FROM target_presentation)
  ON CONFLICT (tenant_id, output_target_id)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    target_kind = EXCLUDED.target_kind,
    window_ref = EXCLUDED.window_ref,
    safe_blanked = EXCLUDED.safe_blanked,
    confidence_output_enabled = EXCLUDED.confidence_output_enabled,
    updated_at = EXCLUDED.updated_at
  RETURNING tenant_id, output_target_id
)
INSERT INTO presenter_presentation_output_targets (
  tenant_id,
  presentation_id,
  output_target_id,
  created_at
)
SELECT target_presentation.tenant_id, target_presentation.presentation_id, upserted.output_target_id, $8
FROM target_presentation, upserted
ON CONFLICT (tenant_id, presentation_id, output_target_id) DO NOTHING
`.trim(),
          transaction
        });
        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "setOutputTarget",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return PresenterOutputTargetPersistenceRecordSchema.parse(operation.input.outputTarget);
      }
    );
  },

  updateSlide: async (
    rawOperation: UpdatePresenterSlidePersistenceOperation
  ): Promise<PresenterSlidePersistenceRecord> => {
    const operation = UpdatePresenterSlidePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();

    return runWithWriteTransaction(
      dependencies.executor,
      operation.options.transaction,
      async (transaction): Promise<PresenterSlidePersistenceRecord> => {
        await dependencies.executor.query({
          name: "presenter.slides.update",
          parameters: [
            operation.options.context.tenantId,
            operation.input.presentationId,
            operation.input.slide.slideId,
            operation.input.slide.serviceItemId ?? null,
            operation.input.slide.title ?? null,
            operation.input.slide.layout,
            operation.input.slide.backgroundRef ?? null,
            operation.input.slide.notes ?? null,
            operation.input.slide.timingHintSeconds ?? null,
            jsonParameter(operation.input.slide.blocks),
            now
          ],
          sql: `
UPDATE presenter_slides
SET
  service_item_id = $4,
  title = $5,
  layout = $6,
  background_ref = $7,
  notes = $8,
  timing_hint_seconds = $9,
  updated_at = $11
WHERE tenant_id = $1
  AND presentation_id = $2
  AND slide_id = $3
`.trim(),
          transaction
        });
        await dependencies.executor.query({
          name: "presenter.slide_blocks.replace",
          parameters: [
            operation.options.context.tenantId,
            operation.input.presentationId,
            operation.input.slide.slideId,
            jsonParameter(operation.input.slide.blocks)
          ],
          sql: `
DELETE FROM presenter_slide_blocks
WHERE tenant_id = $1
  AND presentation_id = $2
  AND slide_id = $3;

INSERT INTO presenter_slide_blocks (
  tenant_id,
  presentation_id,
  slide_id,
  block_id,
  kind,
  block_order,
  payload
)
SELECT
  $1,
  $2,
  $3,
  block_payload->>'blockId',
  block_payload->>'kind',
  block_ordinal - 1,
  block_payload
FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS block(block_payload, block_ordinal)
`.trim(),
          transaction
        });
        await insertAuditLog(dependencies, transaction, {
          actorId: operation.options.context.actorId,
          createdAt: now,
          intent: operation.options.intent,
          operationName: "updateSlide",
          requestId: operation.options.context.requestId,
          targetAggregateId: operation.input.presentationId,
          tenantId: operation.options.context.tenantId
        });

        return PresenterSlidePersistenceRecordSchema.parse(operation.input.slide);
      }
    );
  }
});

const saveThemeRecord = async (
  dependencies: PresenterCommandSqlRepositoryDependencies,
  transaction: TransactionHandle,
  theme: PresenterThemePersistenceRecord,
  now: string
): Promise<void> => {
  await dependencies.executor.query({
    name: "presenter.themes.upsert",
    parameters: [
      theme.tenantId,
      theme.themeId,
      theme.name,
      jsonParameter(theme.typography),
      jsonParameter(theme.colors),
      jsonParameter(theme.spacing),
      jsonParameter(theme.lowerThird),
      now
    ],
    sql: `
INSERT INTO presenter_themes (
  tenant_id,
  theme_id,
  name,
  typography,
  colors,
  spacing,
  lower_third,
  created_at,
  updated_at
)
VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $8)
ON CONFLICT (tenant_id, theme_id)
DO UPDATE SET
  name = EXCLUDED.name,
  typography = EXCLUDED.typography,
  colors = EXCLUDED.colors,
  spacing = EXCLUDED.spacing,
  lower_third = EXCLUDED.lower_third,
  updated_at = EXCLUDED.updated_at
`.trim(),
    transaction
  });
};

const replacePresentationChildren = async (
  dependencies: PresenterCommandSqlRepositoryDependencies,
  transaction: TransactionHandle,
  presentation: PresenterPresentationPersistenceRecord,
  now: string
): Promise<void> => {
  await dependencies.executor.query({
    name: "presenter.presentations.replace_children",
    parameters: [presentation.tenantId, presentation.presentationId],
    sql: `
DELETE FROM presenter_media_cues
WHERE tenant_id = $1
  AND presentation_id = $2;
DELETE FROM presenter_slide_blocks
WHERE tenant_id = $1
  AND presentation_id = $2;
DELETE FROM presenter_slides
WHERE tenant_id = $1
  AND presentation_id = $2
`.trim(),
    transaction
  });

  for (const slide of presentation.slides) {
    await dependencies.executor.query({
      name: "presenter.slides.insert_saved",
      parameters: [
        slide.tenantId,
        slide.presentationId,
        slide.slideId,
        slide.serviceItemId ?? null,
        slide.title ?? null,
        slide.layout,
        slide.order,
        slide.backgroundRef ?? null,
        slide.notes ?? null,
        slide.timingHintSeconds ?? null,
        now
      ],
      sql: `
INSERT INTO presenter_slides (
  tenant_id,
  presentation_id,
  slide_id,
  service_item_id,
  title,
  layout,
  sort_order,
  background_ref,
  notes,
  timing_hint_seconds,
  created_at,
  updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
`.trim(),
      transaction
    });
    await dependencies.executor.query({
      name: "presenter.slide_blocks.insert_saved",
      parameters: [
        slide.tenantId,
        slide.presentationId,
        slide.slideId,
        jsonParameter(slide.blocks)
      ],
      sql: `
INSERT INTO presenter_slide_blocks (
  tenant_id,
  presentation_id,
  slide_id,
  block_id,
  kind,
  block_order,
  payload
)
SELECT
  $1,
  $2,
  $3,
  block_payload->>'blockId',
  block_payload->>'kind',
  block_ordinal - 1,
  block_payload
FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS block(block_payload, block_ordinal)
`.trim(),
      transaction
    });
  }

  for (const mediaCue of presentation.mediaCues) {
    await dependencies.executor.query({
      name: "presenter.media_cues.insert_saved",
      parameters: [
        mediaCue.tenantId,
        mediaCue.mediaCueId,
        mediaCue.presentationId,
        mediaCue.slideId,
        mediaCue.label,
        mediaCue.mediaAssetRef,
        mediaCue.playbackHint
      ],
      sql: `
INSERT INTO presenter_media_cues (
  tenant_id,
  media_cue_id,
  presentation_id,
  slide_id,
  label,
  media_asset_ref,
  playback_hint
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
`.trim(),
      transaction
    });
  }
};
