import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import {
  AddPlayCuePersistenceOperationSchema,
  GetPlaybackStatePersistenceOperationSchema,
  GetTrackSetPersistenceOperationSchema,
  ListPadLayersPersistenceOperationSchema,
  ListPlayArrangementsPersistenceOperationSchema,
  ListPlayCuesPersistenceOperationSchema,
  ListPlaySectionsPersistenceOperationSchema,
  ListTrackSetsForSongPersistenceOperationSchema,
  ListTrackSetsPersistenceOperationSchema,
  PadLayerPersistenceRecordSchema,
  PlaybackStatePersistenceRecordSchema,
  PlayArrangementPersistenceRecordSchema,
  PlayCuePersistenceRecordSchema,
  PlaySectionPersistenceRecordSchema,
  RemovePlayCuePersistenceOperationSchema,
  ReorderPlaySectionsPersistenceOperationSchema,
  SavePadLayerPersistenceOperationSchema,
  SavePlayArrangementPersistenceOperationSchema,
  SavePlaySectionPersistenceOperationSchema,
  SaveTrackSetPersistenceOperationSchema,
  SetPlaybackStatePersistenceOperationSchema,
  TrackMemberRefPersistenceRecordSchema,
  TrackSetPersistenceRecordSchema,
  UpdatePlayCuePersistenceOperationSchema,
  UpdateTrackSetMembersPersistenceOperationSchema,
  type PadLayerPersistenceRecord,
  type PlaybackStatePersistenceRecord,
  type PlayArrangementPersistenceRecord,
  type PlayCommandPersistenceRepository,
  type PlayCuePersistenceRecord,
  type PlayQueryPersistenceRepository,
  type PlaySectionPersistenceRecord,
  type TrackSetPersistenceRecord
} from "./play-repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";

type ListTrackSetsPersistenceOperation = z.infer<
  typeof ListTrackSetsPersistenceOperationSchema
>;
type GetTrackSetPersistenceOperation = z.infer<typeof GetTrackSetPersistenceOperationSchema>;
type ListTrackSetsForSongPersistenceOperation = z.infer<
  typeof ListTrackSetsForSongPersistenceOperationSchema
>;
type ListPlayArrangementsPersistenceOperation = z.infer<
  typeof ListPlayArrangementsPersistenceOperationSchema
>;
type ListPlaySectionsPersistenceOperation = z.infer<
  typeof ListPlaySectionsPersistenceOperationSchema
>;
type ListPlayCuesPersistenceOperation = z.infer<typeof ListPlayCuesPersistenceOperationSchema>;
type ListPadLayersPersistenceOperation = z.infer<
  typeof ListPadLayersPersistenceOperationSchema
>;
type GetPlaybackStatePersistenceOperation = z.infer<
  typeof GetPlaybackStatePersistenceOperationSchema
>;
type SaveTrackSetPersistenceOperation = z.infer<typeof SaveTrackSetPersistenceOperationSchema>;
type UpdateTrackSetMembersPersistenceOperation = z.infer<
  typeof UpdateTrackSetMembersPersistenceOperationSchema
>;
type SavePlayArrangementPersistenceOperation = z.infer<
  typeof SavePlayArrangementPersistenceOperationSchema
>;
type SavePlaySectionPersistenceOperation = z.infer<
  typeof SavePlaySectionPersistenceOperationSchema
>;
type ReorderPlaySectionsPersistenceOperation = z.infer<
  typeof ReorderPlaySectionsPersistenceOperationSchema
>;
type AddPlayCuePersistenceOperation = z.infer<typeof AddPlayCuePersistenceOperationSchema>;
type UpdatePlayCuePersistenceOperation = z.infer<typeof UpdatePlayCuePersistenceOperationSchema>;
type RemovePlayCuePersistenceOperation = z.infer<typeof RemovePlayCuePersistenceOperationSchema>;
type SavePadLayerPersistenceOperation = z.infer<typeof SavePadLayerPersistenceOperationSchema>;
type SetPlaybackStatePersistenceOperation = z.infer<
  typeof SetPlaybackStatePersistenceOperationSchema
