# NOW

## Task
Run a Presenter persistence composition release check.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-api-event-persistence-release-check.md`, `apps/api/src/services/presenter/composition.ts`, `apps/api/src/services/presenter/composition.test.ts`, and current Presenter DB persistence adapters
- Audit Presenter API persistence composition against the Presenter plan, API plan, engineering rules, and the earlier release-check follow-up
- Verify default/test in-memory selection, production SQL dependency requirements, strict secret-free runtime config, PostgreSQL binding isolation, live-DB-free default tests, tenant/audit repository boundary preservation, no GraphQL-to-DB coupling, no raw media storage, no OBS/stream automation, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
New production code · live PostgreSQL integration · migration runner execution · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter persistence composition
- [x] Audit Presenter persistence composition readiness
- [x] Write release-check findings to `07-reviews/architecture/`
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter persistence composition readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add opt-in live PostgreSQL coverage for Presenter persistence composition if the release-check passes, or address any release-check findings first.
