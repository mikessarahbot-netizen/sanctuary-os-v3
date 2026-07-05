# Presenter Desktop Network Replay Executor Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The network replay executor and concrete error classifier are complete and pushed (`a3e4e0b`); release check at `07-reviews/architecture/presenter-desktop-network-replay-executor-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 212 + 2 skipped, desktop 27, church-context 5).

The desktop offline-sync feature now has every adapter except the runtime bootstrap:
- A `node:sqlite`/`better-sqlite3`-compatible SQLite migration client interface, executor, and migration runner (`packages/db`).
- The migrated-store composition root, replay pass, scheduler, and assembly factory (`apps/desktop`).
- A network replay executor (GraphQL over an injected transport) + error classifier (`apps/desktop`).
- A compiling Tauri 2 shell (`apps/desktop/src-tauri`).

The next session should bootstrap the runtime: record the SQLite-execution-model ADR (Node + `node:sqlite`, Tauri spawns a sidecar), add a concrete `fetch` GraphQL transport, and add a Node entry that wires the SQLite client + network executor + classifier + interval/connectivity/clock adapters into `createPresenterDesktopReplayRuntime`, with a `node:sqlite` availability-guarded smoke.

After that, the Tauri shell spawns the bootstrap as a sidecar and a minimal desktop UI surfaces queue/replay status.

Open questions:
- The API HTTP/GraphQL server transport is not built; the executor assumes bearer auth + `x-request-id` idempotency + `extensions.code` conflict codes, which the future server must honor.
