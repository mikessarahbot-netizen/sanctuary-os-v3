# NOW

## Task
Implement an adapter-free in-memory Planning query/readiness repository test adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add a test-only in-memory adapter for Planning query/readiness repository contracts under `apps/api/src/services/planning/testing/`
- Support tenant-scoped service, assignment, service template, song library, and readiness reads used by `createPlanningQueryService`
- Zod-validate DB persistence operation shapes at the adapter boundary and preserve actor/request/tenant read context for assertions
- Add focused API integration tests that exercise `createPlanningQueryService` through the in-memory adapter, including nullable lookups and tenant-scope rejection
- Preserve existing Planning command, GraphQL, CCLI, rehearsal visibility, rehearsal acknowledgement, and readiness behavior
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production database adapter · migrations · concrete storage · UI components · media storage · chart rendering · notifications · mobile rehearsal UX · GraphQL resolver changes · CCLI/SongSelect vendor calls

## Progress
- [ ] Add in-memory Planning query/readiness repository test adapter
- [ ] Add focused query service integration tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning query/readiness service contracts are exercised through a tenant-scoped, Zod-validating, adapter-free in-memory test repository; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
