# API Presenter GraphQL Transport Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The API's GraphQL execution layer is in: an executable Presenter schema (`createPresenterGraphqlSchema`) and a transport-agnostic request handler (`createPresenterGraphqlRequestHandler`) are complete and pushed (`4db0fb8`); release check at `07-reviews/architecture/presenter-api-graphql-transport-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 217 + 2 skipped, desktop 42, church-context 5).

This closes the gap found earlier (the API had SDL + resolvers but no engine). The handler resolves the actor from the auth header, conveys `requestId`, executes the schema, and redacts resolver errors while preserving `extensions.code` — matching the conventions the desktop network executor already assumes.

Remaining threads:
1. **Typed Presenter domain errors + conflict-code mapping** (the current active task) — the services throw generic errors today, so no conflict codes are emitted; adding typed errors completes the offline conflict round-trip. Gate-testable via the transport handler.
2. **Concrete Node `http` listener** — a thin binding (read body → handler → write status/JSON) so the API actually serves requests.
3. **Desktop tail** — process `main`, Tauri sidecar spawn/supervision, and a minimal status UI.

The full Presenter offline-edit path is now built end to end across all four workspaces; what remains is the typed-error round-trip, two thin runtime bindings (API http listener, desktop process main), and the Tauri/UI shell wiring.

Open questions:
- None blocking.
