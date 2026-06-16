# NOW

## Task
Add migration framework tests and the initial Planning schema migration shape for SQL-first PostgreSQL persistence.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and `packages/db/docs/planning-production-adapter-contract.md`
- Add adapter-free migration framework tests around the existing migration registry concepts
- Add the initial Planning SQL migration shape as reviewed migration text or metadata under `packages/db`
- Cover required Planning table groups, tenant IDs, audit metadata, confirmation intent, core indexes, and rollback/checksum expectations at the contract level
- Keep this slice free of live database connections, connection strings, secrets, runtime adapter code, dependency installation, and API wiring
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · runtime repository adapter implementation · ORM/query-builder adoption · dependency installation · production connection configuration · GraphQL/resolver changes · service changes · UI

## Progress
- [ ] Re-sync with required docs, DB plan, ADR, and adapter contract
- [ ] Add migration framework tests
- [ ] Add initial Planning schema migration shape
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The DB package has reviewed tests and migration artifacts that define the initial Planning SQL schema shape without requiring a live database; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement the first SQL-first Planning command repository adapter slice approved by `05-plans/db-plan.md` and ADR 0003.
