# NOW

## Task
Play module, slice 3: the Play migration artifact (`packages/db/src/play-migrations.ts`) — `PlayInitialSchemaMigration` (six tables + indexes + CHECKs) via `defineSqlMigrationArtifact`, mirroring `charts-migrations.ts`. (Play slices 1–2 done + green at `9575f98`.)

## Module
Building Play from `05-plans/play-module-plan.md` (authoritative; slice breakdown 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
See `agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Per-slice release-check docs are streamlined to module-backend milestones to conserve context; gates are the per-slice verification.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-migrations.ts` + its test exactly
- Add `packages/db/src/play-migrations.ts`: `PlayInitialSchemaMigration` creating the six tables from the plan's persistence-model section (`track_sets`, `play_arrangements`, `play_sections`, `play_cues`, `pad_layers`, `playback_state`) with PKs leading `tenant_id`, all CHECK constraints (tempo_bpm>0, schema_version='play.v1', kind/action/fire_mode/transport_status enums, gain 0..1, boolean IN (0,1), nonneg bounds, jump⇒target / pad-change⇒pad), tenant-scoped indexes, and rollback; SQLite-compatible (TEXT/INTEGER/REAL). Export `PlayInitialMigrationTableNames`/`IndexNames` + `PlaySqlMigrations`
- Tests: artifact shape, CREATE TABLE/INDEX presence, constraint strings, rollback drops, checksum stability, and a `node:sqlite` smoke (apply → insert valid → reject bad rows → rollback)

## Out of scope
The local-sync-queue migration (slice 7) · SQLite adapter (slice 4) · service/graphql · UI

## Progress
- [ ] Re-sync with `charts-migrations.ts` + the plan persistence-model section
- [ ] `play-migrations.ts` (`PlayInitialSchemaMigration` + name lists + `PlaySqlMigrations`)
- [ ] Migration tests + `node:sqlite` smoke
- [ ] Run lint, typecheck, test green
- [ ] Advance NOW.md + session-summary + commit/push

## Done when
`PlayInitialSchemaMigration` creates the six tables/indexes with all CHECKs + rollback, covered by artifact tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
Play slice 4: the Play SQLite adapter (`packages/db/src/play-sql-repository.ts`) over the executor (JSON (de)serialization for track_refs/section_order, tenant filtering), then slices 5–10 per `05-plans/play-module-plan.md`.
