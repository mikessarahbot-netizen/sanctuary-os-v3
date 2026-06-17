# Presenter Desktop Replay Conflict Classification Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `ffd90d7`

## Result

Pass with follow-ups. The slice routes command-service errors in the replay pass through an injected `PresenterDesktopReplayErrorClassifier`: a `conflict` classification records `markConflict` with validated conflict details (transition `replaying -> conflict`), while a `failed` classification stays a retryable `markFailed`. The default classifier treats every error as `failed`. The pass result now reports conflicted entries. This completes the replay pass's correctness against the queue plan's conflict-vs-failure distinction. It adds no timer loop, offline/online detection, Tauri/Rust, or checked-in secret.

## Scope Reviewed

- `apps/desktop/src/replay-pass.ts`
- `apps/desktop/src/replay-pass.test.ts`
- `packages/db/src/presenter-repository-contracts.ts` (conflict detail + `markConflict` contract)
- `05-plans/presenter-local-sync-queue-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Classifier contract | Pass | `PresenterDesktopReplayErrorClassification` is a discriminated union (`conflict` with `PresenterLocalSyncConflictDetailPersistence`, or `failed` with a safe message); `PresenterDesktopReplayErrorClassifier` receives the error and the entry. |
| Default behavior | Pass | When no classifier is injected, errors default to `failed` with the configured safe message, preserving the prior safe-stop behavior; an existing test still passes. |
| Conflict path | Pass | A `conflict` classification calls `markConflict` with the validated details and the `replaying -> conflict` transition; a test asserts the recorded conflict detail and status. |
| Retryable path | Pass | A `failed` classification calls `markFailed` with the classifier-supplied safe message; a test asserts the message is used. |
| Result reporting | Pass | The pass result adds a `conflicted` array alongside `synced`/`failed`/`exhausted`, so callers can surface conflicts for review. |
| Plan alignment | Pass | Matches the queue plan: stale revision/validation/authorization/tenant-mismatch are intended conflicts (operator review), transient transport errors are retryable failures. |
| Injection boundary | Pass | The classifier is injected, so the concrete error shapes of the future network command service are mapped at the desktop edge, not hard-coded in the pass. |
| Engine-free tests | Pass | All replay-pass tests use fakes; no database, network, Tauri, or API is required. |
| Out-of-scope avoidance | Pass | The slice modifies only the replay pass and its test. No timer loop, Tauri command, window, event bus, or GraphQL change is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `ffd90d7`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 11 tests pass (replay pass now 6) |
| `pnpm --filter @sanctuary-os/desktop typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | All workspace tests pass (desktop 11; api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- Add a desktop replay scheduler wrapper (interval + offline/online gating) around the pass, with injected timer/connectivity so it stays testable.
- Provide a concrete classifier once the network `PresenterCommandService` exists, mapping its error shapes (HTTP status, GraphQL error codes, revision mismatch) to conflict kinds.
- The actual Tauri shell, window management, and OS packaging remain separate later slices with their own tooling considerations.
