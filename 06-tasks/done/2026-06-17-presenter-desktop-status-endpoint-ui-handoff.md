# Presenter Desktop Status Endpoint + UI Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop status endpoint and status UI are complete and pushed (`8d0c661`); release check `07-reviews/architecture/presenter-desktop-status-endpoint-ui-release-check.md` (pass with follow-ups). All four workspaces are green (db 143, api 230 + 2 skipped, desktop 48, church-context 5); the sidecar bundle builds.

The desktop app now shows live queue status (total / pending / synced / needs-attention) polled from the sidecar's localhost endpoint.

Remaining (documented, none blocking):
1. **Operator retry/cancel** (current active task) — a sidecar action endpoint mapping to `repository.requeue`/`cancel` for conflict/failed entries, plus UI controls. Gate-testable handler.
2. **Packaging** — bundle Node with the app / self-contained sidecar binary; wire `build:sidecar` into the Tauri build; pass the status port to the webview (currently hardcoded 7421).
3. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).

The Presenter offline-edit feature is built end to end, launchable, with conflict handling, status reporting, and a status UI; what remains is operator actions, packaging, and other modules.

Open questions:
- None blocking.
