# NOW

## Task
Charts module, slice 4: the SQLite repository adapter implementing the query/command repositories over an injected SQLite executor.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, `packages/db/src/presenter-local-sync-queue-sql-repository.ts` (mirror its style), `packages/db/src/charts-repository-contracts.ts`, `packages/db/src/charts-migrations.ts`, and `packages/db/src/sqlite-executor.ts`
- Add `packages/db/src/charts-sql-repository.ts`: `createChartsSqlRepository({ executor })` returning the `ChartsQueryPersistenceRepository` + `ChartsCommandPersistenceRepository`, using positional `?` SQLite SQL, tenant filtering on every read/write, row→contract mapping validated through the contract schemas, boolean ↔ 0/1 and `section_order` JSON serialization
- Implement: listCharts/getChart/listChartsForSong/listChartArrangements/getMusicianChartPreference/listChartAnnotations; saveChart (upsert), updateChartSource (update + re-read), saveChartArrangement (upsert), setMusicianChartPreference (upsert), addChartAnnotation/updateChartAnnotation (upsert), removeChartAnnotation (delete)
- Export from the db barrel
- Add recording-executor unit tests (tenant-scoped SQL, params, mapping) plus a `node:sqlite` smoke (migrate → save chart → get → save preference → annotate → list) using the existing migration artifact
- Keep this slice the adapter only; no GraphQL, service, or offline wiring

## Out of scope
GraphQL/API surface · service layer · offline sync · mobile UI · charts migration runner wiring (reuse existing runner later)

## Progress
- [ ] Re-sync with the Charts contracts, migration, and the presenter SQL adapter style
- [ ] Add `createChartsSqlRepository` (query + command) with tenant filtering and mapping
- [ ] Add recording-executor unit tests + a `node:sqlite` smoke
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the Charts SQLite adapter slice
- [ ] Session handoff

## Done when
The Charts SQLite adapter implements the query/command repositories with tenant filtering and validated mapping, covered by recording-executor tests + a `node:sqlite` smoke, default gates pass, the slice is committed and pushed, and handoff documents identify the next Charts slice (the GraphQL surface).

## Next task after this
Charts slice 5: the Charts GraphQL schema + resolvers (queries/mutations from the plan) plus the in-memory service, wired into the executable schema/transport, mirroring the presenter GraphQL.
