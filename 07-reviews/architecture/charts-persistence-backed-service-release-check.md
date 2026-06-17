# Charts Persistence-Backed Service Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
Baseline commit: `52cf763`

## Result

Pass. Charts module slice 6 adds a persistence-backed `ChartsQueryService` / `ChartsCommandService` (`apps/api/src/services/charts/persistence.ts`) delegating to the slice-4 Charts SQL repositories over an injected executor, plus a composition (`composition.ts`) that selects in-memory vs SQL and applies `ChartsInitialSchemaMigration` via the migration runner. It is a drop-in for the in-memory service behind the existing GraphQL resolvers; the in-memory service remains the test double.

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Interface parity | Pass | Implements the same service interfaces the resolvers consume; GraphQL surface unchanged. |
| Domain↔persistence mapping | Pass | Explicit field-by-field mapping; injects/strips `schemaVersion`; re-applies branded IDs via the domain schemas on read. |
| Tenant scope | Pass | Every repository call is tenant-scoped; a defensive out-bound tenant assertion mirrors planning's belt-and-suspenders checks. |
| Authorization | Pass | Role + owning-musician checks run before any I/O and raise typed `ChartsDomainError` (AUTHORIZATION_FAILED). |
| Migration usage | Pass | `migrateChartsSqliteSchema` applies the migration via `createSqliteMigrationRunner`; integration test asserts apply-then-skip idempotency. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 166; api 276 + 2 skipped; desktop 54; church-context 5) — independently re-run by the parent. |

## Follow-Ups / Risks

- Documented semantic difference: for a cross-tenant/unknown chart, the persistence service surfaces `CHART_NOT_FOUND` (tenant-scoped reads cannot see other tenants' rows) where the in-memory service raises `AUTHORIZATION_FAILED`. Both refuse with a typed error; the divergent branch is unobservable through tenant-scoped persistence. Acceptable; note if a single canonical code is later required.
- Slice 7: the Charts offline-sync surface (mirror the presenter local sync queue — contracts + repository first, then replay decision / coordinator / status / composition), then the Charts mobile UI.
