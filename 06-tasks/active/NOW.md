# NOW

## Task
Run a Presenter local sync queue contract release check.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, current Presenter local sync queue contracts/tests, and existing offline/release-check notes
- Audit Presenter local sync queue contracts against the plan, engineering rules, and Presenter offline/failure rules
- Verify strict Zod validation, approved queued operations, forbidden operation rejection, tenant/presentation/actor/request metadata, conflict details, retry metadata, status transition rules, replay ordering, adapter/storage-free scope, no desktop/Tauri/event-bus wiring, no GraphQL/API coupling changes, no OBS/stream/raw-media/vendor/secret payload support, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
New production code · production queue runner · SQLite schema/migrations · local persistence adapter · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Audit local sync queue contract readiness
- [x] Write release-check findings to `07-reviews/architecture/`
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter local sync queue contract readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Start the next Presenter desktop/local implementation slice if the release check is clean, or address any contract findings first.
