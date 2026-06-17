# Handoff — Charts persistence-backed service (slice 6)

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: Charts slices 1–5 DONE + green (ChordPro core, persistence contracts, migration, SQLite adapter, GraphQL + in-memory service). This note scopes slice 6.

## Resume
1. Read order: `agents.md` (note "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/charts-module-plan.md`, `06-tasks/active/NOW.md`.
2. Build slice 6 exactly per `NOW.md`.

## Pattern to mirror
- How the presenter service is backed by persistence: the presenter SQL repository in `packages/db`, `createSqliteExecutor`, and `sqlite-migration-runner` (find the presenter composition that applies its migration and wires the repo behind the service).
- Charts building blocks already in place: `packages/db/src/charts-sql-repository.ts` (createChartsQuerySqlRepository / createChartsCommandSqlRepository), `packages/db/src/charts-migrations.ts` (ChartsInitialSchemaMigration), `apps/api/src/services/charts/in-memory.ts` + `apps/api/src/domain/charts/contracts.ts` (the service interfaces + domain records).

## Scope
A persistence-backed Charts service implementing `ChartsQueryService`/`ChartsCommandService` over the SQLite adapter (translate domain ops ↔ persistence ops/records; keep tenant scope, Zod validation, typed errors), plus a migration-runner usage applying `ChartsInitialSchemaMigration`. Tests: fake-executor service test + a `node:sqlite` integration test. Do NOT change the GraphQL surface. Gates green, then commit + push and run the slice ceremony.

## Upcoming
Slice 7: Charts offline-sync surface (mirror presenter local sync queue), then Charts mobile UI. After Charts: Play → Community+ → OBS (each: author plan from vision + system map, then slice-by-slice).
