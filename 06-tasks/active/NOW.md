# NOW

## Task
Add Presenter local sync queue local persistence repository contracts.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, and current Presenter local sync queue contracts/tests
- Add Presenter local sync queue local persistence repository contracts and focused tests
- Define repository context, enqueue/read/list/status transition/cleanup operation contracts, tenant isolation behavior, replay ordering, stale-data blocking, retry metadata preservation, safe failure persistence, and idempotency metadata preservation
- Keep SQLite migrations, concrete adapters, desktop/Tauri/event-bus wiring, production queue runners, and API replay implementation out of scope
- Run lint, typecheck, and tests
- Commit and push the contract slice
- Run session handoff

## Out of scope
SQLite schema/migrations · concrete local persistence adapter implementation · production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs and storage plan
- [ ] Add local sync queue persistence repository contracts and tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push contract slice
- [ ] Session handoff

## Done when
Presenter local sync queue persistence repository contracts and tests are added without concrete SQLite adapter implementation, default gates pass, the contract slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Run a focused release check for Presenter local sync queue local persistence repository contracts, or address any contract findings first.
