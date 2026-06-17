# NOW

## Task
Play module, slice 4: the Play SQLite adapter (`packages/db/src/play-sql-repository.ts`) — command + query SQL repositories over an injected executor, mirroring `packages/db/src/charts-sql-repository.ts`. (Play slices 1–3 done + green at `3f39126`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative full slice breakdown 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined to NOW.md + summary + commit/push per backend slice; consolidated release check at the Play-backend milestone; gates are the per-slice verification.

## In scope (slice 4)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-sql-repository.ts` exactly (and its test): `createPlayQuerySqlRepository` + `createPlayCommandSqlRepository` over a `Pick<PlanningSqlExecutor,"query">` executor (+ injected `clock` for the command repo); positional `?` SQL; tenant filtering on every statement; row→contract mapping validated through the slice-2 `play-repository-contracts` schemas; boolean ↔ 0/1; JSON (de)serialization for `track_refs_json` (TrackSet) and `section_order` (PlayArrangement); `reorderPlaySections` and `setPlaybackState`/`updateChartSource`-style RETURNING/update where needed; `removePlayCue` as a tenant-scoped DELETE
- Implement all query reads + command writes from the slice-2 repository interfaces
- Export from the db barrel
- Tests: recording-executor unit tests (tenant-scoped SQL, params, mapping) + a `node:sqlite` smoke (apply `PlayInitialSchemaMigration` → save track set → get → save arrangement/section/cue/pad → setPlaybackState → list round-trips)

## Done when
The Play SQLite adapter implements both repositories with tenant filtering + validated mapping + JSON encoding, covered by recording-executor tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
Play slice 5: GraphQL + in-memory service (`apps/api/src/domain/play/{contracts,errors}.ts`, `services/play/in-memory.ts`, `graphql/play.ts`) per the plan. Then 6 (persistence service), 7 (offline queue), 8 (replay), 9 (events), 10 (desktop replay runtime). UI 11–12 await the scaffold decision.
