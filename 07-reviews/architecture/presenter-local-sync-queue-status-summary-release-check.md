# Presenter Local Sync Queue Status Summary Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `82bc758`

## Result

Pass. The slice adds the status data a desktop sidecar reports: a tenant-scoped `countByStatus` capability on the local sync queue repository (SQLite `GROUP BY`, absent statuses defaulting to 0) and a pure `summarizePresenterLocalSyncQueue` helper deriving an operator status object (total, pending, synced, needs-attention). Both are covered by default tests.

## Scope Reviewed

- `packages/db/src/presenter-repository-contracts.ts` (count schemas + interface method)
- `packages/db/src/presenter-local-sync-queue-sql-repository.ts` (adapter `countByStatus`)
- `packages/db/src/presenter-local-sync-queue-status.ts` (summary helper)
- `packages/db/src/presenter-local-sync-queue-sql-repository.test.ts`, `presenter-local-sync-queue-status.test.ts`
- `packages/db/src/presenter-repository-contracts.test.ts`, `apps/desktop/src/replay-pass.test.ts` (fakes)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Contract | Pass | `countByStatus` returns a strict `PresenterLocalSyncQueueStatusCounts` (six non-negative integers) via a read operation; added to `PresenterLocalSyncQueuePersistenceRepository`. |
| Adapter | Pass | The SQLite adapter issues a tenant-scoped `SELECT status, COUNT(*) ... GROUP BY status`, validates each row, and defaults absent statuses to 0; a recording-executor test asserts the SQL, params, and mapping. |
| Pure summary | Pass | `summarizePresenterLocalSyncQueue` computes `total`, `pending = queued + replaying`, `synced`, `needsAttention = conflict + failed`, `cancelled`; tested for a populated and an empty queue. |
| Fakes updated | Pass | The two interface fakes (contracts test, desktop replay-pass test) gained a `countByStatus` stub; typecheck passes. |
| No-engine tests | Pass | All new tests run without a live engine; the four workspaces stay green (db 143, api 230 + 2 skipped, desktop 44, church-context 5). |

## Validation

All gates passed on 2026-06-17 at commit `82bc758`.

| Command | Result |
| --- | --- |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 143; api 230 + 2 skipped; desktop 44; church-context 5) |

## Follow-Ups

- Add a sidecar status reporter that periodically calls `countByStatus` + `summarizePresenterLocalSyncQueue` and exposes the summary (gate-testable `getStatus`).
- Add the sidecar↔webview channel (Tauri command or localhost status endpoint) and a minimal status UI rendering the summary, with operator retry/cancel.
- Consider a `node:sqlite` smoke for the real `GROUP BY` counting when the reporter lands.
