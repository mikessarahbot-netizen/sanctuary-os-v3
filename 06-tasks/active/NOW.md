# NOW

## Task
Implement Planning service template query contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add adapter-free contracts for the planned `serviceTemplates(serviceTypeId)` query
- Define Zod-validated service template record/input schemas and tenant-scoped repository/query service boundaries
- Keep implementation adapter-free: no production persistence, migrations, ORM, SQL, GraphQL server runtime, or UI
- Add focused DB/API tests for query input validation, tenant scope, role checks, nullable or empty results, and repository contract shape
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation · template duplication mutation implementation

## Progress
- [ ] Add service template persistence/query contract schemas
- [ ] Add Planning query service template boundary
- [ ] Add service template query contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning service template query contracts exist, remain adapter-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL `serviceTemplates(serviceTypeId)` resolver contracts to the Planning query service.
