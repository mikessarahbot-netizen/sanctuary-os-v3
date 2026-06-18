import { defineSqlMigrationArtifact } from "./migrations.js";

/**
 * OBS initial-schema migration artifact for the tenant-scoped OBS Studio control
 * surface. Mirrors `charts-migrations.ts` / `play-migrations.ts` /
 * `community-migrations.ts` exactly in shape: a single `defineSqlMigrationArtifact`
 * call describing the eight `obs.v1` tables, their tenant-scoped indexes, and the
 * `CHECK` constraints that encode the Zod invariants from `obs-repository-contracts.ts`
 * (slice 2) and `05-plans/obs-module-plan.md` (authoritative persistence model).
 *
 * Safety posture (this is the system's strongest "automation must fail gracefully"
 * surface — it controls live, public-facing output):
 *   - **No secret columns.** A connection profile holds only an opaque
 *     `connection_ref` (a vault handle) + a human label + last-known status. There
 *     is no `host` / `port` / `password` / `token` / `stream_key` / `secret` column
 *     on any table at all — the absence is structural (verified by a no-secrets
 *     migration test), not just a runtime check.
 *   - **Confirm-before-dispatch is enforced at the DDL.** `obs_action_intents`
 *     carries the human-confirm gate as `CHECK` constraints: any status past
 *     `requested` toward dispatch (`confirmed` / `dispatched` / `succeeded`) requires
 *     `confirmed = 1`, and `confirmed = 1` requires the confirmation columns
 *     (`confirmed_by_ref`, `confirmation_reason`, `confirmed_at`) to be present.
 *     Every v1 action affects live output (`affects_live_output = 1`).
 *   - **Coarse state only.** Stream/recording rows carry status + last transition
 *     only — no bitrate / uptime / dropped-frame / per-frame columns; that telemetry
 *     stays on the local runtime bus, never here.
 *   - **No PII.** OBS controls production hardware/scenes, not people; the schema
 *     provides nowhere to put it.
 *
 * There is intentionally **no local-sync-queue migration** in v1: OBS output actions
 * are deliberately online-only (a replayed `start-stream` after a network gap could
 * take a service live unattended), so the offline queue Charts/Play ship is omitted
 * by design (see the plan's offline-posture section).
 */
export const ObsInitialMigrationTableNames = [
  "obs_connection_profiles",
  "obs_scenes",
  "obs_sources",
  "obs_scene_items",
  "obs_stream_state",
  "obs_recording_state",
  "obs_action_intents",
  "obs_action_log_entries"
] as const;

export const ObsInitialMigrationIndexNames = [
  "obs_connection_profiles_tenant_idx",
  "obs_scenes_ref_uq",
  "obs_scenes_tenant_conn_idx",
  "obs_sources_ref_uq",
  "obs_sources_tenant_conn_idx",
  "obs_scene_items_uq",
  "obs_scene_items_tenant_conn_scene_idx",
  "obs_action_intents_tenant_conn_status_idx",
  "obs_action_log_tenant_conn_idx",
  "obs_action_log_intent_idx"
] as const;

