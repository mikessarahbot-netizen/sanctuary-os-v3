# Planning Production Adapter Contract

This note documents the eventual production database adapter boundary for
`PlanningServiceCommandPersistenceRepository`. It is intentionally adapter-free:
no database connection, ORM, SQL, migration shape, generated client, or concrete
adapter belongs in this slice.

## Boundary

The production adapter must implement every method on
`PlanningServiceCommandPersistenceRepository` from
`packages/db/src/planning-repository-contracts.ts`:

- `createService`
- `duplicateServiceFromTemplate`
- `updateService`
- `addServiceItem`
- `updateServiceItem`
- `reorderServiceItems`
- `assignVolunteer`
- `updateAssignmentStatus`

Each method receives a Planning persistence operation with:

- `input`: the command-specific persistence input.
- `options.context.tenantId`: the tenant scope for every read and write.
- `options.context.actorId`: the actor to attach to audit metadata when present.
- `options.context.requestId`: the request correlation ID for audit and tracing.
- `options.intent`: the caller-declared mutation intent.
- `options.transaction`: an optional transaction handle supplied by a service
  transaction boundary.

The adapter must treat these values as the source of truth for persistence scope
and audit metadata. It must not infer tenant scope from IDs or global state.

## Required Operations

`createService` must create a tenant-scoped service record and return the full
`PlanningServicePersistenceRecord`.

`duplicateServiceFromTemplate` must read the tenant-scoped template identified by
`input.serviceTemplateId`, create a draft tenant-scoped service from it, and
return the full `PlanningServicePersistenceRecord`. Template item duplication is
covered by later service-item adapter slices.

`updateService` must update only the tenant-scoped service identified by
`input.serviceId`. It must persist confirmation intent metadata when present,
especially when `options.intent` is `destructive-confirmed`.

`addServiceItem` must create a tenant-scoped service item under the requested
service and return its persisted `sortOrder`.

`updateServiceItem` must update only the tenant-scoped item identified by both
`input.serviceId` and `input.serviceItemId`.

`reorderServiceItems` must atomically replace the item order for the tenant-scoped
service and return the resulting ordered item records. The adapter must reject an
order that omits existing service items, includes items from another service, or
includes items from another tenant.

`assignVolunteer` must create a tenant-scoped assignment for the requested
service, person, and role. The adapter persists only Planning assignment
references at this boundary; volunteer contact data remains outside Planning.

`updateAssignmentStatus` must update only the tenant-scoped assignment identified
by both `input.serviceId` and `input.assignmentId`.

## Tenant-Scope Invariants

Every persisted read used to satisfy a write must include
`options.context.tenantId`. The adapter must reject writes when the target service,
service item, assignment, role, person reference, or ordered item list does not
belong to that tenant.

Returned records must include the same tenant ID that was supplied in
`options.context.tenantId`. The API command service also verifies returned
tenant, service, item, and assignment identity, but the production adapter remains
responsible for enforcing tenant scope before state is changed.

## Mutation Intent And Audit

The adapter must persist audit metadata for every successful write:

- tenant ID
- actor ID when supplied
- request ID
- repository method name or equivalent operation name
- mutation intent
- timestamp from the production clock

Mutation intent meanings:

- `create`: new Planning aggregate or child record.
- `update`: non-destructive mutation to an existing Planning record.
- `delete`: reserved for future Planning deletes.
- `destructive-confirmed`: human-confirmed destructive or externally visible
  mutation.

Publishing and canceling services are currently mapped by the API command service
to `destructive-confirmed` and include `input.confirmationIntent`. The production
adapter must persist that confirmation reason alongside the audit record. It must
reject destructive service status changes when the operation intent is not
`destructive-confirmed` or when confirmation intent is missing.

## Transaction Behavior

If `options.transaction` is present, the adapter must execute the operation inside
that existing transaction and must not create an independent transaction. If no
transaction is present, the adapter may create the smallest transaction required
to make the method atomic.

The following operations must be atomic:

- service updates that also persist confirmation audit metadata
- service item reorder operations
- assignment status updates and their audit metadata

Events are published by the API service through `publishAfterCommit`; the
production adapter must not publish Planning WebSocket events directly. When a
future service wraps several repository calls in one transaction, the adapter
must honor the supplied transaction handle so event publication can remain
post-commit.

## Validation Expectations

External callers are expected to pass Zod-validated operation shapes, but the
production adapter should validate trust-boundary input again before persistence
or normalize all persistence failures into stable adapter errors. It must never
log secrets, full prompt payloads, volunteer contact data, or raw PII.
