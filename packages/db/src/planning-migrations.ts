import { defineSqlMigrationArtifact } from "./migrations.js";

export const PlanningInitialMigrationTableNames = [
  "planning_services",
  "planning_service_items",
  "planning_assignments",
  "planning_service_templates",
  "planning_song_library_items",
  "planning_readiness_results",
  "planning_ccli_usage_logs",
  "planning_rehearsal_asset_visibility",
  "planning_rehearsal_acknowledgements",
  "planning_audit_log"
] as const;

export const PlanningInitialMigrationIndexNames = [
  "planning_services_tenant_status_starts_idx",
  "planning_service_items_tenant_service_sort_idx",
  "planning_assignments_tenant_service_idx",
  "planning_service_templates_tenant_service_type_idx",
  "planning_song_library_items_tenant_title_idx",
  "planning_readiness_results_tenant_service_idx",
  "planning_ccli_usage_logs_tenant_service_status_idx",
  "planning_rehearsal_asset_visibility_tenant_service_item_idx",
  "planning_rehearsal_acknowledgements_tenant_service_item_idx",
  "planning_audit_log_tenant_request_idx"
] as const;

const upSql = `
CREATE TABLE planning_services (
  tenant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_type_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, service_id),
  CHECK (status IN ('draft', 'scheduled', 'published', 'canceled'))
);

CREATE TABLE planning_service_items (
  tenant_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  song_id TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, service_item_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id)
);

CREATE TABLE planning_assignments (
  tenant_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, assignment_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id),
  CHECK (status IN ('pending', 'confirmed', 'declined'))
);

CREATE TABLE planning_service_templates (
  tenant_id TEXT NOT NULL,
  service_template_id TEXT NOT NULL,
  service_type_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, service_template_id)
);

CREATE TABLE planning_song_library_items (
  tenant_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  default_key TEXT,
  available_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  ccli_song_number TEXT,
  ccli_reporting_allowed BOOLEAN NOT NULL,
  energy TEXT,
  has_arrangements BOOLEAN NOT NULL,
  has_charts BOOLEAN NOT NULL,
  is_banned_or_paused BOOLEAN NOT NULL,
  last_used_at TIMESTAMPTZ,
  tempo_bpm INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, song_id)
);

CREATE TABLE planning_readiness_results (
  tenant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  readiness_score INTEGER NOT NULL,
  band TEXT NOT NULL,
  checks JSONB NOT NULL,
  risks JSONB NOT NULL,
  strengths JSONB NOT NULL,
  recommended_actions JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, service_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id),
  CHECK (band IN ('blocked', 'needs-attention', 'ready'))
);

CREATE TABLE planning_ccli_usage_logs (
  tenant_id TEXT NOT NULL,
  ccli_usage_log_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_item_id TEXT,
  song_id TEXT NOT NULL,
  title TEXT NOT NULL,
  ccli_song_number TEXT,
  usage_type TEXT NOT NULL,
  reporting_status TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, ccli_usage_log_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id),
  CHECK (usage_type IN ('service', 'rehearsal', 'livestream')),
  CHECK (reporting_status IN ('pending', 'reported', 'skipped'))
);

CREATE TABLE planning_rehearsal_asset_visibility (
  tenant_id TEXT NOT NULL,
  rehearsal_asset_visibility_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL,
  visible_to_role_ids JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, rehearsal_asset_visibility_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id),
  FOREIGN KEY (tenant_id, service_item_id)
    REFERENCES planning_service_items (tenant_id, service_item_id)
);

CREATE TABLE planning_rehearsal_acknowledgements (
  tenant_id TEXT NOT NULL,
  rehearsal_acknowledgement_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  readiness_signal TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  PRIMARY KEY (tenant_id, rehearsal_acknowledgement_id),
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES planning_services (tenant_id, service_id),
  FOREIGN KEY (tenant_id, service_item_id)
    REFERENCES planning_service_items (tenant_id, service_item_id),
  FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES planning_assignments (tenant_id, assignment_id),
  CHECK (readiness_signal IN ('ready', 'needs-practice', 'blocked'))
);

CREATE TABLE planning_audit_log (
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

CREATE INDEX planning_services_tenant_status_starts_idx
  ON planning_services (tenant_id, status, starts_at);
CREATE INDEX planning_service_items_tenant_service_sort_idx
  ON planning_service_items (tenant_id, service_id, sort_order);
CREATE INDEX planning_assignments_tenant_service_idx
  ON planning_assignments (tenant_id, service_id);
CREATE INDEX planning_service_templates_tenant_service_type_idx
  ON planning_service_templates (tenant_id, service_type_id);
CREATE INDEX planning_song_library_items_tenant_title_idx
  ON planning_song_library_items (tenant_id, title);
CREATE INDEX planning_readiness_results_tenant_service_idx
  ON planning_readiness_results (tenant_id, service_id);
CREATE INDEX planning_ccli_usage_logs_tenant_service_status_idx
  ON planning_ccli_usage_logs (tenant_id, service_id, reporting_status);
CREATE INDEX planning_rehearsal_asset_visibility_tenant_service_item_idx
  ON planning_rehearsal_asset_visibility (tenant_id, service_id, service_item_id);
CREATE INDEX planning_rehearsal_acknowledgements_tenant_service_item_idx
  ON planning_rehearsal_acknowledgements (
    tenant_id,
    service_id,
    service_item_id,
    person_id,
    assignment_id,
    asset_id
  );
CREATE INDEX planning_audit_log_tenant_request_idx
  ON planning_audit_log (tenant_id, request_id);
`.trim();

const downSql = `
DROP TABLE IF EXISTS planning_audit_log;
DROP TABLE IF EXISTS planning_rehearsal_acknowledgements;
DROP TABLE IF EXISTS planning_rehearsal_asset_visibility;
DROP TABLE IF EXISTS planning_ccli_usage_logs;
DROP TABLE IF EXISTS planning_readiness_results;
DROP TABLE IF EXISTS planning_song_library_items;
DROP TABLE IF EXISTS planning_service_templates;
DROP TABLE IF EXISTS planning_assignments;
DROP TABLE IF EXISTS planning_service_items;
DROP TABLE IF EXISTS planning_services;
`.trim();

export const PlanningInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: ["planning_audit_log"],
  description:
    "Create the initial tenant-scoped Planning persistence schema with audit metadata.",
  downSql,
  migrationId: "202606160001_planning_initial_schema",
  requiredIndexes: [...PlanningInitialMigrationIndexNames],
  requiredTables: [...PlanningInitialMigrationTableNames],
  tenantScopedTables: [...PlanningInitialMigrationTableNames],
  transactional: true,
  upSql
});

export const PlanningSqlMigrations = [PlanningInitialSchemaMigration] as const;
