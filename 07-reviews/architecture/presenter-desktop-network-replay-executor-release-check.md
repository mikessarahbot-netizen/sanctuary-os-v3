# Presenter Desktop Network Replay Executor + Error Classifier Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `a3e4e0b`

## Result

Pass with follow-ups. The slice adds a network-backed Presenter replay executor that issues the existing GraphQL mutations over an injected transport, plus a concrete error classifier mapping GraphQL error codes to conflict vs retryable failure. It also introduces the narrower `PresenterReplayCommandExecutor` interface, because the GraphQL mutation result types are truncated projections and replay only needs success/failure. Both the in-process `PresenterCommandService` and the network executor satisfy it, so the replay pass/runtime are now transport-agnostic. The slice is pure TypeScript with fake-transport tests; it adds no live network, scheduler loop, Tauri runtime, or checked-in secret.

## Scope Reviewed

- `apps/api/src/services/presenter/replay-command-executor.ts`
- `apps/desktop/src/network-command-service.ts`
- `apps/desktop/src/replay-error-classifier.ts`
- `apps/desktop/src/network-command-service.test.ts`, `replay-error-classifier.test.ts`
- `apps/desktop/src/replay-pass.ts`, `replay-runtime.ts` (executor-interface refactor)
- `apps/api/src/graphql/presenter.ts` (mutation SDL)
- `05-plans/presenter-local-sync-queue-plan.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Transport-agnostic interface | Pass | `PresenterReplayCommandExecutor` exposes the six approved commands returning `Promise<unknown>`; both `PresenterCommandService` (full aggregates) and the network executor (no result) are assignable, and the replay pass/runtime now depend on it with their existing tests unchanged and green. |
| Truncated-projection handling | Pass | The SDL exposes only `blockId`/`kind` on blocks and `name`/`tenantId`/`themeId` on themes, so a network client cannot rebuild a full aggregate; the executor selects a minimal confirmation field per mutation and returns nothing on success rather than fabricating a result. |
| Idempotency + auth | Pass | Each command sends `Authorization: Bearer <token>` (from the injected token provider, awaited) and the entry's `requestId` as an idempotency header (default `x-request-id`, overridable); a test asserts both. |
| Error surfacing | Pass | GraphQL `errors` raise a typed `PresenterNetworkReplayError` carrying the errors and the first `extensions.code`; missing data also raises it. |
| Conflict classification | Pass | Known codes (`STALE_PRESENTATION`, `MISSING_SLIDE`, `THEME_MISMATCH`, `OUTPUT_TARGET_MISMATCH`, `VALIDATION_FAILED`, `AUTHORIZATION_FAILED`) map to the conflict kinds with redacted safe messages and a `serverRevision` from extensions (or `unknown`); unknown/non-network errors stay retryable `failed`. |
| Redaction | Pass | The classifier never surfaces raw server error text; conflict and failure messages are fixed, operator-safe strings. |
| Pure + tested | Pass | 9 new fake-transport/unit tests; no live network, database, Tauri, or event bus. |
| Out-of-scope avoidance | Pass | No live transport, scheduler loop, Tauri command, SQLite bridge, or GraphQL server change is added. |
| Checked-in secrets | Pass | No tokens, endpoints, or credentials are committed; the token and transport are injected. |

## Validation

All gates passed on 2026-06-17 at commit `a3e4e0b`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 27 tests pass (9 new) |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 212 + 2 skipped; desktop 27; church-context 5) |

## Follow-Ups

- Add a concrete `fetch`-based `PresenterGraphqlTransport` (endpoint + injected `fetch`) so the executor can reach a real GraphQL endpoint; testable with a fake `fetch`.
- Record the desktop SQLite execution-model ADR (recommend a Node context using `node:sqlite` so the synchronous client is reused, with the Tauri shell spawning it as a sidecar) in `08-decisions/`.
- Bootstrap the runtime: wire the SQLite client, the fetch transport + network executor, the classifier, and interval/connectivity/clock adapters, then call `createPresenterDesktopReplayRuntime`.
- The server must implement the assumed conventions (bearer auth, `x-request-id` idempotency, `extensions.code` conflict codes) when the API HTTP transport is built.
