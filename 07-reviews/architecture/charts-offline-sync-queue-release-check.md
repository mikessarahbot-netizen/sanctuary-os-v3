# Charts Offline-Sync Queue Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
Baseline commit: `1a37a1e`

## Result

Pass. Charts slice 7 (first offline-sync increment) adds the Charts local sync queue: a tenant-scoped queue entry record (7-op discriminated union whose payloads reuse the Charts command input schemas), a SQLite queue repository + an in-memory double, and a `ChartsLocalSyncQueueMigration` table — all in `packages/db`.

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Payload integrity | Pass | Each queued op reuses the existing Charts command input schema, so a queued op cannot drift from the online command path. |
| Status model | Pass | `pending / in-flight / failed / synced` with attempt count + `next_attempt_at` backoff; transition schema enforces legal moves. |
| Tenant scope | Pass | Every queue statement is tenant-scoped; contract refinements verify tenant/chart consistency union-safely (no `any`). |
| Migration | Pass | New table + 3 indexes, SQLite TEXT/INTEGER only, CHECK constraints mirroring the contract refinements; checksum auto-derived; `ChartsSqlMigrations` now `[initial, queue]`. |
| Tests | Pass | Contract tests, recording-executor repository tests, in-memory double tests, and a live `node:sqlite` smoke. |
| Scope discipline | Pass | No replay decision / coordinator / conflict / status-summary yet — deferred to slice 7b. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 219; api 276 + 2 skipped; desktop 54; church-context 5) — independently re-run by the parent. |

## Follow-Ups

- Slice 7b: replay decision (backoff/attempt limits), coordinator (queued op → online command), and status summary (countByStatus) — mirror the presenter replay slices.
- Then slice 8: Charts mobile UI. After Charts: Play → Community+ → OBS.
