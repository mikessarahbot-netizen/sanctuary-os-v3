# Presenter Desktop Local Sync Composition Root Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `462537c`

## Result

Pass with follow-ups. The slice adds `createPresenterDesktopLocalSyncQueueStore`, a desktop-local composition root that, given an injected migration-capable SQLite client and a clock, applies the local sync queue migration and returns the local sync queue repository from the shared persistence selection. A single injected client backs both the migration runner and the query path. It is composition only — no replay loop, Tauri command, window, or live transport — and adds no checked-in secret.

## Scope Reviewed

- `apps/desktop/src/local-sync-queue-store.ts`
- `apps/desktop/src/local-sync-queue-store.test.ts`
- `apps/desktop/src/index.ts`
- `packages/db/src/sqlite-migration-runner.ts`
- `packages/db/src/presenter-local-sync-queue-composition.ts`
- `packages/db/src/presenter-migrations.ts`
- `05-plans/presenter-local-sync-queue-storage-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Migrate-then-serve | Pass | The composition root runs `applyPending([PresenterLocalSyncQueueMigration])` before returning the repository, so the store is migrated before any read/write. |
| Single injected client | Pass | The migration-capable client (`prepare` + `exec`) backs both the migration runner and the selection's query client, avoiding a second connection. |
| Reuse of shared building blocks | Pass | The root composes `createSqliteMigrationRunner` and `createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig` rather than reimplementing migration or selection logic. |
| Idempotent composition | Pass | The smoke proves a second composition reports the migration `skipped`, so repeated startup is safe. |
| Real round-trip | Pass | The availability-guarded `node:sqlite` smoke migrates, enqueues, and reads back the entry through the composed repository. |
| Injected driver boundary | Pass | The desktop workspace imports no SQLite driver; the engine is injected, so `apps/desktop` gains no native dependency. |
| No-engine default coverage | Pass | A default test documents engine availability; the round-trip smoke auto-runs on `node:sqlite` and skips otherwise, so default `pnpm test` needs no external database. |
| Out-of-scope avoidance | Pass | The slice adds only the composition root, its test, and a barrel re-export. No replay loop, Tauri command, window, event bus, or live transport is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `462537c`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 5 tests pass (3 scaffold + 2 store, store smoke active on `node:sqlite`) |
| `pnpm --filter @sanctuary-os/desktop typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | All workspace tests pass (desktop 5; api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- Build the desktop replay loop (`runReplayPass`) that reads ready entries, applies `decidePresenterLocalSyncQueueReplay`, marks each eligible entry `replaying`, maps it with `mapPresenterLocalSyncQueueEntryToReplayCommand`, calls an injected `PresenterCommandService`, and marks the outcome `synced`/`conflict`/`failed`; mark `exhausted` entries `failed`.
- Inject a real `node:sqlite`/`better-sqlite3` client and an authenticated actor at desktop startup once the Tauri shell exists.
- A timer/interval wrapper around `runReplayPass` and offline/online detection remain later runtime concerns.
