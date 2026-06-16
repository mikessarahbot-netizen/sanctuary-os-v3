# NOW

## Task
Implement adapter-free Planning CCLI usage log contracts in the DB/API service layers.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add Planning CCLI usage log domain/service contract support for song usage events required by the Planning plan
- Define Zod-validated DB persistence contracts for tenant-scoped CCLI usage log records and operations
- Add API service boundary contracts for recording and listing CCLI usage log entries without calling CCLI/SongSelect vendor APIs
- Enforce Planning roles, tenant scope, request context propagation, and no raw vendor credential handling
- Preserve existing Planning GraphQL query/mutation resolver contracts and existing Planning command/query/readiness behavior
- Add focused DB/API tests for input validation, role checks, tenant scope, operation shape, and adapter-free repository boundaries
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · vendor SDK integrations · direct CCLI/SongSelect calls · reporting-file export · GraphQL resolver wiring · GraphQL server runtime

## Progress
- [ ] Add DB CCLI usage log persistence contracts
- [ ] Add API Planning CCLI usage log service contracts
- [ ] Add focused DB/API contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning CCLI usage log contracts are Zod-validated, tenant-scoped, role-gated, adapter-free, covered by focused DB/API tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL CCLI usage log resolver contracts if a GraphQL surface is added to the approved plan; otherwise select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
