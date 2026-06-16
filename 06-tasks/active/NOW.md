# NOW

## Task
Implement the SQL-first Planning rehearsal tracking persistence adapter.

## In scope
- Continue from pushed branch `feature/planning-ccli-usage-sql-adapter`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/planning-module-plan.md`, `05-plans/db-plan.md`, `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`, and existing `packages/db` SQL adapter code
- Add a SQL-first Planning rehearsal tracking persistence adapter under `packages/db`
- Cover `setRehearsalAssetVisibility`, `listRehearsalAssetVisibility`, `recordRehearsalAcknowledgement`, and `listRehearsalAcknowledgements`
- Keep tenant predicates, request/actor audit metadata, mutation intent, service/item/assignment ownership checks, row validation, no raw media/contact payloads, and transaction-handle propagation visible at the adapter boundary
- Add adapter-level tests that run without checked-in secrets or a live database
- Preserve existing repository contracts and avoid GraphQL, resolver, service, UI, worker, vendor SDK, Auth0, command adapter, query adapter, CCLI adapter, and readiness adapter changes
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL execution · connection strings or secrets · GraphQL/resolver changes · API service wiring · UI · queue workers · media storage or chart rendering · notification delivery · attendance workflows · command repository changes · query repository changes · CCLI adapter · readiness adapter · ORM/query-builder adoption

## Progress
- [ ] Re-sync with required docs, DB plan, ADR, and existing SQL adapter code
- [ ] Add SQL-first Planning rehearsal tracking persistence adapter
- [ ] Add adapter-level tests without live database requirements
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The DB package has a SQL-first Planning rehearsal tracking persistence adapter for asset visibility and acknowledgement record/list operations with tenant/audit/ownership/transaction/no-raw-media-or-contact behavior covered by adapter-level tests; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Implement Planning readiness persistence storage and lookup.
