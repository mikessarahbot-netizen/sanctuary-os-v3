# NOW

## Task
Implement an adapter-free in-memory Planning rehearsal tracking repository test adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add a test-only in-memory adapter for Planning rehearsal tracking repository contracts under `apps/api/src/services/planning/testing/`
- Support tenant-scoped rehearsal asset visibility and rehearsal acknowledgement reads/writes used by the existing Planning rehearsal services
- Zod-validate DB persistence operation shapes at the adapter boundary and preserve actor/request/tenant context plus mutation intent for assertions
- Add focused API integration tests that exercise rehearsal asset visibility and rehearsal acknowledgement services through the in-memory adapter, including tenant-scope rejection and nullable/empty reads
- Preserve existing Planning command, query, readiness, CCLI, GraphQL, and rehearsal service behavior
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production database adapter · migrations · concrete storage · UI components · media storage · chart rendering · notifications · mobile rehearsal UX · GraphQL resolver changes · CCLI/SongSelect vendor calls

## Progress
- [ ] Add in-memory Planning rehearsal tracking repository test adapter
- [ ] Add focused rehearsal service integration tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning rehearsal asset visibility and acknowledgement service contracts are exercised through a tenant-scoped, Zod-validating, adapter-free in-memory test repository; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
