# NOW

## Task
Add the desktop sidecar process entry: wire a real `node:sqlite` database and `fetch` from the parsed env config into `startPresenterDesktopSidecar`, with a thin runnable `main`.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/src/sidecar-entry.ts`, `sidecar-config.ts`, `node-sqlite-client.ts`, and `graphql-transport.ts`
- Add `startPresenterDesktopSidecarFromEnv(env, deps?)`: parse the sidecar config, open a `node:sqlite` database at `config.sqliteFilePath`, wrap it as the migration client, adapt `globalThis.fetch` to `PresenterFetchLike`, and call `startPresenterDesktopSidecar` — returning the handle (keep the `node:sqlite` import injectable/dynamic so the module stays loadable without it)
- Add a thin runnable entry (`sidecar-main`) that calls the above with `process.env`, installs `SIGINT`/`SIGTERM` handlers to `stop()` and close the database, and is the only non-unit-tested shell
- Add a `fetch` adapter from `globalThis.fetch` to the `PresenterFetchLike` shape
- Add default tests for the `fetch` adapter and a `node:sqlite` availability-guarded smoke that runs `startPresenterDesktopSidecarFromEnv` against an in-memory path and replays a queued edit
- Keep this slice the process-entry wiring only; do not add the Tauri sidecar spawn config or UI (next slice)

## Out of scope
Tauri sidecar spawn/supervision config · desktop UI screens · deployment/packaging · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [x] Re-sync with the sidecar entry, config, and adapters
- [x] No fetch adapter needed — `globalThis.fetch` is structurally assignable to `PresenterFetchLike`
- [x] Add `startPresenterDesktopSidecarFromEnv` wiring `node:sqlite` (dynamic import, injectable) + fetch
- [x] Add a thin runnable `sidecar-main` entry with `SIGINT`/`SIGTERM` handling (no auto-run on import)
- [x] Add a `node:sqlite` availability-guarded smoke (parse env → open SQLite → replay → synced)
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the process-entry slice
- [ ] Session handoff

## Done when
`startPresenterDesktopSidecarFromEnv` wires a real `node:sqlite` database and `fetch` from env config into the sidecar, a thin `main` runs it with signal handling, the fetch adapter and a `node:sqlite` smoke pass, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the Tauri shell to spawn/supervise the sidecar process and add a minimal desktop status UI surfacing pending/conflict/failed queue entries — addressing any process-entry findings first.
