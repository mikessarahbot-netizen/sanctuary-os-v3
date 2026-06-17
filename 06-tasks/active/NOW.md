# NOW

## Task
Run a Presenter local sync queue repository contract release check.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, and current Presenter local sync queue repository contracts/tests
- Audit Presenter local sync queue repository contracts against the plan, engineering rules, and offline/storage expectations
- Verify repository context, enqueue/read/list/status transition/cleanup contracts, tenant isolation, replay ordering, stale-data blocking, retry metadata preservation, safe failure persistence, idempotency metadata preservation, adapter-free scope, no SQLite migrations, no concrete adapters, no desktop/Tauri/event-bus wiring, no GraphQL/API replay changes, no OBS/stream/raw-media/vendor/secret payload support, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the release-check slice
- Run session handoff

## Out of scope
SQLite schema/migrations · concrete local persistence adapter implementation · production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs and repository contracts
- [ ] Audit local sync queue repository contract readiness
- [ ] Write release-check findings to `07-reviews/architecture/`
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push release-check slice
- [ ] Session handoff

## Done when
Presenter local sync queue repository contract readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add Presenter local sync queue SQLite migration artifacts and migration tests if the release check is clean, or address any contract findings first.
