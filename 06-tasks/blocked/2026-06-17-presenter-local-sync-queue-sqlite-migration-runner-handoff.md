# Local SQLite Migration Runner Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The local SQLite migration runner (`planSqliteMigrationApply` + `createSqliteMigrationRunner`) and its tests are complete and pushed (`656656d`). The release check is written under `07-reviews/architecture/presenter-local-sync-queue-sqlite-migration-runner-release-check.md` (pass with follow-ups). All default gates pass; the runner smoke runs against `node:sqlite` when available and skips cleanly otherwise.

The next session should add a pure Presenter local sync queue replay decision contract (ordering, backoff, attempt-limit gating) that extends the existing `listPresenterLocalSyncQueueEntriesReadyForReplay` helper, keeping any running scheduler loop, timers, Tauri, event-bus, and live API replay for later slices.

After that, scaffolding `apps/desktop` as its own workspace becomes the gating step for wiring the persistence selection, migration runner, and replay decision into a desktop composition root.

Open questions:
- None.
