# NOW

## Task
Implement Planning song library query contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add adapter-free contract support for the planned Planning `songLibrary(searchInput)` query
- Define Zod-validated song library search input, result record, DB operation, repository, and Planning query service boundaries
- Keep the implementation tenant-scoped and role-gated through `AuthenticatedActor` and `requestId`
- Preserve existing Planning query/mutation resolver contracts and service behavior
- Add focused DB/API tests for search input validation, tenant scope, role checks, empty results, and repository contract shape
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · CCLI/SongSelect implementation · AI setlist generation · GraphQL schema/resolver wiring · GraphQL server runtime

## Progress
- [x] Add DB song library query operation/repository contracts
- [x] Add Planning query service songLibrary contracts
- [x] Add focused DB/API contract tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning `songLibrary(searchInput)` query contracts are Zod-validated, tenant-scoped, role-gated, adapter-free, covered by focused DB/API tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL `songLibrary(searchInput)` resolver contracts to the Planning query service.
