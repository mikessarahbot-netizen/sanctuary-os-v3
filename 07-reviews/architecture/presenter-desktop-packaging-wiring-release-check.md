# Presenter Desktop Packaging Wiring Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `8b00413`

## Result

Pass with follow-ups. The slice self-wires the desktop app: the Tauri build runs `build:sidecar`, the Rust shell defaults the sidecar's status port, and the webview reads a configurable port matching that default — so a built app starts the sidecar and the status UI reaches it without manual configuration. Bundling a Node runtime / a self-contained sidecar binary for distribution remains a deeper packaging step.

## Scope Reviewed

- `apps/desktop/src-tauri/tauri.conf.json` (`beforeBuildCommand`/`beforeDevCommand`)
- `apps/desktop/src-tauri/src/lib.rs` (status-port default)
- `apps/desktop/web/index.html` (configurable port)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Build wiring | Pass | `beforeBuildCommand`/`beforeDevCommand` run `pnpm build:sidecar`, so `dist/presenter-sidecar.mjs` exists before the app is built/run; `cargo check` (which does not run the command) still compiles. |
| Status-port default | Pass | The Rust shell sets `SANCTUARY_OS_PRESENTER_STATUS_PORT=7421` on the spawned sidecar when unset; an explicit env value still wins. |
| Webview config | Pass | The UI reads `window.__SANCTUARY_OS_PRESENTER_STATUS_PORT__` (default `7421`), so the shell and UI agree out of the box and a generated config can override. |
| Compilation | Pass | `cargo check` compiles; the TS gates stay green (db 143, api 230 + 2 skipped, desktop 54, church-context 5). |

## Validation

| Command | Result |
| --- | --- |
| `cargo check` (src-tauri) | Compiles |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 143; api 230 + 2 skipped; desktop 54; church-context 5) |

## Follow-Ups

- Bundle a Node runtime with the app (or compile the sidecar to a self-contained binary via Node SEA / a packer) and resolve `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` from the app's resources, so a distributed build does not depend on a system `node`.
- Add the bundled sidecar to `tauri.conf.json` `bundle.resources` and resolve its path in the Rust shell.
- Record the packaging approach as an ADR before the distribution build.
- The full `tauri build` and a real launch are verified by running, not the unit-test gates.
