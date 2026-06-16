# NOW

## Task
Implement Planning readiness domain slice.

## In scope
- Create branch `feature/planning-readiness-domain`
- Add Planning domain schemas for services, service items, assignments, rehearsal tracking, and CCLI usage
- Add pure readiness score calculation based on `05-plans/planning-module-plan.md`
- Add service boundary for `refreshReadinessScore` with Planning role checks and tenant-scope guards
- Add validated `readiness.updated` WebSocket payload shape
- Add tests for readiness scoring, service authorization, tenant mismatch, and payload publication
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database persistence · GraphQL resolvers · UI components · prompt execution · vendor SDK integrations · volunteer contact data

## Progress
- [x] Created and checked out `feature/planning-readiness-domain`
- [x] Add Planning domain schemas
- [x] Add readiness score calculation
- [x] Add service boundary with role and tenant checks
- [x] Add readiness event payload validation
- [x] Add tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning readiness domain types, pure calculation, and service boundary are implemented, validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Implement the next approved Planning API service contract slice.
