# NOW

## Task
Charts module, slice 7: the Charts offline-sync queue — contracts + repository (in-memory + SQLite), the first increment of the offline-sync surface, mirroring the presenter local sync queue's contracts + repository slices.

## Session protocol (in force)
Keep context small: at clean breakpoints commit + push all work, write the handoff, then hand off to a fresh session. See `agents.md` › "Session continuity protocol". Charts slices 1–6 are DONE and green (ChordPro core, persistence contracts, migration, SQLite adapter, GraphQL + in-memory service, persistence-backed service).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Mirror the presenter local sync queue's EARLY slices for style/shape:
  - `packages/db/src/presenter-local-sync-queue-repository-contracts.ts` (queue entry record + queue repository contracts)
  - `packages/db/src/presenter-local-sync-queue-sql-repository.ts` (the SQLite queue repository)
  - `packages/db/src/presenter-in-memory-repository.ts` (the in-memory double)
  - `packages/db/src/presenter-migrations.ts` (if a queue table/migration is needed) and the existing `packages/db/src/charts-migrations.ts`
- Define a Charts offline-sync queue entry record (Zod, tenant-scoped, branded IDs): the queued local Charts mutation (op kind + payload + status + attempt/backoff metadata + timestamps), and the queue repository contracts (enqueue, list-pending, mark-status, etc.)
- Implement the SQLite queue repository over `createChartsSqlRepository`-style executor usage (or a new `charts-local-sync-queue-sql-repository.ts`) + an in-memory queue double
- If a new queue table is required, add it as a Charts queue migration artifact (mirror the presenter queue migration), or extend `charts-migrations.ts` — keep SQLite-compatible (TEXT/INTEGER/REAL)
- Tests: contract schema tests + recording-executor repository tests + a `node:sqlite` smoke

## Out of scope
Replay decision / coordinator / network executor / status summary (slices 7b+) · Charts mobile UI · the Play/Community+/OBS modules

## Progress
- [ ] Re-sync with the presenter local sync queue contracts + SQL repository + in-memory double
- [ ] Charts offline-sync queue entry record + queue repository contracts
- [ ] SQLite queue repository + in-memory double (+ queue migration if needed)
- [ ] Contract tests + recording-executor tests + `node:sqlite` smoke
- [ ] Run lint, typecheck, test green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push the slice

## Done when
The Charts offline-sync queue contracts + repository (SQLite + in-memory) exist with tenant scope, validated records, and tests (contracts + recording-executor + `node:sqlite` smoke), default gates green, committed and pushed.

## Next task after this
Charts slice 7b: the replay decision (backoff/attempt limits) + coordinator (op→command) + status summary for the Charts offline queue (mirror the presenter replay slices); then slice 8: the Charts mobile UI. After Charts: author and build the Play module (plan from vision + system map, then slice-by-slice), then Community+, then OBS.
