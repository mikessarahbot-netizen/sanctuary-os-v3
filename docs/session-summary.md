# Session Summary

Format: date · branch · tasks completed · next task · open questions

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 7b: replay decision + coordinator (CHARTS BACKEND COMPLETE)

Tasks completed:
- Built the Charts offline-sync replay layer (delegated to a sub-agent; parent independently re-ran gates before committing): `packages/db/src/charts-local-sync-queue-replay.ts` (pure decision: exponential backoff + attempt limits over an injected clock), `charts-local-sync-queue-status.ts` + `countByStatus` on both queue repos, and `apps/api/src/services/charts/local-sync-queue-replay-coordinator.ts` (queued op → ChartsCommandService; retryable-vs-terminal typed-error classification; status transitions).
- Tests: +16 db, +8 api. Gates green: lint clean, typecheck all 4, tests db 235 / api 284 + 2 skipped / desktop 54 / church-context 5.
- Committed `feat: add the Charts offline-sync replay decision, status, and coordinator` (`e9acfa6`). Wrote the release check.
- MILESTONE: Charts backend is complete end-to-end (slices 1–7b).

Next task:
- Author `05-plans/play-module-plan.md`, then begin Play backend slice 1 (backend-first; mirrors the Charts rhythm).

Open questions / decisions:
- Charts mobile UI (slice 8) DEFERRED: `apps/mobile` is bare; the Expo/RN scaffold is a larger architectural step (several shaping sub-decisions, hard to verify autonomously) — flagged for the user. Default: continue backend-first (Play → Community+ → OBS), return to mobile UIs once the scaffold is decided.
- The live `/goal` Stop hook still forces continuation; this session built Charts slices 4–7b under it with safe commits + pushes at every breakpoint. Re-issue `/goal` (or `/clear`) for a true fresh-session handoff.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 7: offline-sync queue (contracts + repo)

Tasks completed:
- Built the Charts local sync queue (delegated to a sub-agent; parent independently re-ran gates before committing). Added `packages/db/src/charts-local-sync-queue-repository-contracts.ts` (tenant-scoped queue entry record, 7-op discriminated union reusing the Charts command input schemas as payloads, pending/in-flight/failed/synced status + attempt/backoff), `charts-local-sync-queue-sql-repository.ts` (SQLite queue repo), `charts-local-sync-queue-in-memory-repository.ts` (double), and a `ChartsLocalSyncQueueMigration` table in `charts-migrations.ts`.
- Tests: +53 db (contracts 22, sql 14, in-memory 9, queue migration +8, node:sqlite smoke). Gates green: lint clean, typecheck all 4, tests db 219 / api 276 + 2 skipped / desktop 54 / church-context 5.
- Committed `feat(db): add the Charts offline-sync queue contracts and repository` (`1a37a1e`). Wrote the release check + the slice-7b handoff note.

Next task:
- Charts slice 7b: replay decision (backoff/attempt limits) + coordinator (queued op → ChartsCommandService) + status summary (mirror the presenter replay slices).

Open questions:
- The live `/goal` Stop hook still forces continuation; re-issue `/goal` with the session-handoff wording (or `/clear`) for a true fresh-session handoff. Multiple Charts slices have been built this session under the hook with safe commits at each breakpoint.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 6: persistence-backed service

Tasks completed:
- Built the persistence-backed Charts service (delegated to a sub-agent; parent independently re-ran gates before committing). Added `apps/api/src/services/charts/persistence.ts` (ChartsQueryService/ChartsCommandService over the slice-4 SQL repos; domain↔persistence mapping; tenant scope; role/owning-musician checks; typed errors) + `composition.ts` (in-memory vs SQL selection + `migrateChartsSqliteSchema` via the migration runner). Drop-in behind the existing GraphQL resolvers; in-memory service untouched.
- Tests: +14 api (11 recording-executor + 3 node:sqlite integration). Gates green: lint clean, typecheck all 4 projects, tests db 166 / api 276 + 2 skipped / desktop 54 / church-context 5.
- Committed `feat(api): add the persistence-backed Charts service over the SQLite repos` (`52cf763`). Wrote the release check + the slice-7 handoff note.

Next task:
- Charts slice 7: the Charts offline-sync queue (contracts + SQLite/in-memory repository), first increment mirroring the presenter local sync queue.

Open questions:
- Documented: persistence service raises CHART_NOT_FOUND for cross-tenant where in-memory raises AUTHORIZATION_FAILED (tenant-scoped reads can't see other tenants); both refuse with a typed error.
- The live `/goal` Stop hook still forces continuation; re-issue `/goal` with the session-handoff wording (or `/clear`) for a true fresh-session handoff.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 5: GraphQL + in-memory service

Tasks completed:
- Built the API-side Charts surface (delegated to a sub-agent to keep the main context lean; parent independently re-ran gates before committing). Added `apps/api/src/domain/charts/contracts.ts` + `errors.ts` (ChartsDomainError + codes), `apps/api/src/services/charts/in-memory.ts` (tenant-scoped, Zod-validated, 13 operations, per-musician scope), `apps/api/src/graphql/charts.ts` (SDL: 6 queries + 7 mutations), merged into the executable schema (`presenter-schema.ts`) with `ChartsDomainError → extensions.code` mapping in `transport.ts`. In-memory only (SQL adapter is slice 6).
- Tests: +23 api (14 service + 9 graphql). Gates green: lint clean, typecheck all 4 projects, tests db 166 / api 262 + 2 skipped / desktop 54 / church-context 5.
- Committed `feat(api): add the Charts GraphQL surface and in-memory service` (`ed0138b`). Wrote `07-reviews/architecture/charts-graphql-service-release-check.md` + the slice-6 handoff note.

Next task:
- Charts slice 6: a persistence-backed Charts service over the slice-4 SQLite adapter + a Charts migration-runner usage (replace the in-memory store behind the same interface).

Open questions:
- Minor: Charts operation schemas live in `domain/charts/contracts.ts` (importing `AuthenticatedActorSchema` from auth); presenter splits records vs operations. Optional later cleanup (noted in the release check).
- The live `/goal` Stop hook still forces continuation; re-issue `/goal` with the session-handoff wording (or `/clear`) to enable a true fresh-session handoff.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 4 COMPLETE: SQLite adapter

Tasks completed:
- Finished the Charts SQLite adapter (`packages/db/src/charts-sql-repository.ts`): reconciled it to the real contract surface (the contracts expose operation SCHEMAS + generic `ChartsReadPersistenceOperation`/`ChartsPersistenceOperation` wrappers, not per-operation type aliases — re-declared the needed operation types as local `z.infer` aliases, leaving method bodies untouched). Added the barrel export.
- Added `packages/db/src/charts-sql-repository.test.ts` (10 tests): recording-executor unit tests (tenant-scoped SQL + params, row→contract mapping, tenant-mismatch rejection, RETURNING update with clock, DELETE scoping) + a live `node:sqlite` smoke (migrate → save → get → preference round-trip → annotate → list → update source).
- Gates green: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 166, api 239 + 2 skipped, desktop 54, church-context 5).
- Wrote `07-reviews/architecture/charts-sql-adapter-release-check.md` (pass) + the slice-5 handoff note.

Next task:
- Charts slice 5: GraphQL schema + resolvers + in-memory service, wired into the executable schema/transport (mirror the presenter GraphQL).

Open questions:
- The live `/goal` Stop hook still forces continuation; re-issue `/goal` with the session-handoff wording to allow clean stops at breakpoints.

## 2026-06-17 - feature/presenter-domain-contracts - Session-continuity protocol + Charts slice 4 (WIP)

Tasks completed:
- Adopted a session-continuity protocol (user directive: keep context windows small, low token usage; commit before each new session). Encoded durably in `agents.md` › "Session continuity protocol": always commit + push before a handoff, hand off at clean breakpoints, `chore(wip)` commits sanctioned mid-slice, fresh session resumes from `agents.md` + `NOW.md`, print `🔄 SESSION HANDOFF` and stop.
- Drafted `packages/db/src/charts-sql-repository.ts` (Charts slice 4 adapter: query + command repositories, tenant filtering, row↔contract mapping, upserts, `RETURNING` source update). Committed as WIP — does not compile yet (imports per-operation type aliases the contracts don't export; the contracts use generic `ChartsReadPersistenceOperation<TInput>` / `ChartsPersistenceOperation<TInput>` wrappers). Reconciliation steps captured in `NOW.md` + the slice-4 handoff note.

Next task:
- Finish Charts slice 4: reconcile the adapter to the real contract surface, barrel export, tests + `node:sqlite` smoke, gates green.

Open questions:
- The live `/goal` Stop hook is per-session runtime state (not a file). Re-issue `/goal` with the session-handoff wording so the live hook permits clean stops at breakpoints.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 3: SQLite migration artifact

Tasks completed:
- Added `packages/db/src/charts-migrations.ts`: a `defineSqlMigrationArtifact` creating tenant-scoped SQLite tables `charts`, `chart_arrangements`, `chart_annotations`, `musician_chart_preferences` (PKs, `charts.v1` schema-version CHECK, annotation-kind/instrument/boolean CHECKs, tenant indexes, rollback; TEXT/INTEGER/REAL only). Exported with name lists + `ChartsSqlMigrations`.
- Added 7 tests (artifact shape, constraint/index presence, rollback drops, checksum stability) + a `node:sqlite` smoke proving the CHECKs reject bad rows and rollback drops the tables. db now 156.
- Wrote `07-reviews/architecture/charts-migration-artifact-release-check.md` (pass).
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 156, api 239 + 2 skipped, desktop 54, church-context 5).
- Pushed implementation commit `30554af` (`feat(db): add the Charts SQLite migration artifact`).

Next task:
- Charts slice 4: the SQLite repository adapter (query/command repositories over an injected executor).

Open questions:
- None blocking; Charts module progression: ChordPro core → contracts → migration → adapter (next) → GraphQL → service → offline.

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 2: persistence contracts

Tasks completed:
- Added `packages/db/src/charts-repository-contracts.ts`: tenant-scoped, Zod-validated persistence records (Chart, ChartArrangement, ChartAnnotation with a note refinement, MusicianChartPreference with integer transpose/capo/instrument/fontScale/chordsVisible), actor-required read/write options, per-operation schemas, and the query/command repository interfaces from the Charts plan. Exported from the db barrel.
- Added 6 schema tests (valid record, unknown-field rejection, schema version, note refinement, negative transpose, actor requirement). db now 149 tests.
- Wrote `07-reviews/architecture/charts-persistence-contracts-release-check.md` (pass).
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 149, api 239 + 2 skipped, desktop 54, church-context 5).
- Pushed implementation commit `1d20689` (`feat(db): add Charts persistence contracts`).

Next task:
- Charts slice 3: the Charts SQLite migration artifact + migration tests.

Open questions:
- None blocking; building Charts slice-by-slice (next: migration → adapter → GraphQL → service → offline).

## 2026-06-17 - feature/presenter-domain-contracts - Charts slice 1: ChordPro domain

Tasks completed:
- Added the pure ChordPro domain in `apps/api/src/domain/charts/chordpro.ts`: strict Zod schemas (`ChordProDocument`/`ChartSection`/`ChartLine`/`ChartSegment`/kind), `parseChordPro` (directives, section delimiters, inline `[chord]lyric`, default section), and `transposeChord`/`transposeChordProDocument` (root + bass shift, sharp policy, key transpose, non-chord pass-through). Exported from the api domain barrel.
- Added 9 pure unit tests (multi-section parse, default section, unknown directives, transpose up/down with octave wrap, slash chords, pass-through, key transpose, zero no-op).
- Wrote `07-reviews/architecture/charts-chordpro-domain-release-check.md` (pass). api now 239 tests.
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 143, api 239 + 2 skipped, desktop 54, church-context 5).
- Pushed implementation commit `ac5124c` (`feat(charts): add the pure ChordPro domain (parse + transpose)`).

Next task:
- Charts slice 2: the Charts persistence contracts in `packages/db` (Chart, ChartArrangement, ChartAnnotation, MusicianChartPreference).

Open questions:
- None blocking; building Charts slice-by-slice (next: persistence contracts → migration + adapter → GraphQL → offline).

## 2026-06-17 - feature/presenter-domain-contracts - Charts module: plan authored (next module)

Tasks completed:
- Presenter offline-sync feature confirmed complete; recorded ADR 0006 (Node SEA sidecar distribution) and a feature-complete handoff.
- Per the adjusted goal (build modules in sequential order, keep going), chose the module order Charts → Play → Community+ → OBS (Charts/Play are offline-first per the non-negotiables).
- Authored `05-plans/charts-module-plan.md` from `00-product/vision.md` + `01-architecture/system-map.md` (Charts owns ChordPro rendering/editor, annotations, per-musician prefs; mobile, offline-first): scope, domain objects (Chart/ChartArrangement/ChordProDocument/ChartSection/ChartAnnotation/MusicianChartPreference), boundaries, GraphQL surface, pure render/transform rules, offline/privacy/AI rules, acceptance — mirroring the presenter module plan.

Next task:
- Charts slice 1: the pure ChordPro domain (Zod schemas + `parseChordPro` + `transposeChordProDocument`) in `apps/api/src/domain/charts`.

Open questions:
- None blocking; building Charts slice-by-slice from the plan.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop packaging wiring

Tasks completed:
- Set the Tauri `beforeBuildCommand`/`beforeDevCommand` to run `pnpm build:sidecar` so the sidecar bundle exists before the app builds.
- The Rust shell defaults `SANCTUARY_OS_PRESENTER_STATUS_PORT` to 7421 when spawning the sidecar (explicit env still wins); the webview reads a configurable port (`window.__SANCTUARY_OS_PRESENTER_STATUS_PORT__`, default 7421) so the shell and UI agree.
- Verified `cargo check` compiles and the TS gates stay green (db 143, api 230 + 2 skipped, desktop 54, church-context 5).
- Wrote `07-reviews/architecture/presenter-desktop-packaging-wiring-release-check.md` (pass with follow-ups).
- Pushed implementation commit `8b00413` (`feat(desktop): wire sidecar build into Tauri and align the status port`).
- The Presenter offline-sync feature is now complete end to end as a self-wiring, launchable, conflict-resolving desktop app.

Next task:
- Record the desktop Node-runtime packaging ADR, then begin the next module (Play/Charts/Community+/OBS need a plan authored first; only Planning and Presenter have plans).

Open questions:
- Node-runtime bundling / self-contained sidecar binary for distribution is the remaining packaging step (ADR next).

## 2026-06-17 - feature/presenter-domain-contracts - Desktop operator requeue/cancel actions

