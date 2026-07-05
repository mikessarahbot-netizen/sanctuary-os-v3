# Presenter Desktop Tauri Sidecar Spawn Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The Presenter replay sidecar is now a runnable esbuild bundle and the Tauri Rust shell spawns/supervises it (pushed `60285e6`; release check `07-reviews/architecture/presenter-desktop-tauri-sidecar-spawn-release-check.md`, pass with follow-ups). All four TS workspaces are green (db 140, api 230 + 2 skipped, desktop 44, church-context 5); `cargo check` compiles.

The Presenter offline-edit feature is now a launchable desktop app: the Tauri shell starts a Node sidecar that opens SQLite, replays queued edits to the API GraphQL server, and handles the conflict round-trip — all built end to end and gate-tested except the runtime spawn (verified by compile + run).

Remaining (documented, none blocking):
1. **Status summary** (current active task) — a repository count-by-status capability + a pure summary the sidecar can report (gate-testable).
2. **Status IPC + UI** — expose the summary to the webview and render it; operator retry/cancel.
3. **Packaging** — bundle Node with the app / compile a self-contained sidecar; wire `build:sidecar` into the Tauri build.
4. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).

Open questions:
- None blocking.
