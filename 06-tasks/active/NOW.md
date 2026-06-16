# NOW

## Task
Wire API composition to select Planning persistence adapters by environment.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `07-reviews/architecture/planning-db-persistence-release-check.md`, and current `apps/api`/`packages/db` composition and repository code
- Inspect current API service dependency construction and test/in-memory Planning repositories
- Add a small API composition boundary that can select in-memory/test Planning repositories or production SQL-backed Planning persistence adapters by environment/config
- Keep GraphQL resolvers thin and unchanged unless they need to accept the selected service dependencies
- Keep live PostgreSQL execution, connection strings, secrets, migrations execution, and deployment configuration out of scope
- Add tests for environment/config selection, safe defaults, no secrets in config, and preservation of existing in-memory/test behavior
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL connection/client implementation · connection strings or secrets · migration runner execution · production deployment config · GraphQL contract changes · UI · queue workers · vendor SDKs · Auth0 integration changes · ORM/query-builder adoption · new Planning domain behavior

## Progress
- [x] Re-sync with required docs, release-check, API composition code, and repository adapters
- [x] Identify current API dependency construction and safe environment/config switch point
- [x] Add Planning persistence adapter selection boundary
- [x] Add composition tests without live database requirements
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The API package has a tested composition boundary for selecting in-memory/test Planning repositories or SQL-backed Planning persistence adapters by environment/config without secrets or live database requirements; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add the concrete PostgreSQL client binding and runtime configuration boundary for Planning persistence without checking in secrets.
