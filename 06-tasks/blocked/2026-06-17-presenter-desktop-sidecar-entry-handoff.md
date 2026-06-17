# Presenter Desktop Sidecar Entry Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The sidecar config loader, the `node:sqlite` migration-client wrapper, and `startPresenterDesktopSidecar` are complete and pushed (`5812888`); release check at `07-reviews/architecture/presenter-desktop-sidecar-entry-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 212 + 2 skipped, desktop 42, church-context 5).

The Presenter local sync queue offline-edit feature is now complete from storage through a runnable sidecar entry:
- `packages/db`: contracts, migration + migration runner, SQLite adapter + executor, persistence composition, replay decision.
- `apps/api`: replay coordinator + `PresenterReplayCommandExecutor`.
- `apps/desktop`: store composition root, replay pass, scheduler, runtime assembly, network executor, error classifier, fetch transport, runtime bootstrap, `node:sqlite` wrapper, sidecar config, and sidecar entry — proven by `node:sqlite` smokes (start → enqueue → replay → synced → stop).
- `apps/desktop/src-tauri`: a compiling Tauri 2 shell.

Two threads remain:
1. **API HTTP/GraphQL server transport** (the current active task) — a transport-agnostic request handler resolving the actor from the auth header, conveying `requestId`, executing the schema, and mapping service errors to the `extensions.code` conflict codes the desktop expects. This is gate-testable and gives the desktop sidecar a real endpoint.
2. **Desktop tail** — the thin process `main`, the Tauri sidecar spawn/supervision, and a minimal status UI. Mostly verified by running the app, not the unit-test gates.

Open questions:
- None blocking.
