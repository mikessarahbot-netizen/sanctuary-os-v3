# NOW

## Task
Wire Planning GraphQL query resolver contracts to the Planning query service contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add Planning GraphQL query resolver contracts for `services(filter)`, `service(id)`, `serviceAssignments(serviceId)`, and `serviceReadiness(serviceId)`
- Keep resolvers thin: parse GraphQL-style args/context, attach `AuthenticatedActor` and `requestId`, and delegate to `createPlanningQueryService`
- Preserve existing mutation resolver contracts and Planning command/readiness behavior
- Add focused tests for query schema names, resolver delegation, request context propagation, nullable service/readiness results, and invalid query input rejection
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation · GraphQL server runtime

## Progress
- [ ] Add Planning GraphQL query schema/resolver contracts
- [ ] Delegate query resolvers to Planning query service contracts
- [ ] Add query resolver contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL query resolver contracts delegate to the Planning query service contracts, remain adapter-free and server-runtime-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md` and `05-plans/api-plan.md`.
