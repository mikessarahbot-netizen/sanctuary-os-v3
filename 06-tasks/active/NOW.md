# NOW

## Task
Run a Presenter API/event/persistence release-check before SQL adapter work.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, current Presenter domain/API/service/event contracts, and Presenter persistence contracts/adapters
- Audit Presenter domain contracts, GraphQL/service contracts, in-memory service adapter, event contracts/publication, persistence contracts, and in-memory persistence repository adapters against the Presenter plan and engineering rules
- Verify tenant scope, actor/request audit metadata, Zod validation boundaries, event publication after successful state changes, adapter isolation, no raw media payload storage, no OBS/stream automation, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the release-check slice
- Run session handoff

## Out of scope
PostgreSQL Presenter adapters · database migrations · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter implementation
- [x] Audit Presenter API/event/persistence readiness
- [x] Write release-check findings to `07-reviews/architecture/`
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter API/event/persistence readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Start PostgreSQL Presenter persistence adapter contracts/migrations if the release-check passes, or address any release-check findings first.
