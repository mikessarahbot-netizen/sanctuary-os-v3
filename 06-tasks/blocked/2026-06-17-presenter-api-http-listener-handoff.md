# API Presenter GraphQL HTTP Listener Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The Presenter GraphQL HTTP listener is complete and pushed (`5162f9a`); release check at `07-reviews/architecture/presenter-api-graphql-http-listener-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 224 + 2 skipped, desktop 42, church-context 5).

The API now serves the Presenter GraphQL surface over `node:http` (proven by a real listen + `fetch` smoke), so the desktop sidecar's network executor has a real endpoint shape to target. Both ends of the offline-sync boundary now exist.

Remaining (documented, none blocking):
1. **Service-side conflict detection** (current active task) — the in-memory command service should throw `PresenterDomainError` for the conditions it can detect, completing the conflict path with real detection. Gate-testable.
2. **Process entry + deployment** — an env-driven `server.listen` entry and TLS/deploy config (out of the testable core).
3. **Desktop tail** — process `main`, Tauri sidecar spawn/supervision, minimal status UI.

The Presenter offline-edit feature is now built end to end on both ends (desktop runtime → network → API GraphQL server), including the typed-error conflict round-trip.

Open questions:
- None blocking.
