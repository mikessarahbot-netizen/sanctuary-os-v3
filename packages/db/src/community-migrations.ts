import { defineSqlMigrationArtifact } from "./migrations.js";

export const CommunityInitialMigrationTableNames = [
  "members",
  "households",
  "community_groups",
  "group_memberships",
  "attendance_records",
  "communication_messages",
  "communication_recipients",
  "engagement_summaries"
] as const;

export const CommunityInitialMigrationIndexNames = [
  "members_tenant_status_idx",
  "members_tenant_household_idx",
  "households_tenant_idx",
  "community_groups_tenant_kind_idx",
  "group_memberships_active_uq",
  "group_memberships_tenant_group_idx",
  "attendance_member_uq",
  "attendance_tenant_occasion_idx",
  "communication_messages_tenant_status_idx",
  "communication_recipients_uq",
  "communication_recipients_tenant_message_idx",
  "engagement_summaries_tenant_scope_idx"
] as const;

const upSql = `
CREATE TABLE members (
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  household_ref TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  segment_refs_json TEXT NOT NULL DEFAULT '[]',
  custom_field_values_json TEXT NOT NULL DEFAULT '[]',
  contact_channel_refs_json TEXT NOT NULL DEFAULT '[]',
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, member_id),
  CHECK (display_name <> ''),
  CHECK (status IN ('active', 'inactive', 'visitor', 'archived')),
  CHECK (schema_version = 'community.v1')
);

CREATE TABLE households (
  tenant_id TEXT NOT NULL,
  household_ref TEXT NOT NULL,
  label TEXT NOT NULL,
  member_refs_json TEXT NOT NULL DEFAULT '[]',
  primary_contact_member_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, household_ref),
  CHECK (label <> '')
);

CREATE TABLE community_groups (
  tenant_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  leader_member_ref TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, group_id),
  CHECK (kind IN ('small-group', 'serving-team', 'ministry', 'class', 'other')),
  CHECK (archived IN (0, 1)),
  CHECK (label <> '')
);

CREATE TABLE group_memberships (
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  member_ref TEXT NOT NULL,
  role_in_group TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, membership_id),
  CHECK (role_in_group IN ('leader', 'co-leader', 'member', 'guest')),
  CHECK (active IN (0, 1))
);

CREATE TABLE attendance_records (
  tenant_id TEXT NOT NULL,
  attendance_id TEXT NOT NULL,
  occasion_ref TEXT NOT NULL,
  member_ref TEXT,
  status TEXT,
  headcount INTEGER,
  recorded_by_ref TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, attendance_id),
  CHECK (status IS NULL OR status IN ('present', 'absent', 'excused')),
  CHECK (headcount IS NULL OR headcount > 0),
  CHECK (
    (member_ref IS NOT NULL AND status IS NOT NULL AND headcount IS NULL)
    OR (member_ref IS NULL AND headcount IS NOT NULL AND status IS NULL)
  )
);

CREATE TABLE communication_messages (
  tenant_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body_template TEXT NOT NULL,
  audience_json TEXT NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_by_ref TEXT,
  confirmation_reason TEXT,
  confirmed_at TEXT,
  created_by_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, message_id),
  CHECK (channel IN ('sms', 'email', 'push')),
  CHECK (subject IS NULL OR channel = 'email'),
  CHECK (status IN ('draft', 'reviewed', 'confirmed', 'queued', 'sent', 'failed', 'canceled')),
  CHECK (origin IN ('human', 'ai-drafted')),
  CHECK (confirmed IN (0, 1)),
  CHECK (status NOT IN ('confirmed', 'queued', 'sent') OR confirmed = 1),
  CHECK (
    confirmed = 0
    OR (confirmed_by_ref IS NOT NULL AND confirmation_reason IS NOT NULL AND confirmed_at IS NOT NULL)
  ),
  CHECK (body_template <> '')
);

CREATE TABLE communication_recipients (
  tenant_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  member_ref TEXT NOT NULL,
  channel_ref TEXT NOT NULL,
  send_status TEXT NOT NULL,
  failure_reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, recipient_id),
  CHECK (send_status IN ('pending', 'sent', 'delivered', 'failed', 'suppressed')),
  CHECK (failure_reason IS NULL OR send_status = 'failed')
);

CREATE TABLE engagement_summaries (
  tenant_id TEXT NOT NULL,
  summary_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  member_ref TEXT,
  segment_ref TEXT,
  attendance_streak INTEGER NOT NULL DEFAULT 0,
  serving_count INTEGER NOT NULL DEFAULT 0,
  comms_response_count INTEGER NOT NULL DEFAULT 0,
  last_present_occasion_ref TEXT,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, summary_id),
  CHECK (scope_kind IN ('member', 'segment')),
  CHECK (
    (scope_kind = 'member' AND member_ref IS NOT NULL AND segment_ref IS NULL)
    OR (scope_kind = 'segment' AND segment_ref IS NOT NULL AND member_ref IS NULL)
  ),
  CHECK (attendance_streak >= 0),
  CHECK (serving_count >= 0),
  CHECK (comms_response_count >= 0),
  CHECK (window_end >= window_start)
);

CREATE INDEX members_tenant_status_idx
  ON members (tenant_id, status);
CREATE INDEX members_tenant_household_idx
  ON members (tenant_id, household_ref);
CREATE INDEX households_tenant_idx
  ON households (tenant_id);
CREATE INDEX community_groups_tenant_kind_idx
  ON community_groups (tenant_id, kind);
CREATE UNIQUE INDEX group_memberships_active_uq
  ON group_memberships (tenant_id, group_id, member_ref)
  WHERE active = 1;
CREATE INDEX group_memberships_tenant_group_idx
  ON group_memberships (tenant_id, group_id);
CREATE UNIQUE INDEX attendance_member_uq
  ON attendance_records (tenant_id, occasion_ref, member_ref)
  WHERE member_ref IS NOT NULL;
CREATE INDEX attendance_tenant_occasion_idx
  ON attendance_records (tenant_id, occasion_ref);
CREATE INDEX communication_messages_tenant_status_idx
  ON communication_messages (tenant_id, status);
CREATE UNIQUE INDEX communication_recipients_uq
  ON communication_recipients (tenant_id, message_id, member_ref);
CREATE INDEX communication_recipients_tenant_message_idx
  ON communication_recipients (tenant_id, message_id);
CREATE INDEX engagement_summaries_tenant_scope_idx
  ON engagement_summaries (tenant_id, scope_kind);
`.trim();

