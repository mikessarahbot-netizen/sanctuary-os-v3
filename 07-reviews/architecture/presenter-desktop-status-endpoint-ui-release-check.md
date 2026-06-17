# Presenter Desktop Status Endpoint + UI Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `8d0c661`

## Result

Pass with follow-ups. The slice surfaces the queue status to the operator: a localhost status HTTP endpoint over `runtime.getStatus` and a polling status panel in the Tauri web frontend. The request/response handler is pure and gate-tested; the env starter launches the server when a status port is configured; the UI renders total / pending / synced / needs-attention.

## Scope Reviewed

- `apps/desktop/src/status-server.ts` + `status-server.test.ts`
- `apps/desktop/src/sidecar-runtime-env.ts` (status wiring)
- `apps/desktop/web/index.html` (status UI)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Pure handler | Pass | `handlePresenterStatusHttpInvocation` serves the status JSON on `GET <path>`, 404 for other paths, 405 for non-GET; three unit tests cover these. |
| Real HTTP smoke | Pass | A server on an ephemeral port serves a real `fetch` GET returning the status object. |
| Localhost + CORS | Pass | The server binds `127.0.0.1` and sets a permissive `access-control-allow-origin` so the webview can poll it; only queue counts are exposed (no secret). |
| Sidecar wiring | Pass | The env starter starts the status server only when `SANCTUARY_OS_PRESENTER_STATUS_PORT` is set and closes it in the handle's `stop`, so the runtime smokes (which do not set it) avoid port conflicts. |
| UI | Pass | `web/index.html` polls the endpoint every 5s, renders the four totals, and degrades to "Replay sidecar is offline." on error. |
| Bundle intact | Pass | `build:sidecar` still bundles and `node --check` passes with the status server included. |
| Gate isolation | Pass | The handler/wiring are gate-tested; the static HTML is outside the TS gates; all four workspaces stay green (db 143, api 230 + 2 skipped, desktop 48, church-context 5). |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test -- status-server.test.ts` | 4 tests pass |
| `pnpm --filter @sanctuary-os/desktop build:sidecar` + `node --check` | Builds, valid JS |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 143; api 230 + 2 skipped; desktop 48; church-context 5) |

## Follow-Ups

- Add operator retry/cancel: a sidecar endpoint (POST) mapping to `repository.requeue`/`cancel` for conflict/failed entries, and UI controls; gate-test the action handler.
- Pass the status port from the Tauri shell to both the sidecar (env) and the webview (so the UI port is not hardcoded to 7421).
- The UI rendering is verified by running the app, not the unit-test gates.
