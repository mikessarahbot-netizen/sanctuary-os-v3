# NOW

## Task
Make the desktop sidecar runnable and have the Tauri Rust shell spawn it: a build step + sidecar bin entry, and Rust spawn/supervision (cargo-check verified).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/src/sidecar-main.ts`, `apps/desktop/package.json`, `apps/desktop/src-tauri/src/lib.rs`, and `tauri.conf.json`
- Add a `build` script (`tsc`) to `apps/desktop` producing `dist/`, and a thin `bin/presenter-sidecar` entry that imports and calls `runPresenterDesktopSidecarMain`; keep the build out of the default `lint`/`typecheck`/`test` gates but runnable via `pnpm --filter @sanctuary-os/desktop build`
- Update the Tauri Rust shell to spawn the sidecar process on setup (via `std::process::Command` running `node` against the built entry), passing the env through, and to terminate it on exit; keep the spawn behind a config/env guard so `cargo build` stays clean in CI
- Verify the Rust shell still compiles with `cargo check`/`cargo build`
- Keep this slice the spawn wiring only; the status IPC + UI are the next slice
- Do not check in secrets; the sidecar reads its config from the environment the shell passes

## Out of scope
Status IPC channel · desktop status UI · packaging/installers/code-signing · deployment config · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the sidecar main, desktop package, and Tauri Rust shell
- [ ] Add the desktop `build` script + sidecar bin entry
- [ ] Spawn/supervise the sidecar from the Tauri Rust shell setup
- [ ] Verify `cargo check`/`cargo build` and the desktop build
- [ ] Run lint, typecheck, and tests (TS gates unaffected)
- [ ] Commit and push the Tauri spawn slice
- [ ] Session handoff

## Done when
The desktop produces a runnable sidecar entry, the Tauri Rust shell spawns and terminates it, `cargo check` and the desktop build pass, the TS gates stay green, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add the sidecar↔webview status IPC and a minimal desktop status UI surfacing pending/conflict/failed queue entries with operator retry/cancel — addressing any spawn findings first.
