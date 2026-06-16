# NOW

## Task
Write an ADR choosing the database adapter and migration tooling path for Planning production persistence.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `07-reviews/architecture/planning-api-contract-release-check.md`, `08-decisions/0002-defer-database-adapter-choice.md`, and `packages/db/docs/planning-production-adapter-contract.md`
- Add a new ADR in `08-decisions/` that chooses the production DB adapter and migration tooling strategy for the first Planning persistence implementation
- Evaluate SQL-first PostgreSQL client + explicit migrations, typed query builder, and ORM-backed adapter against tenant scope, transaction handles, migration reviewability, local tests without secrets, and future SQLite compatibility
- Keep this as a documentation/decision slice only
- Run lint, typecheck, and tests
- Commit and push the ADR
- Run session handoff

## Out of scope
Runtime adapter implementation · migrations · schema files · dependency installation · connection strings · secrets · UI · GraphQL/resolver changes · service changes

## Progress
- [ ] Re-sync with required docs, DB plan, ADR 0002, and adapter contract
- [ ] Add DB adapter/migration tooling ADR
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push ADR
- [ ] Session handoff

## Done when
The ADR records a clear tooling path for the first Planning production persistence implementation; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the first approved DB implementation slice from `05-plans/db-plan.md` and the new ADR.
