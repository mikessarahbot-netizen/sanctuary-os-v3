import { defineSqlMigrationArtifact } from "./migrations.js";

export const PlayInitialMigrationTableNames = [
  "track_sets",
  "play_arrangements",
  "play_sections",
  "play_cues",
  "pad_layers",
  "playback_state"
] as const;

export const PlayInitialMigrationIndexNames = [
  "track_sets_tenant_song_idx",
  "play_arrangements_tenant_song_idx",
  "play_sections_tenant_arrangement_idx",
  "play_cues_tenant_trackset_idx",
  "pad_layers_tenant_song_idx"
] as const;

const upSql = `
CREATE TABLE track_sets (
  tenant_id TEXT NOT NULL,
  track_set_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  service_id TEXT,
  arrangement_ref TEXT,
  title TEXT,
  default_key TEXT NOT NULL,
  tempo_bpm REAL NOT NULL,
  track_refs_json TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, track_set_id),
  CHECK (tempo_bpm > 0),
  CHECK (track_refs_json <> ''),
  CHECK (schema_version = 'play.v1')
);

CREATE TABLE play_arrangements (
  tenant_id TEXT NOT NULL,
  arrangement_ref TEXT NOT NULL,
  song_id TEXT NOT NULL,
  label TEXT NOT NULL,
  default_key TEXT NOT NULL,
  tempo_bpm REAL NOT NULL,
  section_order TEXT NOT NULL,
  loop_section_ref TEXT,
  PRIMARY KEY (tenant_id, arrangement_ref),
  CHECK (tempo_bpm > 0)
);

CREATE TABLE play_sections (
  tenant_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  arrangement_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT,
  length_bars INTEGER NOT NULL DEFAULT 0,
  click_enabled_default INTEGER NOT NULL,
  pad_layer_ref TEXT,
  PRIMARY KEY (tenant_id, section_id),
  CHECK (length_bars >= 0),
  CHECK (click_enabled_default IN (0, 1)),
  CHECK (kind IN ('intro', 'verse', 'prechorus', 'chorus', 'bridge', 'instrumental', 'tag', 'outro', 'other'))
);

CREATE TABLE play_cues (
  tenant_id TEXT NOT NULL,
  cue_id TEXT NOT NULL,
  track_set_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  marker_offset_beats INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_section_ref TEXT,
  pad_layer_ref TEXT,
  fire_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, cue_id),
  CHECK (marker_offset_beats >= 0),
  CHECK (action IN ('play', 'stop', 'jump', 'pad-change', 'click-toggle')),
  CHECK (fire_mode IN ('manual', 'auto')),
  CHECK (action <> 'jump' OR target_section_ref IS NOT NULL),
  CHECK (action <> 'pad-change' OR pad_layer_ref IS NOT NULL)
);

CREATE TABLE pad_layers (
  tenant_id TEXT NOT NULL,
  pad_layer_ref TEXT NOT NULL,
  song_id TEXT,
  pad_key TEXT NOT NULL,
  section_scope_ref TEXT,
  pad_media_ref TEXT NOT NULL,
  gain REAL NOT NULL,
  loop INTEGER NOT NULL,
  label TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, pad_layer_ref),
  CHECK (gain >= 0 AND gain <= 1),
  CHECK (loop IN (0, 1))
);

CREATE TABLE playback_state (
  tenant_id TEXT NOT NULL,
  track_set_id TEXT NOT NULL,
  active_section_ref TEXT,
  transport_status TEXT NOT NULL,
  position_beats REAL NOT NULL DEFAULT 0,
  click_enabled INTEGER NOT NULL,
  active_pad_layer_ref TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, track_set_id),
  CHECK (transport_status IN ('stopped', 'playing', 'paused')),
  CHECK (position_beats >= 0),
  CHECK (click_enabled IN (0, 1))
);

CREATE INDEX track_sets_tenant_song_idx
  ON track_sets (tenant_id, song_id);
CREATE INDEX play_arrangements_tenant_song_idx
  ON play_arrangements (tenant_id, song_id);
CREATE INDEX play_sections_tenant_arrangement_idx
  ON play_sections (tenant_id, arrangement_ref);
CREATE INDEX play_cues_tenant_trackset_idx
  ON play_cues (tenant_id, track_set_id);
CREATE INDEX pad_layers_tenant_song_idx
  ON pad_layers (tenant_id, song_id);
`.trim();