>;

export type PlaySqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface PlayQuerySqlRepositoryDependencies {
  readonly executor: PlaySqlExecutor;
}

export interface PlayCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: PlaySqlExecutor;
}

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const optionalText = (value: string | undefined): string | null => value ?? null;

const TrackMemberRefArraySchema = z.array(TrackMemberRefPersistenceRecordSchema);

const TrackSetSqlRowSchema = z
  .object({
    arrangement_ref: z.string().min(1).nullable().optional(),
    created_at: z.string().datetime({ offset: true }),
    default_key: z.string().min(1),
    schema_version: z.string().min(1),
    service_id: z.string().min(1).nullable().optional(),
    song_id: z.string().min(1),
    tempo_bpm: z.number().positive(),
    tenant_id: z.string().min(1),
    title: z.string().min(1).nullable().optional(),
    track_refs_json: z.string().min(1),
    track_set_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): TrackSetPersistenceRecord =>
    TrackSetPersistenceRecordSchema.parse({
      ...(row.arrangement_ref !== undefined && row.arrangement_ref !== null
        ? { arrangementRef: row.arrangement_ref }
        : {}),
      createdAt: row.created_at,
      defaultKey: row.default_key,
      schemaVersion: row.schema_version,
      ...(row.service_id !== undefined && row.service_id !== null
        ? { serviceRef: row.service_id }
        : {}),
      songRef: row.song_id,
      tempoBpm: row.tempo_bpm,
      tenantId: row.tenant_id,
      ...(row.title !== undefined && row.title !== null ? { title: row.title } : {}),
      trackRefs: TrackMemberRefArraySchema.parse(JSON.parse(row.track_refs_json)),
      trackSetId: row.track_set_id,
      updatedAt: row.updated_at
    })
  );

