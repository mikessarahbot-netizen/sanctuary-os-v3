# NOW

## Task
Add the desktop Presenter sidecar entry: a Zod-validated runtime config loader and a Node entry that builds a real `node:sqlite` client and runs the runtime bootstrap.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `08-decisions/0005-desktop-presenter-replay-runs-in-node-with-node-sqlite.md`, `07-reviews/architecture/presenter-desktop-runtime-bootstrap-release-check.md`, and `apps/desktop/src/runtime-bootstrap.ts`
- Add a Zod-validated sidecar runtime config (GraphQL endpoint URL, replay interval, replay policy, local SQLite file path, tenant/actor identity, request-id header name) parsed from an injected env record, with default and rejection tests
- Add a reusable `node:sqlite` → `SqliteMigrationDatabaseClient` wrapper helper (so the entry and smokes share one wrapper)
- Add a Node sidecar entry function that, given a parsed config + injected SQLite client + fetch + auth token, calls `createPresenterDesktopRuntimeBootstrap` and starts the scheduler, returning a stop handle; keep the actual process `main`/stdin-stdout protocol thin and out of scope for now
- Add default unit tests for config parsing and entry wiring (fake client/fetch) plus a `node:sqlite` availability-guarded smoke
- Do not add the Tauri sidecar spawn config or UI yet (next slice); no checked-in secrets

## Out of scope
Tauri sidecar spawn/supervision config · desktop UI screens · live network endpoint/secrets · API GraphQL server transport · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config

## Progress
- [ ] Re-sync with the bootstrap and ADR 0005
- [ ] Add the Zod sidecar config loader with tests
- [ ] Add the `node:sqlite` migration-client wrapper helper
- [ ] Add the sidecar entry function with tests + a `node:sqlite` smoke
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the sidecar entry slice
- [ ] Session handoff

## Done when
A Zod-validated sidecar config loader, a reusable `node:sqlite` client wrapper, and a sidecar entry that runs the bootstrap and starts the scheduler are covered by default tests plus a `node:sqlite` smoke, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the Tauri shell to spawn and supervise the sidecar (start/stop, crash recovery) and add a minimal desktop UI surfacing queue/replay status — or address any sidecar-entry findings first. Separately, the API HTTP/GraphQL server transport remains unbuilt and is required for a live endpoint.
