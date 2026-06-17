# Presenter Local Sync Queue Persistence Composition Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `b03c1b8`

## Result

Pass with follow-ups. The slice adds a runtime-config-driven selection factory that composes `createSqliteExecutor` with `createPresenterLocalSyncQueueSqlRepository` for the desktop-local store. It mirrors the API's `createPresenterPersistenceSelectionFromRuntimeConfig`: a Zod-validated config (defaulting to the `sqlite` runtime) plus an injected `SqliteDatabaseClient`, returning the selected repository. The factory adds no native driver dependency, no real Tauri/desktop/event-bus wiring, no replay scheduler, no GraphQL/API replay change, and no checked-in secret.

## Scope Reviewed

- `packages/db/src/presenter-local-sync-queue-composition.ts`
- `packages/db/src/presenter-local-sync-queue-composition.test.ts`
- `packages/db/src/sqlite-executor.ts`
- `packages/db/src/presenter-local-sync-queue-sql-repository.ts`
- `packages/db/src/config.ts`
- `packages/db/src/index.ts`
- `apps/api/src/services/presenter/composition.ts`
- `05-plans/presenter-local-sync-queue-storage-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Config validation | Pass | `PresenterLocalSyncQueuePersistenceRuntimeConfigSchema` reuses the shared `DatabaseConnectionConfigSchema`, defaults to the `sqlite` runtime, and a `superRefine` rejects any non-`sqlite` runtime; a test asserts the rejection. |
| Selection wiring | Pass | The factory builds the executor + adapter and returns `{ mode: "sqlite", repository }`; a test drives a fake `SqliteDatabaseClient` and confirms `getById` prepares a tenant-scoped `SELECT` against `presenter_local_sync_queue_entries`. |
| Injected driver boundary | Pass | The SQLite client is injected via `dependencies.sqlite.database`; the factory imports no SQLite driver, so `@sanctuary-os/db` keeps only its `zod` dependency. |
| Missing-dependency guard | Pass | `requireSqliteRuntimeDependencies` throws a clear error when the injected client is absent; a test covers it. |
| Pattern consistency | Pass | The config/selection shape parallels the API presenter composition (environment enum, `parse*` helper, `*FromRuntimeConfig` factory), easing future desktop wiring. |
| No-live-engine tests | Pass | All composition tests use a fake client; default `pnpm test` needs no SQLite engine, network, or secret. |
| Out-of-scope avoidance | Pass | The slice adds only the composition module, its test, and the barrel export. No Tauri command, desktop window, event bus, replay scheduler, API/GraphQL change, or vendor integration is added. |
| Checked-in secrets | Pass | The config references an env-var name for a local path but stores no credential, connection string, or token. |

## Validation

All gates passed on 2026-06-17 at commit `b03c1b8`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- presenter-local-sync-queue-composition.test.ts` | 4 tests pass |
| `pnpm --filter @sanctuary-os/db typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 3 packages) |
| `pnpm test` | All workspace tests pass (db 125; api 204 + 2 skipped; church-context 5) |

## Follow-Ups

- Add a Presenter local sync queue desktop replay scheduler contract (ordering, backoff, attempt limits, conflict/failed stop conditions) as pure logic with tests, before any live Tauri/event-bus wiring.
- Once `apps/desktop` is scaffolded as its own workspace, consume this selection from the desktop composition root and provide a concrete `node:sqlite`/`better-sqlite3` client wrapper.
- Pair the selection with the future local SQLite migration runner so the desktop store is migrated before the repository writes rows.
