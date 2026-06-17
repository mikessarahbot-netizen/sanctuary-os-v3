# NOW

## Task
Add a desktop-local Presenter sync composition root in `apps/desktop` that migrates the SQLite store and exposes the local sync queue repository from an injected client.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/desktop-workspace-scaffold-release-check.md`, and the `@sanctuary-os/db` building blocks (`createSqliteMigrationRunner`, `PresenterLocalSyncQueueMigration`, `createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig`, `SqliteMigrationDatabaseClient`)
- Add an async composition root in `apps/desktop` that, given an injected migration-capable SQLite client and a clock, runs `applyPending([PresenterLocalSyncQueueMigration])` and returns the migration result plus the selected local sync queue repository
- Reuse the existing persistence selection for the repository; the migration client (`prepare` + `exec`) also satisfies the selection's query client
- Add default tests for config/wiring plus an availability-guarded `node:sqlite` smoke that migrates and round-trips an enqueue/getById through the composed repository
- Keep this slice composition-only; do not add a replay loop, Tauri commands, desktop windows, event-bus wiring, or live API transport

## Out of scope
Replay loop runtime · Tauri/Rust shell · real desktop windows · desktop UI screens · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [x] Re-sync with the desktop scaffold and the db building blocks
- [x] Add the desktop-local sync composition root
- [x] Add default wiring tests and an availability-guarded migrate+round-trip smoke
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the desktop composition root slice
- [ ] Session handoff

## Done when
A desktop composition root migrates the local store and returns the local sync queue repository from an injected SQLite client, default tests cover wiring without a live engine, an availability-guarded smoke proves migrate + enqueue/getById round-trip, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Build the desktop replay loop that consumes `decidePresenterLocalSyncQueueReplay` and `mapPresenterLocalSyncQueueEntryToReplayCommand`, driving an injected `PresenterCommandService` and marking entries replaying/synced/conflict/failed — or address any composition findings first.
