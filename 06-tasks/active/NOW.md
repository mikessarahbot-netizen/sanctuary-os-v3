# NOW

## Task
Wire Planning GraphQL rehearsal asset visibility set/list contracts to the service boundary.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add thin GraphQL SDL contracts for setting Planning rehearsal asset visibility and listing asset visibility by service
- Add resolver contracts that Zod-parse GraphQL-style `{ input }` args/context, authorize through the existing Planning rehearsal asset visibility service, and delegate to set/list service methods
- Preserve tenant scope, actor/request metadata, service ID, service item ID, asset ID, asset type, visibility flag, and updated timestamp
- Add focused GraphQL tests for resolver delegation, request context propagation, returned visibility shape, empty list behavior, invalid input rejection, and service error propagation
- Keep media storage, chart rendering, raw media payloads, playback engine integration, UI, and notifications out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Media storage · chart rendering · raw media payloads · playback engine integration · UI · notifications

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add GraphQL rehearsal asset visibility set/list contracts
- [x] Add focused GraphQL rehearsal asset visibility tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning GraphQL exposes adapter-free rehearsal asset visibility set/list contracts that delegate to the existing service boundary; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
