# NOW

## Task
Wire the desktop packaging: build the sidecar as part of the Tauri build and pass the status port from the shell to both the sidecar and the webview.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/lib.rs`, and `apps/desktop/web/index.html`
- Set the Tauri `build.beforeBuildCommand` (and `beforeDevCommand`) to run `pnpm build:sidecar` so the bundle exists before the app is built
- Have the Rust shell pass `SANCTUARY_OS_PRESENTER_STATUS_PORT` (a default constant) to the spawned sidecar, and resolve the bundled sidecar path relative to the app resources when `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` is unset
- Make the webview status port configurable instead of hardcoded: inject it via a generated `web/config.js` written by `build:sidecar` (or a small build step) so the UI and the shell agree on the port
- Verify `cargo check` still compiles and the bundle builds; keep the TS gates green
- Out of scope: bundling a Node runtime / self-contained binary / code-signing (a deeper deployment task); document it as the remaining packaging step

## Out of scope
Node-runtime bundling / self-contained sidecar binary · code-signing / installers · CI release pipeline · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets · other modules

## Progress
- [x] Re-sync with the desktop package, Tauri config, Rust shell, and web frontend
- [x] Wire `build:sidecar` into the Tauri `beforeBuildCommand`/`beforeDevCommand`
- [x] Pass the status port default (`7421`) from the Rust shell to the spawned sidecar (explicit env still wins)
- [x] Make the webview status port configurable (reads `window.__SANCTUARY_OS_PRESENTER_STATUS_PORT__`, default 7421 matching the shell)
- [x] Verify `cargo check` compiles and the TS gates pass
- [ ] Commit and push the packaging-wiring slice
- [ ] Session handoff

## Done when
The Tauri build runs `build:sidecar`, the shell and webview agree on the status port via configuration (not a hardcoded constant), `cargo check` and the bundle build pass, the TS gates stay green, the slice is committed and pushed, and handoff documents identify the exact next task (a Node-runtime/self-contained packaging step, then the next module).

## Next task after this
Decide and document the Node-runtime packaging approach (bundle Node / self-contained binary) for distribution; then begin the next module (re-sync its plan first). Address any packaging-wiring findings first.
