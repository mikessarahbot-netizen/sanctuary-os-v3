# NOW

## Task
Implement Planning persistence repository contracts for service commands.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add repository contract types for Planning service command persistence boundaries
- Map command-service repository methods to tenant-scoped DB package operation contracts
- Keep implementation adapter-free: no database connection, migrations, ORM, or SQL
- Add tests for tenant scope, mutation intent, and repository contract shape
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete persistence adapters · GraphQL changes · UI components · prompt execution · vendor SDK integrations · volunteer contact data

## Progress
- [ ] Add Planning persistence repository contracts
- [ ] Map repository methods to DB operation contract shapes
- [ ] Add tenant-scope and mutation-intent tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning persistence repository contracts are defined without concrete adapters, validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Implement Planning repository in-memory test adapter for service command integration tests.
