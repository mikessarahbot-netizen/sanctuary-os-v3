# NOW

## Task
Implement the SQL-first Planning rehearsal tracking persistence adapter.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and existing `packages/db` SQL adapter code
- Add a SQL-first Planning rehearsal tracking persistence adapter under `packages/db`
- Cover rehearsal asset visibility set/list and rehearsal acknowledgement record/list
- Keep tenant predicates, request/actor audit metadata, mutation intent, service/item/assignment ownership checks, row validation, no media/contact payload storage, and transaction-handle propagation visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing repository contracts and avoid GraphQL, resolver, service, UI, worker, vendor SDK, Auth0, command adapter, query adapter, CCLI adapter, and readiness adapter changes
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · chart rendering · media storage · notification delivery · command repository changes · query repository changes · CCLI adapter changes · readiness adapter · ORM/query-builder adoption

## Progress
- [x] Re-sync with required docs, DB plan, ADR, and existing SQL adapter code
- [x] Add SQL-first Planning rehearsal tracking persistence adapter
- [x] Add adapter-level tests without live database requirements
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
The DB package has a SQL-first Planning rehearsal tracking persistence adapter for asset visibility and acknowledgements with tenant/audit/ownership/transaction/no-media/no-contact behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement the SQL-first Planning readiness persistence adapter.
