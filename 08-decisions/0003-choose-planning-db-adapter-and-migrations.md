# ADR 0003: Choose Planning Database Adapter and Migration Tooling

## Status
Accepted

## Date
2026-06-16

## Context
Planning is the first Sanctuary OS module ready for production persistence. Its API
contracts, service boundaries, adapter-free repository interfaces, event handoff,
job handoff, and Zod validation layer are already established.

ADR 0002 intentionally deferred database adapter, migration tooling, connection
pool, and schema implementation choices. `05-plans/db-plan.md` now requires this
decision before production adapter code or migrations are added.

The first Planning persistence implementation must optimize for:

- tenant-scope checks that are easy to review in every query and mutation
- deterministic migrations reviewed as code
- transaction handles that can be passed through repository operations
- local tests that do not require checked-in secrets
- future SQLite compatibility for Play, Charts, and local/offline projections

## Decision
Use a SQL-first PostgreSQL adapter with a small PostgreSQL client and explicit SQL
migrations for the first Planning production persistence implementation.

`packages/db` will own:

- PostgreSQL connection and transaction-handle boundaries
- SQL files for production migrations
- migration registry metadata with stable migration IDs, checksums, applied state,
  and rollback state where rollback is supported
- migration tests for Planning schema shape and required indexes
- repository adapters that implement
  `packages/db/src/planning-repository-contracts.ts`
- persistence-level validation and stable adapter error normalization

The initial production adapter should use hand-written SQL for Planning repository
methods. Every persisted Planning read or write must include explicit tenant scope
from `options.context.tenantId`; writes that touch related Planning records must
verify those related records in the same tenant before mutation.

The initial migration path should use ordered SQL migration files plus a small
package-owned migration runner/registry instead of generated schema migrations.
Migration files must be committed and reviewed directly. They must not require
checked-in secrets or production connection strings.

## Alternatives Considered

### Typed Query Builder
A typed query builder could improve query composition and reduce some row-shape
mistakes. It is not the first choice because Planning's initial persistence layer
needs a small number of highly reviewable tenant-scoped queries, atomic writes,
and audit inserts. Adding a query-builder abstraction now would make migration
review and future SQLite projection strategy more dependent on library-specific
patterns before the first production schema proves itself.

This decision does not ban a future typed query builder. If repeated SQL mapping
or cross-database query generation becomes a real maintenance cost, a later ADR
may introduce one behind the repository adapter boundary.

### ORM-Backed Adapter
An ORM would provide model mapping, relations, and migration workflows, but it is
not the first choice for Planning persistence. The current requirements value
explicit tenant filters, visible transaction behavior, reviewed SQL migrations,
and compact adapter code over broader object mapping. ORM-generated migrations
can make destructive changes and tenant-scope guarantees harder to audit in early
slices.

This decision does not ban future ORM use in unrelated modules, but Planning's
first production persistence path should remain SQL-first.

## Consequences

- Tenant-scope enforcement is visible in each repository method and migration.
- Migrations are deterministic, reviewable, and independent of generated clients.
- Transaction behavior stays explicit through adapter-owned transaction handles.
- Local tests can run against an ephemeral or developer-provided PostgreSQL
  database without storing secrets in the repository.
- Future SQLite work remains possible because public repository contracts keep
  IDs opaque, tenant IDs explicit, timestamps portable, and enums/booleans
  representable without PostgreSQL-only domain encoding.
- The adapter will need careful row-mapping tests because hand-written SQL does
  not provide generated model types.
- If query volume or SQL duplication grows beyond the Planning adapter boundary,
  the team should revisit typed query-builder adoption with a focused ADR.

## Follow-Up Work

1. Add the package-owned migration runner/registry and Planning schema migration
   tests.
2. Add initial SQL migrations only for the Planning persistence interfaces being
   implemented.
3. Implement the Planning command repository adapter first.
4. Keep query-builder or ORM dependencies out of the first Planning persistence
   slice unless a later ADR supersedes this decision.
