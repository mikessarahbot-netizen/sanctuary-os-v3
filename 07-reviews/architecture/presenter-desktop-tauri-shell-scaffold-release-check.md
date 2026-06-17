# Presenter Desktop Tauri Shell Scaffold Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `740d06d`

## Result

Pass with follow-ups. With user authorization to install required tooling, the Rust toolchain (rustup → stable 1.96.0) and the Tauri 2 CLI were installed, and `apps/desktop` was scaffolded into a real, compiling Tauri 2 desktop app. The Rust shell builds (`cargo build` and `cargo check` both succeed). This resolves the previously recorded Tauri-shell toolchain blocker. The shell does not yet bootstrap the TypeScript replay runtime — the SQLite client bridge and network command service wiring are the next slices — and the existing monorepo lint/typecheck/test gates are unaffected.

## Scope Reviewed

- `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`, `src/main.rs`, `src/lib.rs`
- `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/default.json`, `icons/*`
- `apps/desktop/web/index.html`
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json` (gate-scope confirmation)
- `06-tasks/blocked/2026-06-17-presenter-desktop-tauri-shell-blocked.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Toolchain installed | Pass | `rustc 1.96.0` and `cargo 1.96.0` available via the Homebrew `rustup` keg; `@tauri-apps/cli ^2.11.2` added to `apps/desktop` devDependencies. |
| Shell compiles | Pass | `cargo build` finished the `dev` profile (1m07s cold) and `cargo check` finished in 18s after the crate rename; the `sanctuary-os-presenter` crate builds against `tauri 2.11.2`. |
| App configuration | Pass | `tauri.conf.json` sets a real bundle identifier (`os.sanctuary.presenter`), a window title, and `frontendDist: ../web`; the static `web/index.html` exists so the build embeds a frontend. |
| Crate metadata | Pass | The generated placeholder metadata (`name = "app"`, "A Tauri App") was replaced with `sanctuary-os-presenter` and a real description/license. |
| Gate isolation | Pass | `apps/desktop/tsconfig.json` includes only `src/**/*.ts` and the root eslint glob is `.ts`-only, so the Rust shell and HTML frontend are outside lint/typecheck; all four workspaces stay green (db 140, api 212 + 2 skipped, desktop 18, church-context 5). |
| Build artifact hygiene | Pass | `src-tauri/.gitignore` excludes `/target/` and `/gen/schemas`; the commit staged 0 `target/` files. `Cargo.lock` is committed for reproducible builds. |
| Runtime wiring | Deferred | The shell compiles but does not yet construct the concrete adapters or call `createPresenterDesktopReplayRuntime`; this is intentionally the next slice. |

## Validation

| Command | Result |
| --- | --- |
| `cargo build` (src-tauri) | Pass (dev profile, exit 0) |
| `cargo check` (src-tauri) | Pass (18s) |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 212 + 2 skipped; desktop 18; church-context 5) |

## Follow-Ups

- Decide the desktop SQLite execution model — the replay runtime's `SqliteMigrationDatabaseClient` is synchronous (`node:sqlite`/`better-sqlite3`), which does not run in a Tauri webview. Either run the runtime in a Node sidecar (keeps the sync client) or introduce an async SQLite client backed by the Tauri SQL plugin (a client-interface refactor). Capture this as an ADR before wiring.
- Add a production network `PresenterCommandService` plus a concrete replay error classifier (pure TypeScript, testable) — independent of the SQLite-bridge decision and consumable by the runtime.
- Bundle the desktop frontend that imports the TS runtime, then have the Tauri shell construct the adapters and call `createPresenterDesktopReplayRuntime`.
- The shell is verified by compilation and by running the app, not by the unit-test gates; note this when reviewing.
