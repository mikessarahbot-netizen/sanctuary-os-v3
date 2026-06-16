# NOW

## Task
Implement SQL-first Planning command repository adapter coverage for service items, reorder, volunteer assignments, and assignment status updates.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and `packages/db/docs/planning-production-adapter-contract.md`
- Extend the existing SQL-first Planning command repository adapter under `packages/db`
- Cover `addServiceItem`, `updateServiceItem`, `reorderServiceItems`, `assignVolunteer`, and `updateAssignmentStatus`
- Keep tenant predicates, request/actor audit metadata, mutation intent, atomic reorder/status behavior, and transaction-handle propagation visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing repository contracts and avoid GraphQL, resolver, service, UI, worker, vendor SDK, Auth0, CCLI, rehearsal, readiness, and query repository changes
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · query repository adapter · CCLI reporting adapter · rehearsal adapter · readiness adapter · ORM/query-builder adoption

## Progress
- [ ] Re-sync with required docs, DB plan, ADR, and adapter contract
- [ ] Extend SQL-first adapter for service item and assignment command methods
- [ ] Add adapter-level tests without live database requirements
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The DB package SQL-first Planning command repository adapter covers service item create/update/reorder and assignment create/status update with tenant/audit/transaction behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement the SQL-first Planning query repository adapter for services, service detail, templates, song library search, assignments, and readiness lookup.
