# NOW

## Task
Implement an adapter-free in-memory Planning CCLI usage repository test adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add a test-only in-memory adapter for Planning CCLI usage repository contracts under `apps/api/src/services/planning/testing/`
- Support tenant-scoped CCLI usage log reads/writes used by the existing Planning CCLI usage service
- Zod-validate DB persistence operation shapes at the adapter boundary and preserve actor/request/tenant context plus mutation intent for assertions
- Add focused API integration tests that exercise the CCLI usage service through the in-memory adapter, including tenant-scoped empty reads and malformed operation rejection
- Preserve existing Planning command, query, readiness, GraphQL, rehearsal visibility, and rehearsal acknowledgement behavior
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production database adapter · migrations · concrete storage · UI components · CCLI/SongSelect vendor calls · credentials · reporting jobs · media storage · chart rendering · notifications · GraphQL resolver changes

## Progress
- [x] Add in-memory Planning CCLI usage repository test adapter
- [x] Add focused CCLI usage service integration tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning CCLI usage service contracts are exercised through a tenant-scoped, Zod-validating, adapter-free in-memory test repository; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
