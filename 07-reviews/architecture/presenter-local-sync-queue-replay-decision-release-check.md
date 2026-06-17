# Presenter Local Sync Queue Replay Decision Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `eedd0a6`

## Result

Pass with follow-ups. The slice adds `decidePresenterLocalSyncQueueReplay`, a pure scheduling decision that layers a Zod-validated exponential-backoff and attempt-limit policy on top of the existing `listPresenterLocalSyncQueueEntriesReadyForReplay` ordering/blocking helper. It returns `eligible`, `waiting` (with next-eligible time), and `exhausted` sets, deciding one head entry per presentation. It is decision logic only: no scheduler loop, timer, Tauri command, event-bus wiring, live API replay, GraphQL change, or checked-in secret is introduced.

## Scope Reviewed

- `packages/db/src/presenter-local-sync-queue-replay.ts`
- `packages/db/src/presenter-local-sync-queue-replay.test.ts`
- `packages/db/src/presenter-repository-contracts.ts`
- `packages/db/src/index.ts`
- `05-plans/presenter-local-sync-queue-plan.md`
- `05-plans/presenter-local-sync-queue-storage-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Policy validation | Pass | `PresenterLocalSyncQueueReplayPolicySchema` requires a positive base/cap, multiplier `>= 1`, and a positive integer max-attempts, and a `superRefine` rejects a cap below the base; a test covers the rejection. |
| Ordering reuse | Pass | The decision delegates ordering and conflict/failed blocking to `listPresenterLocalSyncQueueEntriesReadyForReplay`, so it inherits the established replay order and blocking semantics rather than reimplementing them. |
| One entry per presentation | Pass | A `decidedPresentationKeys` set ensures only the earliest-queued entry per `tenant:presentation` is decided, matching the in-order one-at-a-time replay rule; a test asserts only the head entry is eligible. |
| Backoff gating | Pass | Retried entries (`attemptCount > 0`) are held until `lastAttemptedAt + min(cap, base * multiplier^(attemptCount-1))`; tests cover holding before the window, eligibility after it, and the cap. |
| Attempt-limit exhaustion | Pass | Entries at or beyond `maxAttempts` are surfaced in `exhausted` and never made eligible, leaving the failed-marking decision to the caller (no automatic API call). |
| Conflict/failed blocking | Pass | A queued entry behind a `conflict` entry for the same presentation is excluded, proven by a test that yields empty `eligible`/`waiting`. |
| Purity | Pass | The function performs no I/O, opens no connection, and starts no timer; it derives times from the injected `now` and entry timestamps only. |
| No-integration tests | Pass | All 9 tests are pure and need no database, network, Tauri, event bus, or API. |
| Out-of-scope avoidance | Pass | The slice adds only the decision module, its test, and the barrel export. No scheduler loop, desktop code, Tauri command, event bus, API/GraphQL change, or vendor integration is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `eedd0a6`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- presenter-local-sync-queue-replay.test.ts` | 9 tests pass |
| `pnpm --filter @sanctuary-os/db typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 3 packages) |
| `pnpm test` | All workspace tests pass (db 140; api 204 + 2 skipped; church-context 5) |

## Follow-Ups

- Add a replay coordinator that maps an eligible queue entry to the existing Presenter service/API command shape (actor/request/tenant scope, `requestId` idempotency) as pure mapping logic in `apps/api`, before any live replay transport.
- Mark `exhausted` entries `failed` and `waiting` re-evaluation timing belong to the future desktop replay scheduler runtime, which consumes this decision.
- Scaffolding `apps/desktop` as its own workspace remains the gating step before the decision, persistence selection, and migration runner are wired into a desktop composition root.
