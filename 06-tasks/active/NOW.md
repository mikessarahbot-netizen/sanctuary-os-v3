# NOW

## Status
Presenter local sync queue offline-edit feature is complete at the logic level. The next step (desktop Tauri shell) is BLOCKED — see `06-tasks/blocked/2026-06-17-presenter-desktop-tauri-shell-blocked.md`. A direction decision is required.

## What was completed (pushed through `9c64384` + release checks)
- `packages/db`: queue contracts, migration + SQLite migration runner, SQLite repository adapter + executor, persistence composition, replay decision (backoff/attempt limits).
- `apps/api`: replay coordinator (queue operation → Presenter command), via a focused `@sanctuary-os/api/presenter` export.
- `apps/desktop`: scaffolded workspace, migrated store composition root, replay pass (with conflict-vs-failure classification), replay scheduler (offline gating + injected interval), and the runtime assembly factory.
- All with no-live-engine default tests plus `node:sqlite` availability-guarded smokes. Four green workspaces (db 140, api 212 + 2 skipped, desktop 18, church-context 5).

## Why the next step is blocked
The Tauri shell supplies the concrete adapters and calls `createPresenterDesktopReplayRuntime`, but `cargo`/`rustc` are not installed in this environment and Tauri requires the Rust toolchain. Installing a system toolchain is a user decision; the shell is also not unit-testable via the current gates.

## Decision required (pick the next direction)
1. Install the Rust/Tauri toolchain (user-approved) and build the desktop shell.
2. Pivot to another pure-TypeScript module now (Play, Charts, Community+, or OBS contracts), re-syncing that module's plan first.
3. Define the production network `PresenterCommandService` contract + concrete error classifier (pure-TS, no Tauri).
4. Scaffold a desktop UI layer (requires choosing/scaffolding a UI framework first).

## Done when
A direction is chosen and a new active task is written here for it.
