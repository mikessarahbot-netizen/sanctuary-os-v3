# NOW

## Task
Run a Planning DB persistence release-check.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, `08-decisions/0004-add-readiness-save-persistence-contract.md`, and current `packages/db` SQL adapter code
- Audit implemented Planning SQL persistence against `05-plans/db-plan.md`, ADR 0003, ADR 0004, and the active repository contracts
- Verify command, query, CCLI usage, rehearsal tracking, readiness, migration, tenant scope, audit metadata, transaction propagation, row validation, no secret/PII/media payload storage, and live-DB-free test coverage
- Run lint, typecheck, and tests
- Write findings to `07-reviews/architecture/planning-db-persistence-release-check.md`
- Update this task file with completion status
- Commit and push the release-check slice
- Run session handoff

## Out of scope
New production database wiring · live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · vendor SDKs · Auth0 · ORM/query-builder adoption · new feature behavior beyond defects directly found by this release-check

## Progress
- [ ] Re-sync with required docs, ADRs, contracts, adapters, and migration code
- [ ] Audit implemented SQL persistence against DB plan and ADRs
- [ ] Run lint, typecheck, and tests
- [ ] Write architecture review findings
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
`07-reviews/architecture/planning-db-persistence-release-check.md` records evidence-backed findings for the implemented Planning SQL persistence layer, gates pass, the slice is committed and pushed, and the next task is documented in session handoff.

## Next task after this
Wire API composition to select in-memory/test or production Planning persistence adapters by environment.
