# NOW

## Task
Wire Planning GraphQL CCLI usage log record/list contracts to the service boundary.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add thin GraphQL SDL contracts for recording Planning CCLI usage logs and listing usage logs by service/reporting status
- Add resolver contracts that Zod-parse GraphQL-style `{ input }` args/context, authorize through the existing Planning CCLI usage service, and delegate to `recordUsage` / `listUsageLogs`
- Preserve tenant scope, actor/request metadata, service ID, service item ID, song ID, usage type, used-at timestamp, reporting status, notes, and CCLI song number
- Add focused GraphQL tests for resolver delegation, request context propagation, returned usage-log shape, empty list behavior, invalid input rejection, and service error propagation
- Keep CCLI/SongSelect vendor calls, credentials, reporting submission, reporting file generation, worker execution, queue infrastructure, UI, and notifications out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
CCLI/SongSelect credentials · vendor reporting submission · file exports · production queue/broker · worker execution · UI · notifications

## Progress
- [ ] Re-sync with required docs and current implementation
- [ ] Add GraphQL CCLI usage log record/list contracts
- [ ] Add focused GraphQL CCLI usage log tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL exposes adapter-free CCLI usage log record/list contracts that delegate to the existing service boundary; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