Tasks completed:
- Added `requeueEntry`/`cancelEntry` to the desktop runtime (`apps/desktop/src/replay-runtime.ts`): look up the entry, build the allowed transition from its current status, and call `repository.requeue`/`cancel` under the runtime actor.
- Added a pure POST `/actions` handler (`status-server.ts`) over those methods (Zod body, 200/400/405/409) and made the localhost server route both `GET /status` and `POST /actions`; the env starter passes the runtime actions.
- Added requeue/cancel controls to `web/index.html` (entry-id input + buttons posting to `/actions`).
- Added 5 action-handler unit tests + a `node:sqlite` runtime smoke (conflict → `requeueEntry` → `queued`); the sidecar bundle still builds. desktop now 54 tests.
- Wrote `07-reviews/architecture/presenter-desktop-operator-actions-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 143, api 230 + 2 skipped, desktop 54, church-context 5).
- Pushed implementation commit `618591a` (`feat(desktop): add operator requeue/cancel for queue entries`).

Next task:
- Wire the desktop packaging: build the sidecar in the Tauri build and pass the status port from the shell to the sidecar and webview.

Open questions:
- Node-runtime bundling / a self-contained sidecar binary for distribution is a deeper deployment task (after the build wiring).

## 2026-06-17 - feature/presenter-domain-contracts - Desktop status endpoint + status UI

Tasks completed:
- Added a localhost status HTTP endpoint (`apps/desktop/src/status-server.ts`): a pure `{ method, path } → { status, body }` handler over `runtime.getStatus` plus a `node:http` server factory (permissive CORS, localhost-only).
- Wired the env starter to start the status server when `SANCTUARY_OS_PRESENTER_STATUS_PORT` is set and close it with the sidecar.
- Added a polling status panel to `apps/desktop/web/index.html` (total / pending / synced / needs-attention; degrades to "offline").
- Added 3 handler unit tests + a real listen+fetch smoke; the sidecar bundle still builds (`node --check`).
- Wrote `07-reviews/architecture/presenter-desktop-status-endpoint-ui-release-check.md` (pass with follow-ups). desktop now 48 tests.
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 143, api 230 + 2 skipped, desktop 48, church-context 5).
- Pushed implementation commit `8d0c661` (`feat(desktop): serve sidecar status over HTTP and render a status UI`).

Next task:
- Add operator retry/cancel for conflict/failed queue entries (sidecar action endpoint → repository requeue/cancel + UI controls).

Open questions:
- The status port is hardcoded (7421) in the UI; pass it from the Tauri shell to both sidecar and webview (follow-up).

## 2026-06-17 - feature/presenter-domain-contracts - Desktop runtime getStatus reporter

Tasks completed:
- Added `getStatus` to the desktop replay runtime (`apps/desktop/src/replay-runtime.ts`): calls `repository.countByStatus`, returns `summarizePresenterLocalSyncQueue(counts)` plus the last replay-pass result (tracked by wrapping the scheduler `onResult`).
- Extended the `node:sqlite` runtime smoke to assert the summary (`{ synced: 1, total: 1, ... }`) and `lastResult` after a real replay.
- Wrote `07-reviews/architecture/presenter-desktop-status-reporter-release-check.md` (pass).
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 143, api 230 + 2 skipped, desktop 44, church-context 5).
- Pushed implementation commit `c4f328f` (`feat(desktop): expose getStatus on the replay runtime`).

Next task:
- Expose the sidecar status over a localhost HTTP endpoint and render a minimal desktop status UI.

Open questions:
- The status endpoint handler is gate-testable; the web UI rendering is verified by running the app.

## 2026-06-17 - feature/presenter-domain-contracts - Local sync queue status counts + summary

Tasks completed:
- Added a tenant-scoped `countByStatus` capability to `PresenterLocalSyncQueuePersistenceRepository` and its SQLite adapter (`SELECT status, COUNT(*) ... GROUP BY status`, absent statuses default to 0), with a recording-executor test.
- Added a pure `summarizePresenterLocalSyncQueue` helper (`packages/db/src/presenter-local-sync-queue-status.ts`) deriving total / pending / synced / needs-attention, with unit tests.
- Updated the two interface fakes (contracts test, desktop replay-pass test) for the new method.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-status-summary-release-check.md` (pass). db now 143 tests.
- Validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (db 143, api 230 + 2 skipped, desktop 44, church-context 5).
- Pushed implementation commit `82bc758` (`feat(db): add Presenter local sync queue status counts and summary`).

Next task:
- Add a desktop sidecar status reporter (`getStatus` via `countByStatus` + `summarizePresenterLocalSyncQueue`).

Open questions:
- The sidecar↔webview IPC channel and the status UI remain (verified by running the app, not unit tests).

## 2026-06-17 - feature/presenter-domain-contracts - Tauri sidecar spawn (launchable desktop app)

Tasks completed:
- Added an esbuild `build:sidecar` script bundling `sidecar-bin.ts` (runs `runPresenterDesktopSidecarMain`) into `dist/presenter-sidecar.mjs` (node: builtins external); verified with `node --check`.
- Updated the Tauri Rust shell (`src-tauri/src/lib.rs`) to spawn `node <bundle>` on setup (env-guarded via `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` / `_DISABLED`) and kill it on `RunEvent::Exit`; `cargo check` compiles.
- The desktop app is now launchable: the Tauri shell spawns the Node sidecar running the offline-sync runtime.
- `dist/` is gitignored; the TS lint/typecheck/test gates are unaffected (db 140, api 230 + 2 skipped, desktop 44, church-context 5).
- Wrote `07-reviews/architecture/presenter-desktop-tauri-sidecar-spawn-release-check.md` (pass with follow-ups).
- Pushed implementation commit `60285e6` (`feat(desktop): bundle the sidecar and spawn it from the Tauri shell`).

Next task:
- Add a Presenter local sync queue status summary (repository count-by-status + a pure summary the sidecar can report).

Open questions:
- The sidecar↔webview status IPC, the status UI, and Node-with-app packaging remain (next slices / deployment).

## 2026-06-17 - feature/presenter-domain-contracts - Desktop sidecar process entry (env-driven)

Tasks completed:
- Added `startPresenterDesktopSidecarFromEnv` (`apps/desktop/src/sidecar-runtime-env.ts`): parses the sidecar config from an env record, opens a `node:sqlite` database (dynamic import, injectable), and starts the sidecar with `globalThis.fetch` (structurally assignable to `PresenterFetchLike` — no adapter needed).
- Added `runPresenterDesktopSidecarMain` (`apps/desktop/src/sidecar-main.ts`): a thin runnable entry from `process.env` with `SIGINT`/`SIGTERM` → `stop()`, no auto-run on import.
- Added a `node:sqlite` availability-guarded smoke (parse env → open SQLite → enqueue → replay → synced → stop). Exported both from the barrel.
- Wrote `07-reviews/architecture/presenter-desktop-sidecar-process-entry-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (desktop 44).
- Pushed implementation commit `afe4ed1` (`feat(desktop): add env-driven sidecar process entry`).

Next task:
- Make the desktop sidecar runnable (build + bin entry) and have the Tauri Rust shell spawn/supervise it (cargo-check verified).

Open questions:
- The sidecar↔webview status IPC and a desktop status UI remain (next slice); packaging/code-signing is a later deployment concern.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter service conflict detection (typed errors)

Tasks completed:
- Replaced the in-memory Presenter command service's generic errors with typed `PresenterDomainError`, mapping each detectable condition to the conflict code the desktop classifier expects: missing presentation → `STALE_PRESENTATION`, tenant/role → `AUTHORIZATION_FAILED`, unknown theme → `THEME_MISMATCH`, unknown/missing slide → `MISSING_SLIDE`, output-target tenant → `OUTPUT_TARGET_MISMATCH`, reorder/keep-one invariants → `VALIDATION_FAILED`.
- This completes the offline conflict round-trip with real detection: a replayed edit hitting one of these conditions now yields `extensions.code` → desktop `conflict`.
- Updated four existing in-memory assertions for the new safe messages; added `presenter-domain-error.test.ts` with 6 per-code tests (api now 230 + 2 skipped).
- Wrote `07-reviews/architecture/presenter-service-conflict-detection-release-check.md` (pass).
- Validation passed: `pnpm --filter @sanctuary-os/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Pushed implementation commit `897f4b5` (`feat(api): throw typed Presenter domain errors for conflict conditions`).

Next task:
- Add the desktop sidecar process entry: wire a real `node:sqlite` database and `fetch` from env config into `startPresenterDesktopSidecar`, with a thin runnable `main`.

Open questions:
- `STALE_PRESENTATION` fires on a missing presentation; base-revision staleness needs server revision tracking (follow-up).

## 2026-06-17 - feature/presenter-domain-contracts - API Presenter GraphQL HTTP listener

Tasks completed:
- Added `apps/api/src/graphql/http-server.ts`: a pure `handlePresenterGraphqlHttpInvocation` adapter (path/method checks, JSON body parse + Zod validation, serialization) plus `createPresenterGraphqlHttpServer` wrapping `node:http`.
- Only POST to the configured path is served; malformed body → 400, wrong path → 404, non-POST → 405; headers normalized from `string | string[] | undefined`.
- Added 4 pure adapter tests and 2 real listen-on-ephemeral-port + `fetch` smokes (200 with data, 401 unauthenticated). The API now serves the Presenter GraphQL surface the desktop sidecar targets.
- Wrote `07-reviews/architecture/presenter-api-graphql-http-listener-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/api test -- http-server.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (api 224 + 2 skipped).
- Pushed implementation commit `5162f9a` (`feat(api): bind the Presenter GraphQL handler to a Node http listener`).

Next task:
- Wire the in-memory Presenter command service to throw `PresenterDomainError` for real conflict conditions (completing the conflict path with detection).

Open questions:
- A process entry (env-driven host/port + `server.listen`) and deployment/TLS are out of the testable core and remain for the runtime/deploy thread.

## 2026-06-17 - feature/presenter-domain-contracts - Typed Presenter domain error + conflict-code mapping

Tasks completed:
- Added `PresenterDomainError` (`apps/api/src/domain/presenter/errors.ts`) carrying a stable conflict `code` and a redacted `safeMessage`, exported via the domain barrel.
- Mapped it through the GraphQL transport: `formatError` reads `error.originalError` and emits `{ message: safeMessage, extensions: { code } }` for domain errors while keeping other resolver errors redacted — no resolver changes needed.
- This completes the offline replay conflict round-trip: service throws → `extensions.code` → desktop classifier marks the entry `conflict` (the codes match the desktop `CONFLICT_CODE_TO_KIND` map exactly).
- Added a transport test proving a thrown `STALE_PRESENTATION` surfaces the code + safe message (api now 218 + 2 skipped).
- Wrote `07-reviews/architecture/presenter-typed-domain-error-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/api test -- transport.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Pushed implementation commit `b05b30f` (`feat(api): add typed Presenter domain error and conflict-code mapping`).

Next task:
- Bind the Presenter GraphQL request handler to a concrete Node `http` listener so the API can serve requests.

Open questions:
- The in-memory/SQL services still throw generic errors for real conditions; emitting `PresenterDomainError` per condition is a follow-up.

## 2026-06-17 - feature/presenter-domain-contracts - API Presenter GraphQL schema + HTTP transport handler

Tasks completed:
- Discovered the API had GraphQL SDL + resolvers but no execution engine; added `graphql` + `@graphql-tools/schema` to `apps/api`.
- Added `createPresenterGraphqlSchema` (`apps/api/src/graphql/presenter-schema.ts`): base root `Query`/`Mutation` + `JSON` scalar merged with the presenter SDL (which supplies `DateTime`), pass-through scalar resolvers, presenter resolvers via `makeExecutableSchema`.
- Added `createPresenterGraphqlRequestHandler` (`apps/api/src/graphql/transport.ts`): a transport-agnostic `{ headers, body } → { status, body }` handler resolving the actor via the injected `AuthBoundary`, conveying `requestId` from `x-request-id` (generating one if absent), executing the schema, and redacting resolver error text while preserving `extensions.code`.
- Added 5 transport tests (mutation, query, request-id passthrough, generated id, two 401 cases); added `apps/api/vitest.config.mts` to dedupe/inline `graphql` (fixing the CJS/ESM "another module or realm" failure), named `.mts` to stay out of the lint/typecheck globs.
- Wrote `07-reviews/architecture/presenter-api-graphql-transport-release-check.md` (pass with follow-ups). Deferred the conflict-code mapping (needs typed domain errors).
- Validation passed: `pnpm --filter @sanctuary-os/api test -- transport.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (api 217 + 2 skipped).
- Pushed implementation commit `4db0fb8` (`feat(api): add executable Presenter GraphQL schema and HTTP transport handler`).

Next task:
- Add typed Presenter domain errors and map them to GraphQL `extensions.code` conflict codes, completing the offline replay conflict round-trip.

Open questions:
- None blocking; binding a concrete Node `http` listener and the desktop tail remain.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop replay sidecar config + entry

Tasks completed:
- Added a Zod-validated sidecar config loader (`apps/desktop/src/sidecar-config.ts`) parsing twelve env keys (GraphQL endpoint, auth token, SQLite path, replay interval/policy, tenant/actor identity, optional request-id header) from an injected env record into a typed config with a validated `AuthenticatedActor`.
- Added a reusable `node:sqlite`/`better-sqlite3` → `SqliteMigrationDatabaseClient` wrapper (`apps/desktop/src/node-sqlite-client.ts`).
- Added `startPresenterDesktopSidecar` (`apps/desktop/src/sidecar-entry.ts`): bootstraps the runtime, starts the scheduler, and returns a `{ runtime, stop }` handle.
- Added 9 tests (config parse valid/invalid, wrapper delegation, and a `node:sqlite` smoke that starts the sidecar, replays a queued edit to `synced`, and stops cleanly).
- Wrote `07-reviews/architecture/presenter-desktop-sidecar-entry-release-check.md` (pass with follow-ups).
- The Presenter offline-sync feature is now complete from storage through a runnable sidecar entry; only the thin process `main`, Tauri sidecar spawn, and a status UI remain on the desktop side. Four green workspaces (db 140, api 212 + 2 skipped, desktop 42, church-context 5).
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Pushed implementation commit `5812888` (`feat(desktop): add Presenter replay sidecar config and entry`).

Next task:
- Build the API HTTP/GraphQL server transport (transport-agnostic request handler: actor/requestId resolution, schema execution, conflict-code error mapping) — the live endpoint the desktop assumes.

Open questions:
- None blocking; the API server transport is the next foundational piece, after which the desktop sidecar can reach a real endpoint.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop runtime bootstrap (offline-sync runtime runnable end to end)

Tasks completed:
- Recorded ADR 0005: the desktop Presenter replay runtime runs in a Node context using `node:sqlite` (reusing the synchronous client), with the Tauri shell spawning it as a sidecar — chosen over an async Tauri-SQL-plugin client refactor.
- Added `createPresenterFetchGraphqlTransport` (`apps/desktop/src/graphql-transport.ts`): a `fetch`-based GraphQL transport validating the `{ data, errors }` envelope and throwing on non-OK HTTP, with fake-`fetch` tests.
- Added `createPresenterDesktopRuntimeBootstrap` (`apps/desktop/src/runtime-bootstrap.ts`): wires the transport, network executor, classifier, and a Node interval scheduler into `createPresenterDesktopReplayRuntime`, all from injected SQLite client/fetch/auth/connectivity.
- Added a `node:sqlite` availability-guarded smoke proving the assembled bootstrap migrates, enqueues, replays an edit to `synced`, and skips while offline; added `zod` as a direct desktop dependency.
- Wrote `07-reviews/architecture/presenter-desktop-runtime-bootstrap-release-check.md` (pass with follow-ups).
- The Presenter offline-sync feature is now runnable end to end at the runtime level (storage, API coordinator/executor, desktop runtime + adapters + bootstrap, compiling Tauri shell). Four green workspaces (db 140, api 212 + 2 skipped, desktop 33, church-context 5).
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Pushed implementation commit `febf648` (`feat(desktop): bootstrap the Presenter replay runtime (ADR 0005)`).

Next task:
- Add the desktop Presenter sidecar entry: a Zod-validated runtime config loader and a Node entry that builds a real `node:sqlite` client and runs the runtime bootstrap.

Open questions:
- The API HTTP/GraphQL server transport is still unbuilt; the runtime assumes bearer auth + `x-request-id` idempotency + `extensions.code` conflict codes, which the server must honor.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop network replay executor + error classifier

Tasks completed:
- Re-synced with the GraphQL presenter mutations (`apps/api/src/graphql/presenter.ts`), the `PresenterCommandService` contract, and the replay error-classifier contract; confirmed the API has no HTTP server transport yet and that GraphQL mutation result types are truncated projections.
- Added a narrower `PresenterReplayCommandExecutor` (api) returning `Promise<unknown>` — both the in-process service and a network client satisfy it — and refactored `replay-pass.ts`/`replay-runtime.ts` to depend on it (existing tests unchanged and green).
- Added `createPresenterNetworkReplayCommandExecutor` (`apps/desktop/src/network-command-service.ts`): issues the existing GraphQL mutations over an injected transport with `Authorization: Bearer` + `x-request-id` idempotency headers, selects a minimal confirmation field, and throws a typed `PresenterNetworkReplayError` (carrying `extensions.code`).
- Added `createPresenterReplayErrorClassifier` (`apps/desktop/src/replay-error-classifier.ts`): maps known GraphQL error codes to conflict kinds with redacted safe messages; everything else stays retryable `failed`.
- Added 9 fake-transport/unit tests; exported both from the desktop barrel.
- Wrote `07-reviews/architecture/presenter-desktop-network-replay-executor-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (desktop 27 tests).
- Pushed implementation commit `a3e4e0b` (`feat(desktop): add network replay command executor and error classifier`).

