# Planning DB Persistence Release Check

Date: 2026-06-16
Branch: `feature/planning-db-release-check`
Base branch/commit: `feature/planning-readiness-domain` at `5e49384`

## Scope
Release check for the implemented Planning SQL persistence layer against:
- `05-plans/db-plan.md`
- `05-plans/api-plan.md`
- `05-plans/planning-module-plan.md`
- `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`
- `08-decisions/0004-add-readiness-save-persistence-contract.md`
- current `packages/db` repository contracts, SQL adapters, migrations, and tests

Checked surfaces:
- Planning persistence contracts in `packages/db/src/planning-repository-contracts.ts`
- Planning migration artifact in `packages/db/src/planning-migrations.ts`
- SQL command/query/CCLI/rehearsal/readiness adapters in `packages/db/src/`
- Focused live-DB-free adapter and migration tests in `packages/db/src/*test.ts`

## Evidence
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm install --frozen-lockfile` was required first because this worktree was missing `node_modules`; the lockfile was unchanged.
- SQL adapters Zod-parse repository operations before issuing SQL statements.
- SQL row mappers Zod-validate returned records before exposing repository results.
- Mutations insert Planning audit rows with tenant, actor, request, operation, mutation intent, target aggregate, timestamp, and confirmation reason where applicable.
- Mutations either use the supplied transaction handle or open the adapter executor transaction boundary.
- Queries and writes consistently pass tenant ID as an explicit SQL parameter and predicate tenant-owned tables by tenant.
- Current tests are live-DB-free and cover adapter SQL shape, row validation, audit metadata, supplied transaction propagation, and absence of obvious secret/contact/media payload columns.

## Gate Results
| Category | Result | Notes |
|---|---|---|
| Tooling ADR | Pass | ADR 0003 chooses SQL-first PostgreSQL with repo-owned explicit SQL migrations before adapter implementation. |
| Migration shape | Pass with follow-up | Initial Planning migration covers the planned table groups, tenant columns, core indexes, rollback SQL, audit columns, and checksum metadata. No live PostgreSQL migration execution/rollback test exists yet. |
| Tenant scope | Fail | Core service/item/assignment/readiness/rehearsal predicates are tenant-scoped, but song references can be written without verifying the referenced song belongs to the tenant. |
| Audit metadata | Pass | Successful mutation paths write `planning_audit_log`; publish/cancel service updates require confirmation intent and persist the reason. |
| Transaction propagation | Pass with defect | Supplied transaction handles are propagated and standalone mutations are wrapped, but duplicate service-item reorder inputs can mutate before the adapter throws. |
| Row/input validation | Pass | Operation schemas and returned-row schemas are used across the SQL adapters. |
| No secret/PII/media payload storage | Pass | Adapter SQL and tests do not add credential, contact, raw media, or raw prompt payload columns. |
| Live-DB-free tests | Pass | Full repo tests pass without database credentials or a live PostgreSQL instance. |
| Production wiring readiness | No-go | Fix the P1/P2 findings below before selecting these adapters for production API composition. |

## Findings
### P1: Song References Are Not Tenant-Validated Before Writes
`05-plans/db-plan.md:97` requires writes to reject related song references that do not belong to the requested tenant. The migration defines tenant-owned `planning_song_library_items` with `(tenant_id, song_id)` at `packages/db/src/planning-migrations.ts:86`, but the write paths that persist song references do not check that table:
- `addServiceItem` accepts `operation.input.songId` and only checks service ownership before insert at `packages/db/src/planning-command-sql-repository.ts:245`.
- `updateServiceItem` can set `song_id` while only filtering the target service item by tenant/service/item at `packages/db/src/planning-command-sql-repository.ts:670`.
- `recordCcliUsage` accepts `operation.input.songId` and validates service/service-item ownership, but not song ownership, at `packages/db/src/planning-ccli-usage-sql-repository.ts:186`.

Impact:
Cross-tenant or nonexistent song IDs can be persisted on service items or CCLI usage logs if the caller supplies them. That violates the DB plan's tenant-scope rule and weakens later CCLI/readiness behavior that assumes song refs are tenant-owned.

Recommended fix:
Add tenant-scoped `EXISTS` checks against `planning_song_library_items` for non-null service item song refs and CCLI usage song refs. Add live-DB-free tests that assert the SQL checks `song.tenant_id = $1` and `song.song_id = <input song id>` before returning rows/auditing.

### P2: Duplicate Item IDs Can Partially Reorder Before Rejection
`05-plans/db-plan.md:83` requires service item reorder to be atomic. The reorder SQL validates requested count against existing count and rejects requested IDs that are absent, but it does not reject duplicates before the `UPDATE` runs at `packages/db/src/planning-command-sql-repository.ts:534`. With an input like `["item_1", "item_1"]` for a two-item service, `validated.ok` can be true because both requested rows match an existing item and the counts match. PostgreSQL updates the matched item, returns fewer rows than requested, and then the adapter throws at `packages/db/src/planning-command-sql-repository.ts:588`.

Impact:
When the adapter opened its own transaction, the throw should roll back through the executor boundary. When a caller supplies a transaction, the statement has already mutated state inside that transaction before the adapter error reaches the caller. If the caller mishandles the error or transaction lifecycle, the invalid reorder can leak a partial update.

Recommended fix:
Reject duplicate `orderedServiceItemIds` before SQL execution with a Zod refinement or strengthen the SQL validation with `COUNT(DISTINCT requested.service_item_id) = COUNT(*)` before the `UPDATE`. Add a regression test for duplicate IDs that asserts no SQL write is issued or no rows are updated.

### P3: Live PostgreSQL Migration/Failure Coverage Remains Deferred
`05-plans/db-plan.md:127` asks for migration tests and failure tests, including unavailable database and transaction rollback behavior. Current tests validate migration artifacts and adapter SQL shape without secrets or a live database, which satisfies the active release-check's live-DB-free requirement. They do not execute the migration against PostgreSQL or prove rollback/connection failure behavior with a real driver.

Impact:
The SQL is reviewable and well covered as generated statements, but production deployment risk remains until an opt-in local/ephemeral PostgreSQL harness runs migrations and transaction rollback cases.

Recommended fix:
Before production rollout, add an opt-in PostgreSQL integration test path that runs the migration up/down and exercises transaction rollback/connection unavailable cases, skipping clearly when required local test database settings are absent.

## Passed Checks
- Command adapter covers service create/update, template duplication, service items, item reorder, volunteer assignment, and assignment status with tenant predicates and audit metadata.
- Query adapter covers service lists/detail, templates, song library, assignments, and readiness lookup with tenant predicates and row validation.
- CCLI usage adapter records/lists usage logs with service and optional item ownership checks, pending reporting defaults, tenant predicates, audit metadata, and no vendor credential storage.
- Rehearsal tracking adapter records/lists visibility and acknowledgements with service/item/assignment ownership checks, tenant predicates, audit metadata, and no raw media/contact payload storage.
- Readiness adapter saves and looks up readiness results with result/context tenant mismatch rejection, service ownership checks, JSON field validation, audit metadata, and transaction propagation.
- No GraphQL/resolver, API service wiring, UI, worker, vendor SDK, Auth0, connection string, secret, or ORM/query-builder changes were made in this release-check slice.

## Recommendation
No-go for production API composition until P1 and P2 are fixed. The SQL-first adapter direction, migration artifact shape, audit pattern, validation pattern, and live-DB-free test suite are solid enough to continue, but the next task should be a narrow DB fix slice for song-reference tenant validation and duplicate reorder rejection before wiring environment-based production persistence selection.
