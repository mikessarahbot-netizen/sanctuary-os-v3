# NOW

## Task
OBS module, slice 4: the SQLite adapter (`packages/db/src/obs-sql-repository.ts`) — command + query SQL repositories over an injected executor, mirroring the charts/play/community adapters. (OBS slices 1–3 done + green at `95a65e2`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Final module. NO secrets; confirm-before-dispatch; coarse state. Charts + Play + Community+ backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 4)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/{charts,play,community}-sql-repository.ts` exactly (and their tests): `createObsQuerySqlRepository` + `createObsCommandSqlRepository` over a `Pick<PlanningSqlExecutor,"query">` executor (+ injected `clock` for the command repo); positional `?` SQL; tenant filtering on every statement; row→contract mapping validated through the slice-2 contracts; boolean ↔ 0/1; the flattened confirmation columns ↔ the record's confirmation object; the action-intent lifecycle writes (saveObsActionIntent + setObsActionIntentStatus as the confirm-gated transition, using RETURNING where needed); appendObsActionLogEntry insert-only; the catalog snapshot replace (delete-then-insert scenes/sources/sceneItems for a connection, tenant-scoped); setStreamState/setRecordingState upserts (one-per-connection)
- Implement all query reads + command writes from the slice-2 repository interfaces
- Export from the db barrel
- Tests: recording-executor unit tests (tenant-scoped SQL, params, mapping, confirmation flatten/rebuild, the no-secrets mapping) + a `node:sqlite` smoke (apply ObsInitialSchemaMigration → upsert connection profile → replace catalog → set stream state → save→confirm→dispatch an action intent → append a log entry → list round-trips, asserting the confirm-before-dispatch DDL gate holds)

## Done when
The OBS SQLite adapter implements both repositories with tenant filtering + validated mapping + the confirm-gated transition write + catalog replace, covered by recording-executor tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
OBS slice 5: the `ObsControlPort` interface + a faked/in-memory adapter (the obs-websocket boundary; fake for tests). Then slices 6–10 per `05-plans/obs-module-plan.md` (GraphQL+service → action gate → persistence service → events → AI assist). Slices 11–13 (real obs-websocket port, desktop agent runtime, operator UI) await user decisions. After OBS backend: the autonomously-buildable backend is complete; remaining is UIs + live integrations (need the user).