Next task:
- Bootstrap the desktop Presenter replay runtime: a fetch GraphQL transport, the SQLite-execution-model ADR (Node + `node:sqlite` sidecar), and a Node entry wiring every adapter into `createPresenterDesktopReplayRuntime`.

Open questions:
- The API HTTP/GraphQL server transport is not built; the network executor assumes bearer auth + `x-request-id` + `extensions.code` conflict codes, which the server must honor when built.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop Tauri shell scaffold (toolchain installed)

Tasks completed:
- With user authorization to install required tooling, installed the Rust toolchain (Homebrew `rustup` keg → stable 1.96.0; `cargo`/`rustc` available) and added `@tauri-apps/cli ^2.11.2` to `apps/desktop`.
- Scaffolded `apps/desktop/src-tauri` into a real Tauri 2 app: `cargo build` (dev) and `cargo check` both compile. Set a proper bundle identifier (`os.sanctuary.presenter`), a static `web/index.html` frontend, default capabilities/icons, and a `tauri` package script; renamed the crate to `sanctuary-os-presenter`.
- Confirmed the monorepo gates are unaffected — `apps/desktop/tsconfig.json` and the root eslint glob only cover `src/**/*.ts`, and `src-tauri/target` is gitignored. All four workspaces green (db 140, api 212 + 2 skipped, desktop 18, church-context 5).
- Wrote `07-reviews/architecture/presenter-desktop-tauri-shell-scaffold-release-check.md`; updated the Tauri blocker note to RESOLVED.
- Pushed implementation commit `740d06d` (`feat(desktop): scaffold Tauri shell for the Presenter desktop app`) to `feature/presenter-domain-contracts`.

Next task:
- Add a production network `PresenterCommandService` and a concrete replay error classifier (pure TypeScript) that the desktop shell injects into the replay runtime.

Open questions:
- Desktop SQLite execution model: the synchronous `SqliteMigrationDatabaseClient` cannot run in a Tauri webview — Node sidecar vs async Tauri-SQL-plugin client. Capture as an ADR in `08-decisions/` before wiring the runtime bootstrap.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop replay runtime assembly (Presenter offline-sync feature complete)

Tasks completed:
- Added `createPresenterDesktopReplayRuntime` in `apps/desktop/src/replay-runtime.ts`: an async factory composing the migrated store, a replay-pass binding, and the scheduler from injected adapters, returning the migration result, repository, and scheduler.
- Added an availability-guarded `node:sqlite` end-to-end smoke proving migrate → enqueue → offline-skip → online-sync → entry-synced through the assembled runtime. Re-exported from the desktop barrel.
- Wrote `07-reviews/architecture/presenter-desktop-replay-runtime-release-check.md` (pass with follow-ups).
- This completes the Presenter local sync queue offline-edit feature at the logic level across `packages/db`, `apps/api`, and `apps/desktop` — all with no-live-engine default tests plus node:sqlite smokes, in four green workspaces.
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm --filter @sanctuary-os/desktop typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 18 tests).
- Pushed implementation commit `9c64384` (`feat(desktop): add Presenter replay runtime assembly`) to `feature/presenter-domain-contracts`.

Next task:
- BLOCKED: the desktop Tauri shell requires the Rust toolchain (`cargo`/`rustc` not installed) and is not unit-testable via the current gates. A direction decision is required — see `06-tasks/blocked/2026-06-17-presenter-desktop-tauri-shell-blocked.md` and `06-tasks/active/NOW.md`.

Open questions:
- Is the Rust/Tauri toolchain expected in the build environment, or should the next work pivot to another pure-TypeScript module?
- What transport and error shapes will the production `PresenterCommandService` use?

## 2026-06-17 - feature/presenter-domain-contracts - Desktop replay scheduler

Tasks completed:
- Re-synced with the replay pass and desktop runtime expectations.
- Added `createPresenterDesktopReplayScheduler` in `apps/desktop/src/replay-scheduler.ts`: wraps a replay-pass runner with offline/online gating and an injected interval. `runOnce` skips while offline or runs the pass and reports the result; `start`/`stop` drive `runOnce` through the injected `schedule`/`cancel` abstraction; a scheduled tick never throws (per-tick errors route to `onError`).
- Connectivity, interval, and the pass runner are injected; the scheduler is generic over the result and handle types and holds no transport or real timer.
- Added 5 engine-free tests (offline skip, online run, start scheduling, start idempotency + stop cancel, per-tick error containment). Re-exported from the desktop barrel.
- Wrote `07-reviews/architecture/presenter-desktop-replay-scheduler-release-check.md` (pass with follow-ups). The desktop replay runtime (pass + scheduler) is now complete and fully injected.
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm --filter @sanctuary-os/desktop typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 16 tests; all 4 workspaces green).
- Pushed implementation commit `c0b9112` (`feat(desktop): add Presenter replay scheduler`) to `feature/presenter-domain-contracts`.

Next task:
- Add a desktop Presenter replay runtime assembly factory that composes the migrated store, the replay pass binding, and the scheduler from injected adapters.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop replay conflict classification

Tasks completed:
- Re-synced with the replay pass and the queue conflict-detail contract.
- Added `PresenterDesktopReplayErrorClassification` (conflict-with-details or retryable-failed) and an injectable `PresenterDesktopReplayErrorClassifier` to `runPresenterDesktopReplayPass`; the default classifier treats every error as `failed`.
- On a command-service error the pass now classifies: a `conflict` calls `markConflict` with validated details (`replaying -> conflict`); a `failed` calls `markFailed` with the supplied safe message. The result reports a `conflicted` set.
- Added 2 engine-free tests (injected conflict path, classifier-supplied failure message) and updated the existing result-shape assertion.
- Wrote `07-reviews/architecture/presenter-desktop-replay-conflict-classification-release-check.md` (pass with follow-ups). This completes the replay pass's correctness against the plan's conflict-vs-failure distinction.
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm --filter @sanctuary-os/desktop typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 11 tests; all 4 workspaces green).
- Pushed implementation commit `ffd90d7` (`feat(desktop): classify replay errors as conflict or failed`) to `feature/presenter-domain-contracts`.

Next task:
- Add a desktop replay scheduler that runs the replay pass on an injected interval with offline/online gating.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop Presenter replay pass

Tasks completed:
- Re-synced with the replay decision, coordinator, repository, and command service contracts.
- Added `runPresenterDesktopReplayPass` in `apps/desktop/src/replay-pass.ts`: a single pass that reads ready entries, applies `decidePresenterLocalSyncQueueReplay`, marks each eligible entry `replaying`, maps it via `mapPresenterLocalSyncQueueEntryToReplayCommand`, calls the injected `PresenterCommandService`, then marks `synced`/`failed`; exhausted entries are marked `failed` without a service call. Returns a synced/failed/exhausted summary.
- Added a focused `@sanctuary-os/api/presenter` subpath export so the desktop imports the coordinator without evaluating the full api barrel (graphql/jobs/pg); added `@sanctuary-os/api` as a desktop dependency.
- Added 4 engine-free tests with a fake repository and fake command service (clean sync, error → failed, exhausted → failed, backoff no-op). Re-exported from the desktop barrel.
- Wrote `07-reviews/architecture/presenter-desktop-replay-pass-release-check.md` (pass with follow-ups). The Presenter local sync queue offline-edit pipeline is now functional end to end at the logic level.
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm --filter @sanctuary-os/desktop typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 9 tests; all 4 workspaces green).
- Pushed implementation commit `86ddd21` (`feat(desktop): add Presenter local sync queue replay pass`) to `feature/presenter-domain-contracts`.

Next task:
- Add injected conflict-vs-failure classification to the desktop replay pass.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop local sync composition root

Tasks completed:
- Re-synced with the desktop scaffold and the `@sanctuary-os/db` building blocks (migration runner, persistence selection, queue migration).
- Added `createPresenterDesktopLocalSyncQueueStore` in `apps/desktop/src/local-sync-queue-store.ts`: given an injected migration-capable SQLite client and a clock, it applies `PresenterLocalSyncQueueMigration` and returns the local sync queue repository from the shared persistence selection, with one client backing both the migration runner and the query path.
- Added an availability-guarded `node:sqlite` smoke that migrates, round-trips enqueue/getById, and proves a second composition is idempotent (migration skipped). Re-exported from the desktop barrel.
- Wrote `07-reviews/architecture/presenter-desktop-local-sync-composition-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/desktop test`, `pnpm --filter @sanctuary-os/desktop typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 5 tests).
- Pushed implementation commit `462537c` (`feat(desktop): add local sync queue composition root`) to `feature/presenter-domain-contracts`.

Next task:
- Add the desktop Presenter local sync queue replay pass that drives an injected command service from the queue, marking outcomes.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Desktop workspace scaffold

Tasks completed:
- Re-synced with the root `package.json`/`pnpm-workspace.yaml`/`tsconfig.base.json` and the `apps/api`/`packages/church-context` workspace wiring.
- Scaffolded `apps/desktop` as a minimal `@sanctuary-os/desktop` TypeScript workspace: `package.json` (lint/typecheck/test scripts, `@sanctuary-os/db` workspace dependency), `tsconfig.json` extending the base, and a typed `src/index.ts` placeholder (`describePresenterDesktopLocalSyncRuntime`) plus `src/index.test.ts`.
- Confirmed `pnpm install` now reports 5 workspace projects and the root lint glob, `pnpm -r typecheck`, and `pnpm -r test` all pick up `apps/desktop` (3 tests).
- Wrote `07-reviews/architecture/desktop-workspace-scaffold-release-check.md` (pass with follow-ups).
- Kept the slice infrastructure-only: no Tauri/Rust shell, desktop windows, replay loop, or UI.
- Validation passed: `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (desktop 3, api 212, db 140, church-context 5).
- Pushed implementation commit `253bb99` (`chore(desktop): scaffold apps/desktop workspace`) to `feature/presenter-domain-contracts`.

Next task:
- Add a desktop-local Presenter sync composition root in `apps/desktop` that migrates the SQLite store and exposes the local sync queue repository from an injected client.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue replay coordinator

Tasks completed:
- Re-synced with the queue entry contracts in `@sanctuary-os/db` and the Presenter service command contracts/auth actor schema in `apps/api`.
- Added `mapPresenterLocalSyncQueueEntryToReplayCommand` in `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.ts`: a pure mapping from a validated queue entry to the existing Presenter service command shape.
- The mapping covers all six approved operations, reuses the entry `requestId` for idempotency, takes the authenticated actor from the caller (queue stores only `actorId`), and requires the actor tenant to match the entry tenant.
- Added 8 pure tests covering each operation, tenant-mismatch rejection, and malformed-entry rejection; confirmed the `packages/db` persistence and `apps/api` domain schema families stay aligned (slide/output-target round-trip). Exported from the presenter service barrel.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-replay-coordinator-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/api test -- local-sync-queue-replay-coordinator.test.ts`, `pnpm --filter @sanctuary-os/api typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (api 212 tests).
- Pushed implementation commit `31e062d` (`feat(presenter): add local sync queue replay coordinator`) to `feature/presenter-domain-contracts`.

Next task:
- Scaffold the `apps/desktop` workspace as a minimal TypeScript package integrated with the monorepo lint/typecheck/test gates (no Tauri/Rust shell yet).

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue replay decision contract

Tasks completed:
- Re-synced with the local sync queue plans, the migration-runner release check, and the existing `listPresenterLocalSyncQueueEntriesReadyForReplay` helper and queue entry contracts.
- Added `decidePresenterLocalSyncQueueReplay` in `packages/db/src/presenter-local-sync-queue-replay.ts`: a pure scheduling decision with a Zod-validated policy (max attempts, backoff base/multiplier/cap).
- The decision reuses the readiness helper for ordering and conflict/failed blocking, decides one head entry per presentation, and returns `eligible`, `waiting` (next-eligible time from capped exponential backoff), and `exhausted` (attempt budget spent) sets — never calling the API or starting a timer.
- Added 9 pure unit tests (policy rejection, immediate eligibility, backoff hold/release, cap, exhaustion, one-per-presentation, conflict blocking, independent presentations). Exported from the barrel.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-replay-decision-release-check.md` (pass with follow-ups).
- Placed in `packages/db` alongside the existing readiness-helper precedent; the desktop scheduler runtime that consumes this remains a later slice.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-local-sync-queue-replay.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (db 140 tests).
- Pushed implementation commit `eedd0a6` (`feat(db): add Presenter local sync queue replay decision contract`) to `feature/presenter-domain-contracts`.

Next task:
- Add a pure Presenter local sync queue replay coordinator that maps an eligible queue entry to the existing Presenter command shape (no live transport).

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Local SQLite migration runner

Tasks completed:
- Re-synced with `migrations.ts`, `sqlite-executor.ts`, `presenter-migrations.ts`, and the storage plan's migration-runner requirement.
- Added `planSqliteMigrationApply` (pure apply/skip decision with checksum-drift detection) and `createSqliteMigrationRunner` in `packages/db/src/sqlite-migration-runner.ts`.
- The runner ensures a `sanctuary_migrations` tracking table, applies pending migrations in order honoring the `transactional` flag (atomic DDL + record write), upserts checksum/state/timestamp, lists applied records, and rolls a migration back, all over an injected `SqliteMigrationDatabaseClient` (the executor's client plus `exec`).
- Added 4 engine-free planner tests and a `node:sqlite` availability-guarded smoke proving apply, idempotent re-run, drift rejection, and rollback (queue table dropped). Exported from the barrel.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-sqlite-migration-runner-release-check.md` (pass with follow-ups).
- Sequenced this before replay scheduling because migrations are owned by `packages/db` and the runner is a prerequisite for desktop wiring, whereas replay scheduling is desktop-owned.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- sqlite-migration-runner.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (db 131 tests).
- Pushed implementation commit `656656d` (`feat(db): add local SQLite migration runner`) to `feature/presenter-domain-contracts`.

