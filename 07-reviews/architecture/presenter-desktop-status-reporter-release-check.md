# Presenter Desktop Status Reporter Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `c4f328f`

## Result

Pass. The desktop replay runtime now exposes `getStatus`, which calls `repository.countByStatus` and returns `summarizePresenterLocalSyncQueue(counts)` plus the last replay-pass result (tracked by wrapping the scheduler's `onResult`). This is the observability surface a future IPC/UI reads to show queue health.

## Scope Reviewed

- `apps/desktop/src/replay-runtime.ts`
- `apps/desktop/src/replay-runtime.test.ts`
- `packages/db/src/presenter-local-sync-queue-status.ts`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Status surface | Pass | `PresenterDesktopReplayRuntime.getStatus` returns `{ summary, lastResult? }`; the summary is derived from `countByStatus` via the pure helper. |
| Last-result tracking | Pass | The runtime wraps the scheduler `onResult` so `lastResult` always reflects the latest pass while still forwarding to the injected `onResult`. |
| Tenant scope | Pass | `getStatus` builds the read context from the runtime's actor (actorId/tenantId), so counts are tenant-scoped. |
| Smoke coverage | Pass | The `node:sqlite` runtime smoke enqueues and replays an edit, then asserts `getStatus().summary` is `{ synced: 1, total: 1, ... }` and `lastResult.synced` lists the entry. |
| Gate safety | Pass | No new default-gate engine/network requirement; all four workspaces stay green (db 143, api 230 + 2 skipped, desktop 44, church-context 5). |

## Validation

All gates passed on 2026-06-17 at commit `c4f328f`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test -- replay-runtime.test.ts` | 2 tests pass |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 143; api 230 + 2 skipped; desktop 44; church-context 5) |

## Follow-Ups

- Expose `getStatus` from the sidecar over a localhost status endpoint (reuse the http request-handler pattern) so the Tauri webview can poll it; gate-test the handler.
- Render a minimal desktop status UI (totals + needs-attention) with operator retry/cancel.
- Periodic status push (instead of poll) is optional once the channel exists.
