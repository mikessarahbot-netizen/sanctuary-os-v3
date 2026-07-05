# Handoff — Charts SQLite adapter (slice 4, WIP)

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: adapter drafted and committed as WIP (`chore(wip)`), NOT compiling yet.

## Resume
1. Read order: `agents.md` (note the new "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/charts-module-plan.md`, `06-tasks/active/NOW.md`.
2. Finish `packages/db/src/charts-sql-repository.ts` exactly per `NOW.md`.

## Why this is WIP
The session's context window was full. Per the new session-continuity protocol (`agents.md`), the in-progress adapter was committed + pushed and handed to a fresh session rather than finishing the typecheck loop in a bloated context.

## Exact remaining work
- The draft imports per-operation TYPE aliases (`GetChartPersistenceOperation`, `ListChartsPersistenceOperation`, …) that `charts-repository-contracts.ts` does NOT export. It exports operation SCHEMAS + INPUT types + the generic wrappers `ChartsReadPersistenceOperation<TInput>` / `ChartsPersistenceOperation<TInput>`. Remove those type imports; let method params infer from the repository interfaces (the factory objects are already annotated with `ChartsQueryPersistenceRepository` / `ChartsCommandPersistenceRepository`).
- Verify every `operation.input.*` access against the input schemas (e.g. the `listCharts` filter shape, `chartId`, `songRef`, `musicianId`).
- Confirm `operation.options.context.tenantId` and optional `operation.options.transaction`, plus the `PlanningSqlExecutor` / `PlanningSqlRow` / `TransactionHandle` imports.
- Add the barrel export to `packages/db/src/index.ts`.
- Add recording-executor unit tests + a `node:sqlite` smoke; run `pnpm lint && pnpm typecheck && pnpm test` green.
- Then the slice ceremony: release check (`07-reviews/architecture/`), advance `NOW.md`, append `docs/session-summary.md`, commit + push.

## Next slice
Charts slice 5: GraphQL schema + resolvers + in-memory service, wired into the executable schema/transport (mirror the presenter GraphQL).