Next task:
- Add a pure Presenter local sync queue replay decision contract (ordering, backoff, attempt-limit gating) extending the existing replay-readiness helper.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue persistence composition

Tasks completed:
- Re-synced with `agents.md`, the Presenter local sync queue plans, the engineering rules, the SQLite executor release check, and the API presenter composition pattern.
- Added `createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig` in `packages/db/src/presenter-local-sync-queue-composition.ts`: a Zod-validated runtime config (shared `DatabaseConnectionConfigSchema`, defaulting to the `sqlite` runtime) plus an injected `SqliteDatabaseClient`, composing `createSqliteExecutor` with `createPresenterLocalSyncQueueSqlRepository`.
- Config parse rejects non-`sqlite` runtimes; the factory throws when the injected client is absent.
- Added 4 default tests (config parse, non-sqlite rejection, end-to-end wiring via a fake client, missing-dependency guard) needing no live engine; exported from the barrel.
- Confirmed `apps/desktop` is an unscaffolded README-only placeholder, so the selection lives in `packages/db` for the desktop app to consume once scaffolded.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-composition-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-local-sync-queue-composition.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (db 125 tests).
- Pushed implementation commit `b03c1b8` (`feat(db): add Presenter local sync queue persistence composition`) to `feature/presenter-domain-contracts`.

Next task:
- Add a Presenter local sync queue replay scheduling decision contract (pure policy logic, no live Tauri/event-bus/API).

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue SQLite executor + integration smoke

Tasks completed:
- Re-synced with `agents.md`, the Presenter local sync queue plans, the engineering rules, the adapter release check, and the existing `postgresql-planning-executor` injection pattern.
- Added `createSqliteExecutor` in `packages/db/src/sqlite-executor.ts`: a dependency-free adapter from an injected `SqliteDatabaseClient` (satisfiable by `node:sqlite` `DatabaseSync` or `better-sqlite3`) to the `PlanningSqlExecutor.query` boundary used by the local sync queue repository.
- Routed `SELECT`/`RETURNING` statements through `all()` and other writes through `run()`; normalized boolean params to integers and `bigint` row values to numbers; rejected array binds; wrapped engine failures with the statement name and cause.
- Added 7 fake-client executor unit tests (no engine) and a real-engine integration smoke that runs the full queue lifecycle (enqueue/get/list/replay/conflict/requeue/sync/cleanup) against a `node:sqlite` `:memory:` database, auto-skipping when the engine is absent.
- Exported the executor from the package barrel and wrote `07-reviews/architecture/presenter-local-sync-queue-sqlite-executor-release-check.md` (pass with follow-ups).
- Validation passed: `pnpm --filter @sanctuary-os/db test -- sqlite-executor.test.ts presenter-local-sync-queue-sqlite-integration.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (db 121 tests).
- Pushed implementation commit `19e0a1e` (`feat(db): add SQLite executor and local sync queue integration smoke`) to `feature/presenter-domain-contracts`.

Next task:
- Add a Presenter local sync queue desktop-local persistence selection factory that wires the SQLite executor and queue adapter from a validated runtime config.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue SQLite adapter + release check

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, the Presenter module/local-sync/storage plans, the migration artifact release check, and the existing local sync queue repository contracts/migration.
- Implemented `createPresenterLocalSyncQueueSqlRepository` in `packages/db/src/presenter-local-sync-queue-sql-repository.ts` against the existing `PresenterLocalSyncQueuePersistenceRepository` contract and the `presenter_local_sync_queue_entries` migration.
- Covered enqueue, tenant-scoped get, replay-ready listing with conflict blocking, status transitions (replaying/synced/conflict/failed/requeue/cancel), and retention cleanup using single-statement SQLite-compatible mutations with `RETURNING` and a `status`-from guard.
- Added canonical JSON serialization for stored operation/conflict payloads, row-to-contract mapping validated through the persistence schemas, an operation-column vs payload integrity check, and a tenant-mismatch guard.
- Added 17 no-live-database adapter tests via a recording executor; exported the adapter from the package barrel.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-sql-adapter-release-check.md`. Result: pass with follow-ups. No blocking defects found.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-local-sync-queue-sql-repository.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed adapter commit `1e2c936` (`feat(presenter): add local sync queue SQLite repository adapter`) to `feature/presenter-domain-contracts`.

Next task:
- Add a concrete SQLite executor and opt-in live-database integration smoke for the Presenter local sync queue adapter.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue migration artifact release check

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, Presenter module/local-sync/storage plans, the prior repository contract release check, and current Presenter local sync queue migration artifacts/tests.
- Audited `PresenterLocalSyncQueueMigration` and migration tests against the Presenter local sync queue storage expectations.
- Verified table shape, required columns, tenant scope, schema version, operation/status constraints, retry/conflict/failure guards, replay/status/request indexes, rollback SQL, registry order, checksum coverage, SQLite portability, default no-live-database validation, and the absence of adapter/runtime/desktop/API replay wiring.
- Wrote `07-reviews/architecture/presenter-local-sync-queue-migration-artifact-release-check.md`.
- Result: pass with follow-ups. No blocking defects found.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-migrations.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Add Presenter local sync queue SQLite local repository adapter scaffolding.

Open questions:
- None.

## 2026-06-16 21:47 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, current Presenter domain/API/service/event contracts, and Presenter persistence contracts/adapters.
- Audited Presenter domain contracts, GraphQL/service contracts, in-memory service adapter, event contracts/publication, persistence contracts, and in-memory persistence repository adapters against the Presenter plan and engineering rules.
- Verified tenant scope, actor/request audit metadata, Zod validation boundaries, event publication after successful state changes, adapter isolation, no raw media payload storage, no OBS/stream automation, and no checked-in secrets.
- Wrote `07-reviews/architecture/presenter-api-event-persistence-release-check.md`.
- Recorded a pass-with-follow-up result: no blocking defects found; Presenter SQL adapters, migrations, runtime persistence composition, WebSocket server wiring, desktop event bus wiring, desktop output windows, and UI remain future slices.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `0ef3094 docs(presenter): add api event persistence release check`.

Next task:
- Add Presenter PostgreSQL persistence migrations and repository adapters.

Open questions:
- None.

## 2026-06-17 - feature/presenter-domain-contracts - Presenter local sync queue migration artifact

- Added `PresenterLocalSyncQueueMigration` in `packages/db/src/presenter-migrations.ts`.
- Defined the SQLite-compatible `presenter_local_sync_queue_entries` table with tenant scope, queue entry identity, presentation/actor/request/base revision metadata, operation/status fields, JSON text payload/conflict fields, safe failure text, retry timestamps, schema version, and created/updated timestamps.
- Added replay, status dashboard, and request idempotency indexes plus rollback SQL and deterministic checksum coverage.
- Added migration tests for artifact validity, registry order, required columns, tenant scope, schema version, status/operation constraints, retry constraints, indexes, rollback SQL, portability, and secret/raw-media/OBS/stream/vendor field exclusion.
- Kept the slice migration-artifact-only with no concrete local adapter, production queue runner, desktop UI, Tauri command, desktop event bus, GraphQL/API replay changes, vendor SDK, Auth0 integration, AI execution, deployment config, or checked-in secrets.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-migrations.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed implementation commit `432cbca` (`feat(presenter): add local sync queue migration artifact`) to `feature/presenter-domain-contracts`.
- Next task: run a focused release check for Presenter local sync queue migration artifacts.

Open questions:
- None.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue repository contract release check

- Completed the Presenter local sync queue repository contract release check and wrote findings to `07-reviews/architecture/presenter-local-sync-queue-repository-contract-release-check.md`.
- Result: pass with follow-ups. The DB package repository contract layer has strict Zod validation for storage schema versioning, approved queued operations, queue entry persistence records, conflict details, status transitions, enqueue/read/list/transition/conflict/failure/cleanup operation shapes, replay ordering, and stale-data blocking.
- Verified the slice avoids SQLite migrations, concrete adapters, production queue runners, desktop/Tauri/event-bus wiring, GraphQL/API replay changes, OBS/stream controls, raw media payloads, vendor tokens, and secrets.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-repository-contracts.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed release-check commit `01d5567` (`docs(presenter): add local sync queue repository release check`) to `feature/presenter-domain-contracts`.
- Next task: add Presenter local sync queue SQLite migration artifacts and migration tests.

Open questions:
- None.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue repository contracts

- Added Presenter local sync queue persistence repository contracts in `packages/db/src/presenter-repository-contracts.ts`.
- Added strict Zod schemas/types for queue storage schema version, approved queued operations, queue entry persistence records, conflict details, status transitions, enqueue/read/list/transition/conflict/failure/cleanup operation shapes, and cleanup results.
- Added `PresenterLocalSyncQueuePersistenceRepository` plus the adapter-free `listPresenterLocalSyncQueueEntriesReadyForReplay` helper for replay ordering and stale-data blocking behind conflict/failed entries.
- Added focused tests for enqueue validation, tenant/presentation mismatch rejection, duplicate reorder rejection, secret-like field rejection, transition validation, conflict/failure/cleanup operation shapes, replay ordering/stale-data blocking, retry metadata preservation, request/base-revision preservation, and adapter-free repository interface shape.
- Kept the slice contract-only with no SQLite schema/migrations, concrete local adapter, production queue runner, desktop UI, Tauri command, desktop event bus, GraphQL/API replay changes, OBS/stream automation, vendor SDK, Auth0 integration, AI execution, deployment config, or checked-in secrets.
- Validation passed: `pnpm --filter @sanctuary-os/db test -- presenter-repository-contracts.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed implementation commit `f621ff4` (`feat(presenter): add local sync queue repository contracts`) to `feature/presenter-domain-contracts`.
- Next task: run a focused release check for Presenter local sync queue repository contracts.

Open questions:
- None.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue storage plan

- Added `05-plans/presenter-local-sync-queue-storage-plan.md`.
- Defined local persistence ownership, storage record shape, SQLite-compatible table/index expectations, migration expectations, repository contract operations, replay/idempotency metadata, stale-data/conflict behavior, retry/retention behavior, tenant isolation, privacy constraints, and implementation test expectations.
- Linked the storage plan from `05-plans/presenter-local-sync-queue-plan.md`.
- Kept the slice planning-only with no SQLite migrations, concrete local adapter, production queue runner, desktop UI, Tauri command, desktop event bus, API replay implementation, vendor SDK, Auth0 integration, AI execution, deployment config, or checked-in secrets.
- Validation passed: `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed planning commit `8cc6f9b` (`docs(presenter): add local sync queue storage plan`) to `feature/presenter-domain-contracts`.
- Next task: add Presenter local sync queue local persistence repository contracts and tests.

Open questions:
- None.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue contract release check

- Completed the Presenter local sync queue contract release check and wrote findings to `07-reviews/architecture/presenter-local-sync-queue-contract-release-check.md`.
- Result: pass with follow-ups. The contract layer has strict Zod validation for approved queued operations, queue entries, conflict details, retry metadata, status transitions, and replay ordering.
- Verified the slice avoids production queue runners, SQLite migrations, local persistence adapters, desktop/Tauri/event-bus wiring, GraphQL/API coupling changes, OBS/stream controls, raw media payloads, vendor tokens, and secrets.
- Validation passed: `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed release-check commit `5c39a18` (`docs(presenter): add local sync queue contract release check`) to `feature/presenter-domain-contracts`.
- Next task: add a Presenter local sync queue persistence/storage plan before implementing SQLite-backed queue storage.

Open questions:
- None.

## 2026-06-16 22:17 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, product vision, system map, engineering rules, API plan, Presenter module plan, Presenter API/event/persistence release check, Presenter persistence composition release check, current API event contracts, and Presenter service event publication code.
- Added an API event transport boundary in `apps/api/src/events/index.ts` that validates event envelopes, wraps them with tenant/aggregate/event-type routing metadata, and dispatches through an injected transport client.
- Added an in-memory API event transport client for tests with tenant-, aggregate-, and event-type-scoped subscriptions, unsubscribe behavior, and ordered delivery recording.
- Preserved `publishAfterCommit` validation semantics by adding `createApiEventTransportPublisher`, which rejects malformed Presenter envelopes before transport delivery.
- Added focused tests for Presenter event dispatch ordering, tenant-scoped routing, aggregate-scoped subscriptions, malformed envelope rejection, route metadata mismatch rejection, and rejection of OBS/stream/raw-media/secret-like payloads.
- Documented the event transport boundary in `apps/api/README.md`, including that default tests use in-memory transport only and do not start live WebSocket, desktop bus, OBS, or stream controls.
- Rebased onto remote `a05a4ed fix(db): split presenter sql child writes`, reran validation, and pushed `7576912 feat(api): add presenter event transport`.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- events/index.test.ts presenter`, `pnpm --filter @sanctuary-os/api test:integration:postgres`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Run a focused Presenter event transport release check and record findings under `07-reviews/architecture/`.

Open questions:
- None.

## 2026-06-16 22:12 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, product vision, system map, engineering rules, API plan, Presenter module plan, Presenter persistence composition release check, Presenter runtime composition, Presenter migrations, Presenter SQL repositories, and the Planning opt-in PostgreSQL smoke test pattern.
- Added `apps/api/src/services/presenter/postgresql-integration.test.ts`, skipped by default unless `SANCTUARY_OS_PRESENTER_POSTGRES_URL` is set.
- The Presenter smoke test validates an isolated Zod-checked schema name, applies `PresenterInitialSchemaMigration`, builds SQL-backed Presenter persistence through API runtime composition, and exercises presentation save/query, service lookup, theme query, output target linking, slide add/update/reorder/remove, and audit rows.
- Updated `apps/api` integration script so `pnpm --filter @sanctuary-os/api test:integration:postgres` runs both Planning and Presenter smoke tests, each skipped unless its module URL variable is set.
- Documented `SANCTUARY_OS_PRESENTER_POSTGRES_URL`, optional `SANCTUARY_OS_PRESENTER_POSTGRES_SCHEMA`, schema cleanup behavior, and no-secrets guidance in API/DB docs.
- Fixed two live-PostgreSQL Presenter SQL issues covered by the smoke path: aggregate slide JSON now strips null optional fields before Zod parsing, and `removeSlide` deletes slide blocks before deleting the slide row.
- Verified default validation remains live-DB-free: `pnpm --filter @sanctuary-os/api test:integration:postgres` passed with both live tests skipped without database URLs.
- Ran and passed focused Presenter API/DB tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `44485d4 test(presenter): add postgres integration smoke`.

Next task:
- Add API WebSocket/event transport wiring for validated Presenter events, without desktop event bus, UI, OBS, or stream automation.

