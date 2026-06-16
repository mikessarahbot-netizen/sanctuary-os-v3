# NOW

## Task
Implement adapter-free Planning rehearsal acknowledgement contracts in the DB/API service layers.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add Planning RehearsalTracking contract support for volunteer asset acknowledgements and readiness signals required by the Planning plan
- Define Zod-validated DB persistence contracts for tenant-scoped rehearsal acknowledgement records and operations
- Add API service boundary contracts for recording and listing rehearsal acknowledgements without media storage, chart rendering, or notification integration
- Enforce Planning read/write roles, tenant scope, service scope, assignment/person scope, request context propagation, and no raw media payload handling
- Preserve existing Planning GraphQL query/mutation resolver contracts and existing Planning command/query/readiness/CCLI/rehearsal visibility behavior
- Add focused DB/API tests for input validation, role checks, tenant scope, operation shape, and adapter-free repository boundaries
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · media storage · chart rendering · notifications · mobile rehearsal UX · GraphQL resolver wiring · GraphQL server runtime

## Progress
- [ ] Add DB rehearsal acknowledgement persistence contracts
- [ ] Add API Planning rehearsal acknowledgement service contracts
- [ ] Add focused DB/API contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning rehearsal acknowledgement contracts are Zod-validated, tenant-scoped, role-gated, adapter-free, covered by focused DB/API tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
