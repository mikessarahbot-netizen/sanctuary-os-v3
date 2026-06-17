# Presenter Persistence Composition Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`

## Scope
Audit the Presenter API persistence composition slice against:
- `05-plans/api-plan.md`
- `05-plans/presenter-module-plan.md`
- `02-standards/engineering-rules.md`
- `07-reviews/architecture/presenter-api-event-persistence-release-check.md`
- `apps/api/src/services/presenter/composition.ts`
- `apps/api/src/services/presenter/composition.test.ts`
- `packages/db/src/presenter-in-memory-repository.ts`
- `packages/db/src/presenter-sql-repository.ts`
- `packages/db/src/postgresql-planning-executor.ts`

## Result
Pass with follow-up.

The Presenter persistence composition boundary is ready for the next planned opt-in live PostgreSQL coverage slice. It selects in-memory persistence for development/test by default, selects SQL persistence for production by default, requires injected SQL/PostgreSQL dependencies for SQL mode, keeps runtime config strict and secret-free, and preserves the API-to-repository boundary without adding GraphQL-to-DB coupling.

## Evidence
| Area | Status | Evidence |
|---|---|---|
| Default/test selection | Pass | `resolvePresenterPersistenceMode` returns `in-memory` for development/test and `sql` for production. Composition tests cover defaults and explicit production in-memory override. |
| In-memory adapter wiring | Pass | `createPresenterPersistenceSelection` builds the shared DB in-memory Presenter persistence adapter and exposes query/command repositories plus the test adapter handle. Tests seed a saved presentation, exercise a tenant-scoped query, and verify operation recording with actor/request/tenant context. |
| SQL adapter wiring | Pass | SQL mode builds `createPresenterQuerySqlRepository` and `createPresenterCommandSqlRepository` from injected executor, clock, and audit-log ID dependencies. Tests exercise `presenter.presentations.get` through a recording executor and verify tenant/presentation parameters. |
| Production dependency requirements | Pass | Production defaults to SQL and throws without SQL dependencies. Runtime-config SQL mode throws without PostgreSQL bindings, preventing accidental live database work in unit tests or incomplete production wiring. |
| Runtime config safety | Pass | `PresenterPersistenceRuntimeConfigSchema` stores only `connectionName`, `runtime`, and `urlEnvVar`; strict schemas reject raw `databaseUrl`, URL-shaped `urlEnvVar`, and extra `url` fields. Tests cover these rejection paths. |
| PostgreSQL binding isolation | Pass | `createPresenterSqlPersistenceDependenciesFromPostgreSqlRuntime` wraps injected query/transaction clients with the existing SQL executor boundary. Tests use recording clients and verify query forwarding without reading environment variables or opening a real connection. |
| Tenant/audit boundary preservation | Pass | Composition does not bypass Presenter persistence repository contracts; tenant/request/actor requirements remain enforced by the in-memory and SQL repositories. SQL command adapters still receive the injected clock and audit-log ID generator needed for audit rows. |
| Live-DB-free default gates | Pass | Tests rely on recording executors/clients only. The default repo test run does not require PostgreSQL credentials or a running database. |
| Adapter isolation | Pass | API composition imports DB repository factories and executor types, but GraphQL resolvers still delegate to services and do not import DB adapters directly. No vendor SDK, Auth0, WebSocket server, desktop event bus, OBS, stream automation, migration execution, or deployment config was introduced. |
| Privacy and safety | Pass | Targeted scans found raw-media, OBS, credential, token, and secret-like terms only in negative tests and existing rejection assertions. Composition does not store raw media payloads or introduce stream/OBS controls. |

## Findings
No blocking defects found in the Presenter persistence composition slice.

## Follow-Up
- Add opt-in live PostgreSQL coverage for Presenter persistence composition with documented skip behavior and no checked-in secrets.
- Consider a future naming cleanup for the shared PostgreSQL executor, which is currently named `Planning` but is already reused as the generic SQL executor shape for Presenter. This is non-blocking and should wait until another module also needs SQL runtime binding.
- Add WebSocket server wiring after persistence-backed Presenter state changes are ready to broadcast beyond the in-memory publisher boundary.
- Add desktop run-mode/output-window integration and local sync queue work in later slices, preserving offline-safe loaded presentation behavior.

## Validation
- `pnpm --filter @sanctuary-os/api test -- composition.test.ts presenter`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
