# NOW

## Task
Add a concrete SQLite executor and opt-in live-database integration smoke for the Presenter local sync queue adapter.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-sql-adapter-release-check.md`, and the current local sync queue adapter/migration artifacts
- Add a concrete SQLite-compatible executor that satisfies the `PlanningSqlExecutor.query` shape used by `createPresenterLocalSyncQueueSqlRepository` (mirror the existing `postgresql-planning-executor` boundary style)
- Apply the `PresenterLocalSyncQueueMigration` forward SQL against the live engine in the smoke path only
- Add an opt-in live-database integration smoke (guarded by an env flag, like the existing PostgreSQL integration tests) that enqueues, lists replay-ready entries, transitions status, and cleans up
- Keep default `pnpm test` runs free of any live database, network, connection string, or secret
- Run lint, typecheck, and tests
- Commit and push the executor + smoke slice
- Run session handoff

## Out of scope
Production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs, adapter, and migration artifacts
- [ ] Add the concrete SQLite executor boundary
- [ ] Add the opt-in live-database integration smoke
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the executor + smoke slice
- [ ] Session handoff

## Done when
A concrete SQLite executor satisfies the adapter's query boundary, an opt-in live-database smoke proves enqueue/list/transition/cleanup against a real engine without affecting default gates, default lint/typecheck/test pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the Presenter local sync queue SQLite adapter into a desktop-local persistence composition root, or address any executor/smoke findings first.
