# Presenter Desktop Sidecar Process Entry Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `afe4ed1`

## Result

Pass with follow-ups. The slice adds the env-driven process entry that turns the sidecar runtime into something runnable: `startPresenterDesktopSidecarFromEnv` parses the config from an environment record, opens a `node:sqlite` database at the configured path (dynamic import, injectable for tests), and starts the sidecar with `globalThis.fetch` — which is structurally assignable to `PresenterFetchLike`, so no adapter is needed. A thin `runPresenterDesktopSidecarMain` runs it from `process.env` with signal handlers. The only non-unit-tested code is the thin `main`; everything else is covered by a `node:sqlite` smoke.

## Scope Reviewed

- `apps/desktop/src/sidecar-runtime-env.ts` + `sidecar-runtime-env.test.ts`
- `apps/desktop/src/sidecar-main.ts`
- `apps/desktop/src/sidecar-entry.ts`, `node-sqlite-client.ts`, `graphql-transport.ts`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Env wiring | Pass | `startPresenterDesktopSidecarFromEnv` parses the config, opens SQLite, and starts the sidecar; the `node:sqlite` open and connectivity are injectable. |
| No fetch adapter | Pass | `globalThis.fetch` is structurally assignable to `PresenterFetchLike`, so it is passed directly (verified by typecheck). |
| Dynamic engine load | Pass | `node:sqlite` is dynamically imported only on the default path, so the module stays loadable without the engine; tests inject `createDatabase`. |
| Runnable main | Pass | `runPresenterDesktopSidecarMain` starts from `process.env`, installs `SIGINT`/`SIGTERM` → `stop()`, and does not auto-run on import (no side effects). |
| End-to-end smoke | Pass | A `node:sqlite` smoke parses the env, opens an in-memory database, enqueues an edit, and replays it to `synced` through the assembled sidecar. |
| Gate safety | Pass | Default tests need no engine/network; all four workspaces stay green (db 140, api 230 + 2 skipped, desktop 44, church-context 5). |

## Validation

All gates passed on 2026-06-17 at commit `afe4ed1`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test -- sidecar-runtime-env.test.ts` | 2 tests pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 230 + 2 skipped; desktop 44; church-context 5) |

## Follow-Ups

- Desktop build/packaging: decide how the TypeScript sidecar becomes a runnable artifact the Tauri shell can spawn (a `tsc`/bundle build producing a `node`-runnable entry, or a packaged binary).
- Tauri sidecar spawn: have the Rust shell spawn/supervise the sidecar process (start/stop, crash recovery) and establish an IPC channel for status.
- Minimal desktop status UI surfacing pending/conflict/failed queue entries and operator retry/cancel actions.
