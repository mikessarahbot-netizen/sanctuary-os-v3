# Presenter Desktop Runtime Bootstrap Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `febf648`

## Result

Pass with follow-ups. The slice completes the desktop Presenter replay runtime at the bootstrap level: a `fetch`-based GraphQL transport, a Node runtime bootstrap that wires every adapter into `createPresenterDesktopReplayRuntime`, and ADR 0005 recording the SQLite execution model (Node + `node:sqlite`, Tauri sidecar). A `node:sqlite` smoke proves the assembled runtime migrates, enqueues, replays an edit to `synced`, and skips while offline — entirely through the real bootstrap with an injected fake `fetch`. No Tauri sidecar spawn, desktop UI, or live network endpoint is added.

## Scope Reviewed

- `apps/desktop/src/graphql-transport.ts` + test
- `apps/desktop/src/runtime-bootstrap.ts` + `node:sqlite` smoke
- `apps/desktop/src/replay-runtime.ts`, `network-command-service.ts`, `replay-error-classifier.ts`, `replay-scheduler.ts`
- `08-decisions/0005-desktop-presenter-replay-runs-in-node-with-node-sqlite.md`
- `apps/desktop/package.json` (zod dependency)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Fetch transport | Pass | `createPresenterFetchGraphqlTransport` POSTs `{ operationName, query, variables }` to the injected endpoint, sets `content-type` plus the request headers, validates the `{ data, errors }` envelope with zod, and throws on a non-OK HTTP status (a retryable transport fault). |
| Bootstrap wiring | Pass | `createPresenterDesktopRuntimeBootstrap` builds the transport, network executor, classifier, and a Node interval scheduler, then delegates to `createPresenterDesktopReplayRuntime`; `fetch`, auth token, connectivity, and the SQLite client stay injected. |
| Engine/transport agnosticism | Pass | The bootstrap takes a `SqliteMigrationDatabaseClient` and a `PresenterFetchLike` by injection and imports no SQLite driver or HTTP client, so it is unit-testable and matches ADR 0005. |
| End-to-end proof | Pass | The `node:sqlite` smoke migrates the store, enqueues an `updatePresentation` entry, runs one replay pass (fake `fetch` returns success), and asserts the entry becomes `synced`; a second case asserts `skipped-offline` when `isOnline` is false. |
| ADR recorded | Pass | ADR 0005 documents the Node + `node:sqlite` sidecar decision and the rejected async-client alternative, with consequences. |
| Default-gate safety | Pass | The transport tests use a fake `fetch` and run by default; the bootstrap smoke is `node:sqlite` availability-guarded. All four workspaces stay green. |
| Dependency hygiene | Pass | `zod` was added as a direct `apps/desktop` dependency for the transport's response validation. |
| Out-of-scope avoidance | Pass | No Tauri sidecar process, desktop UI, or live endpoint is introduced. |

## Validation

All gates passed on 2026-06-17 at commit `febf648`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/desktop test` | 33 tests pass (6 new) |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 212 + 2 skipped; desktop 33; church-context 5) |

## Follow-Ups

- Add a Node sidecar entry that constructs a real `node:sqlite` client (durable file path), reads endpoint/auth config from the environment, and runs `createPresenterDesktopRuntimeBootstrap` with `scheduler.start()`; package it for Tauri's sidecar mechanism.
- Wire the Tauri shell to spawn and supervise the sidecar (start/stop, crash recovery) and expose queue/replay status to the webview.
- Add a minimal desktop UI surfacing pending/conflict/failed queue entries and operator retry/cancel actions.
- The runtime assumes the API honors bearer auth, `x-request-id` idempotency, and `extensions.code` conflict codes; the API HTTP/GraphQL server transport that implements these is still unbuilt.
