# Planning Production Persistence Wiring Release Check

Date: 2026-06-17
Branch: `feature/planning-readiness-domain`

## Scope
Audit the implemented Planning production persistence wiring against:
- `05-plans/api-plan.md`
- `05-plans/planning-module-plan.md`
- `05-plans/db-plan.md`
- `07-reviews/architecture/planning-db-persistence-release-check.md`
- `apps/api/src/services/planning/composition.ts`
- `packages/db/src/config.ts`
- `packages/db/src/postgresql-planning-executor.ts`
- Current live-DB-free API and DB tests

## Result
Pass with follow-up.

The Planning persistence stack now has a complete production wiring path from API runtime config to SQL-backed Planning repositories through a PostgreSQL-compatible executor boundary. The wiring remains secret-free by design and keeps default validation live-DB-free. Before production Planning persistence is used from app surfaces, add opt-in live PostgreSQL integration coverage with documented skip behavior.

## Evidence
| Area | Status | Evidence |
|---|---|---|
| API composition boundary | Pass | `createPlanningPersistenceSelectionFromRuntimeConfig` parses runtime config, preserves in-memory defaults for development/test, and builds SQL-backed Planning repositories for production SQL mode. |
| SQL adapter wiring | Pass | Production SQL mode feeds one `PlanningSqlExecutor`, clock, and ID boundary into command, query, CCLI usage, rehearsal tracking, and readiness SQL repositories. |
| PostgreSQL executor boundary | Pass | `createPostgreSqlPlanningExecutor` forwards named SQL statements and parameters to a PostgreSQL-compatible query client, parses result envelopes, and normalizes failures without leaking raw connection details. |
| Transaction behavior | Pass | The PostgreSQL executor opens transactions through an injected transaction pool, uses transaction-scoped clients, commits successful operations, rolls back failed operations, and releases clients. |
| Secret handling | Pass | Runtime config stores URL environment variable names only through `urlEnvVar`; strict schemas reject raw URL fields and URL-looking values. Tests assert raw PostgreSQL URL/password details are not surfaced in normalized errors. |
| Live-DB-free validation | Pass | API composition and DB executor tests use recording clients/executors and do not require checked-in secrets, live PostgreSQL, migrations execution, or deployment config. |
| Adapter isolation | Pass | `packages/db` owns database connection/executor boundaries and repository adapters. `apps/api` owns runtime selection and dependency composition. No GraphQL resolver, Auth0, vendor SDK, UI, worker, or migration-runner behavior was added. |
| Tenant/audit continuity | Pass | The runtime wiring reuses the previously release-checked SQL repositories, which preserve tenant predicates, mutation audit metadata, confirmation intent, and operation validation. |

## Findings
No blocking defects found in the Planning production persistence wiring.

## Decision
Add opt-in live PostgreSQL integration coverage with documented skip behavior before proceeding to the next product module.

Rationale:
- The production wiring path is covered with recording clients, which is enough for default CI and secret-free validation.
- A real PostgreSQL smoke path should verify SQL syntax, migration shape, transaction semantics, and repository wiring against an actual database before app surfaces rely on production persistence.
- The DB plan allows live PostgreSQL tests when they are opt-in and skip clearly unless required environment variables are present.

## Follow-Up
- Add opt-in live PostgreSQL integration tests for Planning persistence wiring.
- Document required environment variable names and skip behavior without checking in secrets.
- Keep migration runner execution and deployment configuration separate unless the active task explicitly includes them.

## Validation
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
