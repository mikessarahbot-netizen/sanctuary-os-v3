# Charts SQLite Repository Adapter Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
Baseline commit: (this slice)

## Result

Pass. Charts module slice 4 adds `createChartsQuerySqlRepository` + `createChartsCommandSqlRepository` (`packages/db/src/charts-sql-repository.ts`) over an injected `ChartsSqlExecutor`, implementing both repository contracts with tenant filtering on every statement and validated row↔contract mapping.

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Tenant scoping | Pass | Every query/command threads `options.context.tenantId` as the first predicate parameter; commands also reject records whose `tenantId` differs from the operation tenant. |
| Mapping | Pass | snake_case SQL rows are parsed through dedicated row schemas that `.transform()` into the contract record schemas (boolean ↔ 0/1, `section_order` JSON, optional `arrangement_ref`/`title`/`note`/`color`). |
| Reads | Pass | listCharts (optional song filter via repeated null-guard param), getChart, listChartsForSong, listChartArrangements, getMusicianChartPreference, listChartAnnotations (optional musician filter). |
| Writes | Pass | saveChart / saveChartArrangement / setMusicianChartPreference / addChartAnnotation / updateChartAnnotation as `ON CONFLICT … DO UPDATE` upserts; updateChartSource as `UPDATE … RETURNING` with a clock-stamped `updated_at`; removeChartAnnotation as a tenant+id `DELETE`. |
| Engine portability | Pass | Positional `?` parameters and `RETURNING` routed through the executor's `statementReturnsRows` path; verified against `node:sqlite`. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- charts-sql-repository.test.ts` | 10 tests pass (recording-executor unit tests + a live `node:sqlite` smoke) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 166; api 239 + 2 skipped; desktop 54; church-context 5) |

## Follow-Ups

- Charts slice 5: the Charts GraphQL schema + resolvers + in-memory service, wired into the executable schema/transport (mirror the presenter GraphQL).
- Later: wire the SQL adapter behind the service (replacing the in-memory store) and add a Charts migration-runner usage.
