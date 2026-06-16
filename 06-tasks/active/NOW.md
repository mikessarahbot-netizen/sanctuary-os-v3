# NOW

## Task
Implement Planning repository in-memory test adapter for service command integration tests.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add a test-only in-memory adapter implementing `PlanningServiceCommandPersistenceRepository`
- Use the adapter in Planning command service integration tests
- Preserve tenant-scoped operation handling and mutation-intent assertions
- Keep implementation adapter-free for production: no database connection, migrations, ORM, or SQL
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · production persistence adapters · GraphQL changes · UI components · prompt execution · vendor SDK integrations · volunteer contact data

## Progress
- [ ] Add Planning in-memory repository test adapter
- [ ] Integrate adapter with command service tests
- [ ] Add tenant-scope and mutation-intent integration assertions
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning command service integration tests exercise a test-only in-memory repository adapter that implements the DB package persistence contract, with validation passing, committed, pushed, and documented in session handoff.

## Next task after this
Implement Planning service repository adapter contract notes for the eventual production database adapter.
