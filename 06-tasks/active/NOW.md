# NOW

## Task
Wire Planning GraphQL CCLI reporting job schedule/status contracts to the service boundary.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add thin GraphQL SDL contracts for scheduling a Planning CCLI reporting job and polling its job status
- Add resolver contracts that Zod-parse GraphQL-style `{ input }` args/context, authorize through the existing Planning CCLI usage service, and delegate to `scheduleReportingJob` / `getReportingJobStatus`
- Preserve tenant scope, actor/request metadata, job ID, job type, job status, timestamps, and safe error messages
- Add focused GraphQL tests for resolver delegation, request context propagation, status shape, missing job null behavior, invalid input rejection, and unconfigured-service propagation
- Keep worker execution, queue infrastructure, retry policies, CCLI/SongSelect vendor calls, credentials, reporting file generation, UI, and notifications out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production queue/broker · worker execution · retry policies · CCLI/SongSelect credentials · vendor reporting submission · file exports · UI · notifications

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add GraphQL CCLI reporting job schedule/status contracts
- [x] Add focused GraphQL CCLI reporting job tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning GraphQL exposes adapter-free CCLI reporting job schedule/status contracts that delegate to the existing service boundary; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
