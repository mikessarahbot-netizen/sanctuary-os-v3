# Presenter Desktop Tauri Sidecar Spawn Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `60285e6`

## Result

Pass with follow-ups. The slice makes the Presenter replay sidecar a runnable artifact and has the Tauri shell launch it. An esbuild `build:sidecar` script bundles `sidecar-bin.ts` into `dist/presenter-sidecar.mjs`, and the Rust shell spawns `node <bundle>` on setup and kills it on exit. Spawning is env-guarded so the shell and CI still run without the sidecar. Verification is by build/compile (the bundle passes `node --check`, `cargo check` compiles) since this is runtime wiring outside the unit-test gates.

## Scope Reviewed

- `apps/desktop/src/sidecar-bin.ts`
- `apps/desktop/package.json` (`build:sidecar`, esbuild)
- `apps/desktop/src-tauri/src/lib.rs`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Runnable bundle | Pass | `build:sidecar` bundles the sidecar entry + workspace deps into `dist/presenter-sidecar.mjs` (node: builtins external); `node --check` confirms valid runnable JS. |
| Bin entry | Pass | `sidecar-bin.ts` runs `runPresenterDesktopSidecarMain`, logs a startup failure to stderr, and is never imported by the barrel (no import side effects). |
| Tauri spawn | Pass | The Rust shell spawns `node <SANCTUARY_OS_PRESENTER_SIDECAR_PATH>` on setup, stores the `Child`, and kills it on `RunEvent::Exit`; `cargo check` compiles. |
| Env guard | Pass | Spawning is skipped when the path env var is unset or `SANCTUARY_OS_PRESENTER_SIDECAR_DISABLED` is set, so the shell and CI build cleanly without the sidecar. |
| Gate isolation | Pass | The bundle output is gitignored (`dist/`); the new `sidecar-bin.ts` passes lint/typecheck; all four TS workspaces stay green (db 140, api 230 + 2 skipped, desktop 44, church-context 5). |
| Secret hygiene | Pass | No secret is committed; the sidecar reads config from the environment the shell passes through. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop build:sidecar` | Builds `dist/presenter-sidecar.mjs` |
| `node --check dist/presenter-sidecar.mjs` | Valid runnable JS |
| `cargo check` (src-tauri) | Compiles |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 140; api 230 + 2 skipped; desktop 44; church-context 5) |

## Follow-Ups

- Add a sidecar↔webview status channel (the sidecar reports queue counts / replay outcomes; the webview reads them via a Tauri command or a localhost status endpoint) and a minimal status UI.
- Make `build:sidecar` part of the Tauri `beforeBuildCommand`/`beforeDevCommand` and set `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` to the bundled path so the app self-wires.
- Package Node with the app (or compile the sidecar to a self-contained binary) for distribution; supervise restarts on sidecar crash.
- The spawn path is verified by compilation and running the app, not the unit-test gates.
