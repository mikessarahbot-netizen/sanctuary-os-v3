# NOW

## Task
Run a Presenter event transport release check.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-api-event-persistence-release-check.md`, `07-reviews/architecture/presenter-persistence-composition-release-check.md`, current `apps/api/src/events/` contracts/tests, and Presenter service event publication code
- Audit the API event transport boundary against the Presenter plan, API plan, engineering rules, and earlier release-check follow-ups
- Verify `publishAfterCommit` validation, Presenter event envelope validation, tenant/aggregate route metadata, subscription filtering, event ordering, adapter injection, live-network-free default tests, no GraphQL-to-transport coupling, no desktop event bus wiring, no OBS/stream/raw-media payload support, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
New production code · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and current event transport code
- [x] Audit Presenter event transport readiness
- [x] Write release-check findings to `07-reviews/architecture/`
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter event transport readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Start the next Presenter delivery slice, likely desktop run-mode/output-window contracts or local sync queue planning, or address any event transport release-check findings first.
