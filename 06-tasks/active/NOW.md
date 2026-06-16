# NOW

## Task
Refresh the Planning module plan with approved GraphQL extension operations.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, and `07-reviews/architecture/planning-api-contract-release-check.md`
- Update `05-plans/planning-module-plan.md` so its GraphQL query/mutation sections include the approved CCLI reporting job, CCLI usage log, rehearsal asset visibility, and rehearsal acknowledgement operations already implemented in Planning GraphQL
- Preserve the distinction between original first-slice operations and approved v1 extension operations
- Keep this as documentation alignment only
- Run lint, typecheck, and tests
- Commit and push the plan refresh
- Run session handoff

## Out of scope
New runtime features · new public GraphQL operations · resolver changes · service changes · UI · vendor adapters · database migrations · queue workers

## Progress
- [x] Re-sync with required docs, release-check, and current implementation
- [x] Update Planning plan GraphQL sections with approved extension operations
- [x] Run lint, typecheck, and tests
- [ ] Commit and push plan refresh
- [ ] Session handoff

## Done when
The Planning plan reflects the approved CCLI and rehearsal tracking GraphQL extension operations, gates pass, and the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved project slice based on the refreshed plan and existing release-check findings.
