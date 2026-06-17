# Local SQLite Migration Runner Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `656656d`

## Result

Pass with follow-ups. The slice adds `planSqliteMigrationApply` (pure apply/skip decision with checksum-drift detection) and `createSqliteMigrationRunner`, which ensures a tracking table, applies pending migrations in order honoring the `transactional` flag, records checksum/state/timestamp, lists applied records, and rolls a migration back — all over an injected SQLite client extended with `exec`. It adds no native driver dependency, no desktop/Tauri/event-bus wiring, no replay scheduler, no API/GraphQL change, and no checked-in secret. This unblocks the storage plan's requirement to migrate the desktop store before the repository writes rows, replacing direct `migration.upSql` calls outside tests.

## Scope Reviewed

- `packages/db/src/sqlite-migration-runner.ts`
- `packages/db/src/sqlite-migration-runner.test.ts`
- `packages/db/src/migrations.ts`
- `packages/db/src/sqlite-executor.ts`
- `packages/db/src/presenter-migrations.ts`
- `packages/db/src/index.ts`
- `05-plans/presenter-local-sync-queue-storage-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Pure planning | Pass | `planSqliteMigrationApply` maps each artifact to `apply`/`skip` from the applied records and is engine-free; unit tests cover no-record, matching-checksum skip, drift throw, and re-apply after rollback. |
| Checksum-drift detection | Pass | An applied record whose stored checksum differs from the artifact checksum throws `Migration checksum drift detected for <id>`, proven in both the unit test and the real-engine smoke. |
| Ordering and idempotency | Pass | `applyPending` applies artifacts in the supplied order and skips already-applied ones; the smoke asserts a second run returns `skipped` for the same migration. |
| Transactional safety | Pass | `runInOptionalTransaction` wraps `transactional` migrations in `BEGIN`/`COMMIT` with best-effort `ROLLBACK`, applying the DDL and the tracking-record write atomically. |
| Tracking table | Pass | `ensureTrackingTable` creates `sanctuary_migrations` with `CREATE TABLE IF NOT EXISTS`; records are upserted via `ON CONFLICT (migration_id) DO UPDATE`, and rows are validated through `MigrationRecordSchema`. |
| Rollback | Pass | `rollback` runs `downSql` and records `rolled-back`; the smoke confirms the queue table is dropped and the record state flips to `rolled-back`. |
| Injected driver boundary | Pass | The runner depends on `SqliteMigrationDatabaseClient` (the executor's client plus `exec`); no SQLite driver is imported, so `@sanctuary-os/db` keeps only its `zod` dependency. |
| No-engine default tests | Pass | The planner suite runs with no engine; the runner smoke auto-runs on `node:sqlite` and skips with a documented test otherwise, so default `pnpm test` needs no external database, network, or secret. |
| Out-of-scope avoidance | Pass | The slice adds only the runner, its test, and the barrel export. No desktop app code, Tauri command, event bus, replay scheduler, API/GraphQL change, or vendor integration is added. |
| Checked-in secrets | Pass | No credentials, connection strings, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `656656d`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- sqlite-migration-runner.test.ts` | 6 tests pass (4 planner + 2 smoke, smoke active on `node:sqlite`) |
| `pnpm --filter @sanctuary-os/db typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 3 packages) |
| `pnpm test` | All workspace tests pass (db 131; api 204 + 2 skipped; church-context 5) |

## Follow-Ups

- Wire the migration runner into the desktop-local persistence composition (or a startup step) so the queue store is migrated before the repository writes rows, once `apps/desktop` is scaffolded.
- Consider a `status(migrations)` helper that returns each migration's `pending`/`applied`/`drift` state for diagnostics without applying anything.
- Replay scheduling and the desktop replay coordinator remain later slices, owned by the desktop layer, and are not affected by this runner.
