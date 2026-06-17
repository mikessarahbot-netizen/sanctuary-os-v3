import { z } from "zod";
import {
  AddChartAnnotationPersistenceOperationSchema,
  ChartAnnotationPersistenceRecordSchema,
  ChartArrangementPersistenceRecordSchema,
  ChartPersistenceRecordSchema,
  GetChartPersistenceOperationSchema,
  GetMusicianChartPreferencePersistenceOperationSchema,
  ListChartAnnotationsPersistenceOperationSchema,
  ListChartArrangementsPersistenceOperationSchema,
  ListChartsForSongPersistenceOperationSchema,
  ListChartsPersistenceOperationSchema,
  MusicianChartPreferencePersistenceRecordSchema,
  RemoveChartAnnotationPersistenceOperationSchema,
  SaveChartArrangementPersistenceOperationSchema,
  SaveChartPersistenceOperationSchema,
  SetMusicianChartPreferencePersistenceOperationSchema,
  UpdateChartSourcePersistenceOperationSchema,
  type ChartAnnotationPersistenceRecord,
  type ChartArrangementPersistenceRecord,
  type ChartPersistenceRecord,
  type ChartsCommandPersistenceRepository,
  type ChartsQueryPersistenceRepository,
  type MusicianChartPreferencePersistenceRecord
} from "./charts-repository-contracts.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

type ListChartsPersistenceOperation = z.infer<typeof ListChartsPersistenceOperationSchema>;
type GetChartPersistenceOperation = z.infer<typeof GetChartPersistenceOperationSchema>;
type ListChartsForSongPersistenceOperation = z.infer<
  typeof ListChartsForSongPersistenceOperationSchema
>;
type ListChartArrangementsPersistenceOperation = z.infer<
  typeof ListChartArrangementsPersistenceOperationSchema
>;
type GetMusicianChartPreferencePersistenceOperation = z.infer<
  typeof GetMusicianChartPreferencePersistenceOperationSchema
>;
type ListChartAnnotationsPersistenceOperation = z.infer<
  typeof ListChartAnnotationsPersistenceOperationSchema
>;
type SaveChartPersistenceOperation = z.infer<typeof SaveChartPersistenceOperationSchema>;
type UpdateChartSourcePersistenceOperation = z.infer<
  typeof UpdateChartSourcePersistenceOperationSchema
>;
type SaveChartArrangementPersistenceOperation = z.infer<
  typeof SaveChartArrangementPersistenceOperationSchema
>;
type SetMusicianChartPreferencePersistenceOperation = z.infer<
  typeof SetMusicianChartPreferencePersistenceOperationSchema
>;
type AddChartAnnotationPersistenceOperation = z.infer<
  typeof AddChartAnnotationPersistenceOperationSchema
>;
type RemoveChartAnnotationPersistenceOperation = z.infer<
  typeof RemoveChartAnnotationPersistenceOperationSchema
>;

export type ChartsSqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface ChartsQuerySqlRepositoryDependencies {
  readonly executor: ChartsSqlExecutor;
}

export interface ChartsCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: ChartsSqlExecutor;
}

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const optionalText = (value: string | undefined): string | null => value ?? null;

const ChartSqlRowSchema = z
  .object({
    arrangement_ref: z.string().min(1).nullable().optional(),
    chart_id: z.string().min(1),
    chord_pro_source: z.string().min(1),
    created_at: z.string().datetime(),
    default_key: z.string().min(1),
    schema_version: z.string().min(1),
    song_id: z.string().min(1),
    tenant_id: z.string().min(1),
    title: z.string().min(1).nullable().optional(),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row): ChartPersistenceRecord =>
    ChartPersistenceRecordSchema.parse({
      ...(row.arrangement_ref !== undefined && row.arrangement_ref !== null
        ? { arrangementRef: row.arrangement_ref }
        : {}),
      chartId: row.chart_id,
      chordProSource: row.chord_pro_source,
      createdAt: row.created_at,
      defaultKey: row.default_key,
      schemaVersion: row.schema_version,
      songRef: row.song_id,
      tenantId: row.tenant_id,
      ...(row.title !== undefined && row.title !== null ? { title: row.title } : {}),
      updatedAt: row.updated_at
    })
  );

