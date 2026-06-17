# NOW

## Task
Add operator retry/cancel for conflict/failed queue entries: a sidecar action endpoint mapping to repository requeue/cancel, plus UI controls.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/src/status-server.ts`, `apps/desktop/src/replay-runtime.ts`, the queue transition contracts in `packages/db/src/presenter-repository-contracts.ts`, and `apps/desktop/web/index.html`
- Add a pure action handler (`{ method, path, body } → { status, body }`) that accepts `POST` with `{ action: "requeue" | "cancel", queueEntryId, from }`, builds the allowed transition, and calls `repository.requeue`/`cancel` under the runtime's actor; validate the body with Zod and reject unknown actions / malformed bodies
- Add a `node:http` action server (or fold into the status server) bound to localhost; wire it into the env starter with the status server
- Add UI controls to `web/index.html` to requeue/cancel an entry by id (minimal form; non-gate-tested)
- Add focused tests for the action handler (requeue, cancel, bad body, wrong method) using a fake repository, plus a `node:sqlite` smoke that conflicts an entry then requeues it via the handler
- Keep this slice the action endpoint + minimal UI only; no auth beyond the sidecar's actor; no secrets

## Out of scope
Packaging · deployment · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets · planning/other modules

## Progress
- [x] Re-sync with the status server, runtime, and transition contracts
- [x] Add `requeueEntry`/`cancelEntry` to the runtime (getById → transition → requeue/cancel) and a pure action handler (Zod body, 200/400/405/409)
- [x] Route the action endpoint in the combined localhost server; env starter passes the runtime actions
- [x] Add requeue/cancel UI controls to web/index.html
- [x] Add 5 action-handler tests + a `node:sqlite` requeue smoke (conflict → requeueEntry → queued)
- [x] Run lint, typecheck, and tests; the sidecar bundle still builds
- [ ] Commit and push the operator-actions slice
- [ ] Session handoff

## Done when
The sidecar exposes a localhost action endpoint that requeues/cancels entries through the repository (pure handler unit-tested + a `node:sqlite` smoke), the UI offers the controls, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Package the desktop app (bundle Node / self-contained sidecar binary; wire `build:sidecar` into the Tauri build; pass the status port to the webview), then begin the next module — addressing any operator-action findings first.
