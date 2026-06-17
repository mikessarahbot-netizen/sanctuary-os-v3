import { defineSqlMigrationArtifact } from "./migrations.js";

export const ChartsInitialMigrationTableNames = [
  "charts",
  "chart_arrangements",
  "chart_annotations",
  "musician_chart_preferences"
] as const;

export const ChartsInitialMigrationIndexNames = [
  "charts_tenant_song_idx",
  "chart_arrangements_tenant_song_idx",
  "chart_annotations_tenant_chart_musician_idx"
] as const;

const upSql = `
CREATE TABLE charts (
  tenant_id TEXT NOT NULL,
  chart_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  arrangement_ref TEXT,
  default_key TEXT NOT NULL,
  chord_pro_source TEXT NOT NULL,
  title TEXT,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chart_id),
  CHECK (schema_version = 'charts.v1'),
  CHECK (chord_pro_source <> '')
);

CREATE TABLE chart_arrangements (
  tenant_id TEXT NOT NULL,
  arrangement_ref TEXT NOT NULL,
  song_id TEXT NOT NULL,
  label TEXT NOT NULL,
  default_key TEXT NOT NULL,
  capo INTEGER NOT NULL DEFAULT 0,
  section_order TEXT NOT NULL,
  PRIMARY KEY (tenant_id, arrangement_ref),
  CHECK (capo >= 0)
);

CREATE TABLE chart_annotations (
  tenant_id TEXT NOT NULL,
  annotation_id TEXT NOT NULL,
  chart_id TEXT NOT NULL,
  musician_id TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  line_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, annotation_id),
  CHECK (section_index >= 0),
  CHECK (line_index >= 0),
  CHECK (kind IN ('highlight', 'note', 'repeat', 'section-marker')),
  CHECK (kind <> 'note' OR note IS NOT NULL)
);

CREATE TABLE musician_chart_preferences (
  tenant_id TEXT NOT NULL,
  chart_id TEXT NOT NULL,
  musician_id TEXT NOT NULL,
  transpose_semitones INTEGER NOT NULL,
  capo INTEGER NOT NULL DEFAULT 0,
  instrument TEXT NOT NULL,
  font_scale REAL NOT NULL,
  chords_visible INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chart_id, musician_id),
  CHECK (capo >= 0),
  CHECK (font_scale > 0),
  CHECK (chords_visible IN (0, 1)),
  CHECK (instrument IN ('guitar', 'piano', 'bass', 'vocal', 'other'))
);

CREATE INDEX charts_tenant_song_idx
  ON charts (tenant_id, song_id);
CREATE INDEX chart_arrangements_tenant_song_idx
  ON chart_arrangements (tenant_id, song_id);
CREATE INDEX chart_annotations_tenant_chart_musician_idx
  ON chart_annotations (tenant_id, chart_id, musician_id);
`.trim();

const downSql = `
DROP INDEX IF EXISTS chart_annotations_tenant_chart_musician_idx;
DROP INDEX IF EXISTS chart_arrangements_tenant_song_idx;
DROP INDEX IF EXISTS charts_tenant_song_idx;
DROP TABLE IF EXISTS musician_chart_preferences;
DROP TABLE IF EXISTS chart_annotations;
DROP TABLE IF EXISTS chart_arrangements;
DROP TABLE IF EXISTS charts;
`.trim();

export const ChartsInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Charts schema: charts, arrangements, annotations, and per-musician preferences.",
  downSql,
  migrationId: "202606170003_charts_initial_schema",
  requiredIndexes: [...ChartsInitialMigrationIndexNames],
  requiredTables: [...ChartsInitialMigrationTableNames],
  tenantScopedTables: [...ChartsInitialMigrationTableNames],
  transactional: true,
  upSql
});

export const ChartsLocalSyncQueueMigrationTableNames = [
  "charts_local_sync_queue_entries"
] as const;

export const ChartsLocalSyncQueueMigrationIndexNames = [
  "charts_local_sync_queue_pending_idx",
  "charts_local_sync_queue_status_idx",
  "charts_local_sync_queue_request_idx"
] as const;

const localSyncQueueUpSql = `
CREATE TABLE charts_local_sync_queue_entries (
  tenant_id TEXT NOT NULL,
  queue_entry_id TEXT NOT NULL,
  chart_id TEXT,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  safe_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  last_attempted_at TEXT,
  next_attempt_at TEXT,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, queue_entry_id),
  CHECK (attempt_count >= 0),
  CHECK (payload_json <> ''),
  CHECK (schema_version = 'charts-local-sync-queue.v1'),
  CHECK (operation IN (
    'saveChart',
    'updateChartSource',
    'saveChartArrangement',
    'setMusicianChartPreference',
    'addChartAnnotation',
    'updateChartAnnotation',
    'removeChartAnnotation'
  )),
  CHECK (status IN ('pending', 'in-flight', 'failed', 'synced')),
  CHECK (
    (status = 'failed' AND safe_error_message IS NOT NULL)
    OR (status <> 'failed' AND safe_error_message IS NULL)
  ),
  CHECK (next_attempt_at IS NULL OR status = 'failed'),
  CHECK (last_attempted_at IS NULL OR attempt_count > 0)
);

CREATE INDEX charts_local_sync_queue_pending_idx
  ON charts_local_sync_queue_entries (
    tenant_id,
    status,
    queued_at,
    queue_entry_id
  );
CREATE INDEX charts_local_sync_queue_status_idx
  ON charts_local_sync_queue_entries (tenant_id, status, updated_at);
CREATE INDEX charts_local_sync_queue_request_idx
  ON charts_local_sync_queue_entries (tenant_id, request_id);
`.trim();

const localSyncQueueDownSql = `
DROP INDEX IF EXISTS charts_local_sync_queue_request_idx;
DROP INDEX IF EXISTS charts_local_sync_queue_status_idx;
DROP INDEX IF EXISTS charts_local_sync_queue_pending_idx;
DROP TABLE IF EXISTS charts_local_sync_queue_entries;
`.trim();

export const ChartsLocalSyncQueueMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Charts local sync queue storage table and replay indexes.",
  downSql: localSyncQueueDownSql,
  migrationId: "202606170004_charts_local_sync_queue",
  requiredIndexes: [...ChartsLocalSyncQueueMigrationIndexNames],
  requiredTables: [...ChartsLocalSyncQueueMigrationTableNames],
  tenantScopedTables: [...ChartsLocalSyncQueueMigrationTableNames],
  transactional: true,
  upSql: localSyncQueueUpSql
});

export const ChartsSqlMigrations = [
  ChartsInitialSchemaMigration,
  ChartsLocalSyncQueueMigration
] as const;
