# Presenter Desktop Sidecar Process Entry Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The env-driven sidecar process entry (`startPresenterDesktopSidecarFromEnv`) and a thin runnable `main` are complete and pushed (`afe4ed1`); release check `07-reviews/architecture/presenter-desktop-sidecar-process-entry-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 230 + 2 skipped, desktop 44, church-context 5).

The Presenter offline-sync feature is now functionally complete and runnable as a Node process from env config (open SQLite → replay queued edits → API GraphQL server → conflict round-trip), proven by `node:sqlite` smokes.

Remaining (documented, none blocking):
1. **Desktop build + Tauri sidecar spawn** (current active task) — produce a runnable sidecar entry and spawn/supervise it from the Tauri Rust shell (cargo-check verified). The TS sidecar needs a build/packaging story.
2. **Status IPC + UI** — a sidecar↔webview channel and a minimal status UI.
3. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).

The remaining desktop work is mostly verified by compilation and running the app rather than the unit-test gates.

Open questions:
- None blocking.
