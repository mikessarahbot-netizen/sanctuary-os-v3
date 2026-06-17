# NOW

## Task
Expose the sidecar status over a localhost HTTP endpoint and render a minimal desktop status UI.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/src/replay-runtime.ts` (`getStatus`), `apps/desktop/src/sidecar-entry.ts`, and `apps/desktop/web/index.html`
- Add a small status HTTP handler (a pure `{ method, path } → { status, body }` adapter over `getStatus`, plus a `node:http` server factory bound to localhost) that serves the queue summary as JSON on GET; reuse the request/response-adapter style from the API http listener
- Wire the sidecar to start the status server on a configurable port (env `SANCTUARY_OS_PRESENTER_STATUS_PORT`, optional) and stop it with the sidecar
- Add a minimal status section to `apps/desktop/web/index.html` that polls the status endpoint and renders total / pending / synced / needs-attention (static-friendly; non-gate-tested)
- Add focused tests for the pure status handler (GET ok, wrong method/path) and a real listen+fetch smoke; default tests only
- Keep this slice the status endpoint + UI only; no operator retry/cancel actions yet

## Out of scope
Operator retry/cancel mutations from the UI · packaging · deployment · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the runtime getStatus, sidecar, and web frontend
- [ ] Add the pure status HTTP handler + `node:http` localhost server factory
- [ ] Wire the sidecar to start/stop the status server (configurable port)
- [ ] Add the minimal status UI section to web/index.html
- [ ] Add handler unit tests + a real listen+fetch smoke
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the status endpoint/UI slice
- [ ] Session handoff

## Done when
The sidecar serves the queue summary over a localhost HTTP endpoint (pure handler unit-tested + a listen smoke), the web frontend polls and renders it, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add operator retry/cancel actions (UI → sidecar → repository requeue/cancel) for conflict/failed entries, then move on to packaging — or address any status-endpoint findings first.
