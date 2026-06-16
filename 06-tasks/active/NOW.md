# NOW

## Task
Implement Planning query service contracts for service and assignment reads.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add adapter-free Planning query service contracts for `services(filter)`, `service(id)`, `serviceAssignments(serviceId)`, and `serviceReadiness(serviceId)`
- Define Zod-validated query command/input schemas, repository boundary interfaces, tenant-scope guards, and role checks
- Keep resolvers thin and delegate-ready without adding production persistence, migrations, ORM, SQL, or UI
- Add focused tests for tenant scope, role checks, query input validation, and repository contract shape
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · GraphQL wiring changes · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation

## Progress
- [ ] Add Planning query service schemas and repository interfaces
- [ ] Add tenant-scope and role guard behavior
- [ ] Add query service contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning query service contracts exist for planned service and assignment reads, remain adapter-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL query resolver contracts to the Planning query service contracts.
