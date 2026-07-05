# Presenter Desktop Tauri Shell — RESOLVED

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: RESOLVED (toolchain installed, shell scaffolded and compiling).

## Resolution

With user authorization to install required tooling, the previous toolchain blocker is cleared:

- Installed the Rust toolchain via the Homebrew `rustup` keg → stable `1.96.0` (`cargo`/`rustc` available).
- Added `@tauri-apps/cli ^2.11.2` to `apps/desktop`.
- Scaffolded `apps/desktop/src-tauri` (Tauri 2) with a real bundle identifier (`os.sanctuary.presenter`), a static `web/` frontend, default capabilities/icons, and a `tauri` package script.
- Verified the shell compiles: `cargo build` (dev profile) and `cargo check` both succeed.
- Confirmed the monorepo gates are unaffected (db 140, api 212 + 2 skipped, desktop 18, church-context 5).

Pushed as `740d06d`; release check at `07-reviews/architecture/presenter-desktop-tauri-shell-scaffold-release-check.md`.

## Remaining work (now tracked in `06-tasks/active/NOW.md`)

The shell compiles but does not yet run the TypeScript replay runtime. Two follow-on threads:

1. Network `PresenterCommandService` + concrete replay error classifier (pure TypeScript, testable) — the current active task.
2. Desktop SQLite execution model ADR + runtime bootstrap — the synchronous `SqliteMigrationDatabaseClient` cannot run in a Tauri webview, so choose a Node sidecar (keeps the sync client) vs an async Tauri-SQL-plugin client (interface refactor), record it in `08-decisions/`, then wire `createPresenterDesktopReplayRuntime` from the frontend.

## Open questions

- What transport does the production API expose for desktop replay (the existing GraphQL endpoint), and what GraphQL error shapes should map to conflict vs retryable failure?
- Sidecar vs async-client for desktop SQLite (the ADR above).