Open questions:
- None.

## 2026-06-16 22:07 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, product vision, system map, engineering rules, API plan, Presenter module plan, the prior Presenter API/event/persistence release check, Presenter composition code/tests, and current Presenter DB persistence adapters.
- Audited the Presenter persistence composition boundary against the Presenter plan, API plan, engineering rules, and earlier release-check follow-up.
- Verified default/test in-memory selection, production SQL dependency requirements, strict secret-free runtime config, PostgreSQL binding isolation, live-DB-free default tests, tenant/audit repository boundary preservation, no GraphQL-to-DB coupling, no raw media storage, no OBS/stream automation, and no checked-in secrets.
- Wrote `07-reviews/architecture/presenter-persistence-composition-release-check.md`.
- Recorded a pass-with-follow-up result: no blocking defects found; opt-in live PostgreSQL coverage, WebSocket server wiring, desktop run-mode/output-window integration, and local sync queue remain future slices.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- composition.test.ts presenter`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `40af0af docs(presenter): add persistence composition release check`.

Next task:
- Add opt-in live PostgreSQL coverage for Presenter persistence composition with documented skip behavior and no checked-in secrets.

Open questions:
- None.

## 2026-06-16 22:05 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, product vision, system map, engineering rules, API plan, Presenter module plan, the Presenter release check, current Planning composition patterns, and Presenter DB SQL/in-memory repositories.
- Added `apps/api/src/services/presenter/composition.ts` to select Presenter persistence adapters by environment/mode.
- Defaulted development/test Presenter persistence to the DB in-memory adapter and production Presenter persistence to SQL when dependencies are supplied.
- Added strict Presenter runtime config parsing that stores database URL environment variable names only and rejects secret-bearing config fields.
- Added PostgreSQL runtime dependency construction using the existing SQL executor boundary without requiring a live database in default tests.
- Added focused API composition tests for default/test selection, production SQL construction, explicit production in-memory mode, strict config validation, injected executor behavior, PostgreSQL binding forwarding, and missing runtime dependency failure.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- composition.test.ts presenter`, `pnpm --filter @sanctuary-os/api typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `b14d48f feat(presenter): add persistence composition`.

Next task:
- Run a focused Presenter persistence composition release check and record findings under `07-reviews/architecture/`.

Open questions:
- None.

## 2026-06-16 21:59 EDT · feature/presenter-domain-contracts

Tasks completed:
- Continued the Presenter persistence foundation from the release-check handoff in a clean temporary worktree, leaving unrelated dirty changes in the original worktree untouched.
- Added Presenter PostgreSQL migration artifacts for presentations, slides, slide blocks, scripture passages/verses, media cues, themes, output targets, presentation-output target links, and audit metadata.
- Added PostgreSQL-compatible Presenter query and command repository adapters with tenant predicates, transaction propagation, row validation, actor/request audit metadata, mutation intent auditing, slide ordering support, output target links, and raw-media/secret/vendor-field rejection.
- Added focused DB tests using recording executors only; no live PostgreSQL dependency was introduced.
- Rebased the local SQL persistence commit onto the latest pushed `feature/presenter-domain-contracts` branch and pushed `902584c feat(db): add presenter sql persistence`.
- Verified `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass after the rebase.

Next task:
- Wire API runtime composition to select in-memory/test or production Presenter persistence adapters.

Open questions:
- None.

## 2026-06-16 21:44 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, current Presenter service contracts, existing DB repository patterns, and `packages/db/src/presenter-repository-contracts.ts`.
- Moved the in-memory Presenter persistence repository adapter into `packages/db` and exported it from the DB package.
- Implemented shared in-memory query and command repositories for saved presentations, Presenter themes, output targets, and slide add/update/reorder/remove mutations.
- Preserved tenant scope, actor/request audit metadata, transaction ID recording, Zod operation validation, opaque IDs, clone-on-read/write defensive copying, presentation-to-output-target links, and no raw media/OBS/vendor/secret storage.
- Removed the earlier API-local Presenter persistence testing adapter now that the persistence adapter lives with the DB contracts.
- Added focused DB tests covering tenant-scoped queries, operation validation, audit metadata, mutation behavior, output-target links, defensive copying, and invalid/out-of-scope payload rejection via the existing contracts.
- Kept the slice persistence-adapter-only with no SQL adapter, database migration, WebSocket server, desktop event bus wiring, UI, OBS automation, stream start/stop, vendor SDKs, AI execution, deployment config, or checked-in secrets.
- Ran and passed `pnpm --filter @sanctuary-os/db test -- presenter-in-memory-repository.test.ts presenter-repository-contracts.test.ts`, `pnpm --filter @sanctuary-os/db typecheck`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Run a Presenter API/event/persistence release-check before SQL adapter work, or start PostgreSQL Presenter persistence adapters if the release-check is already complete.

Open questions:
- None.

## 2026-06-16 21:36 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, current Presenter service contracts, and existing DB repository contract patterns.
- Added Presenter persistence contract schemas and repository interfaces in `packages/db` for saved presentations, themes, output targets, and slide mutations.
- Required tenant/request/actor scope on Presenter persistence operations through shared repository options, with Presenter-specific actor validation.
- Preserved opaque IDs, strict Zod validation, tenant consistency checks, adapter isolation, and no raw media payload/vendor secret storage.
- Added focused tests covering operation validation, tenant/audit metadata requirements, aggregate consistency, slide mutation operation shapes, output target/theme contracts, and rejection of raw media/OBS/vendor/secret-like fields.
- Kept the slice contract-only with no SQL adapter, database migration, WebSocket server, desktop event bus wiring, UI, OBS automation, stream start/stop, vendor SDKs, AI execution, deployment config, or checked-in secrets.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `832e4fc feat(db): add presenter persistence contracts`.

Next task:
- Add in-memory Presenter persistence repository adapters for the new contracts.

Open questions:
- None.

## 2026-06-16 21:29 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, and current Presenter domain/API/service/event contracts.
- Added an optional `EventPublisher` dependency to `createInMemoryPresenterServicesAdapter`.
- Wired Presenter in-memory command mutations to publish validated events after successful state changes.
- Published `presentation.updated` for presentation create/update/theme/slide mutations, `presenter.slideChanged` when slide mutations identify an affected active slide, and `presenter.outputBlanked` / `presenter.outputRestored` from output target safe-blank state.
- Preserved service-owned role checks, tenant scoping, Zod validation, no event publication before successful mutation validation, and no publication after rejected mutations.
- Kept the slice local/adapter-only with no WebSocket server, desktop event bus wiring, PostgreSQL adapters, DB migrations, UI, OBS automation, stream start/stop, vendor SDKs, AI execution, deployment config, or checked-in secrets.
- Added focused tests for event publication after successful mutations, event ordering, output blank/restore events, payload tenant/aggregate/request/actor scope, and no events after rejected mutations.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- presenter`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `43abfa6 feat(presenter): publish in-memory mutation events`.

Next task:
- Add Presenter persistence contracts for saved presentations and output targets.

Open questions:
- None.

## 2026-06-16 21:22 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, current Presenter domain/API/service contracts, and existing API event conventions.
- Extended the API event contract union with Presenter event names: `presentation.updated`, `presenter.slideChanged`, `presenter.outputBlanked`, and `presenter.outputRestored`.
- Added strict Presenter event payload schemas with schema versions, tenant IDs, presentation aggregate IDs, and optional actor/request scope through the shared event envelope.
- Added Presenter-specific envelope consistency validation so event tenant IDs match payload tenant IDs and event aggregate IDs match payload presentation IDs.
- Kept the slice contract-only with no WebSocket server wiring, desktop event bus wiring, service publication, persistence adapters, DB migrations, UI, OBS control, stream start/stop, vendor SDKs, AI execution, deployment config, or checked-in secrets.
- Added focused tests for event names, schema versions, publisher validation, tenant/aggregate mismatch rejection, and rejection of OBS/stream/raw-media/secret-like payload fields.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- events`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `4ed2829 feat(presenter): add event payload contracts`.

Next task:
- Wire Presenter service mutations to emit validated events after durable in-memory state changes.

Open questions:
- None.

## 2026-06-16 21:17 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, and current Presenter domain/API contracts.
- Added `createInMemoryPresenterServicesAdapter` in `apps/api/src/services/presenter/in-memory.ts`.
- Implemented in-memory Presenter query and command services behind the existing GraphQL resolver contracts.
- Added service-owned role checks, tenant-scoped reads/writes, Zod validation, deterministic ID/clock injection for tests, default tenant theme creation, slide add/update/reorder/remove behavior, theme application, and output target storage.
- Kept the slice persistence-adapter-free with no DB migrations, SQL adapters, UI, desktop windows, Tauri commands, raw media storage, Bible API, OBS control, stream start/stop, vendor SDKs, Auth0 integration, AI prompt execution, deployment config, or checked-in secrets.
- Added focused tests for creation, tenant isolation, read-vs-write roles, slide mutation behavior, output target tenant validation, and GraphQL resolver composition through in-memory services.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- presenter`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `c2b5db5 feat(presenter): add in-memory service adapter`.

Next task:
- Add Presenter WebSocket event payload contracts for `presentation.updated`, `presenter.slideChanged`, `presenter.outputBlanked`, and `presenter.outputRestored`.

Open questions:
- None.

## 2026-06-16 21:07 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, and current API layout.
- Added Presenter service contract schemas/interfaces in `apps/api/src/services/presenter/` for planned Presenter queries and mutations.
- Added Presenter GraphQL SDL placeholders and typed resolver shells in `apps/api/src/graphql/presenter.ts`.
- Wired Presenter operation names into the GraphQL public surface exports.
- Kept the slice implementation-free beyond contracts: no repositories, DB migrations, UI, desktop windows, Tauri commands, raw media storage, Bible API, OBS control, stream start/stop, vendor SDKs, Auth0 integration, AI execution, deployment config, or checked-in secrets.
- Added focused tests for Presenter operation names, actor/request delegation, resolver validation, duplicate slide order rejection, destructive slide-removal confirmation, service error propagation, and exclusion of stream/OBS/raw-media controls.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- presenter`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `04812e6 feat(presenter): add graphql contract shells`.

Next task:
- Add in-memory Presenter services/repositories for GraphQL contract tests and development composition.

Open questions:
- None.

## 2026-06-16 20:56 EDT · feature/presenter-domain-contracts

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Presenter module plan, and current app/package layout.
- Created `feature/presenter-domain-contracts` from the pushed `feature/planning-live-postgres-integration` tip because the worktree started detached at that commit.
- Added the first Presenter domain contract surface in `apps/api/src/domain/presenter/` for Presentation, Slide, SlideBlock, ScripturePassage, MediaCue, OutputTarget, and PresenterTheme.
- Added local Presenter run-mode schemas for loading an embedded offline-safe presentation, slide navigation, blank/restore output, and confidence output toggling.
- Kept the slice adapter-free with no UI, GraphQL resolvers, persistence adapters, media storage, Bible API, OBS control, vendor SDKs, Auth0, deployment config, checked-in secrets, or AI prompt execution.
- Added focused Zod contract tests for schema validation, tenant consistency, load-action tenant boundaries, offline-safe loaded state, output run-mode actions, duplicate/missing slide references, and rejection of secret-like fields.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Add Presenter GraphQL contract documentation or API contract scaffolding based on the Presenter domain schemas.

Open questions:
- None.

## 2026-06-16 20:51 EDT · feature/planning-live-postgres-integration

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, existing `05-plans/*.md`, and architecture release checks.
- Chose Presenter as the next product module after Planning persistence readiness because it is the next workflow step in the system map and is owned by the desktop app for slides, scripture, outputs, and style.
- Added `05-plans/presenter-module-plan.md` covering v1 scope, out-of-scope items, domain objects, domain boundaries, API/storage surfaces, GraphQL shape, desktop run-mode actions, WebSocket events, offline/failure rules, privacy/safety rules, AI assist rules, and first-task acceptance.
- Kept the slice documentation-only with no module implementation code, UI, database migrations, vendor SDK integration, OBS control, Auth0 changes, deployment config, secrets, or GraphQL contract code.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `82f5f57 docs(presenter): add module implementation plan` to `origin/feature/planning-live-postgres-integration`.

Next task:
- Add Presenter domain contracts and local run-mode schemas from `05-plans/presenter-module-plan.md`.

Open questions:
- None.

## 2026-06-16 20:47 EDT · feature/planning-live-postgres-integration

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, Planning persistence release-checks, and current API/DB persistence wiring.
- Added opt-in live PostgreSQL integration coverage for Planning runtime composition in `apps/api/src/services/planning/postgresql-integration.test.ts`.
- The smoke test is skipped by default unless `SANCTUARY_OS_PLANNING_POSTGRES_URL` is set, creates/recreates an isolated schema, applies the Planning initial migration, and exercises SQL-backed Planning command/query/CCLI/rehearsal/readiness repositories through API runtime composition.
- Added API package `test:integration:postgres` plus `pg` / `@types/pg` dev dependencies for the opt-in harness.
- Documented the integration environment variables, local command, schema behavior, and no-secrets rule in `apps/api/README.md`, with DB README pointing to the API-owned runtime composition smoke test.
- Normalized `Date` values returned by PostgreSQL clients to ISO strings in the DB PostgreSQL executor, with regression coverage, so repository row schemas can safely parse real `pg` timestamp results.
- Verified default validation remains live-DB-free: `pnpm --filter @sanctuary-os/api test:integration:postgres` skipped the live test without a database URL; `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed.
- Committed and pushed `0294e4e test(api): add planning postgres integration smoke` to `origin/feature/planning-live-postgres-integration`.

Next task:
- Create the next product module plan, likely Presenter, so implementation can proceed beyond Planning persistence with a documented active slice.

Open questions:
- None.

## 2026-06-16 20:39 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, the Planning DB persistence release-check, and current API/DB persistence wiring.
- Audited Planning production persistence wiring across API runtime composition, PostgreSQL executor behavior, strict config boundaries, transaction behavior, secret handling, tenant/audit continuity, adapter isolation, and live-DB-free tests.
- Wrote `07-reviews/architecture/planning-production-persistence-wiring-release-check.md`.
- Recorded a pass-with-follow-up result: no blocking defects found in the production persistence wiring.
- Decided to add opt-in live PostgreSQL integration coverage with documented skip behavior before proceeding to the next product module.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `cfed591 docs(api): add planning persistence wiring release check`.

Next task:
- Add opt-in live PostgreSQL integration coverage for Planning persistence wiring with documented skip behavior and no checked-in secrets.

Open questions:
- None.

## 2026-06-16 19:48 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, the Planning DB persistence release-check, and current API composition / DB SQL adapter code.
- Added a concrete PostgreSQL-compatible Planning SQL executor boundary in `packages/db` that forwards named SQL statements and parameters, validates query result envelopes, uses transaction-scoped clients, rolls back on failed transaction operations, releases clients, and normalizes database failures without leaking raw connection details.
- Tightened DB connection metadata validation so config stores URL environment variable names only and rejects secret-looking connection URL fields.
- Added API Planning runtime config parsing for environment/mode plus PostgreSQL database URL env-var metadata, with production SQL mode requiring PostgreSQL runtime bindings while preserving in-memory defaults and the existing injected SQL dependency path.
- Covered runtime config validation, secret-free boundaries, PostgreSQL statement forwarding, transaction forwarding, rollback/release behavior, missing transaction pool failure, and missing production runtime dependency failure with live-DB-free tests.
- Installed workspace dependencies for validation because the worktree initially lacked `node_modules`.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `feat(api): add planning postgresql runtime binding`.

Next task:
- Run a release-check for Planning production persistence wiring and decide whether to add opt-in live PostgreSQL integration coverage or proceed to the next product module.

Open questions:
- None.

## 2026-06-16 19:41 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, the Planning DB persistence release-check, and current `apps/api` / `packages/db` persistence code.
- Added an API Planning persistence composition boundary that selects in-memory persistence for development/test by default and SQL-backed repository adapters for production by default.
- Kept configuration strict and secret-free: production SQL mode requires injected executor/clock/ID dependencies, while connection strings, live PostgreSQL execution, migrations execution, and deployment config remain out of scope.
- Added an in-memory Planning readiness repository adapter so API composition can provide readiness save/lookup behavior without a live database.
- Covered environment/mode defaults, explicit overrides, SQL dependency requirements, strict config rejection of secret-bearing fields, in-memory operation recording, readiness seed lookup, and SQL adapter construction with live-DB-free tests.
- Ran and passed `pnpm --filter @sanctuary-os/api test -- composition.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- Committed and pushed `c25fa67 feat(api): add planning persistence composition`.