const downSql = `
DROP INDEX IF EXISTS engagement_summaries_tenant_scope_idx;
DROP INDEX IF EXISTS communication_recipients_tenant_message_idx;
DROP INDEX IF EXISTS communication_recipients_uq;
DROP INDEX IF EXISTS communication_messages_tenant_status_idx;
DROP INDEX IF EXISTS attendance_tenant_occasion_idx;
DROP INDEX IF EXISTS attendance_member_uq;
DROP INDEX IF EXISTS group_memberships_tenant_group_idx;
DROP INDEX IF EXISTS group_memberships_active_uq;
DROP INDEX IF EXISTS community_groups_tenant_kind_idx;
DROP INDEX IF EXISTS households_tenant_idx;
DROP INDEX IF EXISTS members_tenant_household_idx;
DROP INDEX IF EXISTS members_tenant_status_idx;
DROP TABLE IF EXISTS engagement_summaries;
DROP TABLE IF EXISTS communication_recipients;
DROP TABLE IF EXISTS communication_messages;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS community_groups;
DROP TABLE IF EXISTS households;
DROP TABLE IF EXISTS members;
`.trim();

export const CommunityInitialSchemaMigration = defineSqlMigrationArtifact({
  auditTables: [],
  description:
    "Create the tenant-scoped Community+ schema: members, households, community groups, group memberships, attendance, communication messages and recipients, and PII-free engagement summaries.",
  downSql,
  migrationId: "202606170007_community_initial_schema",
  requiredIndexes: [...CommunityInitialMigrationIndexNames],
  requiredTables: [...CommunityInitialMigrationTableNames],
  tenantScopedTables: [...CommunityInitialMigrationTableNames],
  transactional: true,
  upSql
});

export const CommunitySqlMigrations = [CommunityInitialSchemaMigration] as const;
