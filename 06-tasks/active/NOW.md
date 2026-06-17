# NOW

## Task
Add a Presenter local sync queue desktop-local persistence selection factory that wires the SQLite executor and queue adapter from a validated runtime config.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-sqlite-executor-release-check.md`, and the existing `apps/api/src/services/presenter/composition.ts` selection pattern
- Add a runtime-config-driven factory (Zod-validated config) that constructs the SQLite-backed Presenter local sync queue repository by composing `createSqliteExecutor` with `createPresenterLocalSyncQueueSqlRepository`
- Accept the SQLite database client by injection (the same `SqliteDatabaseClient` shape) so the factory stays free of a native driver dependency
- Add default tests that validate config parsing and repository selection without a live engine, plus an availability-guarded smoke if consistent with the existing pattern
- Keep the slice composition-only; do not add real Tauri commands, desktop windows, event-bus wiring, replay scheduling, GraphQL/API replay changes, or external integrations

## Out of scope
Production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs, executor, adapter, and composition pattern
- [x] Add the runtime-config schema and selection factory
- [x] Add default selection tests (fake injected client, no live engine)
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the composition slice
- [ ] Session handoff

## Done when
A Zod-validated runtime config selects the SQLite-backed Presenter local sync queue repository through an injected database client, default tests cover config parsing and selection without a live engine, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add the Presenter local sync queue desktop replay scheduler contract (no live Tauri/event-bus), or address any composition findings first.
