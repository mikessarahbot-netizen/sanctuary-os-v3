# NOW

## Task
Community+ module, slice 3: the migration artifact (`packages/db/src/community-migrations.ts`) — `CommunityInitialSchemaMigration` (the tables for the 8 objects + indexes + CHECKs) via `defineSqlMigrationArtifact`, mirroring `charts-migrations.ts`/`play-migrations.ts`. (Community+ slices 1–2 done + green at `bc8fc8f`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module: NO raw PII columns (opaque contact_channel_ref + consent only); tenant-scope; schema_version literal `community.v1`. Charts + Play backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 3)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-migrations.ts` + `packages/db/src/play-migrations.ts` + their tests
- Add `packages/db/src/community-migrations.ts`: `CommunityInitialSchemaMigration` creating the tables from the plan's persistence-model section (members, households, community_groups, group_memberships, attendance_records, communication_messages, communication_recipients, engagement_summaries — match the plan's exact table/column names) with PKs leading `tenant_id`, all CHECK constraints (schema_version='community.v1', enum CHECKs for status/role/kind/channel/send-status, boolean IN (0,1), the confirmation-required-when-confirmed/queued/sent CHECK, consent status enum), NO raw PII columns (contact_channel_ref + consent_status only; JSON columns for array fields like contact_channel_refs/audience/segment_refs), tenant-scoped indexes, and rollback; SQLite-compatible (TEXT/INTEGER/REAL). Export name lists + `CommunitySqlMigrations`. migrationId `…0007`
- Tests: artifact shape, CREATE TABLE/INDEX presence, constraint strings (incl. a NO-PII assertion that the DDL has no phone/email/address columns), rollback drops, checksum stability, and a `node:sqlite` smoke (apply → insert valid → reject bad rows incl. an unconfirmed-but-queued message → rollback)

## Out of scope
The adapter (slice 4) · GraphQL/service · UI · send integration · a comms-queue/offline migration (Community+ is online-primary per the plan; no offline queue unless the plan says so)

## Done when
`CommunityInitialSchemaMigration` creates the tables/indexes with all CHECKs + rollback (no raw PII columns), covered by artifact tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
Community+ slice 4: the SQLite adapter (`packages/db/src/community-sql-repository.ts`). Then slices 5–10 per `05-plans/community-plus-module-plan.md` (GraphQL+service → comms lifecycle/confirmation gate → persistence service → engagement rollup → events → AI assist). Slices 11–13 await user decisions. After Community+: the OBS module.
