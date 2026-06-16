# ADR 0004: Add Planning Readiness Save Persistence Contract

## Status
Accepted

## Date
2026-06-16

## Context
The Planning API service already calculates readiness from a service-owned
`PlanningReadinessRepository` and calls `saveReadinessResult` after a refresh.
The DB package already exposes a tenant-scoped `getServiceReadiness` lookup as
part of the Planning query persistence repository, but it did not have a
persistence contract for saving calculated readiness results.

`05-plans/db-plan.md` requires Planning readiness storage and lookup, audit
metadata for successful mutations, transaction-handle propagation, and atomic
readiness save behavior.

## Decision
Add an additive `PlanningReadinessPersistenceRepository` contract in
`packages/db` with `saveServiceReadiness`.

The save operation accepts the full validated readiness result, including
`tenantId`, and the SQL adapter rejects mismatches between the result tenant and
the operation context tenant before touching storage. Lookup remains available
through the existing `getServiceReadiness` query contract, and the SQL readiness
adapter may expose both methods for readiness-specific composition.

## Consequences
- Readiness refresh persistence has a DB-owned production adapter boundary
  without changing GraphQL, resolver, or API service behavior in this slice.
- Successful readiness saves can be audited with request, actor, intent, target
  service, tenant, and timestamp metadata.
- The contract remains additive and does not break existing Planning repository
  consumers.
