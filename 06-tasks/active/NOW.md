# NOW

## Task
Add the concrete PostgreSQL client binding and runtime configuration boundary for Planning persistence without checking in secrets.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `07-reviews/architecture/planning-db-persistence-release-check.md`, and current API composition / DB SQL adapter code
- Inspect `PlanningSqlExecutor`, SQL adapter transaction expectations, and the new API Planning persistence composition boundary
- Add a small PostgreSQL client/executor binding boundary suitable for API production injection
- Add runtime configuration parsing for non-secret mode selection and environment variable names only; do not check in secret values or connection strings
- Preserve the existing in-memory/test behavior and the existing SQL composition dependency injection path
- Add tests for config validation, secret-free boundaries, executor statement forwarding, transaction forwarding, and safe failure behavior without requiring a live PostgreSQL database
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Checked-in connection strings or secrets · live PostgreSQL requirement in default tests · migration runner execution · production deployment config · GraphQL contract changes · UI · workers · vendor SDKs · Auth0 integration changes · ORM/query-builder adoption · new Planning domain behavior

## Progress
- [ ] Re-sync with required docs, release-check, API composition code, and DB SQL adapter code
- [ ] Identify PostgreSQL client/executor boundary and runtime config inputs
- [ ] Add concrete PostgreSQL executor/client binding without checked-in secrets
- [ ] Add runtime configuration parsing for production Planning persistence injection
- [ ] Add live-DB-free tests for config and executor behavior
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The API can construct production Planning SQL persistence dependencies through a tested PostgreSQL client/executor boundary and strict runtime configuration without storing secrets in the repo or requiring a live database for default validation; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Run a release-check for Planning production persistence wiring and decide whether to add opt-in live PostgreSQL integration coverage or proceed to the next product module.
