# Charts SQLite Migration Artifact Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `30554af`

## Result

Pass. Charts module slice 3 adds the SQLite migration artifact creating the tenant-scoped tables `charts`, `chart_arrangements`, `chart_annotations`, and `musician_chart_preferences` with primary keys, the `charts.v1` schema-version CHECK, annotation-kind/instrument/boolean CHECKs, tenant-scoped indexes, and rollback SQL — SQLite-compatible (`TEXT`/`INTEGER`/`REAL` only).

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Tables/indexes | Pass | The artifact declares and the forward SQL creates all four tables and three indexes; `requiredTables`/`requiredIndexes`/`tenantScopedTables` match. |
| Constraints | Pass | `schema_version = 'charts.v1'`, `kind IN (...)`, `instrument IN (...)`, `chords_visible IN (0,1)`, non-negative capo/indices, positive font scale, and a note-required-for-note-kind CHECK. |
| Rollback | Pass | The down SQL drops every index then table; the `node:sqlite` smoke confirms the `charts` table is gone after rollback. |
| Real-engine constraints | Pass | The smoke applies the migration, inserts a valid chart, and asserts a bad `schema_version` and a note-kind annotation without note text are both rejected by SQLite. |
| Checksum | Pass | The checksum equals `calculateSqlMigrationChecksum(artifact)` and matches the `fnv1a32` format. |
| SQLite portability | Pass | Only `TEXT`/`INTEGER`/`REAL` columns and standard CHECK/index syntax; no PostgreSQL-only types. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/db test -- charts-migrations.test.ts` | 7 tests pass |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 156; api 239 + 2 skipped; desktop 54; church-context 5) |

## Follow-Ups

- Charts slice 4: the SQLite repository adapter (reuse `createSqliteExecutor`) implementing the query/command repositories with tenant filtering, row↔contract mapping, and a `node:sqlite` smoke.
- Then a local SQLite migration runner usage for Charts (reuse the existing runner), the GraphQL surface, the service layer, and offline sync.
