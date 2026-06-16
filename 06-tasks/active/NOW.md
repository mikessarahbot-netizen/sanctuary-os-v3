# NOW

## Task
Implement the SQL-first Planning readiness persistence adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and existing `packages/db` SQL adapter code
- Inspect current Planning readiness domain/service/query contracts and the `planning_readiness_results` migration shape
- Add SQL-first Planning readiness persistence support under `packages/db`
- Cover readiness result persistence and lookup behavior needed by the existing Planning readiness contract
- Keep tenant predicates, request/actor audit metadata where mutations are introduced, mutation intent where mutations are introduced, service ownership checks, row validation, no PII/contact payload storage, and transaction-handle propagation visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing GraphQL, resolver, service, UI, worker, vendor SDK, Auth0, command adapter, query adapter, CCLI adapter, and rehearsal tracking adapter behavior unless a narrowly scoped readiness repository contract extension is required by the plans
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring unrelated to a required repository contract · UI · queue workers · chart rendering · media storage · notification delivery · command repository changes · query repository changes unrelated to readiness persistence · CCLI adapter changes · rehearsal tracking adapter changes · ORM/query-builder adoption

## Progress
- [x] Re-sync with required docs, DB plan, ADR, readiness contracts, and existing SQL adapter code
- [x] Identify whether the existing query repository readiness lookup is sufficient or a narrow readiness write contract is required
- [x] Add SQL-first Planning readiness persistence support
- [x] Add adapter-level tests without live database requirements
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
The DB package has SQL-first Planning readiness persistence support aligned with the existing readiness contract, with tenant/audit/ownership/transaction/no-PII behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Run a Planning DB persistence release-check against `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and implemented SQL adapters, then write findings to `07-reviews/architecture/`.
