# NOW

## Task
Add Presenter local sync queue SQLite migration artifacts and migration tests.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-repository-contract-release-check.md`, and current DB migration patterns/tests
- Add Presenter local sync queue SQLite-compatible migration artifacts and migration tests
- Define the local queue table, required columns, schema version, status/operation constraints, replay/status/idempotency indexes, rollback SQL, checksum stability, and no-live-database default validation
- Keep concrete local repository adapter implementation, desktop/Tauri/event-bus wiring, production queue runners, and API replay implementation out of scope
- Run lint, typecheck, and tests
- Commit and push the migration artifact slice
- Run session handoff

## Out of scope
Concrete local persistence adapter implementation · production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs, release check, and DB migration patterns
- [ ] Add local sync queue migration artifacts and tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push migration artifact slice
- [ ] Session handoff

## Done when
Presenter local sync queue SQLite migration artifacts and migration tests are added without concrete adapter implementation, default gates pass, the migration artifact slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add a focused release check for Presenter local sync queue migration artifacts, or address any migration findings first.
