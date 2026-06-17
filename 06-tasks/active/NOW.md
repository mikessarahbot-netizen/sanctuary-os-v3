# NOW

## Task
Charts module, slice 4: the SQLite repository adapter (`packages/db/src/charts-sql-repository.ts`). The adapter is DRAFTED and committed as WIP but does NOT compile yet — reconcile it to the real contracts, then export, test, and gate.

## Session protocol (now in force)
Keep context small: at clean breakpoints commit + push all work, write the handoff, then hand off to a fresh session. See `agents.md` › "Session continuity protocol". This session stopped mid-slice and committed the adapter as WIP per that protocol.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, `packages/db/src/charts-repository-contracts.ts`, `packages/db/src/charts-migrations.ts`, and the presenter SQL adapter (`packages/db/src/presenter-local-sync-queue-sql-repository.ts`) for style
- Reconcile `charts-sql-repository.ts` to the REAL contract surface:
  - The contracts export operation SCHEMAS (`GetChartPersistenceOperationSchema`, …), INPUT types, and the generic wrappers `ChartsReadPersistenceOperation<TInput>` / `ChartsPersistenceOperation<TInput>`. There are NO per-operation type aliases. Remove the imports of non-existent types (`GetChartPersistenceOperation`, `ListChartsPersistenceOperation`, …); let each method's `operation` param infer from the `ChartsQueryPersistenceRepository` / `ChartsCommandPersistenceRepository` interface (the factory return objects are already annotated with those interfaces).
  - Verify input field access against the input schemas (`charts-repository-contracts.ts` ~lines 112-155): the `listCharts` filter shape (is it `filter?.songRef`?), `GetChartPersistenceInput.chartId`, `ListChartsForSongPersistenceInput.songRef`, annotation/preference fields.
  - Confirm the options shape: `operation.options.context.tenantId` and optional `operation.options.transaction`.
  - Confirm the `PlanningSqlExecutor` / `PlanningSqlRow` import path and `TransactionHandle`.
- Add the barrel export to `packages/db/src/index.ts`
- Add recording-executor unit tests (tenant-scoped SQL, params, mapping) + a `node:sqlite` smoke (migrate → save chart → get → save preference → annotate → list) using the migration artifact
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`; make them green
- Adapter only — no GraphQL/service/offline this slice

## Out of scope
GraphQL/API surface · service layer · offline sync · mobile UI · charts migration-runner wiring

## Progress
- [x] Draft `createChartsQuerySqlRepository` + `createChartsCommandSqlRepository` (committed as WIP)
- [ ] Reconcile to the real contract types (remove non-existent operation-type imports; verify input/options shapes)
- [ ] Barrel export
- [ ] Recording-executor unit tests + `node:sqlite` smoke
- [ ] Lint, typecheck, test all green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push the finished slice

## Done when
The Charts SQLite adapter compiles and implements both repositories with tenant filtering and validated row↔contract mapping, covered by recording-executor tests + a `node:sqlite` smoke, default gates green, committed and pushed.

## Next task after this
Charts slice 5: the Charts GraphQL schema + resolvers (queries/mutations from the plan) plus the in-memory service, wired into the executable schema/transport, mirroring the presenter GraphQL.
