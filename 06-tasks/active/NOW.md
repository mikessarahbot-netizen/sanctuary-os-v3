# NOW

## Task
Implement Planning service command contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add Zod-validated service command schemas for Planning mutations from `05-plans/planning-module-plan.md`
- Add service-layer interfaces for create/update service, add/update/reorder service items, assign volunteer, and update assignment status
- Require `AuthenticatedActor`, tenant scope, and Planning roles at service boundaries
- Represent destructive or publish-like operations with explicit confirmation intent
- Add tests for command validation, tenant scope, and role gates
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database persistence · GraphQL resolvers · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation

## Progress
- [ ] Add Planning command schemas
- [ ] Add service-layer interfaces
- [ ] Add role/tenant/confirmation helpers
- [ ] Add tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning service command contracts are implemented, validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Implement Planning GraphQL schema/resolver contracts that delegate to the service layer.
