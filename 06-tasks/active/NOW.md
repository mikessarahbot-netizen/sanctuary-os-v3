# NOW

## Task
Bootstrap the desktop Presenter replay runtime: a concrete fetch GraphQL transport, the SQLite-execution-model ADR, and a Node entry that wires every adapter and runs `createPresenterDesktopReplayRuntime`.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `07-reviews/architecture/presenter-desktop-network-replay-executor-release-check.md`, and the desktop runtime/adapters (`apps/desktop/src/replay-runtime.ts`, `network-command-service.ts`, `replay-error-classifier.ts`, `local-sync-queue-store.ts`)
- Record an ADR in `08-decisions/` for the desktop SQLite execution model: run the runtime in a Node context using `node:sqlite` (reusing the synchronous `SqliteMigrationDatabaseClient`), with the Tauri shell spawning it as a sidecar — chosen over an async Tauri-SQL-plugin client (which would force a sync→async client refactor)
- Add a concrete `fetch`-based `PresenterGraphqlTransport` (injected `fetch` + endpoint URL) that POSTs the GraphQL request and parses `{ data, errors }`, with fake-`fetch` unit tests
- Add a Node runtime bootstrap factory that builds the `node:sqlite`-backed migration client, the fetch transport + network executor, the error classifier, and the interval/connectivity/clock adapters, then calls `createPresenterDesktopReplayRuntime`
- Add default unit tests (no live engine/network) plus a `node:sqlite` availability-guarded smoke proving the bootstrap migrates and exposes a scheduler
- Keep this slice runtime-bootstrap-only; do not add the Tauri sidecar spawn, desktop UI, or a live network endpoint

## Out of scope
Tauri sidecar process wiring · desktop UI screens · live network endpoint/secrets · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · API GraphQL server transport

## Progress
- [x] Re-sync with the runtime, adapters, and executor release check
- [x] Record the SQLite execution-model ADR in `08-decisions/` (ADR 0005)
- [x] Add the concrete fetch GraphQL transport with fake-fetch tests
- [x] Add the Node runtime bootstrap factory
- [x] Add default tests and a `node:sqlite` availability-guarded smoke
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the bootstrap slice
- [ ] Session handoff

## Done when
The SQLite execution-model ADR is recorded, a fetch GraphQL transport and a Node bootstrap factory wire every adapter and call `createPresenterDesktopReplayRuntime`, default tests pass without a live engine/network plus a `node:sqlite` smoke proves migrate + scheduler, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the Tauri shell to spawn the Node runtime bootstrap as a sidecar (per the ADR) and surface queue/replay status in a minimal desktop UI — or address any bootstrap findings first.
