# DB Plan

## Purpose
Define the first production persistence path for Planning without selecting a
concrete ORM, query builder, migration tool, connection pool, or generated
database client in this documentation slice.

This plan follows:
- `08-decisions/0002-defer-database-adapter-choice.md`
- `packages/db/docs/planning-production-adapter-contract.md`
- `packages/db/src/planning-repository-contracts.ts`
- `05-plans/api-plan.md`
- `05-plans/planning-module-plan.md`
- `07-reviews/architecture/planning-api-contract-release-check.md`

## First Production Target
PostgreSQL is the first server persistence target for Planning API reads and
writes. The initial production adapter work should live behind the existing
`packages/db` Planning repository interfaces and be consumed by the API service
layer without GraphQL resolver changes.

SQLite remains a future compatibility target for local/offline Play and Charts
workflows. The Planning adapter design must avoid PostgreSQL-only behavior in
repository contracts so future SQLite adapters can reuse the same Zod operation
schemas, tenant-scope rules, and contract tests where practical.

## Boundaries
### In The First DB Implementation Path
- PostgreSQL-backed Planning repository adapters.
- Schema migrations for Planning tables and audit records.
- Transaction boundary implementation compatible with
  `TransactionBoundary` / `TransactionHandle`.
- Tenant-scoped reads and writes for every Planning repository method.
- Audit metadata persistence for every successful mutation.
- Contract tests that run the API Planning services through the production
  adapter against an isolated test database.

### Still Out Of Scope Until Later Tasks
- SQLite/local adapter implementation.
- ORM/query-builder selection in this plan.
- Connection strings, secrets, production deployment wiring, and hosting setup.
- GraphQL schema or resolver changes.
- UI changes.
- WebSocket transport, queue workers, CCLI vendor submission, notification
  delivery, media storage, and Auth0 runtime integration.

## Repository Coverage
The PostgreSQL adapter path must cover all existing Planning persistence
interfaces.

| Interface | Methods | First adapter slice |
|---|---|---|
| `PlanningServiceCommandPersistenceRepository` | `createService`, `duplicateServiceFromTemplate`, `updateService`, `addServiceItem`, `updateServiceItem`, `reorderServiceItems`, `assignVolunteer`, `updateAssignmentStatus` | Slice 1 |
| `PlanningServiceQueryPersistenceRepository` | `listServices`, `getService`, `listServiceTemplates`, `listSongLibrary`, `listServiceAssignments`, `getServiceReadiness` | Slice 2 |
| `PlanningCcliUsageLogPersistenceRepository` | `recordCcliUsage`, `listCcliUsageLogs` | Slice 3 |
| `PlanningRehearsalAssetVisibilityPersistenceRepository` | `setRehearsalAssetVisibility`, `listRehearsalAssetVisibility` | Slice 4 |
| `PlanningRehearsalAcknowledgementPersistenceRepository` | `recordRehearsalAcknowledgement`, `listRehearsalAcknowledgements` | Slice 4 |

Command persistence comes first because service creation, item ordering,
assignment writes, and publish/cancel audit behavior are the highest-risk
tenant-scoped mutations. Query persistence follows once the write model exists,
then CCLI and rehearsal tracking extension repositories.

## Data Model Areas
The first migration set should introduce only tables required by the Planning
repository contracts:
- tenants are referenced by `tenantId` but owned outside this package.
- services.
- service items.
- service templates.
- assignments.
- song library projection records.
- readiness records and readiness checks.
- CCLI usage logs.
- rehearsal asset visibility records.
- rehearsal acknowledgement records.
- Planning audit records.

IDs remain opaque strings at the repository boundary. Database constraints must
enforce tenant-local uniqueness for child records, including service items,
assignments, usage logs, rehearsal visibility, and acknowledgements.

## Tenant Scoping
Every adapter method must use `operation.options.context.tenantId` as the source
of truth. The adapter must not infer tenant scope from IDs, request globals, or
database session state.

Required tenant-scope behavior:
- All reads filter by `tenantId`.
- All writes target rows by `tenantId` plus the requested aggregate or child ID.
- Reorder operations reject item IDs outside the requested tenant and service.
- Assignment updates require the assignment and service to share the same tenant.
- Rehearsal acknowledgement writes require service, item, asset visibility when
  applicable, assignment, and person references to be tenant-compatible.
- Returned records must include the same tenant ID supplied in the operation
  context.

Cross-tenant misses should return `null` or empty lists for read paths that
already model missing data. Mutations should fail with a stable adapter error
that does not reveal whether a cross-tenant record exists.

## Transaction Behavior
The PostgreSQL adapter must honor an incoming `operation.options.transaction`.
When one is present, the adapter joins that transaction and does not start an
independent transaction. When no transaction is present, the adapter creates the
smallest transaction needed to make the method atomic.

