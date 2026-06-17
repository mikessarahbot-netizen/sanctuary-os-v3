# Presenter Desktop Replay Pass Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `86ddd21`

## Result

Pass with follow-ups. The slice adds `runPresenterDesktopReplayPass`, a single replay pass that reads ready entries, applies `decidePresenterLocalSyncQueueReplay`, marks each eligible entry `replaying`, maps it via the coordinator, calls the injected `PresenterCommandService`, and marks `synced` on success or `failed` on error; attempt-exhausted entries are marked `failed` without a service call. With this slice the Presenter local sync queue offline-edit pipeline is functional end to end at the logic level. It is a single pass — no timer loop, no transport of its own, no offline/online detection — and adds no Tauri/Rust, desktop window, or checked-in secret.

## Scope Reviewed

- `apps/desktop/src/replay-pass.ts`
- `apps/desktop/src/replay-pass.test.ts`
- `apps/desktop/src/index.ts`
- `apps/desktop/package.json`
- `apps/api/package.json`
- `packages/db/src/presenter-local-sync-queue-replay.ts`
- `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.ts`
- `05-plans/presenter-local-sync-queue-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| End-to-end wiring | Pass | The pass composes the repository read, the pure decision, the coordinator mapping, and the injected command service, then records the resulting status transition — the full offline-edit replay path. |
| Status lifecycle | Pass | Eligible entries are marked `replaying` then `synced`/`failed`; exhausted entries are marked `failed`; transitions use the entry's tenant/actor and reuse the entry `requestId` for the operation context. |
| Decision reuse | Pass | Backoff, attempt-limit, ordering, and conflict/failed blocking come from `decidePresenterLocalSyncQueueReplay`; the pass adds only execution and outcome recording. |
| Injected transport | Pass | The command service is injected (`PresenterCommandService`), so the pass has no HTTP/GraphQL coupling; production supplies a real client and tests a fake. |
| Focused api surface | Pass | The desktop imports the coordinator via a new `@sanctuary-os/api/presenter` subpath export, avoiding evaluation of the full api barrel (graphql/jobs/pg) at runtime; remaining api types are type-only imports. |
| Engine-free tests | Pass | Four tests use a fake repository and fake command service covering clean sync, error → failed, exhausted → failed, and backoff no-op; no database, network, Tauri, or API is required. |
| Gate integrity | Pass | Adding the `exports` field to `apps/api` and the `@sanctuary-os/api` desktop dependency left all four workspaces' lint/typecheck/test green. |
| Out-of-scope avoidance | Pass | The slice adds the pass, its test, the barrel export, and dependency wiring only. No timer loop, Tauri command, window, event bus, or GraphQL change is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `86ddd21`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 9 tests pass (3 scaffold + 2 store + 4 replay pass) |
| `pnpm --filter @sanctuary-os/desktop typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | All workspace tests pass (desktop 9; api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- Classify command-service errors: stale revision, validation, authorization, tenant mismatch, and destructive-operation attempts should become `conflict` (with details) rather than `failed`; transient transport errors should remain retryable `failed` with backoff. The pass currently marks every error `failed`, which safely stops the presentation but loses the richer conflict signal.
- Add a timer/interval wrapper around the pass plus offline/online detection as the desktop replay runtime.
- Wire a real network-backed `PresenterCommandService` and an authenticated actor at desktop startup once the Tauri shell exists.