const ChartArrangementSqlRowSchema = z
  .object({
    arrangement_ref: z.string().min(1),
    capo: z.number().int().nonnegative(),
    default_key: z.string().min(1),
    label: z.string().min(1),
    section_order: z.string(),
    song_id: z.string().min(1),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): ChartArrangementPersistenceRecord =>
    ChartArrangementPersistenceRecordSchema.parse({
      arrangementRef: row.arrangement_ref,
      capo: row.capo,
      defaultKey: row.default_key,
      label: row.label,
      sectionOrder: z.array(z.string().min(1)).parse(JSON.parse(row.section_order)),
      songRef: row.song_id,
      tenantId: row.tenant_id
    })
  );

const ChartAnnotationSqlRowSchema = z
  .object({
    annotation_id: z.string().min(1),
    chart_id: z.string().min(1),
    color: z.string().min(1).nullable().optional(),
    created_at: z.string().datetime(),
    kind: z.string().min(1),
    line_index: z.number().int().nonnegative(),
    musician_id: z.string().min(1),
    note: z.string().min(1).nullable().optional(),
    section_index: z.number().int().nonnegative(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row): ChartAnnotationPersistenceRecord =>
    ChartAnnotationPersistenceRecordSchema.parse({
      annotationId: row.annotation_id,
      chartId: row.chart_id,
      ...(row.color !== undefined && row.color !== null ? { color: row.color } : {}),
      createdAt: row.created_at,
      kind: row.kind,
      lineIndex: row.line_index,
      musicianId: row.musician_id,
      ...(row.note !== undefined && row.note !== null ? { note: row.note } : {}),
      sectionIndex: row.section_index,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const MusicianChartPreferenceSqlRowSchema = z
  .object({
    capo: z.number().int().nonnegative(),
    chart_id: z.string().min(1),
    chords_visible: z.number().int(),
    font_scale: z.number().positive(),
    instrument: z.string().min(1),
    musician_id: z.string().min(1),
    tenant_id: z.string().min(1),
    transpose_semitones: z.number().int(),
    updated_at: z.string().datetime()
  })
  .strict()
  .transform((row): MusicianChartPreferencePersistenceRecord =>
    MusicianChartPreferencePersistenceRecordSchema.parse({
      capo: row.capo,
      chartId: row.chart_id,
      chordsVisible: row.chords_visible !== 0,
      fontScale: row.font_scale,
      instrument: row.instrument,
      musicianId: row.musician_id,
      tenantId: row.tenant_id,
      transposeSemitones: row.transpose_semitones,
      updatedAt: row.updated_at
    })
  );

const parseOptionalRow = <Result>(
  rowSchema: { readonly parse: (row: PlanningSqlRow) => Result },
  rows: readonly PlanningSqlRow[]
): Result | null => {
  const row = rows[0];

  return row === undefined ? null : rowSchema.parse(row);
};

const firstRow = (rows: readonly PlanningSqlRow[], message: string): PlanningSqlRow => {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(message);
  }

  return row;
};

const CHART_COLUMNS = `
  tenant_id, chart_id, song_id, arrangement_ref, default_key, chord_pro_source,
  title, schema_version, created_at, updated_at
`.trim();

export const createChartsQuerySqlRepository = (
  dependencies: ChartsQuerySqlRepositoryDependencies
): ChartsQueryPersistenceRepository => ({
  getChart: async (rawOperation: GetChartPersistenceOperation) => {
    const operation = GetChartPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "charts.get",
      parameters: [operation.options.context.tenantId, operation.input.chartId],
      sql: `SELECT ${CHART_COLUMNS} FROM charts WHERE tenant_id = ? AND chart_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(ChartSqlRowSchema, result.rows);
  },

  listChartAnnotations: async (rawOperation: ListChartAnnotationsPersistenceOperation) => {
    const operation = ListChartAnnotationsPersistenceOperationSchema.parse(rawOperation);
    const musicianId = operation.input.musicianId ?? null;
    const result = await dependencies.executor.query({
      name: "charts.annotations.list",
      parameters: [operation.options.context.tenantId, operation.input.chartId, musicianId, musicianId],
      sql: `
SELECT tenant_id, annotation_id, chart_id, musician_id, section_index, line_index, kind, note, color, created_at, updated_at
FROM chart_annotations
WHERE tenant_id = ? AND chart_id = ? AND (? IS NULL OR musician_id = ?)
ORDER BY section_index, line_index, annotation_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ChartAnnotationSqlRowSchema).parse(result.rows);
  },

  listChartArrangements: async (rawOperation: ListChartArrangementsPersistenceOperation) => {
    const operation = ListChartArrangementsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "charts.arrangements.list",
      parameters: [operation.options.context.tenantId, operation.input.songRef],
      sql: `
SELECT tenant_id, arrangement_ref, song_id, label, default_key, capo, section_order
FROM chart_arrangements
WHERE tenant_id = ? AND song_id = ?
ORDER BY label, arrangement_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ChartArrangementSqlRowSchema).parse(result.rows);
  },

  listCharts: async (rawOperation: ListChartsPersistenceOperation) => {
    const operation = ListChartsPersistenceOperationSchema.parse(rawOperation);
    const songRef = operation.input.filter?.songRef ?? null;
    const result = await dependencies.executor.query({
      name: "charts.list",
      parameters: [operation.options.context.tenantId, songRef, songRef],
      sql: `
SELECT ${CHART_COLUMNS}
FROM charts
WHERE tenant_id = ? AND (? IS NULL OR song_id = ?)
ORDER BY song_id, chart_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ChartSqlRowSchema).parse(result.rows);
  },

  listChartsForSong: async (rawOperation: ListChartsForSongPersistenceOperation) => {
    const operation = ListChartsForSongPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "charts.list_for_song",
      parameters: [operation.options.context.tenantId, operation.input.songRef],
      sql: `SELECT ${CHART_COLUMNS} FROM charts WHERE tenant_id = ? AND song_id = ? ORDER BY chart_id`,
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(ChartSqlRowSchema).parse(result.rows);
  },

  getMusicianChartPreference: async (
    rawOperation: GetMusicianChartPreferencePersistenceOperation
  ) => {
    const operation = GetMusicianChartPreferencePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "charts.preferences.get",
      parameters: [
        operation.options.context.tenantId,
        operation.input.chartId,
        operation.input.musicianId
      ],
      sql: `
SELECT tenant_id, chart_id, musician_id, transpose_semitones, capo, instrument, font_scale, chords_visible, updated_at
FROM musician_chart_preferences
WHERE tenant_id = ? AND chart_id = ? AND musician_id = ?
LIMIT 1
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(MusicianChartPreferenceSqlRowSchema, result.rows);
  }
});

export const createChartsCommandSqlRepository = (
  dependencies: ChartsCommandSqlRepositoryDependencies
): ChartsCommandPersistenceRepository => ({
  addChartAnnotation: async (rawOperation: AddChartAnnotationPersistenceOperation) => {
    const operation = AddChartAnnotationPersistenceOperationSchema.parse(rawOperation);
    const annotation = operation.input;

    if (annotation.tenantId !== operation.options.context.tenantId) {
      throw new Error("Chart annotation tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "charts.annotations.upsert",
      parameters: [
        annotation.tenantId,
        annotation.annotationId,
        annotation.chartId,
        annotation.musicianId,
        annotation.sectionIndex,
        annotation.lineIndex,
        annotation.kind,
        optionalText(annotation.note),
        optionalText(annotation.color),
        annotation.createdAt,
        annotation.updatedAt
      ],
      sql: `
INSERT INTO chart_annotations (tenant_id, annotation_id, chart_id, musician_id, section_index, line_index, kind, note, color, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, annotation_id) DO UPDATE SET
  chart_id = excluded.chart_id,
  musician_id = excluded.musician_id,
  section_index = excluded.section_index,
  line_index = excluded.line_index,
  kind = excluded.kind,
  note = excluded.note,
  color = excluded.color,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ChartAnnotationPersistenceRecordSchema.parse(annotation);
  },

  removeChartAnnotation: async (rawOperation: RemoveChartAnnotationPersistenceOperation) => {
    const operation = RemoveChartAnnotationPersistenceOperationSchema.parse(rawOperation);
    await dependencies.executor.query({
      name: "charts.annotations.remove",
      parameters: [
        operation.options.context.tenantId,
        operation.input.annotationId,
        operation.input.chartId,
        operation.input.musicianId
      ],
      sql: `DELETE FROM chart_annotations WHERE tenant_id = ? AND annotation_id = ? AND chart_id = ? AND musician_id = ?`,
      ...optionalTransaction(operation.options.transaction)
    });
  },

  saveChart: async (rawOperation: SaveChartPersistenceOperation) => {
    const operation = SaveChartPersistenceOperationSchema.parse(rawOperation);
    const chart = operation.input;

    if (chart.tenantId !== operation.options.context.tenantId) {
      throw new Error("Chart tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "charts.upsert",
      parameters: [
        chart.tenantId,
        chart.chartId,
        chart.songRef,
        optionalText(chart.arrangementRef),
        chart.defaultKey,
        chart.chordProSource,
        optionalText(chart.title),
        chart.schemaVersion,
        chart.createdAt,
        chart.updatedAt
      ],
      sql: `
INSERT INTO charts (tenant_id, chart_id, song_id, arrangement_ref, default_key, chord_pro_source, title, schema_version, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, chart_id) DO UPDATE SET
  song_id = excluded.song_id,
  arrangement_ref = excluded.arrangement_ref,
  default_key = excluded.default_key,
  chord_pro_source = excluded.chord_pro_source,
  title = excluded.title,
  schema_version = excluded.schema_version,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ChartPersistenceRecordSchema.parse(chart);
  },

  saveChartArrangement: async (rawOperation: SaveChartArrangementPersistenceOperation) => {
    const operation = SaveChartArrangementPersistenceOperationSchema.parse(rawOperation);
    const arrangement = operation.input;

    if (arrangement.tenantId !== operation.options.context.tenantId) {
      throw new Error("Chart arrangement tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "charts.arrangements.upsert",
      parameters: [
        arrangement.tenantId,
        arrangement.arrangementRef,
        arrangement.songRef,
        arrangement.label,
        arrangement.defaultKey,
        arrangement.capo,
        JSON.stringify(arrangement.sectionOrder)
      ],
      sql: `
INSERT INTO chart_arrangements (tenant_id, arrangement_ref, song_id, label, default_key, capo, section_order)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, arrangement_ref) DO UPDATE SET
  song_id = excluded.song_id,
  label = excluded.label,
  default_key = excluded.default_key,
  capo = excluded.capo,
  section_order = excluded.section_order
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ChartArrangementPersistenceRecordSchema.parse(arrangement);
  },

  setMusicianChartPreference: async (
    rawOperation: SetMusicianChartPreferencePersistenceOperation
  ) => {
    const operation = SetMusicianChartPreferencePersistenceOperationSchema.parse(rawOperation);
    const preference = operation.input;

    if (preference.tenantId !== operation.options.context.tenantId) {
      throw new Error("Musician chart preference tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "charts.preferences.upsert",
      parameters: [
        preference.tenantId,
        preference.chartId,
        preference.musicianId,
        preference.transposeSemitones,
        preference.capo,
        preference.instrument,
        preference.fontScale,
        preference.chordsVisible ? 1 : 0,
        preference.updatedAt
      ],
      sql: `
INSERT INTO musician_chart_preferences (tenant_id, chart_id, musician_id, transpose_semitones, capo, instrument, font_scale, chords_visible, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, chart_id, musician_id) DO UPDATE SET
  transpose_semitones = excluded.transpose_semitones,
  capo = excluded.capo,
  instrument = excluded.instrument,
  font_scale = excluded.font_scale,
  chords_visible = excluded.chords_visible,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return MusicianChartPreferencePersistenceRecordSchema.parse(preference);
  },

  updateChartAnnotation: async (rawOperation: AddChartAnnotationPersistenceOperation) => {
    return createChartsCommandSqlRepository(dependencies).addChartAnnotation(rawOperation);
  },

  updateChartSource: async (rawOperation: UpdateChartSourcePersistenceOperation) => {
    const operation = UpdateChartSourcePersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const result = await dependencies.executor.query({
      name: "charts.update_source",
      parameters: [
        operation.input.chordProSource,
        optionalText(operation.input.defaultKey),
        now,
        operation.options.context.tenantId,
        operation.input.chartId
      ],
      sql: `
UPDATE charts
SET chord_pro_source = ?,
    default_key = COALESCE(?, default_key),
    updated_at = ?
WHERE tenant_id = ? AND chart_id = ?
RETURNING ${CHART_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return ChartSqlRowSchema.parse(
      firstRow(result.rows, "Chart source update did not match a tenant-scoped chart.")
    );
  }
});
