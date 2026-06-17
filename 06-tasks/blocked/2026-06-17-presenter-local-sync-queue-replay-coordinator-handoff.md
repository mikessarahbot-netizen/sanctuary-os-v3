# Presenter Local Sync Queue Replay Coordinator Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The pure Presenter local sync queue replay coordinator (`mapPresenterLocalSyncQueueEntryToReplayCommand`) and its tests are complete and pushed (`31e062d`). The release check is written under `07-reviews/architecture/presenter-local-sync-queue-replay-coordinator-release-check.md` (pass with follow-ups). All default gates pass.

With this slice, the Presenter local sync queue offline-edit pipeline is fully specified at the contract/logic level:
- `packages/db`: queue contracts, migration + migration runner, SQLite adapter, SQLite executor, persistence composition, and replay decision.
- `apps/api`: replay coordinator mapping queue operations to the existing Presenter service commands.

All with no-live-engine default tests plus `node:sqlite` availability-guarded smokes. No desktop runtime, Tauri, event bus, or live transport exists yet.

The next session should scaffold `apps/desktop` as a minimal TypeScript workspace (package.json, tsconfig, vitest, lint integration) mirroring `apps/api`, so these building blocks can be wired into a desktop composition root and replay loop in later slices. Keep the actual Tauri/Rust shell out of the initial scaffold to avoid native-build/tooling risk.

Open questions:
- Whether the desktop shell should use `node:sqlite` or `better-sqlite3` in production is a later decision; both already satisfy the injected `SqliteDatabaseClient`/`SqliteMigrationDatabaseClient` shapes.
