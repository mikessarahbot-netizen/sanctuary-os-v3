# Presenter Local Sync Queue Status Summary Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The local sync queue `countByStatus` capability and the pure `summarizePresenterLocalSyncQueue` helper are complete and pushed (`82bc758`); release check `07-reviews/architecture/presenter-local-sync-queue-status-summary-release-check.md` (pass). All four workspaces are green (db 143, api 230 + 2 skipped, desktop 44, church-context 5).

This provides the status data the desktop sidecar needs to surface queue health.

Remaining (documented, none blocking):
1. **Sidecar status reporter** (current active task) — a `getStatus` on the runtime/sidecar that calls `countByStatus` + `summarizePresenterLocalSyncQueue` and returns the summary + last replay result. Gate-testable.
2. **Status IPC + UI** — a Tauri command/channel exposing the summary to the webview and a minimal UI rendering it (verified by running).
3. **Packaging** — bundle Node with the app / self-contained sidecar binary; wire `build:sidecar` into the Tauri build.
4. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).

The Presenter offline-edit feature is built end to end and launchable; what remains is observability (status reporter → IPC → UI), packaging, and other modules.

Open questions:
- None blocking.