const upSql = `
CREATE TABLE obs_connection_profiles (
  tenant_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  label TEXT NOT NULL,
  connection_ref TEXT NOT NULL,
  connection_status TEXT NOT NULL,
  obs_websocket_version TEXT,
  last_seen_at TEXT,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, connection_profile_id),
  CHECK (label <> ''),
  CHECK (connection_ref <> ''),
  CHECK (connection_status IN ('connected', 'disconnected', 'unknown')),
  CHECK (schema_version = 'obs.v1')
);

CREATE TABLE obs_scenes (
  tenant_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  obs_scene_ref TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_current_program_scene INTEGER NOT NULL DEFAULT 0,
  order_hint INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, scene_id),
  CHECK (display_name <> ''),
  CHECK (is_current_program_scene IN (0, 1)),
  CHECK (order_hint >= 0)
);

CREATE TABLE obs_sources (
  tenant_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  obs_source_ref TEXT NOT NULL,
  kind_label TEXT NOT NULL,
  muted_hint INTEGER,
  active_hint INTEGER,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, source_id),
  CHECK (kind_label <> ''),
  CHECK (muted_hint IS NULL OR muted_hint IN (0, 1)),
  CHECK (active_hint IS NULL OR active_hint IN (0, 1))
);

CREATE TABLE obs_scene_items (
  tenant_id TEXT NOT NULL,
  scene_item_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  scene_ref TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  obs_scene_item_id TEXT NOT NULL,
  visible_hint INTEGER NOT NULL DEFAULT 1,
  order_hint INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, scene_item_id),
  CHECK (visible_hint IN (0, 1)),
  CHECK (order_hint >= 0)
);

CREATE TABLE obs_stream_state (
  tenant_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  stream_status TEXT NOT NULL,
  last_transition_at TEXT,
  last_transition_actor_id TEXT,
  last_action_intent_ref TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, connection_profile_id),
  CHECK (stream_status IN ('active', 'inactive', 'unknown'))
);

CREATE TABLE obs_recording_state (
  tenant_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  recording_status TEXT NOT NULL,
  last_transition_at TEXT,
  last_transition_actor_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, connection_profile_id),
  CHECK (recording_status IN ('active', 'paused', 'inactive', 'unknown'))
);

CREATE TABLE obs_action_intents (
  tenant_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_scene_ref TEXT,
  target_source_ref TEXT,
  target_scene_item_id TEXT,
  desired_visible INTEGER,
  desired_muted INTEGER,
  affects_live_output INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_by_ref TEXT,
  confirmation_reason TEXT,
  confirmed_at TEXT,
  requested_by_ref TEXT NOT NULL,
  safe_failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, action_intent_id),
  CHECK (kind IN ('start-stream', 'stop-stream', 'switch-scene', 'toggle-source-visibility', 'toggle-source-mute')),
  CHECK (status IN ('requested', 'confirmed', 'dispatched', 'succeeded', 'failed', 'canceled')),
  CHECK (origin IN ('human', 'ai-suggested')),
  CHECK (affects_live_output IN (0, 1)),
  CHECK (affects_live_output = 1),
  CHECK (confirmed IN (0, 1)),
  CHECK (desired_visible IS NULL OR desired_visible IN (0, 1)),
  CHECK (desired_muted IS NULL OR desired_muted IN (0, 1)),
  CHECK (kind <> 'switch-scene' OR target_scene_ref IS NOT NULL),
  CHECK (kind <> 'toggle-source-visibility' OR (target_source_ref IS NOT NULL AND target_scene_item_id IS NOT NULL AND desired_visible IS NOT NULL)),
  CHECK (kind <> 'toggle-source-mute' OR (target_source_ref IS NOT NULL AND desired_muted IS NOT NULL)),
  CHECK (desired_visible IS NULL OR kind = 'toggle-source-visibility'),
  CHECK (desired_muted IS NULL OR kind = 'toggle-source-mute'),
  CHECK (status NOT IN ('confirmed', 'dispatched', 'succeeded') OR confirmed = 1),
  CHECK (status <> 'requested' OR confirmed = 0),
  CHECK (
    confirmed = 0
    OR (confirmed_by_ref IS NOT NULL AND confirmation_reason IS NOT NULL AND confirmed_at IS NOT NULL)
  ),
  CHECK (
    confirmed = 1
    OR (confirmed_by_ref IS NULL AND confirmation_reason IS NULL AND confirmed_at IS NULL)
  ),
  CHECK (safe_failure_message IS NULL OR status = 'failed')
);

CREATE TABLE obs_action_log_entries (
  tenant_id TEXT NOT NULL,
  log_entry_id TEXT NOT NULL,
  connection_profile_id TEXT NOT NULL,
  action_intent_ref TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  outcome TEXT NOT NULL,
  safe_message TEXT,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, log_entry_id),
  CHECK (outcome IN ('requested', 'confirmed', 'dispatched', 'succeeded', 'failed', 'canceled')),
  CHECK (safe_message IS NULL OR outcome = 'failed')
);

CREATE INDEX obs_connection_profiles_tenant_idx
  ON obs_connection_profiles (tenant_id);
CREATE UNIQUE INDEX obs_scenes_ref_uq
  ON obs_scenes (tenant_id, connection_profile_id, obs_scene_ref);
CREATE INDEX obs_scenes_tenant_conn_idx
  ON obs_scenes (tenant_id, connection_profile_id);
CREATE UNIQUE INDEX obs_sources_ref_uq
  ON obs_sources (tenant_id, connection_profile_id, obs_source_ref);
CREATE INDEX obs_sources_tenant_conn_idx
  ON obs_sources (tenant_id, connection_profile_id);
CREATE UNIQUE INDEX obs_scene_items_uq
  ON obs_scene_items (tenant_id, connection_profile_id, scene_ref, source_ref, obs_scene_item_id);
CREATE INDEX obs_scene_items_tenant_conn_scene_idx
  ON obs_scene_items (tenant_id, connection_profile_id, scene_ref);
CREATE INDEX obs_action_intents_tenant_conn_status_idx
  ON obs_action_intents (tenant_id, connection_profile_id, status);
CREATE INDEX obs_action_log_tenant_conn_idx
  ON obs_action_log_entries (tenant_id, connection_profile_id);
CREATE INDEX obs_action_log_intent_idx
  ON obs_action_log_entries (tenant_id, action_intent_ref);
`.trim();

const downSql = `
DROP INDEX IF EXISTS obs_action_log_intent_idx;
DROP INDEX IF EXISTS obs_action_log_tenant_conn_idx;
DROP INDEX IF EXISTS obs_action_intents_tenant_conn_status_idx;
DROP INDEX IF EXISTS obs_scene_items_tenant_conn_scene_idx;
DROP INDEX IF EXISTS obs_scene_items_uq;
DROP INDEX IF EXISTS obs_sources_tenant_conn_idx;
DROP INDEX IF EXISTS obs_sources_ref_uq;
DROP INDEX IF EXISTS obs_scenes_tenant_conn_idx;
DROP INDEX IF EXISTS obs_scenes_ref_uq;
DROP INDEX IF EXISTS obs_connection_profiles_tenant_idx;
DROP TABLE IF EXISTS obs_action_log_entries;
DROP TABLE IF EXISTS obs_action_intents;
DROP TABLE IF EXISTS obs_recording_state;
DROP TABLE IF EXISTS obs_stream_state;
DROP TABLE IF EXISTS obs_scene_items;
DROP TABLE IF EXISTS obs_sources;
DROP TABLE IF EXISTS obs_scenes;
DROP TABLE IF EXISTS obs_connection_profiles;
`.trim();

export const ObsInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: ["obs_action_log_entries"],
  description:
    "Create the tenant-scoped OBS control schema: connection profiles (opaque connection_ref, no secrets), scene/source/scene-item catalog snapshot, coarse stream and recording state, the human-confirm-gated action intents, and the append-only action log.",
  downSql,
  migrationId: "202606170008_obs_initial_schema",
  requiredIndexes: [...ObsInitialMigrationIndexNames],
  requiredTables: [...ObsInitialMigrationTableNames],
  tenantScopedTables: [...ObsInitialMigrationTableNames],
  transactional: true,
  upSql
});

export const ObsSqlMigrations = [ObsInitialSchemaMigration] as const;
