# NOW

## Task
Implement Planning duplicate-service-from-template command contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add adapter-free contract support for the planned Planning `duplicateServiceFromTemplate(input)` mutation
- Define Zod-validated duplicate-from-template input, DB operation, repository, and Planning command service boundaries
- Keep the implementation tenant-scoped and role-gated through `AuthenticatedActor` and `requestId`
- Preserve existing Planning query/mutation resolver contracts and command service behavior
- Add focused DB/API tests for input validation, role checks, tenant scope, mutation intent, repository operation shape, and returned service mismatch guards
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · CCLI/SongSelect implementation · AI setlist generation · GraphQL resolver wiring · GraphQL server runtime

## Progress
- [x] Add DB duplicate-from-template operation/repository contracts
- [x] Add Planning command service duplicateServiceFromTemplate contract
- [x] Add focused DB/API contract tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [ ] Session handoff

## Done when
Planning `duplicateServiceFromTemplate(input)` command contracts are Zod-validated, tenant-scoped, role-gated, adapter-free, covered by focused DB/API tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contracts to the Planning command service.
