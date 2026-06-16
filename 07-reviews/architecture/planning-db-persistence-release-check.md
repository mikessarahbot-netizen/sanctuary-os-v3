# Planning DB Persistence Release Check

Date: 2026-06-16
Branch: `feature/planning-readiness-domain`

## Scope
Audit the implemented Planning SQL persistence layer against:
- `05-plans/db-plan.md`
- `08-decisions/0003-use-sql-first-postgres-for-planning-persistence.md`
- `08-decisions/0004-add-readiness-save-persistence-contract.md`
- `packages/db/src/planning-repository-contracts.ts`
- Current Planning SQL migrations, adapters, and adapter-level tests

## Result
Pass with follow-up.

The implemented DB package is ready for the next planned slice: API composition that selects in-memory/test or production Planning persistence adapters by environment. Production API wiring, a live PostgreSQL client binding, connection strings, and live database execution remain intentionally out of scope for this release-check.

## Evidence
| Area | Status | Evidence |
|---|---|---|
| SQL-first decision | Pass | ADR 0003 accepts SQL-first PostgreSQL with explicit migrations and no ORM/query-builder dependency. Current adapters use explicit SQL statements and a small `PlanningSqlExecutor` boundary. |
| Repository contracts | Pass | `planning-repository-contracts.ts` defines command, query, CCLI usage, rehearsal tracking, and readiness persistence contracts with Zod operation schemas. ADR 0004 documents the additive readiness save contract. |
| Migration shape | Pass | `planning-migrations.ts` creates tenant-scoped Planning tables for services, service items, assignments, templates, song library items, readiness results, CCLI usage logs, rehearsal visibility, rehearsal acknowledgements, and audit log. Migration tests validate table metadata, indexes, audit columns, checksum, and rollback SQL. |
| Command adapter | Pass | `planning-command-sql-repository.ts` covers service create/update/template duplication, service item add/update/reorder, volunteer assignment, and assignment status update. Tests cover tenant predicates, audit metadata, confirmation intent, transaction behavior, no volunteer contact storage, and row validation. |
| Query adapter | Pass | `planning-query-sql-repository.ts` covers services, service detail, templates, song library, assignments, and readiness lookup. Tests cover tenant filters, read transaction propagation, no contact/secret query fields, nullable misses, JSON readiness parsing, and malformed rows. |
| CCLI usage adapter | Pass | `planning-ccli-usage-sql-repository.ts` covers usage record/list with tenant/service/item checks, pending reporting defaults, audit metadata, transaction handling, and no vendor credential/token/password storage. |
| Rehearsal tracking adapter | Pass | `planning-rehearsal-tracking-sql-repository.ts` covers asset visibility set/list and acknowledgement record/list with tenant, service, item, assignment/person ownership checks, audit metadata, transaction handling, and no media/contact payload storage. |
| Readiness adapter | Pass | `planning-readiness-sql-repository.ts` covers readiness save and lookup with tenant/result mismatch rejection, service ownership checks, JSONB fields, upsert behavior, audit metadata, transaction propagation, and row validation. |
| Tenant scope | Pass | Every adapter method validates operation shapes and includes `tenant_id` predicates or tenant mismatch checks before returning/persisting records. Migration metadata marks all Planning tables tenant-scoped. |
| Audit metadata | Pass | Mutating adapters insert `planning_audit_log` rows with tenant, audit ID, actor when supplied, request ID, operation name, mutation intent, target aggregate ID, confirmation reason where applicable, and timestamp. |
| Transaction propagation | Pass | Mutating adapters honor supplied transaction handles and open adapter transactions only when none is supplied. Query adapters propagate optional read transactions. Tests cover supplied transaction behavior for command, query, CCLI, rehearsal, and readiness paths. |
| Privacy and adapter isolation | Pass | DB adapters do not contain GraphQL resolver logic, Auth0 claim handling, vendor SDK calls, event publication, UI code, connection strings, secrets, raw prompt payloads, volunteer contact fields, or raw media payload storage. |
| Live-DB-free validation | Pass | Adapter tests use recording executors and run without checked-in secrets or a live PostgreSQL instance. |

## Findings
No blocking defects found in the implemented Planning SQL persistence layer.

## Follow-Up
- Wire API composition to choose in-memory/test or production Planning persistence adapters by environment.
- Add the concrete PostgreSQL client binding and runtime configuration boundary when production persistence is wired.
- Add opt-in live PostgreSQL integration coverage or documented skip behavior once a real client binding exists.
- Keep future SQLite/local persistence separate, with sync-queue and stale-data tests when Play/Charts local persistence begins.

## Validation
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
