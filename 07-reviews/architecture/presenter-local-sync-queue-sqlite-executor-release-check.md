# Presenter Local Sync Queue SQLite Executor + Integration Smoke Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `19e0a1e`

## Result

Pass with follow-ups. The slice adds `createSqliteExecutor`, a dependency-free adapter from an injected SQLite client to the `PlanningSqlExecutor.query` boundary the Presenter local sync queue repository uses, plus an integration smoke that exercises the full queue lifecycle against a real `node:sqlite` in-memory engine. It mirrors the `postgresql-planning-executor` injection style, so `@sanctuary-os/db` gains no native SQLite dependency. No production queue runner, desktop/Tauri/event-bus wiring, GraphQL/API replay change, OBS/stream control, vendor SDK, Auth0 integration, deployment config, or checked-in secret is introduced.

## Scope Reviewed

- `packages/db/src/sqlite-executor.ts`
- `packages/db/src/sqlite-executor.test.ts`
- `packages/db/src/presenter-local-sync-queue-sqlite-integration.test.ts`
- `packages/db/src/presenter-local-sync-queue-sql-repository.ts`
- `packages/db/src/presenter-migrations.ts`
- `packages/db/src/index.ts`
- `05-plans/presenter-local-sync-queue-storage-plan.md`
- `02-standards/engineering-rules.md`
- `07-reviews/architecture/presenter-local-sync-queue-sql-adapter-release-check.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Dependency-free engine boundary | Pass | `createSqliteExecutor` depends only on an injected `SqliteDatabaseClient` interface; no SQLite driver is imported, and `@sanctuary-os/db` `package.json` still lists only `zod`. |
| Query routing | Pass | `statementReturnsRows` sends `SELECT` and any `RETURNING` statement through `all()` and all other writes through `run()`, matching the adapter's RETURNING-based mutations and plain INSERT. |
| Parameter normalization | Pass | Booleans are coerced to `1`/`0`, array binds are rejected with a clear error, and `bigint` row values are downcast to numbers so the persistence row schema validates. |
| Error surfacing | Pass | Engine failures reject with the statement name plus the original message and `cause`; a fake-client test asserts a `CHECK constraint failed` message propagates. |
| No-engine default tests | Pass | `sqlite-executor.test.ts` drives a recording fake client and needs no real engine, so default `pnpm test` stays free of any external database, network, or secret. |
| Real-engine lifecycle smoke | Pass | The integration test applies `PresenterLocalSyncQueueMigration.upSql` to a `node:sqlite` `:memory:` database and runs enqueue → get → list → replay → conflict → requeue → replay → sync → cleanup through the adapter; it auto-runs when `node:sqlite` is present and skips with a documented test otherwise. |
| Real constraint coverage | Pass | The smoke proves the migration CHECK constraints hold on a real engine: duplicate primary keys reject, conflict detail is required on `conflict` and cleared on `requeue`, and replay blocking applies behind a conflicted entry. |
| SQLite portability | Pass | The executor binds positional `?` parameters and the migration DDL uses `TEXT`/`INTEGER` columns with standard CHECK/index syntax; both `node:sqlite` and `better-sqlite3` satisfy the injected client shape. |
| Out-of-scope avoidance | Pass | The slice adds only the executor, its tests, the integration smoke, and the barrel export. No desktop app code, Tauri command, event bus, replay scheduler, API/GraphQL change, or vendor integration is added. |
| Checked-in secrets | Pass | No credentials, connection strings, tokens, or PII are introduced; the in-memory engine needs none. |

## Validation

All gates passed on 2026-06-17 at commit `19e0a1e`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- sqlite-executor.test.ts presenter-local-sync-queue-sqlite-integration.test.ts` | 9 tests pass (7 executor unit + 2 integration, smoke active on `node:sqlite`) |
| `pnpm --filter @sanctuary-os/db typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 3 packages) |
| `pnpm test` | All workspace tests pass (db 121; api 204 + 2 skipped; church-context 5) |

## Follow-Ups

- Wire the SQLite executor + local sync queue adapter into a desktop-local persistence composition root (parallel to `createPresenterPersistenceSelectionFromRuntimeConfig`), keeping replay scheduling, Tauri commands, and event-bus wiring in later slices.
- Add a local SQLite migration runner contract (apply/rollback ordering with checksum verification) before the desktop app writes queue rows, rather than calling `migration.upSql` directly outside tests.
- When `better-sqlite3` is selected for production desktop builds, add a thin wrapper to the same `SqliteDatabaseClient` shape and reuse this executor unchanged.
