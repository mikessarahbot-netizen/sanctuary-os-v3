# NOW

## Task
Add a local SQLite migration runner (apply/rollback with checksum-drift detection) for the Presenter local sync queue store.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `packages/db/src/migrations.ts`, `packages/db/src/sqlite-executor.ts`, and `packages/db/src/presenter-migrations.ts`
- Add a pure migration planner that, given applied records and ordered artifacts, decides apply/skip per migration and throws on checksum drift
- Add a SQLite migration runner over an injected SQLite client (extending the executor's client with `exec`) that ensures a tracking table, applies pending migrations in order (honoring the `transactional` flag), records applied/checksum/timestamp, lists applied records, and rolls a migration back
- Add default planner tests (no engine) plus an availability-guarded real-engine smoke that applies `PresenterLocalSyncQueueMigration`, proves idempotent re-apply, drift rejection, and rollback
- Keep default `pnpm test` free of any live database, network, Tauri, event bus, or secret
- Keep the slice migration-runner-only; do not add desktop UI, Tauri commands, event-bus wiring, replay scheduling, or API/GraphQL changes

## Out of scope
Production queue runner loop · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with migrations, executor, and presenter migration artifacts
- [x] Add the pure migration planner with drift detection
- [x] Add the SQLite migration runner over the injected client
- [x] Add planner unit tests and an availability-guarded runner smoke
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the migration runner slice
- [ ] Session handoff

## Done when
A pure planner decides apply/skip and rejects checksum drift, a SQLite migration runner applies/records/rolls back migrations over an injected client, default planner tests pass without an engine, an availability-guarded smoke proves apply/idempotency/drift/rollback against `node:sqlite`, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add a Presenter local sync queue replay scheduling decision contract (pure policy logic: ordering, backoff, attempt limits, conflict/failed stops), then later wire the desktop replay coordinator — addressing any migration-runner findings first.
