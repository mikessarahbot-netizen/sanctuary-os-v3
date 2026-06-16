# NOW

## Task
Wire Planning GraphQL `songLibrary(searchInput)` resolver contracts to the Planning query service.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add the Planning GraphQL `songLibrary(searchInput)` query schema/resolver contract
- Keep the resolver thin: parse GraphQL-style args/context, attach `AuthenticatedActor` and `requestId`, and delegate to `PlanningQueryService.songLibrary`
- Preserve existing Planning query/mutation resolver contracts and service behavior
- Add focused tests for schema name, resolver delegation, request context propagation, empty song results, invalid query input rejection, and paused-song visibility argument forwarding
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · prompt execution · vendor SDK integrations · CCLI/SongSelect implementation · AI setlist generation · GraphQL server runtime

## Progress
- [x] Add GraphQL songLibrary schema/resolver contract
- [x] Delegate resolver to Planning query service
- [x] Add songLibrary resolver contract tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning GraphQL `songLibrary(searchInput)` resolver contracts delegate to the Planning query service, remain adapter-free and server-runtime-free, are validated by tests, committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md` and `05-plans/api-plan.md`.
