# NOW

## Task
OBS module, slice 3: the migration artifact (`packages/db/src/obs-migrations.ts`) — `ObsInitialSchemaMigration` (tables for the 8 objects + indexes + CHECKs) via `defineSqlMigrationArtifact`, mirroring the other modules' migrations. (OBS slices 1–2 done + green at `3f26b5f`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Final module. NO secret columns (opaque connection_ref); coarse state only; schema_version literal `obs.v1`; confirm-before-dispatch CHECKs. Charts + Play + Community+ backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 3)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/{charts,play,community}-migrations.ts` + their tests
- Add `packages/db/src/obs-migrations.ts`: `ObsInitialSchemaMigration` creating the tables from the plan's persistence-model section (obs_connection_profiles, obs_scenes, obs_sources, obs_scene_items, obs_stream_state, obs_recording_state, obs_action_intents, obs_action_log_entries — match the plan's exact names) with PKs leading `tenant_id`, all CHECK constraints (schema_version='obs.v1', the action-status/origin/source-kind/stream-status enums, boolean IN (0,1), affects_live_output gate, the confirm-before-dispatch CHECKs [status IN ('confirmed','dispatched','succeeded') ⇒ confirmation cols present; requested ⇒ none], coarse-state-only), NO secret columns (connection_ref + opaque only), JSON columns for any arrays, tenant-scoped indexes, and rollback; SQLite-compatible (TEXT/INTEGER/REAL). Export name lists + `ObsSqlMigrations`. migrationId `…0008`
- Tests: artifact shape, CREATE TABLE/INDEX presence, constraint strings (incl. a NO-SECRETS assertion that the DDL has no host/password/token/streamKey columns), rollback drops, checksum stability, and a `node:sqlite` smoke (apply → insert a valid connection profile + a valid requested intent → reject a bad schema_version AND a dispatched intent with no confirmation → rollback)

## Out of scope
The adapter (slice 4) · ObsControlPort · GraphQL/service · the action-gate flow · real obs-websocket · runtime/UI · an offline queue (OBS output actions are online-only per the plan)

## Done when
`ObsInitialSchemaMigration` creates the tables/indexes with all CHECKs + rollback (no secret columns; confirm-before-dispatch enforced at the DDL), covered by artifact tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
OBS slice 4: the SQLite adapter (`packages/db/src/obs-sql-repository.ts`). Then slices 5–10 per `05-plans/obs-module-plan.md` (ObsControlPort+fake → GraphQL+service → action gate → persistence service → events → AI assist). Slices 11–13 await user decisions. After OBS backend: the autonomously-buildable backend is complete; remaining is UIs + live integrations (need the user).
