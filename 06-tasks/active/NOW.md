# NOW

## Task
Run a Planning API contract release-check and write findings to `07-reviews/architecture/`.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Audit current Planning API/domain/service/GraphQL contracts against the API and Planning plans
- Verify tenant scoping, thin resolver delegation, Zod trust-boundary validation, service-owned role checks, explicit publish/destructive confirmation handling, validated event/job handoff, and Planning v1 domain coverage
- Run lint, typecheck, and tests
- Write release-check findings to `07-reviews/architecture/planning-api-contract-release-check.md`
- Update this task with completion status
- Commit and push the release-check
- Run session handoff

## Out of scope
New runtime features · new public GraphQL operations · UI · vendor adapters · database migrations · queue workers · notification delivery

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Audit Planning API contracts against plans and standards
- [x] Run lint, typecheck, and tests
- [x] Write findings to `07-reviews/architecture/planning-api-contract-release-check.md`
- [ ] Commit and push release-check
- [ ] Session handoff

## Done when
The Planning API contract release-check is documented with evidence-backed findings, gates pass, and the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved project slice based on the release-check findings and existing plans.
