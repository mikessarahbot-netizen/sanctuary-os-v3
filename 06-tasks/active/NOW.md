# NOW

## Task
Play module, slice 8: the Play offline-sync replay layer — a pure replay decision + status summary on the queue repos + an api-side coordinator (queued op → PlayCommandService). Mirror Charts slice 7b. (Play slices 1–7 done + green at `cbd20cc`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative; slices 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Play-backend milestone; gates are the per-slice verification.

## In scope (slice 8)
- Continue on `feature/presenter-domain-contracts`
- Mirror the Charts replay files exactly: `packages/db/src/charts-local-sync-queue-replay.ts` (pure decision), `packages/db/src/charts-local-sync-queue-status.ts` (status summary; note `countByStatus` is already on the Play queue repos from slice 7 — reuse it), and `apps/api/src/services/charts/local-sync-queue-replay-coordinator.ts`
- Add `packages/db/src/play-local-sync-queue-replay.ts`: the pure replay decision (entry + injected clock/now + policy → eligible / exhausted; exponential backoff + attempt limit; no I/O, no Date.now)
- Add a Play status summary helper if Charts has a separate one beyond `countByStatus` (else reuse the slice-7 `countByStatus`)
- Add `apps/api/src/services/play/local-sync-queue-replay-coordinator.ts`: single-pass coordinator pulling pending → pure decision → markInFlight → map the stored Play op to the matching `PlayCommandService` method → run → markSynced / (retryable) markFailed+backoff+requeue / (terminal `PlayDomainError`) markFailed; command service + classifier injected; map the queue's persistence payload onto the command input (drop persistence-only fields, re-validate)
- Export new db module from the barrel; export the coordinator from the play services barrel
- Tests: pure-decision tests (eligible/backoff/exhausted at boundaries) + coordinator tests with a fake PlayCommandService (synced / requeued+backoff / terminal / exhausted)

## Done when
The Play replay decision + coordinator exist (queued op → command service, backoff/attempt-limit handling, status transitions, retryable-vs-terminal typed-error classification), covered by pure-decision + coordinator tests, gates green, committed and pushed.

## Next task after this
Play slice 9: WebSocket events (trackSet.updated, play.playbackStateChanged, play.cueFired) added to the API event union with `.strict()` payloads + tenant/aggregate scope superRefines, emitted after durable commits (mirror the presenter events). Then slice 10: the desktop Play replay runtime (Node sidecar; mirror the presenter desktop replay runtime). After slice 10 the Play backend is COMPLETE → write the consolidated Play-backend release check. UI slices 11–12 await the scaffold decision.
