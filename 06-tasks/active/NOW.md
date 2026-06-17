# NOW

## Task
Add a Presenter local sync queue persistence/storage plan.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, and `07-reviews/architecture/presenter-local-sync-queue-contract-release-check.md`
- Add a focused plan for Presenter local sync queue persistence/storage before SQLite-backed queue implementation
- Define local ownership boundaries, queue record storage expectations, migration expectations, replay/idempotency metadata, stale-data/conflict handling, retry behavior, tenant isolation, safe error persistence, and offline-first validation expectations
- Keep desktop/Tauri/event-bus wiring, production queue runners, and concrete storage implementation out of scope
- Run lint, typecheck, and tests
- Commit and push the planning slice
- Run session handoff

## Out of scope
New production code · production queue runner · SQLite schema/migrations · local persistence adapter implementation · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and release-check findings
- [x] Add local sync queue persistence/storage plan
- [x] Run lint, typecheck, and tests
- [ ] Commit and push planning slice
- [ ] Session handoff

## Done when
A Presenter local sync queue persistence/storage plan is written, it defines the storage boundary before implementation, default gates pass, the planning slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add Presenter local sync queue local persistence contracts or storage adapter scaffolding according to the new plan.
