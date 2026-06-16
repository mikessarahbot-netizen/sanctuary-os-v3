# NOW

## Task
Wire Planning GraphQL `serviceTemplates(serviceTypeId)` resolver contracts to the Planning query service.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add the Planning GraphQL `serviceTemplates(serviceTypeId)` query schema/resolver contract
- Keep the resolver thin: parse GraphQL-style args/context, attach `AuthenticatedActor` and `requestId`, and delegate to `PlanningQueryService.serviceTemplates`
- Preserve existing Planning GraphQL query/mutation resolver contracts and service behavior
- Add focused tests for schema name, resolver delegation, request context propagation, empty template results, and invalid query input rejection
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · volunteer contact data · AI setlist generation · template duplication mutation implementation · GraphQL server runtime

## Progress
- [ ] Add GraphQL serviceTemplates schema/resolver contract
- [ ] Delegate resolver to Planning query service
- [ ] Add serviceTemplates resolver contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL `serviceTemplates(serviceTypeId)` resolver contracts delegate to the Planning query service, remain adapter-free and server-runtime-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md` and `05-plans/api-plan.md`.
