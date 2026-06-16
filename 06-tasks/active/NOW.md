# NOW

## Task
Implement adapter-free Planning rehearsal asset visibility contracts in the DB/API service layers.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add Planning RehearsalTracking contract support for rehearsal asset visibility required by the Planning plan and readiness inputs
- Define Zod-validated DB persistence contracts for tenant-scoped rehearsal asset visibility records and operations
- Add API service boundary contracts for setting/listing rehearsal asset visibility without media storage or chart rendering integration
- Enforce Planning roles, tenant scope, service scope, request context propagation, and no raw media payload handling
- Preserve existing Planning GraphQL query/mutation resolver contracts and existing Planning command/query/readiness/CCLI behavior
- Add focused DB/API tests for input validation, role checks, tenant scope, operation shape, and adapter-free repository boundaries
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · media storage · chart rendering · mobile rehearsal UX · GraphQL resolver wiring · GraphQL server runtime

## Progress
- [ ] Add DB rehearsal asset visibility persistence contracts
- [ ] Add API Planning rehearsal asset visibility service contracts
- [ ] Add focused DB/API contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning rehearsal asset visibility contracts are Zod-validated, tenant-scoped, role-gated, adapter-free, covered by focused DB/API tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
