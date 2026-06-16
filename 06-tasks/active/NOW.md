# NOW

## Task
Implement Planning service repository adapter contract notes for the eventual production database adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Document the production Planning repository adapter boundary against `PlanningServiceCommandPersistenceRepository`
- Identify required persistence operations, tenant-scope invariants, mutation-intent/audit expectations, and transaction behavior
- Keep implementation adapter-free: no database connection, migrations, ORM, SQL, or concrete production adapter
- Add focused checks if the notes are referenced from package exports or README files
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · GraphQL changes · UI components · prompt execution · vendor SDK integrations · volunteer contact data

## Progress
- [ ] Add Planning production adapter contract notes
- [ ] Link notes from the relevant DB/API documentation surface
- [ ] Verify notes match current DB repository contract and Planning command service behavior
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The eventual production Planning repository adapter contract is documented against the current DB package repository interface, validation passes, changes are committed and pushed, and the next session handoff is documented.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md` and `05-plans/api-plan.md`.
