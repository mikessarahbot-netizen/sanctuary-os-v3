# NOW

## Task
Charts module, slice 6: a persistence-backed Charts service over the slice-4 SQLite adapter, plus a Charts migration-runner usage — replacing the in-memory store behind the same service interface.

## Session protocol (in force)
Keep context small: at clean breakpoints commit + push all work, write the handoff, then hand off to a fresh session. See `agents.md` › "Session continuity protocol". Charts slices 1–5 are DONE and green (ChordPro core, persistence contracts, migration, SQLite adapter, GraphQL + in-memory service).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, and the presenter persistence-backed wiring for style: how the presenter service is backed by `packages/db` (the presenter SQL repository + `createSqliteExecutor` + `sqlite-migration-runner`), and the existing Charts pieces: `packages/db/src/charts-sql-repository.ts`, `packages/db/src/charts-migrations.ts`, `apps/api/src/services/charts/in-memory.ts`, `apps/api/src/domain/charts/contracts.ts`
- Add a persistence-backed Charts service implementing the same `ChartsQueryService`/`ChartsCommandService` interfaces, delegating to `createChartsQuerySqlRepository` / `createChartsCommandSqlRepository` over an injected executor; translate domain operations → persistence operations and persistence records → domain records; preserve tenant scope, Zod validation, and typed errors
- Add a Charts migration-runner usage that applies `ChartsInitialSchemaMigration` via the existing `sqlite-migration-runner` (mirror how presenter applies its migration)
- Keep the in-memory service as the test/default double; the persistence-backed service is the production path
- Tests: a recording/■fake-executor service test + a `node:sqlite` integration test (migrate → service round-trip), mirroring presenter's persistence-backed tests
- Do not change the GraphQL surface this slice

## Out of scope
Offline-sync surface (next) · mobile UI · OBS/Play/Community+ modules · relocating the operation schemas (optional cleanup noted in the slice-5 release check)

## Progress
- [ ] Re-sync with the presenter persistence wiring + the charts adapter/migration/service
- [ ] Persistence-backed Charts service over the SQLite adapter
- [ ] Charts migration-runner usage
- [ ] Fake-executor service test + `node:sqlite` integration test
- [ ] Run lint, typecheck, test green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push the slice

## Done when
A persistence-backed Charts service satisfies the Charts service interfaces over the slice-4 SQLite adapter with tenant scope + validation + typed errors, the Charts migration is applied via the runner, covered by a fake-executor test + a `node:sqlite` integration test, default gates green, committed and pushed.

## Next task after this
Charts slice 7: the offline-sync surface for Charts (mirror the presenter local sync queue — queue, replay decision, coordinator, status), then the Charts mobile UI. After Charts: author and build the Play module (plan from vision + system map, then slice-by-slice), then Community+, then OBS.
