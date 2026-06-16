# ADR 0003: Use SQL-First PostgreSQL Adapter for Planning Persistence

## Status
Accepted

## Date
2026-06-16

## Context
Planning API contracts now cover service CRUD, ordered items, assignments,
readiness, template duplication, CCLI usage, CCLI reporting jobs, rehearsal asset
visibility, and rehearsal acknowledgements.

`05-plans/db-plan.md` defines Planning production persistence as the first DB
implementation target and requires a tooling decision before runtime adapter
work begins. ADR 0002 deferred that decision during scaffolding so the repo could
establish adapter-free contracts first.

The first production adapter must preserve:
- tenant-scoped reads and writes;
- explicit request/actor audit metadata;
- confirmation-intent audit data for publish/cancel flows;
- transaction handle propagation;
- deterministic, reviewable migrations;
- local tests without checked-in secrets;
- future SQLite/local compatibility for offline-first modules.

## Options Considered
### SQL-first PostgreSQL client with explicit repo-owned migrations
Use a small PostgreSQL client at the adapter boundary and keep SQL migration
files reviewed in the repository. Repository methods map validated persistence
operations to explicit SQL and row mappers.

Pros:
- Tenant predicates are visible in every query.
- Transaction handle usage is straightforward.
- Migration diffs are plain SQL and easy to review.
- Runtime dependency footprint is small.
- Repository contracts remain independent from generated ORM models.
- Future SQLite projections can reuse explicit schema decisions and row mapping
  concepts without ORM coupling.

Cons:
- Less compile-time query construction help than a typed query builder.
- More manual row mapping and SQL maintenance.
- Requires careful test coverage for query shape and schema drift.

### Typed query builder
Use a TypeScript SQL query builder for query construction and execution.

Pros:
- Stronger TypeScript ergonomics for query construction.
- Composable filters can reduce repetitive SQL.
- Less heavyweight than a full ORM.

Cons:
- Adds an abstraction layer before production schema conventions are proven.
- Tenant predicates can become less visually obvious in complex composed queries.
- Type definitions for table shapes must be maintained alongside migrations and
  repository contracts.
- Still requires explicit migration strategy decisions.

### ORM-backed adapter
Use an ORM and generated client as the primary persistence interface.

Pros:
- Fast CRUD scaffolding.
- Generated types and migration workflows.
- Familiar developer experience.

Cons:
- Introduces schema/model coupling across the persistence boundary.
- Can obscure tenant-scope predicates and transaction behavior behind generated
  APIs.
- Heavier dependency and migration workflow before the project has production DB
  experience.
- Future SQLite/local compatibility may be constrained by ORM-specific modeling
  and generated-client assumptions.

## Decision
Use a SQL-first PostgreSQL adapter path for the first Planning production
persistence implementation.

The implementation may add a PostgreSQL client dependency in the first adapter
slice, but it must not introduce an ORM or query-builder abstraction for the
initial Planning adapter. Migrations will be explicit SQL files owned by
`packages/db`, tracked through the existing migration registry concepts.

The first implementation slice after this ADR should add migration framework
tests and the initial Planning schema migration shape before repository methods
are wired to production SQL.

## Implementation Rules
- Keep GraphQL, Auth0 claim handling, service logic, vendor SDK calls, and UI code
  outside `packages/db`.
- Validate persistence operations with existing Zod operation schemas at the
  adapter boundary.
- Filter every tenant-owned read/write by operation `options.context.tenantId`.
- Persist audit metadata for every successful mutation.
- Preserve and use supplied transaction handles; do not create independent
  transactions when a handle is provided.
- Keep migrations deterministic, reviewable, and free of secrets.
- Make live PostgreSQL integration tests opt-in unless an ephemeral test database
  is provided by the test harness.
- Keep repository contracts free of PostgreSQL-specific public types so future
  SQLite/local adapters can implement the same boundaries.

## Consequences
- Planning production persistence can proceed with a small, explicit, auditable
  adapter.
- The team must write more SQL and row-mapping tests by hand.
- Query-builder or ORM adoption remains possible later, but requires a new ADR
  explaining why the first SQL-first adapter path is insufficient.
- SQLite/local persistence remains a separate future implementation track rather
  than a constraint that blocks server persistence.
