# NOW

## Task
Wire Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contracts to the Planning command service.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add the Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contract
- Keep the resolver thin: parse GraphQL-style args/context, attach `AuthenticatedActor` and `requestId`, and delegate to `PlanningCommandService.duplicateServiceFromTemplate`
- Preserve existing Planning GraphQL query/mutation resolver contracts and service behavior
- Add focused tests for resolver delegation, request context propagation, invalid input rejection, and returned service data
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · CCLI/SongSelect implementation · AI setlist generation · GraphQL server runtime

## Progress
- [ ] Add GraphQL duplicateServiceFromTemplate resolver contract
- [ ] Delegate resolver to Planning command service
- [ ] Add duplicateServiceFromTemplate resolver contract tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL `duplicateServiceFromTemplate(input)` resolver contracts delegate to the Planning command service, remain adapter-free and server-runtime-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md` and `05-plans/api-plan.md`.