Required atomic operations:
- `updateService` plus destructive confirmation audit metadata.
- `duplicateServiceFromTemplate` plus copied ordered service items.
- `reorderServiceItems` for the complete item order replacement.
- `assignVolunteer` plus audit metadata.
- `updateAssignmentStatus` plus audit metadata.
- `recordCcliUsage` plus audit metadata.
- rehearsal visibility and acknowledgement writes plus audit metadata.

The API service layer owns `publishAfterCommit`; database adapters must not emit
Planning WebSocket events directly.

## Audit Metadata
Every successful mutation must persist:
- tenant ID.
- actor ID when supplied.
- request ID.
- repository method or equivalent operation name.
- mutation intent from `operation.options.intent`.
- persisted record ID or aggregate ID.
- timestamp from the production clock.

For `destructive-confirmed` operations, the audit record must also persist the
human confirmation reason from `input.confirmationIntent` when present. Service
publish and cancel status changes must be rejected by the adapter if the intent
is not `destructive-confirmed` or the confirmation intent is missing.

Audit rows must not store secrets, vendor credentials, raw prompt payloads,
volunteer contact data, or raw PII.

## Validation And Error Normalization
The API layer already validates GraphQL input and services already validate
repository operation shapes, but the production adapter must still validate or
normalize at the database boundary:
- Parse each operation with the matching Zod operation schema before writing.
- Parse returned rows with the matching persistence record schema before
  returning to services.
- Convert database constraint and connectivity failures into stable adapter
  errors.
- Do not log full operation payloads when they may contain notes or other
  user-entered content.

## Migration Boundaries
Migration work should be its own implementation slice before production adapter
code is wired into API runtime configuration.

Migration requirements:
- Create Planning tables and indexes only.
- Include tenant ID columns on every Planning table.
- Include audit records for Planning mutations.
- Add foreign-key constraints where the owned Planning tables can enforce them.
- Use tenant-aware unique constraints for child records and ordering.
- Include rollback guidance or explicit irreversible-migration notes per
  migration.
- Register applied migration metadata through the package migration boundary.

The migration tool choice remains a future implementation decision. The choice
must be documented before adding migration files.

## SQLite And Offline Compatibility
SQLite is not part of the first production adapter slice, but the PostgreSQL
design must preserve future local compatibility:
- Keep repository contracts free of SQL dialect-specific types.
- Preserve ISO datetime strings at boundaries.
- Avoid relying on PostgreSQL-only return semantics in service tests.
- Keep transaction handling behind `TransactionBoundary`.
- Keep contract tests adapter-neutral so they can be reused by a SQLite adapter
  later.

Offline-first Play and Charts behavior remains owned by their future local
adapters and sync queues. Planning server persistence must not block that future
path by leaking database-specific shapes into API or domain contracts.

## Test Strategy
Each DB implementation slice needs the lightest reliable test layer for the risk
it introduces.

Required tests:
- Repository contract tests for valid reads/writes and malformed operation
  rejection.
- Tenant isolation tests for every repository method.
- Transaction tests for reorder, duplicate-from-template, publish/cancel audit,
  assignment status update, CCLI usage logging, and rehearsal tracking writes.
- API service integration tests that reuse existing Planning services with the
  production adapter.
- Migration tests that apply migrations to an empty test database and verify
  expected tables, indexes, and constraints.
- Regression tests for destructive confirmation and audit metadata.

Existing in-memory adapters under `apps/api/src/services/planning/testing/`
remain useful for service-level tests, but production adapter tests must exercise
real database behavior.

## Rollout Order
1. Choose and document the PostgreSQL adapter and migration tooling.
2. Add Planning migrations and migration tests.
3. Implement PostgreSQL transaction boundary and adapter error normalization.
4. Implement `PlanningServiceCommandPersistenceRepository`.
5. Add command-service integration tests through the PostgreSQL adapter.
6. Implement `PlanningServiceQueryPersistenceRepository`.
7. Add query-service integration tests through the PostgreSQL adapter.
8. Implement CCLI usage persistence.
9. Implement rehearsal asset visibility and acknowledgement persistence.
10. Wire API runtime configuration to select the PostgreSQL adapter in
    production-like environments.
11. Run release-check documentation against API, Planning, and DB plans before
    exposing the adapter-backed API surface broadly.

## First Approved Implementation Slice
Select the adapter and migration tooling for PostgreSQL Planning persistence and
document the decision in `08-decisions/` before writing migrations or adapter
code.

That slice should compare only tools that satisfy the existing constraints:
- TypeScript support in the current Turborepo.
- Explicit transaction control compatible with `TransactionBoundary`.
- Migration support with deterministic CI execution.
- No weakening of Zod validation, tenant scoping, or audit requirements.
- A plausible future SQLite path for local/offline adapters.
