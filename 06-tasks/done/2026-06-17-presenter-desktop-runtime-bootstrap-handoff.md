# Presenter Desktop Runtime Bootstrap Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop runtime bootstrap (fetch GraphQL transport + `createPresenterDesktopRuntimeBootstrap`) and ADR 0005 are complete and pushed (`febf648`); release check at `07-reviews/architecture/presenter-desktop-runtime-bootstrap-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 212 + 2 skipped, desktop 33, church-context 5).

The Presenter local sync queue offline-edit feature is now runnable end to end at the runtime level:
- `packages/db`: queue contracts, migration + migration runner, SQLite adapter + executor, persistence composition, replay decision.
- `apps/api`: replay coordinator + the transport-agnostic `PresenterReplayCommandExecutor`.
- `apps/desktop`: migrated store composition root, replay pass, scheduler, runtime assembly, network executor, error classifier, fetch transport, and the runtime bootstrap — proven by a `node:sqlite` smoke (migrate → enqueue → replay → synced).
- `apps/desktop/src-tauri`: a compiling Tauri 2 shell.

The next session should add the sidecar entry: a Zod runtime-config loader, a reusable `node:sqlite` → `SqliteMigrationDatabaseClient` wrapper, and a Node entry that builds the real client and runs the bootstrap with `scheduler.start()`.

After that: wire the Tauri shell to spawn/supervise the sidecar and add a minimal status UI.

Open questions:
- The API HTTP/GraphQL server transport is unbuilt; the runtime assumes bearer auth + `x-request-id` idempotency + `extensions.code` conflict codes. Building that server transport is a separate API-side workstream and is required before a live endpoint exists.
