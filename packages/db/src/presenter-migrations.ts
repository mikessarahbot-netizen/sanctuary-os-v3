import { defineSqlMigrationArtifact } from "./migrations.js";

export const PresenterInitialMigrationTableNames = [
  "presenter_themes",
  "presenter_presentations",
  "presenter_slides",
  "presenter_scripture_passages",
  "presenter_scripture_verses",
  "presenter_slide_blocks",
  "presenter_media_cues",
  "presenter_output_targets",
  "presenter_presentation_output_targets",
  "presenter_audit_log"
] as const;

export const PresenterInitialMigrationIndexNames = [
  "presenter_presentations_tenant_service_idx",
  "presenter_presentations_tenant_updated_idx",
  "presenter_slides_tenant_presentation_order_idx",
  "presenter_slide_blocks_tenant_slide_idx",
  "presenter_media_cues_tenant_presentation_slide_idx",
  "presenter_output_targets_tenant_kind_idx",
  "presenter_presentation_output_targets_tenant_presentation_idx",
  "presenter_audit_log_tenant_request_idx"
] as const;

export const PresenterLocalSyncQueueMigrationTableNames = [
  "presenter_local_sync_queue_entries"
] as const;

export const PresenterLocalSyncQueueMigrationIndexNames = [
  "presenter_local_sync_queue_replay_idx",
  "presenter_local_sync_queue_status_idx",
  "presenter_local_sync_queue_request_idx"
] as const;

const upSql = `
CREATE TABLE presenter_themes (
  tenant_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  name TEXT NOT NULL,
  typography JSONB NOT NULL,
  colors JSONB NOT NULL,
  spacing JSONB NOT NULL,
  lower_third JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, theme_id)
);

CREATE TABLE presenter_presentations (
  tenant_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  service_id TEXT,
  theme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, presentation_id),
  FOREIGN KEY (tenant_id, theme_id)
    REFERENCES presenter_themes (tenant_id, theme_id)
);

CREATE TABLE presenter_slides (
  tenant_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  service_item_id TEXT,
  title TEXT,
  layout TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  background_ref TEXT,
  notes TEXT,
  timing_hint_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, presentation_id, slide_id),
  FOREIGN KEY (tenant_id, presentation_id)
    REFERENCES presenter_presentations (tenant_id, presentation_id),
  CHECK (layout IN ('title', 'content', 'scripture', 'lyrics', 'media', 'lower-third'))
);

CREATE TABLE presenter_scripture_passages (
  tenant_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  translation_ref TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  display_grouping TEXT NOT NULL,
  PRIMARY KEY (tenant_id, passage_id),
  CHECK (display_grouping IN ('continuous', 'by-verse', 'by-paragraph'))
);

CREATE TABLE presenter_scripture_verses (
  tenant_id TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  verse_index INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER,
  text TEXT NOT NULL,
  PRIMARY KEY (tenant_id, passage_id, verse_index),
  FOREIGN KEY (tenant_id, passage_id)
    REFERENCES presenter_scripture_passages (tenant_id, passage_id)
);

CREATE TABLE presenter_slide_blocks (
  tenant_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  block_order INTEGER NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id, presentation_id, slide_id, block_id),
  FOREIGN KEY (tenant_id, presentation_id, slide_id)
    REFERENCES presenter_slides (tenant_id, presentation_id, slide_id),
  CHECK (kind IN ('text', 'scripture', 'lyric', 'image', 'video', 'lower-third'))
);

CREATE TABLE presenter_media_cues (
  tenant_id TEXT NOT NULL,
  media_cue_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  label TEXT NOT NULL,
  media_asset_ref TEXT NOT NULL,
  playback_hint TEXT NOT NULL,
  PRIMARY KEY (tenant_id, media_cue_id),
  FOREIGN KEY (tenant_id, presentation_id, slide_id)
    REFERENCES presenter_slides (tenant_id, presentation_id, slide_id),
  CHECK (playback_hint IN ('manual', 'auto-start', 'loop', 'hold-last-frame'))
);

CREATE TABLE presenter_output_targets (
  tenant_id TEXT NOT NULL,
  output_target_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  window_ref TEXT NOT NULL,
  safe_blanked BOOLEAN NOT NULL,
  confidence_output_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, output_target_id),
  CHECK (target_kind IN ('main', 'confidence', 'stage-display'))
);

CREATE TABLE presenter_presentation_output_targets (
  tenant_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  output_target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, presentation_id, output_target_id),
  FOREIGN KEY (tenant_id, presentation_id)
    REFERENCES presenter_presentations (tenant_id, presentation_id),
  FOREIGN KEY (tenant_id, output_target_id)
    REFERENCES presenter_output_targets (tenant_id, output_target_id)
);

CREATE TABLE presenter_audit_log (
  tenant_id TEXT NOT NULL,
  audit_log_id TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  mutation_intent TEXT NOT NULL,
  target_aggregate_id TEXT,
  confirmation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, audit_log_id)
);

CREATE INDEX presenter_presentations_tenant_service_idx
  ON presenter_presentations (tenant_id, service_id);
CREATE INDEX presenter_presentations_tenant_updated_idx
  ON presenter_presentations (tenant_id, updated_at);
CREATE INDEX presenter_slides_tenant_presentation_order_idx
  ON presenter_slides (tenant_id, presentation_id, sort_order);
CREATE INDEX presenter_slide_blocks_tenant_slide_idx
  ON presenter_slide_blocks (tenant_id, presentation_id, slide_id, block_order);
CREATE INDEX presenter_media_cues_tenant_presentation_slide_idx
  ON presenter_media_cues (tenant_id, presentation_id, slide_id);
CREATE INDEX presenter_output_targets_tenant_kind_idx
  ON presenter_output_targets (tenant_id, target_kind);
CREATE INDEX presenter_presentation_output_targets_tenant_presentation_idx
  ON presenter_presentation_output_targets (tenant_id, presentation_id);
CREATE INDEX presenter_audit_log_tenant_request_idx
  ON presenter_audit_log (tenant_id, request_id);
`.trim();

