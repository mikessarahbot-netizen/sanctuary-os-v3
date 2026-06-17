# Presenter Desktop Replay Scheduler Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `c0b9112`

## Result

Pass with follow-ups. The slice adds `createPresenterDesktopReplayScheduler`, which wraps a replay-pass runner with offline/online gating and an injected interval. `runOnce` skips while offline or runs the pass and reports the result; `start`/`stop` drive `runOnce` through the injected `schedule`/`cancel` abstraction; a scheduled tick never throws, routing per-tick errors to an optional `onError`. Connectivity, the interval, and the pass runner are all injected, so the scheduler holds no transport or real timer. It adds no Tauri/Rust, real `setInterval` wiring, or checked-in secret.

## Scope Reviewed

- `apps/desktop/src/replay-scheduler.ts`
- `apps/desktop/src/replay-scheduler.test.ts`
- `apps/desktop/src/replay-pass.ts`
- `apps/desktop/src/index.ts`
- `05-plans/presenter-local-sync-queue-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Offline gating | Pass | `runOnce` returns `{ status: "skipped-offline" }` and does not call the pass when `isOnline()` is false; a test asserts the pass never runs. |
| Online run | Pass | `runOnce` runs the pass, invokes the optional `onResult`, and returns `{ status: "ran", result }`; a test asserts the result and callback. |
| Start/stop lifecycle | Pass | `start` schedules exactly once (idempotent) and `stop` cancels the stored handle; a test asserts a single schedule across two `start` calls and a single cancel with a no-op second `stop`. |
| Per-tick error containment | Pass | A scheduled tick wraps `runOnce().catch(...)`, so a rejected pass does not throw out of the tick; a test asserts the callback does not throw and `onError` receives the error. |
| Injection boundary | Pass | Connectivity, interval (`schedule`/`cancel`), and the pass runner are injected and generic over the result and handle types, so no real timer or transport is embedded. |
| Decoupling | Pass | The scheduler is generic over `TResult`; it does not import the replay pass, so it composes with any pass runner. |
| Engine-free tests | Pass | All 5 tests use fakes and a `setTimeout(0)` microtask flush; no database, network, Tauri, or API is required. |
| Out-of-scope avoidance | Pass | The slice adds only the scheduler, its test, and the barrel export. No Tauri command, window, real timer, network service, or GraphQL change is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `c0b9112`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 16 tests pass (scheduler 5) |
| `pnpm --filter @sanctuary-os/desktop typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | All workspace tests pass (desktop 16; api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- Add a single desktop replay runtime assembly factory that, given all injected adapters, composes the migration/store, the replay pass binding, and this scheduler, so the Tauri shell only provides concrete adapters.
- Provide concrete interval (`setInterval`/`clearInterval`) and connectivity (`navigator.onLine`/Tauri events) adapters at the Tauri shell boundary.
- The Tauri shell, real SQLite client, network command service, and authenticated actor remain the final wiring slices, with Rust/tooling considerations.