const PlayArrangementSqlRowSchema = z
  .object({
    arrangement_ref: z.string().min(1),
    default_key: z.string().min(1),
    label: z.string().min(1),
    loop_section_ref: z.string().min(1).nullable().optional(),
    section_order: z.string(),
    song_id: z.string().min(1),
    tempo_bpm: z.number().positive(),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlayArrangementPersistenceRecord =>
    PlayArrangementPersistenceRecordSchema.parse({
      arrangementRef: row.arrangement_ref,
      defaultKey: row.default_key,
      label: row.label,
      ...(row.loop_section_ref !== undefined && row.loop_section_ref !== null
        ? { loopSectionRef: row.loop_section_ref }
        : {}),
      sectionOrder: z.array(z.string().min(1)).parse(JSON.parse(row.section_order)),
      songRef: row.song_id,
      tempoBpm: row.tempo_bpm,
      tenantId: row.tenant_id
    })
  );

const PlaySectionSqlRowSchema = z
  .object({
    arrangement_ref: z.string().min(1),
    click_enabled_default: z.number().int(),
    kind: z.string().min(1),
    label: z.string().min(1).nullable().optional(),
    length_bars: z.number().int().nonnegative(),
    pad_layer_ref: z.string().min(1).nullable().optional(),
    section_id: z.string().min(1),
    tenant_id: z.string().min(1)
  })
  .strict()
  .transform((row): PlaySectionPersistenceRecord =>
    PlaySectionPersistenceRecordSchema.parse({
      arrangementRef: row.arrangement_ref,
      clickEnabledDefault: row.click_enabled_default !== 0,
      kind: row.kind,
      ...(row.label !== undefined && row.label !== null ? { label: row.label } : {}),
      lengthBars: row.length_bars,
      ...(row.pad_layer_ref !== undefined && row.pad_layer_ref !== null
        ? { padLayerRef: row.pad_layer_ref }
        : {}),
      sectionId: row.section_id,
      tenantId: row.tenant_id
    })
  );

const PlayCueSqlRowSchema = z
  .object({
    action: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    cue_id: z.string().min(1),
    fire_mode: z.string().min(1),
    label: z.string().min(1),
    marker_offset_beats: z.number().int().nonnegative(),
    pad_layer_ref: z.string().min(1).nullable().optional(),
    section_id: z.string().min(1),
    target_section_ref: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    track_set_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): PlayCuePersistenceRecord =>
    PlayCuePersistenceRecordSchema.parse({
      action: row.action,
      createdAt: row.created_at,
      cueId: row.cue_id,
      fireMode: row.fire_mode,
      label: row.label,
      markerOffsetBeats: row.marker_offset_beats,
      ...(row.pad_layer_ref !== undefined && row.pad_layer_ref !== null
        ? { padLayerRef: row.pad_layer_ref }
        : {}),
      sectionId: row.section_id,
      ...(row.target_section_ref !== undefined && row.target_section_ref !== null
        ? { targetSectionRef: row.target_section_ref }
        : {}),
      tenantId: row.tenant_id,
      trackSetId: row.track_set_id,
      updatedAt: row.updated_at
    })
  );

const PadLayerSqlRowSchema = z
  .object({
    gain: z.number().min(0).max(1),
    label: z.string().min(1).nullable().optional(),
    loop: z.number().int(),
    pad_key: z.string().min(1),
    pad_layer_ref: z.string().min(1),
    pad_media_ref: z.string().min(1),
    section_scope_ref: z.string().min(1).nullable().optional(),
    song_id: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): PadLayerPersistenceRecord =>
    PadLayerPersistenceRecordSchema.parse({
      gain: row.gain,
      key: row.pad_key,
      ...(row.label !== undefined && row.label !== null ? { label: row.label } : {}),
      loop: row.loop !== 0,
      padLayerRef: row.pad_layer_ref,
      padMediaRef: row.pad_media_ref,
      ...(row.section_scope_ref !== undefined && row.section_scope_ref !== null
        ? { sectionScopeRef: row.section_scope_ref }
        : {}),
      ...(row.song_id !== undefined && row.song_id !== null ? { songRef: row.song_id } : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const PlaybackStateSqlRowSchema = z
  .object({
    active_pad_layer_ref: z.string().min(1).nullable().optional(),
    active_section_ref: z.string().min(1).nullable().optional(),
    click_enabled: z.number().int(),
    position_beats: z.number().nonnegative(),
    tenant_id: z.string().min(1),
    track_set_id: z.string().min(1),
    transport_status: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): PlaybackStatePersistenceRecord =>
    PlaybackStatePersistenceRecordSchema.parse({
      ...(row.active_pad_layer_ref !== undefined && row.active_pad_layer_ref !== null
        ? { activePadLayerRef: row.active_pad_layer_ref }
        : {}),
      ...(row.active_section_ref !== undefined && row.active_section_ref !== null
        ? { activeSectionRef: row.active_section_ref }
        : {}),
      clickEnabled: row.click_enabled !== 0,
      positionBeats: row.position_beats,
      tenantId: row.tenant_id,
      trackSetId: row.track_set_id,
      transportStatus: row.transport_status,
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

const TRACK_SET_COLUMNS = `
  tenant_id, track_set_id, song_id, service_id, arrangement_ref, title, default_key,
  tempo_bpm, track_refs_json, schema_version, created_at, updated_at
`.trim();

const PLAY_ARRANGEMENT_COLUMNS = `
  tenant_id, arrangement_ref, song_id, label, default_key, tempo_bpm, section_order,
  loop_section_ref
`.trim();

const PLAY_SECTION_COLUMNS = `
  tenant_id, section_id, arrangement_ref, kind, label, length_bars, click_enabled_default,
  pad_layer_ref
`.trim();

const PLAY_CUE_COLUMNS = `
  tenant_id, cue_id, track_set_id, section_id, marker_offset_beats, label, action,
  target_section_ref, pad_layer_ref, fire_mode, created_at, updated_at
`.trim();

const PAD_LAYER_COLUMNS = `
  tenant_id, pad_layer_ref, song_id, pad_key, section_scope_ref, pad_media_ref, gain, loop,
  label, updated_at
`.trim();

const PLAYBACK_STATE_COLUMNS = `
  tenant_id, track_set_id, active_section_ref, transport_status, position_beats,
  click_enabled, active_pad_layer_ref, updated_at
`.trim();

export const createPlayQuerySqlRepository = (
  dependencies: PlayQuerySqlRepositoryDependencies
): PlayQueryPersistenceRepository => ({
  getPlaybackState: async (rawOperation: GetPlaybackStatePersistenceOperation) => {
    const operation = GetPlaybackStatePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.playback_state.get",
      parameters: [operation.options.context.tenantId, operation.input.trackSetId],
      sql: `SELECT ${PLAYBACK_STATE_COLUMNS} FROM playback_state WHERE tenant_id = ? AND track_set_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(PlaybackStateSqlRowSchema, result.rows);
  },

  getTrackSet: async (rawOperation: GetTrackSetPersistenceOperation) => {
    const operation = GetTrackSetPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.track_sets.get",
      parameters: [operation.options.context.tenantId, operation.input.trackSetId],
      sql: `SELECT ${TRACK_SET_COLUMNS} FROM track_sets WHERE tenant_id = ? AND track_set_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(TrackSetSqlRowSchema, result.rows);
  },

  listPadLayers: async (rawOperation: ListPadLayersPersistenceOperation) => {
    const operation = ListPadLayersPersistenceOperationSchema.parse(rawOperation);
    const songRef = operation.input.filter?.songRef ?? null;
    const result = await dependencies.executor.query({
      name: "play.pad_layers.list",
      parameters: [operation.options.context.tenantId, songRef, songRef],
      sql: `
SELECT ${PAD_LAYER_COLUMNS}
FROM pad_layers
WHERE tenant_id = ? AND (? IS NULL OR song_id = ?)
ORDER BY pad_layer_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PadLayerSqlRowSchema).parse(result.rows);
  },

  listPlayArrangements: async (rawOperation: ListPlayArrangementsPersistenceOperation) => {
    const operation = ListPlayArrangementsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.arrangements.list",
      parameters: [operation.options.context.tenantId, operation.input.songRef],
      sql: `
SELECT ${PLAY_ARRANGEMENT_COLUMNS}
FROM play_arrangements
WHERE tenant_id = ? AND song_id = ?
ORDER BY label, arrangement_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlayArrangementSqlRowSchema).parse(result.rows);
  },

  listPlayCues: async (rawOperation: ListPlayCuesPersistenceOperation) => {
    const operation = ListPlayCuesPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.cues.list",
      parameters: [operation.options.context.tenantId, operation.input.trackSetId],
      sql: `
SELECT ${PLAY_CUE_COLUMNS}
FROM play_cues
WHERE tenant_id = ? AND track_set_id = ?
ORDER BY marker_offset_beats, cue_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlayCueSqlRowSchema).parse(result.rows);
  },

  listPlaySections: async (rawOperation: ListPlaySectionsPersistenceOperation) => {
    const operation = ListPlaySectionsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.sections.list",
      parameters: [operation.options.context.tenantId, operation.input.arrangementRef],
      sql: `
SELECT ${PLAY_SECTION_COLUMNS}
FROM play_sections
WHERE tenant_id = ? AND arrangement_ref = ?
ORDER BY section_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlaySectionSqlRowSchema).parse(result.rows);
  },

  listTrackSets: async (rawOperation: ListTrackSetsPersistenceOperation) => {
    const operation = ListTrackSetsPersistenceOperationSchema.parse(rawOperation);
    const songRef = operation.input.filter?.songRef ?? null;
    const result = await dependencies.executor.query({
      name: "play.track_sets.list",
      parameters: [operation.options.context.tenantId, songRef, songRef],
      sql: `
SELECT ${TRACK_SET_COLUMNS}
FROM track_sets
WHERE tenant_id = ? AND (? IS NULL OR song_id = ?)
ORDER BY song_id, track_set_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(TrackSetSqlRowSchema).parse(result.rows);
  },

  listTrackSetsForSong: async (rawOperation: ListTrackSetsForSongPersistenceOperation) => {
    const operation = ListTrackSetsForSongPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "play.track_sets.list_for_song",
      parameters: [operation.options.context.tenantId, operation.input.songRef],
      sql: `SELECT ${TRACK_SET_COLUMNS} FROM track_sets WHERE tenant_id = ? AND song_id = ? ORDER BY track_set_id`,
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(TrackSetSqlRowSchema).parse(result.rows);
  }
});

export const createPlayCommandSqlRepository = (
  dependencies: PlayCommandSqlRepositoryDependencies
): PlayCommandPersistenceRepository => ({
  addPlayCue: async (rawOperation: AddPlayCuePersistenceOperation) => {
    const operation = AddPlayCuePersistenceOperationSchema.parse(rawOperation);
    const cue = operation.input;

    if (cue.tenantId !== operation.options.context.tenantId) {
      throw new Error("Play cue tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.cues.upsert",
      parameters: [
        cue.tenantId,
        cue.cueId,
        cue.trackSetId,
        cue.sectionId,
        cue.markerOffsetBeats,
        cue.label,
        cue.action,
        optionalText(cue.targetSectionRef),
        optionalText(cue.padLayerRef),
        cue.fireMode,
        cue.createdAt,
        cue.updatedAt
      ],
      sql: `
INSERT INTO play_cues (tenant_id, cue_id, track_set_id, section_id, marker_offset_beats, label, action, target_section_ref, pad_layer_ref, fire_mode, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, cue_id) DO UPDATE SET
  track_set_id = excluded.track_set_id,
  section_id = excluded.section_id,
  marker_offset_beats = excluded.marker_offset_beats,
  label = excluded.label,
  action = excluded.action,
  target_section_ref = excluded.target_section_ref,
  pad_layer_ref = excluded.pad_layer_ref,
  fire_mode = excluded.fire_mode,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PlayCuePersistenceRecordSchema.parse(cue);
  },

  removePlayCue: async (rawOperation: RemovePlayCuePersistenceOperation) => {
    const operation = RemovePlayCuePersistenceOperationSchema.parse(rawOperation);
    await dependencies.executor.query({
      name: "play.cues.remove",
      parameters: [
        operation.options.context.tenantId,
        operation.input.cueId,
        operation.input.trackSetId
      ],
      sql: `DELETE FROM play_cues WHERE tenant_id = ? AND cue_id = ? AND track_set_id = ?`,
      ...optionalTransaction(operation.options.transaction)
    });
  },

  reorderPlaySections: async (rawOperation: ReorderPlaySectionsPersistenceOperation) => {
    const operation = ReorderPlaySectionsPersistenceOperationSchema.parse(rawOperation);
    const orderedSectionIds = JSON.stringify(operation.input.orderedSectionIds);

    await dependencies.executor.query({
      name: "play.arrangements.reorder_sections",
      parameters: [
        orderedSectionIds,
        operation.options.context.tenantId,
        operation.input.arrangementRef
      ],
      sql: `UPDATE play_arrangements SET section_order = ? WHERE tenant_id = ? AND arrangement_ref = ?`,
      ...optionalTransaction(operation.options.transaction)
    });

    const result = await dependencies.executor.query({
      name: "play.sections.reorder",
      parameters: [
        operation.options.context.tenantId,
        operation.input.arrangementRef,
        orderedSectionIds
      ],
      sql: `
SELECT ${PLAY_SECTION_COLUMNS}
FROM play_sections
WHERE tenant_id = ? AND arrangement_ref = ?
ORDER BY (
  SELECT ordered.key
  FROM json_each(?) AS ordered
  WHERE ordered.value = play_sections.section_id
), section_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(PlaySectionSqlRowSchema).parse(result.rows);
  },

  savePadLayer: async (rawOperation: SavePadLayerPersistenceOperation) => {
    const operation = SavePadLayerPersistenceOperationSchema.parse(rawOperation);
    const padLayer = operation.input;

    if (padLayer.tenantId !== operation.options.context.tenantId) {
      throw new Error("Pad layer tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.pad_layers.upsert",
      parameters: [
        padLayer.tenantId,
        padLayer.padLayerRef,
        optionalText(padLayer.songRef),
        padLayer.key,
        optionalText(padLayer.sectionScopeRef),
        padLayer.padMediaRef,
        padLayer.gain,
        padLayer.loop ? 1 : 0,
        optionalText(padLayer.label),
        padLayer.updatedAt
      ],
      sql: `
INSERT INTO pad_layers (tenant_id, pad_layer_ref, song_id, pad_key, section_scope_ref, pad_media_ref, gain, loop, label, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, pad_layer_ref) DO UPDATE SET
  song_id = excluded.song_id,
  pad_key = excluded.pad_key,
  section_scope_ref = excluded.section_scope_ref,
  pad_media_ref = excluded.pad_media_ref,
  gain = excluded.gain,
  loop = excluded.loop,
  label = excluded.label,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PadLayerPersistenceRecordSchema.parse(padLayer);
  },

  savePlayArrangement: async (rawOperation: SavePlayArrangementPersistenceOperation) => {
    const operation = SavePlayArrangementPersistenceOperationSchema.parse(rawOperation);
    const arrangement = operation.input;

    if (arrangement.tenantId !== operation.options.context.tenantId) {
      throw new Error("Play arrangement tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.arrangements.upsert",
      parameters: [
        arrangement.tenantId,
        arrangement.arrangementRef,
        arrangement.songRef,
        arrangement.label,
        arrangement.defaultKey,
        arrangement.tempoBpm,
        JSON.stringify(arrangement.sectionOrder),
        optionalText(arrangement.loopSectionRef)
      ],
      sql: `
INSERT INTO play_arrangements (tenant_id, arrangement_ref, song_id, label, default_key, tempo_bpm, section_order, loop_section_ref)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, arrangement_ref) DO UPDATE SET
  song_id = excluded.song_id,
  label = excluded.label,
  default_key = excluded.default_key,
  tempo_bpm = excluded.tempo_bpm,
  section_order = excluded.section_order,
  loop_section_ref = excluded.loop_section_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PlayArrangementPersistenceRecordSchema.parse(arrangement);
  },

  savePlaySection: async (rawOperation: SavePlaySectionPersistenceOperation) => {
    const operation = SavePlaySectionPersistenceOperationSchema.parse(rawOperation);
    const section = operation.input;

    if (section.tenantId !== operation.options.context.tenantId) {
      throw new Error("Play section tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.sections.upsert",
      parameters: [
        section.tenantId,
        section.sectionId,
        section.arrangementRef,
        section.kind,
        optionalText(section.label),
        section.lengthBars,
        section.clickEnabledDefault ? 1 : 0,
        optionalText(section.padLayerRef)
      ],
      sql: `
INSERT INTO play_sections (tenant_id, section_id, arrangement_ref, kind, label, length_bars, click_enabled_default, pad_layer_ref)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, section_id) DO UPDATE SET
  arrangement_ref = excluded.arrangement_ref,
  kind = excluded.kind,
  label = excluded.label,
  length_bars = excluded.length_bars,
  click_enabled_default = excluded.click_enabled_default,
  pad_layer_ref = excluded.pad_layer_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PlaySectionPersistenceRecordSchema.parse(section);
  },

  saveTrackSet: async (rawOperation: SaveTrackSetPersistenceOperation) => {
    const operation = SaveTrackSetPersistenceOperationSchema.parse(rawOperation);
    const trackSet = operation.input;

    if (trackSet.tenantId !== operation.options.context.tenantId) {
      throw new Error("Track set tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.track_sets.upsert",
      parameters: [
        trackSet.tenantId,
        trackSet.trackSetId,
        trackSet.songRef,
        optionalText(trackSet.serviceRef),
        optionalText(trackSet.arrangementRef),
        optionalText(trackSet.title),
        trackSet.defaultKey,
        trackSet.tempoBpm,
        JSON.stringify(trackSet.trackRefs),
        trackSet.schemaVersion,
        trackSet.createdAt,
        trackSet.updatedAt
      ],
      sql: `
INSERT INTO track_sets (tenant_id, track_set_id, song_id, service_id, arrangement_ref, title, default_key, tempo_bpm, track_refs_json, schema_version, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, track_set_id) DO UPDATE SET
  song_id = excluded.song_id,
  service_id = excluded.service_id,
  arrangement_ref = excluded.arrangement_ref,
  title = excluded.title,
  default_key = excluded.default_key,
  tempo_bpm = excluded.tempo_bpm,
  track_refs_json = excluded.track_refs_json,
  schema_version = excluded.schema_version,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return TrackSetPersistenceRecordSchema.parse(trackSet);
  },

  setPlaybackState: async (rawOperation: SetPlaybackStatePersistenceOperation) => {
    const operation = SetPlaybackStatePersistenceOperationSchema.parse(rawOperation);
    const playbackState = operation.input;

    if (playbackState.tenantId !== operation.options.context.tenantId) {
      throw new Error("Playback state tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "play.playback_state.upsert",
      parameters: [
        playbackState.tenantId,
        playbackState.trackSetId,
        optionalText(playbackState.activeSectionRef),
        playbackState.transportStatus,
        playbackState.positionBeats,
        playbackState.clickEnabled ? 1 : 0,
        optionalText(playbackState.activePadLayerRef),
        playbackState.updatedAt
      ],
      sql: `
INSERT INTO playback_state (tenant_id, track_set_id, active_section_ref, transport_status, position_beats, click_enabled, active_pad_layer_ref, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, track_set_id) DO UPDATE SET
  active_section_ref = excluded.active_section_ref,
  transport_status = excluded.transport_status,
  position_beats = excluded.position_beats,
  click_enabled = excluded.click_enabled,
  active_pad_layer_ref = excluded.active_pad_layer_ref,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return PlaybackStatePersistenceRecordSchema.parse(playbackState);
  },

  updatePlayCue: async (rawOperation: UpdatePlayCuePersistenceOperation) => {
    return createPlayCommandSqlRepository(dependencies).addPlayCue(rawOperation);
  },

  updateTrackSetMembers: async (rawOperation: UpdateTrackSetMembersPersistenceOperation) => {
    const operation = UpdateTrackSetMembersPersistenceOperationSchema.parse(rawOperation);
    const now = dependencies.clock();
    const result = await dependencies.executor.query({
      name: "play.track_sets.update_members",
      parameters: [
        JSON.stringify(operation.input.trackRefs),
        now,
        operation.options.context.tenantId,
        operation.input.trackSetId
      ],
      sql: `
UPDATE track_sets
SET track_refs_json = ?,
    updated_at = ?
WHERE tenant_id = ? AND track_set_id = ?
RETURNING ${TRACK_SET_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return TrackSetSqlRowSchema.parse(
      firstRow(result.rows, "Track set member update did not match a tenant-scoped track set.")
    );
  }
});
