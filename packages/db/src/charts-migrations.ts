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

export const ChartsSqlMigrations = [ChartsInitialSchemaMigration] as const;
