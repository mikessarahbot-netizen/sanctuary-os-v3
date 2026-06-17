# Handoff — Charts offline-sync queue (slice 7)

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: Charts slices 1–6 DONE + green. This note scopes slice 7 (the first offline-sync increment).

## Resume
1. Read order: `agents.md` (note "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/charts-module-plan.md`, `06-tasks/active/NOW.md`.
2. Build slice 7 exactly per `NOW.md`.

## Pattern to mirror (presenter local sync queue, early slices)
- `packages/db/src/presenter-local-sync-queue-repository-contracts.ts` — queue entry record + repository contracts
- `packages/db/src/presenter-local-sync-queue-sql-repository.ts` — the SQLite queue repository (tenant-scoped, recording-executor + node:sqlite tested)
- `packages/db/src/presenter-in-memory-repository.ts` — the in-memory double
- `packages/db/src/presenter-migrations.ts` / `packages/db/src/charts-migrations.ts` — migration artifacts (add a Charts queue table if needed; SQLite-compatible)

## Scope
Charts offline-sync queue entry record (Zod, tenant-scoped, branded IDs: op kind + payload + status + attempt/backoff + timestamps), queue repository contracts, a SQLite queue repository + in-memory double, a queue migration if a new table is needed, and tests (contracts + recording-executor + node:sqlite smoke). Gates green, then commit + push and run the slice ceremony.

## Upcoming
Slice 7b: replay decision + coordinator + status summary (mirror presenter replay slices). Slice 8: Charts mobile UI. After Charts: Play → Community+ → OBS (each: author plan from vision + system map, then slice-by-slice).
