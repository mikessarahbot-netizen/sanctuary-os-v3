# Presenter Desktop Status Reporter Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop runtime `getStatus` reporter is complete and pushed (`c4f328f`); release check `07-reviews/architecture/presenter-desktop-status-reporter-release-check.md` (pass). All four workspaces are green (db 143, api 230 + 2 skipped, desktop 44, church-context 5).

`getStatus` returns the queue summary (`countByStatus` + `summarizePresenterLocalSyncQueue`) plus the last replay result — the observability surface for the desktop.

Remaining (documented, none blocking):
1. **Status endpoint + UI** (current active task) — serve `getStatus` over a localhost HTTP endpoint (gate-testable handler) and render a minimal status section in `web/index.html`.
2. **Operator retry/cancel** — UI → sidecar → repository requeue/cancel for conflict/failed entries.
3. **Packaging** — bundle Node with the app / self-contained sidecar; wire `build:sidecar` into the Tauri build.
4. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).

The Presenter offline-edit feature is built end to end, launchable, with conflict handling and status reporting; what remains is the status UI, operator actions, packaging, and other modules.

Open questions:
- None blocking.
