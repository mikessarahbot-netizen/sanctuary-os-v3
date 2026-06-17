# Presenter Desktop Tauri Shell — BLOCKED

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: BLOCKED (toolchain + decision required).

## What is complete

The Presenter local sync queue offline-edit feature is complete and verified at the logic level across the monorepo (pushed through `9c64384`):

- `packages/db`: queue contracts, migration + migration runner, SQLite adapter + executor, persistence composition, replay decision (backoff/limits).
- `apps/api`: replay coordinator (queue operation → Presenter command), exposed via a focused `@sanctuary-os/api/presenter` export.
- `apps/desktop`: migrated store composition root, replay pass (with conflict classification), scheduler (offline gating + injected interval), and the runtime assembly factory.

All with no-live-engine default tests plus `node:sqlite` availability-guarded smokes; four green workspaces.

## The blocker

The next Presenter step is the Tauri desktop shell, which must supply the concrete adapters (SQLite client, `setInterval`/connectivity, authenticated actor, network-backed `PresenterCommandService`, error classifier) and call `createPresenterDesktopReplayRuntime`.

This cannot proceed in the current environment:

- `cargo` and `rustc` are not installed; Tauri requires the Rust toolchain.
- No Tauri CLI or npm `@tauri-apps/*` package is present.
- The shell is a native app, not unit-testable via the current lint/typecheck/test gates.

Installing a system-level Rust toolchain is an environment-modifying action that should be an explicit user decision, not done autonomously.

## Decision needed

Options for the next session/owner:
1. Install the Rust/Tauri toolchain (user-approved) and build the shell.
2. Pivot to another module that is pure-TypeScript buildable now (e.g., Play, Charts, Community+, or OBS contracts), re-syncing that module's plan first.
3. Define the production network `PresenterCommandService` contract and a concrete error classifier (pure-TS, no Tauri) as the next slice.
4. Build a desktop UI layer — requires scaffolding a UI framework in `apps/desktop` first (another decision).

## Open questions

- Is the Rust/Tauri toolchain expected to be installed in the build/runtime environment?
- What transport will the production `PresenterCommandService` use (HTTP, GraphQL), and what error shapes should map to conflict vs retryable failure?