Next task:
- Add the concrete PostgreSQL client binding and runtime configuration boundary for Planning persistence without checking in secrets.

Open questions:
- None.

## 2026-06-16 15:53 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, ADR 0004, and current `packages/db` SQL adapter code.
- Audited the implemented Planning SQL persistence layer against `05-plans/db-plan.md`, ADR 0003, ADR 0004, and active repository contracts.
- Verified command, query, CCLI usage, rehearsal tracking, readiness, migration, tenant scope, audit metadata, transaction propagation, row validation, no secret/PII/media payload storage, adapter isolation, and live-DB-free test coverage.
- Wrote findings to `07-reviews/architecture/planning-db-persistence-release-check.md`.
- Recorded a pass-with-follow-up result: no blocking defects found; production API composition, concrete PostgreSQL client binding, runtime config, and live DB integration coverage remain future slices.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `62c1258 docs(db): add planning persistence release check`.

Next task:
- Wire API composition to select in-memory/test or production Planning persistence adapters by environment.

Open questions:
- None.

## 2026-06-16 15:49 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, existing `packages/db` SQL adapter code, and current Planning readiness contracts.
- Identified that readiness lookup already existed in the Planning query SQL repository, while readiness save needed a narrow additive DB persistence contract.
- Added `08-decisions/0004-add-readiness-save-persistence-contract.md` to record the additive readiness save contract decision.
- Added `PlanningReadinessPersistenceRepository.saveServiceReadiness` and its Zod operation schema in `packages/db`.
- Added the SQL-first Planning readiness adapter in `packages/db` with `saveServiceReadiness` and `getServiceReadiness`.
- Covered tenant/result mismatch rejection, service ownership checks, JSONB readiness fields, upsert behavior, request/actor audit metadata, mutation intent, transaction propagation, row validation, and no contact/PII/prompt/secret SQL fields with live-DB-free adapter tests.
- Kept the slice free of live database execution, connection strings, secrets, GraphQL/resolver changes, API service wiring, UI, workers, vendor SDKs, Auth0, command adapter changes, CCLI adapter changes, rehearsal tracking adapter changes, and ORM/query-builder adoption.
- Ran and passed `pnpm --filter @sanctuary-os/db test -- planning-readiness-sql-repository.test.ts planning-repository-contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `2e03202 feat(db): add planning readiness sql adapter`.

Next task:
- Run a Planning DB persistence release-check against `05-plans/db-plan.md`, ADR 0003/0004, and implemented SQL adapters, then write findings to `07-reviews/architecture/`.

Open questions:
- None.

## 2026-06-16 15:42 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, existing `packages/db` SQL adapter code, and the Planning rehearsal tracking service contracts.
- Added the SQL-first Planning rehearsal tracking persistence adapter in `packages/db` for rehearsal asset visibility set/list and rehearsal acknowledgement record/list.
- Preserved tenant predicates, service/service-item/assignment ownership checks, actor/request audit metadata, mutation intent, transaction-handle propagation, adapter row validation, and no media/contact payload storage at the SQL adapter boundary.
- Covered asset visibility set/list, acknowledgement record/list, supplied transaction behavior, audit metadata, no media/contact SQL columns, malformed-row rejection, and live-DB-free adapter behavior with tests.
- Kept the slice free of live database execution, connection strings, secrets, GraphQL/resolver changes, API service wiring, UI, workers, vendor SDKs, Auth0, command adapter changes, query adapter changes, CCLI adapter changes, readiness adapter work, and ORM/query-builder adoption.
- Ran and passed `pnpm --filter @sanctuary-os/db test -- planning-rehearsal-tracking-sql-repository.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `f0929b6 feat(db): add planning rehearsal tracking sql adapter`.

Next task:
- Implement the SQL-first Planning readiness persistence adapter.

Open questions:
- None.

## 2026-06-16 15:35 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, existing `packages/db` SQL adapter code, and the Planning CCLI usage service contract.
- Added the SQL-first Planning CCLI usage persistence adapter in `packages/db` for `recordCcliUsage` and `listCcliUsageLogs`.
- Added tenant-scoped SQL for usage-log recording and listing, service/service-item ownership checks, pending reporting status defaults, audit inserts, transaction propagation, and row validation.
- Covered CCLI usage writes, reads by service/status, supplied transaction behavior, audit metadata, no vendor credential/token/password storage, malformed-row rejection, and live-DB-free adapter behavior with tests.
- Kept the slice free of live database connections, secrets, dependency installation, GraphQL/resolver changes, API service wiring, UI, workers, vendor CCLI submission/report generation, command adapter changes, query adapter changes, rehearsal adapter work, readiness adapter work, and ORM/query-builder adoption.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `2849ec6 feat(db): add planning ccli usage sql adapter`.

Next task:
- Implement the SQL-first Planning rehearsal tracking persistence adapter.

Open questions:
- None.

## 2026-06-16 15:31 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, and existing `packages/db` SQL adapter code.
- Added the SQL-first Planning query repository adapter in `packages/db` for `listServices`, `getService`, `listServiceTemplates`, `listSongLibrary`, `listServiceAssignments`, and `getServiceReadiness`.
- Added row validation for service, template, song library, assignment, and readiness rows, including JSON readiness fields and optional/null database columns.
- Covered tenant predicates, filter parameterization, null-on-missing behavior, transaction propagation for reads, song-library search parameters, no-contact/no-secret query boundaries, and malformed-row rejection with live-DB-free adapter tests.
- Kept the slice free of live database connections, secrets, dependency installation, GraphQL/resolver changes, API service wiring, UI, workers, vendor SDKs, Auth0, command adapter changes, CCLI write adapter work, rehearsal adapter work, readiness write adapter work, and ORM/query-builder adoption.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `45489f8 feat(db): add planning query sql adapter`.

Next task:
- Implement the SQL-first Planning CCLI usage persistence adapter.

Open questions:
- None.

## 2026-06-16 15:26 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, and the Planning production adapter contract.
- Completed the SQL-first Planning command repository adapter in `packages/db` for `addServiceItem`, `updateServiceItem`, `reorderServiceItems`, `assignVolunteer`, and `updateAssignmentStatus`.
- Extended adapter row validation for service items and assignments, ID generation dependencies, explicit tenant-scoped SQL statements, audit inserts, and transaction propagation.
- Covered service item create/update, atomic reorder validation, assignment create/status update, tenant predicates, audit metadata, supplied transaction behavior, no volunteer contact storage, and malformed reorder outcomes with live-DB-free adapter tests.
- Kept the slice free of live database connections, secrets, dependency installation, GraphQL/resolver changes, API service wiring, UI, workers, vendor SDKs, CCLI, rehearsal, readiness, query repository changes, and ORM/query-builder adoption.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `602aec7 feat(db): complete planning command sql adapter`.

Next task:
- Implement the SQL-first Planning query repository adapter for services, service detail, templates, song library search, assignments, and readiness lookup.

Open questions:
- None.

## 2026-06-16 15:21 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, and the Planning production adapter contract.
- Added the first SQL-first Planning command repository adapter slice in `packages/db` for `createService`, `updateService`, and `duplicateServiceFromTemplate`.
- Added a small executor interface that keeps SQL statements, parameters, row validation, audit inserts, and transaction handles visible without requiring a live PostgreSQL connection.
- Covered tenant predicates, supplied transaction propagation, adapter-created transactions, mutation audit metadata, destructive publish/cancel confirmation requirements, template duplication SQL, and returned-row Zod validation with adapter-level tests.
- Kept the slice free of live database connections, secrets, dependency installation, GraphQL/resolver changes, API service wiring, UI, workers, vendor SDKs, and ORM/query-builder adoption.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `c5e84bd feat(db): add planning service sql adapter slice`.

Next task:
- Implement SQL-first Planning command repository adapter coverage for service items, reorder, volunteer assignments, and assignment status updates.

Open questions:
- None.

## 2026-06-16 15:16 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, ADR 0003, and the Planning production adapter contract.
- Added generic SQL migration artifact contracts in `packages/db`, including checksum calculation, metadata validation for tenant/audit tables, and a static migration registry helper.
- Added the initial Planning SQL migration artifact covering services, service items, assignments, templates, song library items, readiness, CCLI usage, rehearsal asset visibility, rehearsal acknowledgements, and audit log tables.
- Covered tenant IDs, audit metadata, confirmation intent, core indexes, rollback SQL, and checksum expectations with adapter-free tests.
- Kept the slice free of live database connections, secrets, runtime adapter code, dependency installation, API wiring, GraphQL, and UI changes.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `2c76e5d feat(db): add planning migration contracts`.

Next task:
- Implement the first SQL-first Planning command repository adapter slice for service create, service update, and template duplication.

Open questions:
- None.

## 2026-06-16 15:10 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, DB plan, Planning API contract release-check, ADR 0002, and the Planning production adapter contract.
- Added `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`.
- Chose a SQL-first PostgreSQL adapter with explicit repo-owned SQL migrations for the first Planning production persistence implementation.
- Evaluated SQL-first PostgreSQL, typed query builder, and ORM-backed approaches against tenant scope, transaction handles, migration reviewability, local testing without secrets, and future SQLite compatibility.
- Kept the slice documentation-only with no adapter code, migrations, schema files, dependency installation, connection strings, secrets, UI, GraphQL, or service changes.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `7eb4975 docs(db): choose planning persistence tooling`.

Next task:
- Add migration framework tests and the initial Planning schema migration shape for SQL-first PostgreSQL persistence.

Open questions:
- None.

## 2026-06-16 15:07 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, Planning API contract release-check, ADR 0002, and the Planning production adapter contract.
- Added `05-plans/db-plan.md` with the first Planning production persistence path.
- Covered PostgreSQL server persistence, SQLite/local future compatibility, migration boundaries, transaction behavior, tenant scoping, audit metadata, error model, test strategy, and rollout order.
- Kept the slice planning-only with no adapter code, migrations, schema files, tooling installation, connection strings, secrets, UI, GraphQL, or service changes.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `74ad17c docs(db): add planning persistence plan`.

Next task:
- Write an ADR choosing the database adapter and migration tooling path for Planning production persistence.

Open questions:
- None.

## 2026-06-16 15:04 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, and the Planning API contract release-check.
- Refreshed `05-plans/planning-module-plan.md` so the GraphQL sections document the approved CCLI reporting job, CCLI usage log, rehearsal asset visibility, and rehearsal acknowledgement extension operations.
- Preserved the distinction between the original first-slice Planning GraphQL surface and later approved v1 extension operations.
- Kept the slice documentation-only with no resolver, service, runtime, UI, vendor, database, or worker changes.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `c5e8da1 docs(planning): document graphql extension operations`.

Next task:
- Create a database adapter implementation plan for Planning production persistence.

Open questions:
- None.

## 2026-06-16 15:01 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Audited current Planning API/domain/service/GraphQL contracts against `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, and `02-standards/engineering-rules.md`.
- Verified tenant scoping, thin resolver delegation, Zod trust-boundary validation, service-owned role checks, explicit publish/cancel confirmation handling, validated event/job handoff, and Planning v1 domain coverage.
- Wrote findings to `07-reviews/architecture/planning-api-contract-release-check.md`.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the release-check checklist in `06-tasks/active/NOW.md`.
- Committed and pushed `984cc48 docs(planning): add api contract release check`.

Next task:
- Refresh `05-plans/planning-module-plan.md` to document the approved Planning GraphQL CCLI and rehearsal tracking extension operations from the release-check.

Open questions:
- None.

## 2026-06-16 14:57 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired Planning GraphQL rehearsal acknowledgement record/list contracts to the existing Planning rehearsal acknowledgement service boundary.
- Added SDL contracts for `recordRehearsalAcknowledgement(input)` and `rehearsalAcknowledgements(input)`, including service ID, service item ID, asset ID, assignment ID, person ID, readiness signal, notes, tenant ID, acknowledgement ID, and acknowledged timestamp.
- Added thin resolvers that Zod-parse GraphQL-style `{ input }` args/context and delegate to `recordAcknowledgement` / `listAcknowledgements` without notification delivery, realtime fanout, mobile UI, attendance workflows, media storage, or playback integration.
- Added focused GraphQL tests for resolver delegation, request context propagation, returned acknowledgement shape, empty list behavior, invalid input rejection, and service error propagation.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.
- Committed and pushed `61919d4 feat(planning): add rehearsal acknowledgement graphql`.

Next task:
- Run a Planning API contract release-check against `05-plans/api-plan.md` and `05-plans/planning-module-plan.md`, then write findings to `07-reviews/architecture/`.

Open questions:
- None.

## 2026-06-16 14:52 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired Planning GraphQL rehearsal asset visibility set/list contracts to the existing Planning rehearsal asset visibility service boundary.
- Added SDL contracts for `setRehearsalAssetVisibility(input)` and `rehearsalAssetVisibility(input)`, including service ID, service item ID, asset ID, asset type, visibility flag, role visibility, tenant ID, title, visibility ID, and updated timestamp.
- Added thin resolvers that Zod-parse GraphQL-style `{ input }` args/context and delegate to `setAssetVisibility` / `listAssetVisibility` without media storage, chart rendering, raw media payloads, playback engine integration, UI, or notifications.
- Added focused GraphQL tests for resolver delegation, request context propagation, returned visibility shape, empty list behavior, invalid input rejection, and service error propagation.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.
- Committed and pushed `5989ed1 feat(planning): add rehearsal asset visibility graphql`.

Next task:
- Wire Planning GraphQL rehearsal acknowledgement record/list contracts to the service boundary.

Open questions:
- None.