const downSql = `
DROP TABLE IF EXISTS presenter_audit_log;
DROP TABLE IF EXISTS presenter_presentation_output_targets;
DROP TABLE IF EXISTS presenter_output_targets;
DROP TABLE IF EXISTS presenter_media_cues;
DROP TABLE IF EXISTS presenter_slide_blocks;
DROP TABLE IF EXISTS presenter_scripture_verses;
DROP TABLE IF EXISTS presenter_scripture_passages;
DROP TABLE IF EXISTS presenter_slides;
DROP TABLE IF EXISTS presenter_presentations;
DROP TABLE IF EXISTS presenter_themes;
`.trim();

export const PresenterInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: ["presenter_audit_log"],
  description:
    "Create the initial tenant-scoped Presenter persistence schema with audit metadata.",
  downSql,
  migrationId: "202606170001_presenter_initial_schema",
  requiredIndexes: [...PresenterInitialMigrationIndexNames],
  requiredTables: [...PresenterInitialMigrationTableNames],
  tenantScopedTables: [...PresenterInitialMigrationTableNames],
  transactional: true,
  upSql
});

const localSyncQueueUpSql = `
CREATE TABLE presenter_local_sync_queue_entries (
  tenant_id TEXT NOT NULL,
  queue_entry_id TEXT NOT NULL,
  presentation_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  conflict_json TEXT,
  safe_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  last_attempted_at TEXT,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, queue_entry_id),
  CHECK (attempt_count >= 0),
  CHECK (payload_json <> ''),
  CHECK (schema_version = 'presenter-local-sync-queue.v1'),
  CHECK (operation IN (
    'updatePresentation',
    'addSlide',
    'updateSlide',
    'reorderSlides',
    'applyPresenterTheme',
    'setOutputTarget'
  )),
  CHECK (status IN (
    'queued',
    'replaying',
    'synced',
    'conflict',
    'failed',
    'cancelled'
  )),
  CHECK (
    (status = 'conflict' AND conflict_json IS NOT NULL)
    OR (status <> 'conflict' AND conflict_json IS NULL)
  ),
  CHECK (
    (status = 'failed' AND safe_error_message IS NOT NULL)
    OR (status <> 'failed' AND safe_error_message IS NULL)
  ),
  CHECK (
    last_attempted_at IS NULL
    OR attempt_count > 0
  )
);

CREATE INDEX presenter_local_sync_queue_replay_idx
  ON presenter_local_sync_queue_entries (
    tenant_id,
    presentation_id,
    status,
    queued_at,
    queue_entry_id
  );
CREATE INDEX presenter_local_sync_queue_status_idx
  ON presenter_local_sync_queue_entries (tenant_id, status, updated_at);
CREATE INDEX presenter_local_sync_queue_request_idx
  ON presenter_local_sync_queue_entries (tenant_id, request_id);
`.trim();

const localSyncQueueDownSql = `
DROP INDEX IF EXISTS presenter_local_sync_queue_request_idx;
DROP INDEX IF EXISTS presenter_local_sync_queue_status_idx;
DROP INDEX IF EXISTS presenter_local_sync_queue_replay_idx;
DROP TABLE IF EXISTS presenter_local_sync_queue_entries;
`.trim();

export const PresenterLocalSyncQueueMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Presenter local sync queue storage table and replay indexes.",
  downSql: localSyncQueueDownSql,
  migrationId: "202606170002_presenter_local_sync_queue",
  requiredIndexes: [...PresenterLocalSyncQueueMigrationIndexNames],
  requiredTables: [...PresenterLocalSyncQueueMigrationTableNames],
  tenantScopedTables: [...PresenterLocalSyncQueueMigrationTableNames],
  transactional: true,
  upSql: localSyncQueueUpSql
});

export const PresenterSqlMigrations = [
  PresenterInitialSchemaMigration,
  PresenterLocalSyncQueueMigration
] as const;
