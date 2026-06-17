# Presenter Service Conflict Detection Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The in-memory Presenter command service now throws typed `PresenterDomainError` for every detectable conflict condition, and the offline replay conflict round-trip is complete with real detection (pushed `897f4b5`; release check `07-reviews/architecture/presenter-service-conflict-detection-release-check.md`, pass). All four workspaces are green (db 140, api 230 + 2 skipped, desktop 42, church-context 5).

The Presenter offline-edit feature is now functionally complete across the network boundary, including conflict detection → `extensions.code` → desktop `conflict`.

Remaining (documented, none blocking):
1. **Desktop process entry** (current active task) — wire a real `node:sqlite` database + `fetch` from env config into `startPresenterDesktopSidecar`, with a thin runnable `main`.
2. **Tauri sidecar spawn + status UI** — spawn/supervise the sidecar from the Tauri shell and surface queue status (mostly verified by running, not unit tests).
3. **Other modules** — Play, Charts, Community+, OBS, auth, deployment (each needs its plan re-synced first).
4. Follow-ups: base-revision staleness detection (needs server revision tracking); the SQL command path's conflict detection; an env-driven API `server.listen` process entry.

Open questions:
- None blocking.
