# NOW

## Task
Add a production network `PresenterCommandService` and a concrete replay error classifier (pure TypeScript) that the desktop shell injects into the replay runtime.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, the GraphQL presenter mutations under `apps/api/src/graphql/presenter`, the `PresenterCommandService` contract in `apps/api/src/services/presenter/contracts.ts`, and the replay error-classifier contract in `apps/desktop/src/replay-pass.ts`
- Add a network-backed `PresenterCommandService` (an injected `fetch`-style transport issuing the existing GraphQL Presenter mutations) that maps each command to its mutation and parses the typed result
- Add a concrete `PresenterDesktopReplayErrorClassifier` that maps transport/GraphQL error shapes to `conflict` (stale revision, validation, authorization, tenant mismatch) vs retryable `failed`, with safe, redacted messages
- Add focused unit tests using a fake transport for success, conflict, and retryable-failure paths, with no live network, database, Tauri, or event bus
- Keep the slice pure TypeScript and testable; do not start a live transport, scheduler loop, or Tauri runtime

## Out of scope
SQLite client bridge / runtime bootstrap (separate slice, pending the SQLite-execution-model ADR) · Tauri commands beyond the existing shell · running scheduler loop · desktop UI framework · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets

## Progress
- [ ] Re-sync with the GraphQL presenter mutations and command/classifier contracts
- [ ] Add the network `PresenterCommandService` over an injected transport
- [ ] Add the concrete replay error classifier
- [ ] Add focused unit tests (success / conflict / retryable failure)
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the network command service slice
- [ ] Session handoff

## Done when
A network `PresenterCommandService` issues the existing Presenter GraphQL mutations over an injected transport, a concrete error classifier maps errors to conflict vs retryable failure, both are covered by fake-transport unit tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Parallel decision to capture (ADR)
Desktop SQLite execution model: the runtime's `SqliteMigrationDatabaseClient` is synchronous (`node:sqlite`/`better-sqlite3`), which cannot run in a Tauri webview. Choose between a Node sidecar (keeps the synchronous client) and an async SQLite client backed by the Tauri SQL plugin (a client-interface refactor). Record the choice in `08-decisions/` before wiring the runtime bootstrap.

## Next task after this
Capture the SQLite-execution-model ADR, then bootstrap the desktop runtime: construct the chosen SQLite client, the network command service, the classifier, and the browser interval/connectivity/clock adapters, and call `createPresenterDesktopReplayRuntime` from the shell frontend.
