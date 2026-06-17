# NOW

## Task
Run a Presenter desktop output-window contract release check.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-event-transport-release-check.md`, current Presenter domain contract/tests, and `apps/desktop/README.md`
- Audit Presenter desktop run-mode/output-window contracts against the Presenter plan, engineering rules, and prior release-check follow-ups
- Verify strict Zod validation, tenant consistency, output window identity, output role/kind, safe blank state, confidence output eligibility, active slide render context, local/offline status metadata, rejection of OBS/stream/raw-media/secret-like fields, no real window/Tauri/event-bus wiring, no GraphQL/API coupling changes, and no checked-in secrets
- Write findings to `07-reviews/architecture/`
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
New production code · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs and current Presenter contracts
- [ ] Audit desktop output-window contract readiness
- [ ] Write release-check findings to `07-reviews/architecture/`
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter desktop output-window contract readiness has been reviewed against the plan and standards, findings are written under `07-reviews/architecture/`, default gates pass, the release-check slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Continue to Presenter local sync queue planning if the release check is clean, or address any release-check findings first.
