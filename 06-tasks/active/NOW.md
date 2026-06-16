# NOW

## Task
Implement Planning GraphQL schema/resolver contracts that delegate to the service layer.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add GraphQL schema/type contract placeholders for Planning mutations from `05-plans/planning-module-plan.md`
- Add resolver contracts that parse GraphQL input and delegate to Planning service-layer commands
- Keep resolvers thin; no persistence, UI, or vendor integrations
- Preserve service-layer tenant scope, role gates, and confirmation-intent requirements
- Add tests that resolver contracts call the service layer with validated command shapes
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database persistence · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation

## Progress
- [ ] Add Planning GraphQL schema/type contracts
- [ ] Add thin resolver contract functions
- [ ] Add input validation/delegation tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL schema/resolver contracts delegate to the service layer, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Implement Planning persistence repository contracts for service commands.