const downSql = `
DROP INDEX IF EXISTS pad_layers_tenant_song_idx;
DROP INDEX IF EXISTS play_cues_tenant_trackset_idx;
DROP INDEX IF EXISTS play_sections_tenant_arrangement_idx;
DROP INDEX IF EXISTS play_arrangements_tenant_song_idx;
DROP INDEX IF EXISTS track_sets_tenant_song_idx;
DROP TABLE IF EXISTS playback_state;
DROP TABLE IF EXISTS pad_layers;
DROP TABLE IF EXISTS play_cues;
DROP TABLE IF EXISTS play_sections;
DROP TABLE IF EXISTS play_arrangements;
DROP TABLE IF EXISTS track_sets;
`.trim();

export const PlayInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Play schema: track sets, arrangements, sections, cues, pad layers, and resumable playback state.",
  downSql,
  migrationId: "202606170005_play_initial_schema",
  requiredIndexes: [...PlayInitialMigrationIndexNames],
  requiredTables: [...PlayInitialMigrationTableNames],
  tenantScopedTables: [...PlayInitialMigrationTableNames],
  transactional: true,
  upSql
});

export const PlayLocalSyncQueueMigrationTableNames = [
  "play_local_sync_queue_entries"
] as const;

export const PlayLocalSyncQueueMigrationIndexNames = [
  "play_local_sync_queue_pending_idx",
  "play_local_sync_queue_status_idx",
  "play_local_sync_queue_request_idx"
] as const;

const localSyncQueueUpSql = `
CREATE TABLE play_local_sync_queue_entries (
  tenant_id TEXT NOT NULL,
  queue_entry_id TEXT NOT NULL,
  track_set_id TEXT,
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
  CHECK (schema_version = 'play-local-sync-queue.v1'),
  CHECK (operation IN (
    'saveTrackSet',
    'updateTrackSetMembers',
    'savePlayArrangement',
    'savePlaySection',
    'reorderPlaySections',
    'addPlayCue',
    'updatePlayCue',
    'savePadLayer',
    'setPlaybackState'
  )),
  CHECK (status IN ('pending', 'in-flight', 'failed', 'synced')),
  CHECK (
    (status = 'failed' AND safe_error_message IS NOT NULL)
    OR (status <> 'failed' AND safe_error_message IS NULL)
  ),
  CHECK (next_attempt_at IS NULL OR status = 'failed'),
  CHECK (last_attempted_at IS NULL OR attempt_count > 0)
);

CREATE INDEX play_local_sync_queue_pending_idx
  ON play_local_sync_queue_entries (
    tenant_id,
    status,
    queued_at,
    queue_entry_id
  );
CREATE INDEX play_local_sync_queue_status_idx
  ON play_local_sync_queue_entries (tenant_id, status, updated_at);
CREATE INDEX play_local_sync_queue_request_idx
  ON play_local_sync_queue_entries (tenant_id, request_id);
`.trim();

const localSyncQueueDownSql = `
DROP INDEX IF EXISTS play_local_sync_queue_request_idx;
DROP INDEX IF EXISTS play_local_sync_queue_status_idx;
DROP INDEX IF EXISTS play_local_sync_queue_pending_idx;
DROP TABLE IF EXISTS play_local_sync_queue_entries;
`.trim();

export const PlayLocalSyncQueueMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Play local sync queue storage table and replay indexes.",
  downSql: localSyncQueueDownSql,
  migrationId: "202606170006_play_local_sync_queue",
  requiredIndexes: [...PlayLocalSyncQueueMigrationIndexNames],
  requiredTables: [...PlayLocalSyncQueueMigrationTableNames],
  tenantScopedTables: [...PlayLocalSyncQueueMigrationTableNames],
  transactional: true,
  upSql: localSyncQueueUpSql
});

export const PlaySqlMigrations = [
  PlayInitialSchemaMigration,
  PlayLocalSyncQueueMigration
] as const;
