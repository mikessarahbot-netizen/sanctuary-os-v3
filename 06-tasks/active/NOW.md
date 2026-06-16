# NOW

## Task
Implement the first SQL-first Planning command repository adapter slice for service create, service update, and template duplication.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and `packages/db/docs/planning-production-adapter-contract.md`
- Add the first SQL-first Planning command repository adapter shape under `packages/db`
- Cover `createService`, `updateService`, and `duplicateServiceFromTemplate`
- Keep tenant predicates, request/actor audit metadata, mutation intent, confirmation reason handling, and transaction-handle propagation visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing repository contracts and avoid GraphQL, resolver, service, UI, worker, vendor SDK, or Auth0 changes
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · CCLI reporting adapter · rehearsal adapter · readiness adapter · ORM/query-builder adoption

## Progress
- [x] Re-sync with required docs, DB plan, ADR, and adapter contract
- [x] Add SQL-first adapter boundary for service create/update/template duplication
- [x] Add adapter-level tests without live database requirements
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
The DB package has the first SQL-first Planning command repository adapter slice for service create, update, and template duplication with tenant/audit/confirmation/transaction behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement SQL-first Planning command repository adapter coverage for service items, reorder, volunteer assignments, and assignment status updates.
