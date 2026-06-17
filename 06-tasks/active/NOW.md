# NOW

## Task
Charts module, slice 3: the Charts SQLite migration artifact + migration tests (charts tables, indexes, constraints, rollback, checksum).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, `packages/db/src/presenter-migrations.ts` (mirror its style), `packages/db/src/migrations.ts`, and `packages/db/src/charts-repository-contracts.ts`
- Add `packages/db/src/charts-migrations.ts`: a `defineSqlMigrationArtifact` artifact creating SQLite-compatible tenant-scoped tables `charts`, `chart_arrangements`, `chart_annotations`, `musician_chart_preferences` with primary keys, the `charts.v1` schema-version CHECK, annotation-kind/instrument CHECKs, and indexes (by tenant+song, tenant+chart, tenant+chart+musician); forward + rollback SQL; `TEXT`/`INTEGER`/`REAL` columns only (no PostgreSQL-only types)
- Export the artifact and table/index name lists; add to a `ChartsSqlMigrations` list
- Add migration tests mirroring the presenter migration tests (table/column presence, schema-version + kind constraints, required indexes, rollback drops, checksum stability via `calculateSqlMigrationChecksum`), default no-live-database
- Export from the db barrel
- Keep this slice the migration artifact only; no repository adapter, GraphQL, or service

## Out of scope
SQLite repository adapter · GraphQL/API surface · service layer · offline sync · mobile UI

## Progress
- [x] Re-sync with the Charts contracts and presenter migration style
- [x] Add the Charts SQLite migration artifact (4 tables, 3 indexes, schema-version/kind/instrument/bool CHECKs, rollback)
- [x] Add 7 migration tests (shape, constraints, indexes, rollback, checksum) + a `node:sqlite` smoke proving constraints + rollback
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the Charts migration slice
- [ ] Session handoff

## Done when
The Charts SQLite migration artifact creates the tenant-scoped charts tables with constraints, indexes, rollback, and a stable checksum, covered by no-live-database migration tests, default gates pass, the slice is committed and pushed, and handoff documents identify the next Charts slice (the SQLite repository adapter).

## Next task after this
Charts slice 4: the Charts SQLite repository adapter (reusing `createSqliteExecutor`), implementing the query/command repositories with tenant filtering, row-to-contract mapping, and a `node:sqlite` smoke.
