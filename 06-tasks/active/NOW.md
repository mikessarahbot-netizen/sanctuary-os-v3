# NOW

## Task
Add opt-in live PostgreSQL integration coverage for Planning persistence wiring with documented skip behavior and no checked-in secrets.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `07-reviews/architecture/planning-db-persistence-release-check.md`, `07-reviews/architecture/planning-production-persistence-wiring-release-check.md`, and current API/DB persistence wiring
- Inspect the Planning SQL migration artifact, PostgreSQL executor boundary, and API runtime composition
- Add opt-in live PostgreSQL integration test coverage or a documented integration test harness that skips clearly unless required environment variables are present
- Verify production persistence wiring against a real PostgreSQL-compatible client only when explicitly configured
- Document required environment variable names and local execution steps without checking in secret values
- Preserve the default live-DB-free `pnpm test` behavior
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Checked-in connection strings or secrets · requiring live PostgreSQL in default CI/tests · production deployment config · migration runner deployment automation · GraphQL contract changes · UI · workers · vendor SDKs · Auth0 integration changes · ORM/query-builder adoption · new Planning domain behavior

## Progress
- [ ] Re-sync with required docs, release-checks, API composition code, DB migrations, and PostgreSQL executor code
- [ ] Identify opt-in integration test approach and required environment variables
- [ ] Add live PostgreSQL integration coverage or documented skip harness
- [ ] Document local execution and skip behavior without secrets
- [ ] Confirm default test suite remains live-DB-free
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning production persistence wiring has opt-in live PostgreSQL integration coverage or a documented skip-safe harness; required environment variable names and local execution steps are documented without secrets; default tests remain live-DB-free; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Decide and start the next product module slice after Planning production persistence readiness.
