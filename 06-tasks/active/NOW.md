# NOW

## Task
Play module, slice 7: the Play offline-sync queue — contracts + SQLite/in-memory repository + a `PlayLocalSyncQueueMigration`, mirroring the Charts offline-sync queue (slice 7). (Play slices 1–6 done + green at `b7e52fb`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative; slices 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined to NOW.md + summary + commit/push per backend slice; consolidated release check at the Play-backend milestone; gates are the per-slice verification.

## In scope (slice 7)
- Continue on `feature/presenter-domain-contracts`
- Mirror the Charts queue files exactly: `packages/db/src/charts-local-sync-queue-repository-contracts.ts`, `charts-local-sync-queue-sql-repository.ts`, `charts-local-sync-queue-in-memory-repository.ts`, and the queue migration in `charts-migrations.ts`
- Add `packages/db/src/play-local-sync-queue-repository-contracts.ts`: a discriminated-union queued-operation over the NON-destructive Play ops (saveTrackSet, updateTrackSetMembers, savePlayArrangement, savePlaySection, reorderPlaySections, addPlayCue, updatePlayCue, savePadLayer, setPlaybackState — each payload reusing the slice-2 command input schema; `removePlayCue` EXCLUDED), the entry record (status pending/in-flight/failed/synced + attempt/backoff/timestamps), status transitions, and the queue repository interface (enqueue/getById/listPending/markInFlight/markSynced/markFailed/requeue/pruneSynced/countByStatus)
- Add `packages/db/src/play-local-sync-queue-sql-repository.ts` + `play-local-sync-queue-in-memory-repository.ts`
- Add `PlayLocalSyncQueueMigration` to `packages/db/src/play-migrations.ts` (table `play_local_sync_queue_entries`, same shape as the charts queue migration; append to `PlaySqlMigrations`), migrationId `…0006`
- Export from the db barrel
- Tests: contract tests + recording-executor repo tests + in-memory tests + migration test + a `node:sqlite` smoke

## Done when
The Play offline-sync queue contracts + repository (SQLite + in-memory) + migration exist with tenant scope, validated records, status transitions, and tests, gates green, committed and pushed.

## Next task after this
Play slice 8: replay decision + status + coordinator (mirror Charts slice 7b). Then 9 (WebSocket events: trackSet.updated, play.playbackStateChanged, play.cueFired into the API event union), 10 (desktop replay runtime). UI 11–12 await the scaffold decision — at which point the Play backend is complete and the consolidated Play-backend release check is due.
