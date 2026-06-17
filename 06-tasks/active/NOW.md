# NOW

## Task
Charts module, slice 7b: the Charts offline-sync replay decision (backoff/attempt limits) + coordinator (queued op → online command) + status summary — building on the slice-7 queue, mirroring the presenter replay slices.

## Session protocol (in force)
Keep context small: at clean breakpoints commit + push all work, write the handoff, then hand off to a fresh session. See `agents.md` › "Session continuity protocol". Charts slices 1–7 are DONE and green (through the offline-sync queue contracts + repository).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Mirror the presenter replay slices for style/shape:
  - `packages/db/src/presenter-local-sync-queue-replay.ts` (the replay decision: which entries are ready, backoff/attempt-limit logic)
  - `packages/db/src/presenter-local-sync-queue-status.ts` (status summary / countByStatus)
  - the presenter replay coordinator + network executor on the consumer side: `apps/desktop/src/replay-*.ts` (e.g. replay-pass, replay-scheduler, replay-error-classifier, network-command-service) and `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.ts`
  - the slice-7 queue: `packages/db/src/charts-local-sync-queue-repository-contracts.ts`, `charts-local-sync-queue-sql-repository.ts`, `charts-local-sync-queue-in-memory-repository.ts`
- Build the Charts replay decision (pure function over a queue entry + clock → replay/backoff/give-up), a `countByStatus`-style status summary on the queue repositories, and a coordinator that maps a queued Charts op → the corresponding Charts command service call (reuse the slice-5/6 `ChartsCommandService`), classifying success / retryable failure / terminal failure and updating queue status accordingly
- Keep the network/transport boundary injected (like presenter), so it is unit-testable without a live server
- Tests: pure replay-decision tests, status-summary tests, and coordinator tests (success → synced; retryable → requeue with backoff; terminal → failed) with a fake command service

## Out of scope
A Charts conflict round-trip UI · the desktop runtime wiring/composition root for Charts replay (can be a later slice) · Charts mobile UI · Play/Community+/OBS

## Progress
- [ ] Re-sync with the presenter replay decision / status / coordinator and the slice-7 queue
- [ ] Charts replay decision (pure) + status summary on the queue repositories
- [ ] Charts replay coordinator (queued op → ChartsCommandService) with status updates
- [ ] Replay-decision + status + coordinator tests
- [ ] Run lint, typecheck, test green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push the slice

## Done when
The Charts replay decision + status summary + coordinator exist (queued op → command service, with backoff/attempt-limit handling and status transitions), covered by pure-decision + coordinator tests, default gates green, committed and pushed.

## Next task after this
Charts slice 8: the Charts mobile UI (offline-first editor/list over the GraphQL surface + local queue). After Charts: author and build the Play module (plan from vision + system map, then slice-by-slice), then Community+, then OBS.
