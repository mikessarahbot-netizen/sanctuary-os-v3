# Presenter Desktop Operator Actions Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `618591a`

## Result

Pass with follow-ups. The slice closes the conflict-resolution loop: the desktop runtime gains `requeueEntry`/`cancelEntry`, a pure POST `/actions` handler maps to them, the localhost server serves both `GET /status` and `POST /actions`, and the web frontend offers requeue/cancel controls. An operator can now resolve a `conflict`/`failed` entry from the UI.

## Scope Reviewed

- `apps/desktop/src/replay-runtime.ts` (`requeueEntry`/`cancelEntry`)
- `apps/desktop/src/status-server.ts` (action handler + combined server)
- `apps/desktop/src/status-server.test.ts`, `replay-runtime.test.ts`
- `apps/desktop/src/sidecar-runtime-env.ts`, `apps/desktop/web/index.html`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Runtime actions | Pass | `requeueEntry`/`cancelEntry` look up the entry, build the allowed transition from its current status, and call `repository.requeue`/`cancel` under the runtime actor; a `node:sqlite` smoke drives conflict → `requeueEntry` → `queued`. |
| Action handler | Pass | `handlePresenterActionHttpInvocation` validates the body with Zod, dispatches requeue/cancel, returns 200; 400 for malformed body, 405 for non-POST, 409 when the transition is rejected. Five unit tests. |
| Combined server | Pass | The localhost server reads the body and routes `GET /status` to the status handler and `POST /actions` to the action handler; the status smoke still passes. |
| UI | Pass | `web/index.html` adds an entry-id input with requeue/cancel buttons that POST to `/actions` and refresh the status. |
| Bundle intact | Pass | `build:sidecar` still bundles and `node --check` passes. |
| Gate isolation | Pass | Handlers/runtime are gate-tested; the static HTML is outside the TS gates; all four workspaces stay green (db 143, api 230 + 2 skipped, desktop 54, church-context 5). |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 54 tests pass |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 143; api 230 + 2 skipped; desktop 54; church-context 5) |
| `build:sidecar` + `node --check` | Builds, valid JS |

## Follow-Ups

- Surface the list of conflict/failed entries (ids) in the UI so operators do not have to type ids — extend the status payload with a needs-attention list.
- Package: bundle Node with the app (or a self-contained sidecar binary), wire `build:sidecar` into the Tauri `beforeBuildCommand`, and pass the status port from the shell to both the sidecar and the webview.
- The UI is verified by running the app, not the unit-test gates.
