# Desktop Workspace Scaffold Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The `apps/desktop` workspace scaffold is complete and pushed (`253bb99`). The release check is written under `07-reviews/architecture/desktop-workspace-scaffold-release-check.md` (pass with follow-ups). All default gates pass; `pnpm install` reports 5 workspace projects and the new workspace is covered by lint, typecheck, and test.

The next session should add a desktop-local Presenter sync composition root in `apps/desktop` that, given an injected migration-capable SQLite client and a clock, runs `createSqliteMigrationRunner(...).applyPending([PresenterLocalSyncQueueMigration])` and returns the local sync queue repository from `createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig`. Add default wiring tests plus an availability-guarded `node:sqlite` migrate + enqueue/getById round-trip smoke.

After the composition root, the desktop replay loop (consuming the replay decision + coordinator against an injected `PresenterCommandService`) is the next slice, then the actual Tauri shell.

Open questions:
- Production SQLite engine (`node:sqlite` vs `better-sqlite3`) remains a later decision; both satisfy the injected client shapes.
