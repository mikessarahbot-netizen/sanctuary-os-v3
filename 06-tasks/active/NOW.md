# NOW

## Task
Wire Planning GraphQL rehearsal acknowledgement record/list contracts to the service boundary.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add thin GraphQL SDL contracts for recording Planning rehearsal acknowledgements and listing acknowledgements by service
- Add resolver contracts that Zod-parse GraphQL-style `{ input }` args/context, authorize through the existing Planning rehearsal acknowledgement service, and delegate to record/list service methods
- Preserve tenant scope, actor/request metadata, service ID, service item ID, person ID, acknowledgement status, notes, and acknowledged timestamp
- Add focused GraphQL tests for resolver delegation, request context propagation, returned acknowledgement shape, empty list behavior, invalid input rejection, and service error propagation
- Keep notification delivery, realtime fanout, mobile UI, attendance workflows, media storage, and playback integration out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Notification delivery · realtime fanout · mobile UI · attendance workflows · media storage · playback integration

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add GraphQL rehearsal acknowledgement record/list contracts
- [x] Add focused GraphQL rehearsal acknowledgement tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL exposes adapter-free rehearsal acknowledgement record/list contracts that delegate to the existing service boundary; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
