# NOW

## Task
Record the desktop Node-runtime packaging ADR (how the sidecar is shipped for distribution), closing the Presenter desktop packaging thread.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `08-decisions/` (ADR format), `apps/desktop/package.json` (`build:sidecar`), `apps/desktop/src-tauri/src/lib.rs`, and `tauri.conf.json`
- Write an ADR in `08-decisions/` choosing the desktop sidecar distribution approach: ship the esbuild bundle and run it with a Node runtime that is bundled as a Tauri external binary / sidecar (Node SEA single-executable or a packed Node), resolving the path from the app resources — versus relying on a system `node` (dev only). Record context, decision, and consequences
- Note the concrete follow-up wiring (add the sidecar binary to `bundle.resources`, resolve `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` from resources, CI step to produce the binary) without implementing the binary packaging in this slice
- Keep this slice the ADR only; no code changes

## Out of scope
Implementing the Node-runtime binary packaging / code-signing / CI release · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets · other modules

## Progress
- [x] Re-sync with the packaging wiring and ADR format
- [x] Write the desktop Node-runtime packaging ADR in `08-decisions/` (ADR 0006: Node SEA binary as a Tauri external bin)
- [x] Run lint, typecheck, and tests (docs-only; gates unaffected)
- [ ] Commit and push the ADR
- [ ] Session handoff

## Done when
The Node-runtime packaging ADR is recorded with context/decision/consequences and concrete follow-up wiring, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Begin the next module. Only Planning and Presenter have plans in `05-plans/`; Play, Charts, Community+, and OBS need a module plan authored first (from `00-product/vision.md` + `01-architecture/system-map.md`) before slice-by-slice implementation. Re-sync the chosen module's intent, author its plan, then build.