## 2026-06-16 14:46 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired Planning GraphQL CCLI usage log record/list contracts to the existing Planning CCLI usage service boundary.
- Added SDL contracts for `recordCcliUsage(input)` and `ccliUsageLogs(input)`, including usage type, reporting status, service/song/item IDs, timestamps, notes, CCLI song number, tenant ID, and usage log ID.
- Added thin resolvers that Zod-parse GraphQL-style `{ input }` args/context and delegate to `recordUsage` / `listUsageLogs` without vendor calls, credentials, reporting submission, file generation, workers, queue infrastructure, UI, or notifications.
- Added focused GraphQL tests for resolver delegation, request context propagation, returned usage-log shape, empty list behavior, invalid input rejection, and service error propagation.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.
- Committed and pushed `24e4acc feat(planning): add ccli usage graphql`.

Next task:
- Wire Planning GraphQL rehearsal asset visibility set/list contracts to the service boundary.

Open questions:
- None.

## 2026-06-16 14:40 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired Planning GraphQL CCLI reporting job schedule/status contracts to the existing Planning CCLI usage service boundary.
- Added SDL contracts for scheduling CCLI reporting jobs and polling job status, including job IDs, job type, status, tenant/request/actor metadata, timestamps, payload, and safe error messages.
- Added thin resolvers that Zod-parse GraphQL-style `{ input }` args/context and delegate to `scheduleReportingJob` / `getReportingJobStatus` without queue workers, vendor calls, credentials, reports, UI, or notifications.
- Added focused GraphQL tests for resolver delegation, request context propagation, failed status shape with safe error message, missing-job null behavior, invalid input rejection, and unconfigured service propagation.
- Ran and passed focused GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.
- Committed and pushed `c6506aa feat(planning): add ccli reporting job graphql`.

Next task:
- Wire Planning GraphQL CCLI usage log record/list contracts to the service boundary.

Open questions:
- None.

## 2026-06-16 14:30 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free API job status transition contracts for async job workers.
- Added strict Zod validation for transition requests, including tenant/request/actor metadata, non-queued target statuses, and bounded safe error messages only on failed transitions.
- Extended the in-memory API job dispatcher with a status writer that preserves original enqueue metadata, keeps `enqueuedAt`, updates `updatedAt`, returns null for missing/cross-tenant jobs, and rejects illegal terminal/regression transitions.
- Added focused API tests for forward transitions, missing/cross-tenant transitions, failed safe-message requirements, schema rejection of queued transitions, and terminal-state rejection.
- Ran and passed focused API checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `fe346aa feat(jobs): add status transition contracts`.

Next task:
- Wire Planning GraphQL CCLI reporting job schedule/status contracts to the service boundary.

Open questions:
- None.

## 2026-06-16 14:27 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free API job status contracts with strict Zod schemas for job status records, status lookups, CCLI reporting payload validation, enqueue order, status timestamps, tenant scope, actor/request metadata, and bounded safe error messages.
- Extended the in-memory API job dispatcher to record queued status records when jobs are enqueued, clear status records between tests, and return tenant-scoped status lookups without exposing cross-tenant or missing jobs.
- Added Planning CCLI reporting job status lookup service contracts with Planning role checks, request-safe lookup metadata, `ccli-reporting` type enforcement, validated status records, and null behavior for missing/cross-tenant jobs.
- Added focused API tests for queued status records, tenant-scoped lookup, malformed status rejection, missing job behavior, service authorization, and unconfigured reader behavior.
- Ran and passed focused API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.

Open questions:
- None.

## 2026-06-16 14:22 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a validated adapter-free API job dispatcher boundary for async job handoff.
- Added strict CCLI reporting job payload validation for pending reporting work, with tenant, actor, request, job type, deterministic job ID, and sequence metadata preserved for assertions.
- Added an in-memory job dispatcher that validates before recording, preserves enqueue order, returns deterministic `job_#` IDs, and supports clearing recorded jobs between tests.
- Added Planning CCLI usage service `scheduleReportingJob` handoff through the validated dispatcher, preserving tenant/actor/request metadata and keeping concrete queue infrastructure and vendor calls out of scope.
- Added focused API tests for dispatcher validation, malformed request rejection, ordering, clearing, and Planning CCLI reporting handoff authorization.
- Ran and passed focused API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `7b98ff3 feat(jobs): add ccli reporting dispatcher`.

Next task:
- Implement adapter-free API job status contracts for Planning CCLI reporting polling.

Open questions:
- None.

## 2026-06-16 14:16 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a validated adapter-free API event publisher boundary that records Planning realtime handoff events in order.
- Added request-safe metadata to Planning event envelopes by carrying `requestId` alongside tenant, actor, aggregate, event type, timestamp, schema version, and payload.
- Tightened event validation for `service.published`, `assignment.statusChanged`, and `readiness.updated` with strict payload schemas and event-specific schema-version checks.
- Added focused event publisher tests for ordered recording, invalid payload rejection, schema-version mismatch rejection, and clearing recorded events.
- Added Planning command/readiness service tests that exercise publication through the validated in-memory event publisher.
- Ran and passed focused API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `644cd5f feat(events): add validated planning event publisher`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Implement an adapter-free validated API job dispatcher for Planning CCLI reporting handoff.

Open questions:
- None.

## 2026-06-16 14:11 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, ChurchContext schema notes, setlist prompt spec, API plan, and Planning plan.
- Integrated the Planning `generateSetlist` service boundary with the validated `planning-setlist` ChurchContext projection contract.
- Added optional Planning setlist ChurchContext builder dependency support and a compatibility projection wrapper for the existing GraphQL input path.
- Validated projection envelopes before prompt request construction, including tenant, request, actor, and service metadata checks.
- Derived setlist prompt request inputs from the validated projection while preserving human-review behavior, banned/paused-song enforcement, AI output validation, and no automatic service-item writes.
- Added focused service tests for projection builder usage, prompt metadata propagation, invalid projection rejection, and existing GraphQL compatibility behavior.
- Ran and passed focused API checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `3aa7973 feat(planning): integrate setlist context projection`.

Next task:
- Implement an adapter-free validated Planning event publisher for realtime event handoff.

Open questions:
- None.

## 2026-06-16 14:04 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, ChurchContext schema notes, setlist prompt spec, API plan, and Planning plan.
- Implemented shared `planning-setlist` ChurchContext projection contracts in `@sanctuary-os/church-context`.
- Added strict Zod schemas for AI-safe service context, song candidates, church preferences, planning constraints, recent usage summaries, integrations, AI policy, target length, and projection metadata.
- Enforced setlist-generation feature availability, human-review policy, available-song presence, target-length consistency, banned/paused-song declaration, and required-song exclusion guards.
- Added API context request/envelope contracts plus an adapter-free helper that wraps validated `planning-setlist` payloads with request actor/service metadata and rejects tenant/service/schema/timestamp mismatches.
- Added focused shared package and API context tests for valid projections, PII-shaped field rejection, banned/paused song guards, and request metadata validation.
- Ran and passed focused context checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `68398be feat(context): add planning setlist projection contracts`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Integrate the Planning setlist ChurchContext projection into the generateSetlist service boundary.

Open questions:
- None.

## 2026-06-16 13:58 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a test-only in-memory Planning CCLI usage repository adapter under `apps/api/src/services/planning/testing/`.
- The adapter Zod-validates CCLI usage read/write DB operation shapes, stores seeded tenant-scoped usage logs, records actor/request/tenant context, and records mutation intent for write assertions.
- Added focused API integration tests that exercise `createPlanningCcliUsageService` through the adapter.
- Covered tenant/status-filtered reads, usage log writes, tenant-local empty reads, operation recording, and malformed DB operation rejection.
- Ran and passed focused API checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Implement Planning setlist ChurchContext projection contracts in the API context layer.

Open questions:
- None.

## 2026-06-16 13:54 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a test-only in-memory Planning rehearsal tracking repository adapter under `apps/api/src/services/planning/testing/`.
- The adapter Zod-validates rehearsal asset visibility and rehearsal acknowledgement DB operation shapes, stores seeded tenant-scoped records, records actor/request/tenant context, and records mutation intent for write assertions.
- Added focused API integration tests that exercise `createPlanningRehearsalAssetVisibilityService` and `createPlanningRehearsalAcknowledgementService` through the adapter.
- Covered visibility writes/reads, acknowledgement writes/reads, empty cross-tenant reads, operation recording, and malformed DB operation rejection.
- Ran and passed focused API checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `6b08db0 test(planning): add in-memory rehearsal tracking adapter`.

Next task:
- Implement an adapter-free in-memory Planning CCLI usage repository test adapter.

Open questions:
- None.

## 2026-06-16 13:50 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a test-only in-memory Planning query/readiness repository adapter under `apps/api/src/services/planning/testing/`.
- The adapter Zod-validates DB read operation shapes, stores seeded tenant-scoped services, assignments, service templates, song library records, and readiness records, and records actor/request/tenant read context for assertions.
- Added focused API integration tests that exercise `createPlanningQueryService` through the in-memory adapter for service, assignment, readiness, template, and song-library reads.
- Covered nullable service/readiness misses, cross-tenant non-leakage, paused-song visibility, filter behavior, and malformed DB operation rejection.
- Ran and passed focused API checks, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `17f1001 test(planning): add in-memory query repository adapter`.

Next task:
- Implement an adapter-free in-memory Planning rehearsal tracking repository test adapter.

Open questions:
- None.

## 2026-06-16 13:43 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Continued the Planning readiness input contract slice from the pushed `feature/planning-readiness-domain` branch.
- Extended adapter-free Planning readiness domain contracts with strict rehearsal acknowledgement readiness inputs and explicit CCLI readiness status inputs.
- Kept readiness calculation deterministic and tenant-scoped, preserving existing legacy CCLI booleans when no explicit CCLI status input is supplied.
- Added readiness scoring, risks, and recommendations for blocked or needs-practice rehearsal acknowledgement signals alongside existing rehearsal asset visibility and CCLI current-status checks.
- Added focused domain/service tests for acknowledgement readiness scoring, default compatibility, explicit CCLI status scoring, and invalid acknowledgement/CCLI service-item or assignment references.
- Ran and passed focused readiness tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement an adapter-free in-memory Planning query/readiness repository test adapter.

Open questions:
- None.

## 2026-06-16 13:37 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free DB Planning rehearsal acknowledgement contracts for tenant-scoped volunteer asset acknowledgements and readiness signals.
- Added API Planning rehearsal acknowledgement service contracts for recording and listing acknowledgements without media storage, chart rendering, notification integration, UI, GraphQL wiring, or raw media payload handling.
- Enforced Planning acknowledgement write/read roles, tenant scope, service scope, service-item scope, asset scope, assignment/person scope, request context propagation, and create/read persistence operation shapes.
- Added focused DB/API tests for input validation, strict raw media rejection, role rejection, tenant/service/item/asset/assignment/person guards, operation shape, and adapter-free repository boundaries.
- Ran and passed focused DB/API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Implement Planning readiness input contracts for rehearsal acknowledgements and CCLI status.

Open questions:
- None.

## 2026-06-16 13:30 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free DB Planning rehearsal asset visibility contracts for tenant-scoped rehearsal assets, including asset type enum, visibility record schema, set/list input schemas, operation schemas, and repository interface.
- Added API Planning rehearsal asset visibility service contracts for setting/listing asset visibility without media storage, chart rendering, raw media payload handling, UI, or GraphQL wiring.
- Enforced Planning visibility roles, tenant scope, service scope, service-item scope, request context propagation, and update/read persistence operation shapes.
- Added focused DB/API tests for input validation, strict raw media rejection, role rejection, tenant/service/service-item guards, operation shape, and adapter-free repository boundaries.
- Ran and passed focused DB/API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Confirmed `2a0439d feat(planning): add rehearsal asset visibility contracts` is pushed to `origin/feature/planning-readiness-domain`.

Next task:
- Implement adapter-free Planning rehearsal acknowledgement contracts in the DB/API service layers.

Open questions:
- None.

## 2026-06-16 13:24 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free DB Planning CCLI usage log contracts for tenant-scoped song usage events, including record/list inputs, persistence operation schemas, record schemas, reporting status/type enums, and a dedicated repository interface.
- Added API Planning CCLI usage service contracts for recording and listing usage logs without CCLI/SongSelect vendor calls or credential handling.
- Enforced Planning CCLI roles, tenant scope, service scope, reporting-status scope, request context propagation, and create/read operation shapes.
- Added focused DB/API tests for input validation, strict rejection of credential-shaped extra input, role rejection, tenant/service/status guards, and adapter-free repository boundaries.
- Ran and passed focused DB/API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `dcbe346 feat(planning): add ccli usage log contracts`.

Next task:
- Implement adapter-free Planning rehearsal asset visibility contracts in the DB/API service layers.

Open questions:
- None.

## 2026-06-16 13:20 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired Planning GraphQL `generateSetlist(input)` to `PlanningCommandService.generateSetlist`.
- Added reviewable generated-setlist GraphQL SDL contracts (`PlanningGeneratedSetlist`, recommendation/alternative/human-review types, and setlist song candidate input) so generated setlists no longer masquerade as persisted `PlanningService` records.
- Kept the resolver thin by parsing GraphQL-style `{ input }` args/context, attaching `AuthenticatedActor` and `requestId`, and delegating through `GeneratePlanningSetlistCommandSchema`.
- Added focused GraphQL tests for SDL return shape, resolver delegation, request context propagation, reviewable result shape, and invalid input rejection before service delegation.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.

Open questions:
- None.

## 2026-06-16 13:15 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, ChurchContext schema notes, and the setlist prompt spec.
- Added adapter-free Planning `generateSetlist(input)` command contracts in the API command service layer.
- Defined Zod schemas/types for generate-setlist command input, song-library candidates, prompt request, prompt result, and the returned reviewable setlist suggestion.
- Added `PlanningCommandService.generateSetlist` with Planning command role checks, actor tenant/request propagation into the prompt request, AI-result validation, banned/paused-song enforcement, and `persisted: false` human-review metadata before any write.
- Preserved existing Planning GraphQL resolver behavior; only test fixtures were updated to satisfy the expanded command service interface.
- Added focused API tests for input validation, role rejection, tenant/request propagation, AI-result validation, unavailable-song rejection, reviewable result shape, and no automatic service-item mutation.
- Ran and passed focused API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Wire Planning GraphQL `generateSetlist(input)` resolver contracts to the Planning command service.

Open questions:
- None.

## 2026-06-16 13:06 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired the Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contract to the existing Planning command service.
- Kept the resolver thin by parsing GraphQL-style `{ input }` args/context, forwarding `AuthenticatedActor` and `requestId`, and delegating to `PlanningCommandService.duplicateServiceFromTemplate`.
- Added focused GraphQL tests for resolver delegation, request context propagation, returned duplicated-service data, and invalid duplicate input rejection before service delegation.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Implement adapter-free Planning `generateSetlist(input)` command contracts in the API service layer.

Open questions:
- None.

## 2026-06-16 13:04 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free DB Planning duplicate-from-template command contracts for `duplicateServiceFromTemplate(input)`, including Zod persistence input/operation schemas and the command repository method.
- Added API Planning command service `duplicateServiceFromTemplate` contracts with Zod-validated input, Planning command role checks, actor/request tenant forwarding, create mutation intent, tenant-scope guards, and returned duplicated-service field mismatch guards.
- Extended the test-only in-memory Planning command repository adapter to support duplicate-from-template operations and operation recording.
- Added focused DB/API tests for input validation, operation shape, role rejection, tenant scope, mutation intent, repository contract shape, returned-service mismatch guards, and in-memory adapter flow.
- Ran and passed focused DB/API tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Wire Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contracts to the Planning command service.

