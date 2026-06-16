# NOW

## Task
Implement the SQL-first Planning query repository adapter for services, service detail, templates, song library search, assignments, and readiness lookup.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and existing `packages/db` SQL adapter code
- Add a SQL-first Planning query repository adapter under `packages/db`
- Cover `listServices`, `getService`, `listServiceTemplates`, `listSongLibrary`, `listServiceAssignments`, and `getServiceReadiness`
- Keep tenant predicates, filter parameterization, row validation, null-on-missing behavior, and no-contact/no-secret boundaries visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing repository contracts and avoid GraphQL, resolver, service, UI, worker, vendor SDK, Auth0, command adapter, CCLI write adapter, rehearsal adapter, and readiness write adapter changes
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · command repository changes · CCLI write adapter · rehearsal adapter · readiness write adapter · ORM/query-builder adoption

## Progress
- [ ] Re-sync with required docs, DB plan, ADR, and existing SQL adapter code
- [ ] Add SQL-first Planning query repository adapter
- [ ] Add adapter-level tests without live database requirements
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The DB package has a SQL-first Planning query repository adapter for services, service detail, templates, song library search, assignments, and readiness lookup with tenant/filter/row-validation behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement the SQL-first Planning CCLI usage persistence adapter.
