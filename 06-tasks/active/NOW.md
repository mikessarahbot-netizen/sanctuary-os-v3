# NOW

## Task
Wire Planning GraphQL `generateSetlist(input)` resolver contracts to the Planning command service.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Wire the existing Planning GraphQL `generateSetlist(input)` mutation resolver contract to `PlanningCommandService.generateSetlist`
- Keep the resolver thin: parse GraphQL-style `{ input }` args/context, attach `AuthenticatedActor` and `requestId`, and delegate to the command service
- Update GraphQL SDL return contracts as needed so generated setlist suggestions are reviewable and do not masquerade as persisted `PlanningService` records
- Preserve existing Planning query/mutation resolver behavior
- Add focused API GraphQL tests for resolver delegation, request context propagation, reviewable generated-result shape, and invalid input rejection before service delegation
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · vendor SDK integrations · direct Claude/OpenAI calls · automatic writes to service items · CCLI/SongSelect implementation · GraphQL server runtime

## Progress
- [ ] Add generated setlist GraphQL result SDL contract
- [ ] Wire `generateSetlist(input)` resolver to the command service
- [ ] Add focused API GraphQL resolver tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning GraphQL `generateSetlist(input)` resolver delegates to the command service with tenant/request context, returns a reviewable generated-setlist result contract, rejects invalid input before delegation, preserves existing resolver behavior, passes lint/typecheck/tests, is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