Open questions:
- None.

## 2026-06-16 12:59 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Verified the Planning GraphQL `songLibrary(searchInput)` resolver contract was already implemented in `28afb15 feat(planning): wire song library query resolver` and pushed to `origin/feature/planning-readiness-domain`.
- Confirmed the GraphQL SDL includes `PlanningSongLibraryItem`, `PlanningSongLibrarySearchInput`, and the `songLibrary(searchInput)` query field.
- Confirmed the resolver parses GraphQL args/context, forwards `AuthenticatedActor` and `requestId`, and delegates to `PlanningQueryService.songLibrary`.
- Confirmed focused GraphQL tests cover schema naming, resolver delegation, request context propagation, empty song results, invalid query input rejection, and paused-song visibility argument forwarding.
- Ran and passed the API test command, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Implement adapter-free Planning `duplicateServiceFromTemplate(input)` command contracts in the DB/API service layers.

Open questions:
- None.

## 2026-06-16 12:56 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, Planning plan, ChurchContext song library context, and setlist prompt rules.
- Added adapter-free DB Planning song library query contracts for the planned `songLibrary(searchInput)` query, including Zod persistence record/search input/operation schemas and a tenant-scoped repository method.
- Added API Planning query service `songLibrary` contracts with Zod-validated search input/output, Planning read-role checks, actor/request tenant forwarding, tenant-scope guards, and paused-song visibility enforcement.
- Added focused DB/API tests for search input validation, repository operation shape, role rejection, tenant scope, empty results, and paused-song visibility.
- Preserved existing Planning query/mutation resolver contracts and kept GraphQL schema/resolver wiring out of scope.
- Ran and passed focused Planning DB/API/GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Wire Planning GraphQL `songLibrary(searchInput)` resolver contracts to the Planning query service.

Open questions:
- None.

## 2026-06-16 12:50 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Wired the Planning GraphQL `serviceTemplates(serviceTypeId)` query contract to the existing Planning query service.
- Added the `PlanningServiceTemplate` GraphQL SDL type and query field while preserving existing Planning query/mutation resolver contracts.
- Kept the resolver thin by parsing GraphQL args/context, forwarding `AuthenticatedActor` and `requestId`, and delegating to `PlanningQueryService.serviceTemplates`.
- Added focused GraphQL tests for schema naming, resolver delegation, request context propagation, empty template results, and invalid input rejection.
- Ran and passed focused API GraphQL tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement adapter-free Planning `songLibrary(searchInput)` query contracts in the DB/API service layers.

Open questions:
- None.

## 2026-06-16 12:46 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free DB Planning service template query contracts for the planned `serviceTemplates(serviceTypeId)` query, including Zod persistence record/input/operation schemas and a tenant-scoped repository method.
- Added API Planning query service template contracts with Zod-validated input/output, Planning read-role checks, actor/request tenant forwarding, and tenant/service-type mismatch guards.
- Added focused DB/API tests for operation shape, repository contract shape, input validation, role rejection, tenant scope, empty template results, and service-type mismatch.
- Kept production persistence, migrations, GraphQL resolver wiring, UI, and template duplication out of scope.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Completed the task checklist in `06-tasks/active/NOW.md`.

Next task:
- Wire Planning GraphQL `serviceTemplates(serviceTypeId)` resolver contracts to the Planning query service.

Open questions:
- None.

## 2026-06-16 12:42 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added Planning GraphQL query schema/resolver contracts for `services(filter)`, `service(id)`, `serviceAssignments(serviceId)`, and `serviceReadiness(serviceId)`.
- Kept resolvers thin by parsing GraphQL-style args/context, attaching `AuthenticatedActor` and `requestId`, and delegating to the Planning query service.
- Preserved existing mutation resolver behavior while adding query resolver dependencies.
- Added focused GraphQL tests for query schema names, query resolver delegation, request context propagation, nullable service/readiness results, and invalid query input rejection.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement Planning service template query contracts.

Open questions:
- None.

## 2026-06-16 12:38 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free Planning query persistence contracts in `packages/db` for `services(filter)`, `service(id)`, `serviceAssignments(serviceId)`, and `serviceReadiness(serviceId)`.
- Added `createPlanningQueryService` in `apps/api` with Zod-validated query schemas, Planning read-role checks, actor/request tenant forwarding, and tenant/service mismatch guards for services, assignments, and readiness records.
- Added focused API and DB tests for query input validation, repository operation shape, role rejection, tenant scope, service scope, nullable lookups, and readiness reads.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed the completed query service contract slice.

Next task:
- Wire Planning GraphQL query resolver contracts to the Planning query service contracts.

Open questions:
- None.

## 2026-06-16 12:34 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added `packages/db/docs/planning-production-adapter-contract.md` documenting the future production database adapter boundary for `PlanningServiceCommandPersistenceRepository`.
- Documented required Planning command persistence operations, tenant-scope invariants, mutation-intent and audit expectations, transaction behavior, validation expectations, and adapter exclusions.
- Linked the production adapter contract notes from `packages/db/README.md` and `apps/api/README.md`.
- Verified the notes reference current DB contract names and README links resolve with `rg` checks.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement Planning query service contracts for service and assignment reads.

Open questions:
- None.

## 2026-06-16 12:29 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added a test-only in-memory Planning command repository adapter in `apps/api/src/services/planning/testing/` that implements the DB package `PlanningServiceCommandPersistenceRepository` contract.
- The adapter Zod-validates DB persistence operation shapes, stores tenant-scoped services/items/assignments in memory, enforces tenant lookup boundaries, and records actor/request/tenant mutation intent metadata for assertions.
- Added Planning command service integration tests that run create service, add/reorder service items, assign/update volunteer status, and confirmed publish through the in-memory adapter.
- Added tenant-scope assertions proving cross-tenant writes are rejected by the adapter boundary and mutation-intent assertions for create/update/destructive-confirmed operations.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement Planning service repository adapter contract notes for the eventual production database adapter.

Open questions:
- None.

## 2026-06-16 12:23 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, `docs/session-summary.md`, active task state, product vision, system map, engineering rules, API plan, and Planning plan.
- Added adapter-free Planning service command persistence operation contracts in `packages/db`, including tenant-scoped write options, mutation intent, command input schemas, record schemas, and repository interface types.
- Exposed `@sanctuary-os/db` source contracts to the workspace and linked the API package to the DB package.
- Updated the Planning command service repository boundary to call DB-shaped persistence operations with `{ input, options: { context, intent } }`.
- Mapped create/add/assign commands to `create`, normal edits/reorders/assignment status updates to `update`, and confirmed publish/cancel service updates to `destructive-confirmed`.
- Added tests for tenant scope, mutation intent, destructive confirmation mapping, and adapter-free repository contract shape.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement Planning repository in-memory test adapter for service command integration tests.

Open questions:
- None.

## 2026-06-16 11:50 EDT · feature/foundation-monorepo-scaffold

Tasks completed:
- Re-synced with `agents.md`, product vision, system map, engineering rules, ChurchContext schema, API plan, Planning plan, and active task file.
- Verified existing scaffold work for `apps/api`, `packages/church-context`, and `packages/db`.
- Verified `origin` is configured as `https://github.com/mikessarahbot-netizen/sanctuary-os-v3.git`.
- Verified `feature/foundation-monorepo-scaffold` is pushed to `origin`.
- Re-ran scaffold release checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git ls-remote --heads origin feature/foundation-monorepo-scaffold`.
- Updated the architecture release-check report to mark push readiness as passing.

Next task:
- Implement the first approved module slice from the scaffolded contracts.

Open questions:
- None.

## 2026-06-16 12:17 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, active task state, session summary, Planning plan, API plan, and current API source files.
- Implemented Planning GraphQL schema/type contract placeholders in `apps/api/src/graphql/planning.ts`.
- Added thin Planning mutation resolver contracts that parse GraphQL-style `{ input }` args, attach `AuthenticatedActor` and `requestId` from context, and delegate to Planning command/readiness services.
- Kept GraphQL work adapter-free: no persistence, UI, vendor integrations, or AI setlist implementation.
- Added tests proving planned mutation names are represented, resolver delegation preserves actor/request context, readiness refresh delegates to the readiness service, and invalid publish input is rejected before service delegation.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Next task:
- Implement Planning persistence repository contracts for service commands.

Open questions:
- None.

## 2026-06-16 12:06 EDT · feature/planning-readiness-domain

Tasks completed:
- Created `feature/planning-readiness-domain` from the pushed foundation scaffold branch.
- Implemented Planning readiness domain contracts in `apps/api/src/domain/planning/`.
- Implemented pure readiness scoring with required-role, confirmation, service-plan, song-asset, rehearsal-asset, and CCLI checks.
- Added `readiness.updated` payload validation in the API events boundary.
- Implemented `createPlanningReadinessService` with Planning role checks, tenant-scope guards, persistence boundary calls, and post-commit event publication.
- Added domain, service, and API export tests.
- Ran and passed `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Committed and pushed `d05f4c1 feat(planning): add readiness domain service`.

Next task:
- Implement Planning service command contracts.

Open questions:
- None.

## 2026-06-16 12:11 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, product vision, system map, engineering rules, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, active task state, and the prior session summary.
- Implemented Zod-validated Planning command schemas for create/update service, add/update/reorder service items, assign volunteer, and update assignment status.
- Added Planning command service/repository interfaces with `AuthenticatedActor` command boundaries, actor tenant scope forwarding, Planning role gates, returned-record tenant/service mismatch guards, and explicit confirmation intent for publish/cancel service updates.
- Added validated `service.published` and `assignment.statusChanged` event payload contracts and post-command event publication.
- Added focused command tests for confirmation validation, tenant scope, role gates, cross-tenant rejection, and validated event publication.
- Verified `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

Next task:
- Implement Planning GraphQL schema/resolver contracts that delegate to the service layer.

Open questions:
- None.

## 2026-06-16 12:10 EDT · feature/planning-readiness-domain

Tasks completed:
- Re-synced with `agents.md`, product vision, system map, engineering rules, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, and active task state.
- Continued from the scaffold handoff on `feature/planning-readiness-domain`.
- Added Planning readiness domain schemas and deterministic readiness scoring in `apps/api`.
- Added the `refreshReadinessScore` service boundary with Zod command validation, Planning role checks, tenant mismatch guards, repository save contract, and validated `readiness.updated` event publication.
- Added focused tests for scoring, event payload validation, service authorization, tenant mismatch, and publication behavior.
- Verified `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

Next task:
- Implement Planning service command contracts.

Open questions:
- None.
## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue contracts

- Added strict Presenter local sync queue contracts in `apps/api/src/domain/presenter/contracts.ts`.
- Added schemas/types/parser helpers for local queue entry IDs, approved queued operations, queue entries, conflict details, status transitions, and replay ordering.
- Covered approved non-destructive operations from `05-plans/presenter-local-sync-queue-plan.md`: `updatePresentation`, `addSlide`, `updateSlide`, `reorderSlides`, `applyPresenterTheme`, and `setOutputTarget`.
- Added focused tests for valid queue entries, tenant/presentation/actor/request metadata, conflict and failure metadata, status transition validation, replay ordering, and rejection of destructive operations, local run-mode actions, OBS/stream controls, raw media payloads, vendor tokens, secrets, and unknown fields.
- Kept the slice contract-only with no production queue runner, SQLite schema/migrations, local persistence adapter, desktop UI, Tauri command, desktop event bus, production WebSocket/SSE adapter, raw media storage, OBS/stream automation, vendor SDK, Auth0 integration, AI execution, deployment config, or checked-in secrets.
- Validation passed: `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed implementation commit `d8d8ea9` (`feat(presenter): add local sync queue contracts`) to `feature/presenter-domain-contracts`.
- Next task: run a focused release check for Presenter local sync queue contracts.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter local sync queue plan

- Added `05-plans/presenter-local-sync-queue-plan.md`.
- Defined queue ownership across Desktop Presenter, API backend, future local DB adapter, and event transport.
- Documented approved non-destructive queued edit scope, queue record shape, conflict states, replay rules, tenant/audit metadata, storage expectations, validation expectations, and first implementation acceptance criteria.
- Kept the slice planning-only with no production queue code, SQLite schema/migrations, desktop UI, Tauri commands, desktop event bus, production WebSocket/SSE adapters, raw media storage, OBS/stream automation, vendor SDKs, Auth0, AI execution, deployment config, or checked-in secrets.
- Validation passed: `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed planning commit `6f1209a` (`docs(presenter): add local sync queue plan`) to `feature/presenter-domain-contracts`.
- Next task: add Presenter local sync queue contracts against the new plan.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter output-window contract release check

- Completed the Presenter desktop output-window contract release check and wrote findings to `07-reviews/architecture/presenter-output-window-contract-release-check.md`.
- Result: pass with follow-ups. The contract layer has strict Zod validation for desktop output-window state, local/offline run-mode status, and active-slide render contexts while avoiding real window creation, Tauri commands, desktop event-bus wiring, GraphQL/API coupling changes, OBS control, stream actions, raw media payloads, and secrets.
- Validation passed: `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed release-check commit `a01c033` (`docs(presenter): add output window contract release check`) to `feature/presenter-domain-contracts`.
- Next task: add a Presenter local sync queue plan before implementing offline queue contracts or desktop wiring.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter desktop output-window contracts

- Added Presenter desktop output-window and local run-mode status contracts in `apps/api/src/domain/presenter/contracts.ts`.
- Added strict Zod schemas/types/parser helpers for `PresenterDesktopOutputWindow`, `PresenterDesktopRunModeStatus`, and `PresenterOutputWindowRenderContext`.
- Covered output window identity, output role, safe blank state, confidence-output eligibility, active slide rendering context, tenant consistency, local/offline status metadata, and rejection of OBS/stream/raw-media/secret-like fields.
- Documented the desktop Presenter contract boundary in `apps/desktop/README.md`.
- Validation passed: `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed implementation commit `93d537a` (`feat(presenter): add desktop output window contracts`) to `feature/presenter-domain-contracts`.
- Next task: run a focused Presenter desktop output-window contract release check and write findings under `07-reviews/architecture/`.

## 2026-06-16 - feature/presenter-domain-contracts - Presenter event transport release check

- Completed the Presenter event transport release check and wrote findings to `07-reviews/architecture/presenter-event-transport-release-check.md`.
- Result: pass with follow-ups. The transport boundary validates Presenter event envelopes before delivery, wraps events with tenant/aggregate/type route metadata, filters subscriptions by tenant/aggregate/type, uses an injected transport client, keeps default tests live-network-free, and avoids desktop event bus, OBS, stream, raw media, and secret payload support.
- Validation passed: `pnpm --filter @sanctuary-os/api test -- events/index.test.ts presenter`, `pnpm --filter @sanctuary-os/api test:integration:postgres`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Pushed release-check commit `bedb82b` (`docs(presenter): add event transport release check`) to `feature/presenter-domain-contracts`.
- Next task: add Presenter desktop run-mode/output-window contracts without implementing desktop UI, Tauri window wiring, live event bus wiring, OBS, stream control, or raw media support.
