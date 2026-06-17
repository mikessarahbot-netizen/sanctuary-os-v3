# Presenter Desktop Sidecar Config + Entry Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `5812888`

## Result

Pass with follow-ups. The slice adds the sidecar layer that turns the runtime bootstrap into a runnable process core: a Zod-validated config loader (parsed from an injected env record), a reusable `node:sqlite` → `SqliteMigrationDatabaseClient` wrapper, and `startPresenterDesktopSidecar`, which bootstraps the runtime, starts the scheduler, and returns a stop handle. The thin process `main` (reading `process.env`, opening the SQLite file, supplying `globalThis.fetch`) is intentionally deferred to the Tauri sidecar wiring slice. No Tauri spawn config, UI, live endpoint, or checked-in secret is added.

## Scope Reviewed

- `apps/desktop/src/sidecar-config.ts` + test
- `apps/desktop/src/node-sqlite-client.ts` + test
- `apps/desktop/src/sidecar-entry.ts` + `node:sqlite` smoke
- `apps/desktop/src/runtime-bootstrap.ts`
- `08-decisions/0005-desktop-presenter-replay-runs-in-node-with-node-sqlite.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Config validation | Pass | `parsePresenterDesktopSidecarConfig` reads twelve env keys, coerces numerics, validates the endpoint URL and actor roles, enforces the backoff cap ≥ base, and assembles a validated `AuthenticatedActor`; tests cover valid env, bad URL, unknown role, bad backoff, and a missing variable. |
| Injected env | Pass | The loader takes a `Record<string, string | undefined>` rather than touching `process.env`, so it is unit-testable and side-effect free. |
| Secret handling | Pass | The auth token is read from the environment and held in memory only; it is never logged or committed, and no default token exists. |
| SQLite wrapper | Pass | `wrapNodeSqliteMigrationDatabase` adapts a structural `node:sqlite`/`better-sqlite3` database to the synchronous migration client; a fake-database unit test verifies `exec`/`prepare`/`all`/`run` delegation. |
| Entry wiring | Pass | `startPresenterDesktopSidecar` calls the bootstrap with the config + injected client/fetch/connectivity, starts the scheduler, and returns `{ runtime, stop }`; `stop` cancels the scheduler. |
| End-to-end proof | Pass | A `node:sqlite` smoke starts the sidecar, enqueues an edit, runs one pass to `synced`, and stops cleanly (clearing the interval so the test process exits). |
| Default-gate safety | Pass | Config and wrapper tests run with no engine; the entry smoke is `node:sqlite` availability-guarded. All four workspaces stay green. |
| Out-of-scope avoidance | Pass | No process `main`, Tauri spawn config, UI, or live endpoint is added. |

## Validation

All gates passed on 2026-06-17 at commit `5812888`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 42 tests pass (9 new) |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 212 + 2 skipped; desktop 42; church-context 5) |

## Follow-Ups

- Add the thin process `main` (read `process.env` via the config loader, open the SQLite file with `node:sqlite`, pass `globalThis.fetch`, and call `startPresenterDesktopSidecar`); this is a small non-gate-testable shell.
- Wire the Tauri shell to spawn and supervise the sidecar binary/script (start/stop, crash recovery) and forward queue/replay status to the webview.
- Add a minimal desktop UI surfacing pending/conflict/failed entries and operator retry/cancel actions.
- The API HTTP/GraphQL server transport that honors bearer auth, `x-request-id` idempotency, and `extensions.code` conflict codes remains unbuilt and is required before a live endpoint exists.
