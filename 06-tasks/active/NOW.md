# NOW

## Task
Add a pure Presenter local sync queue replay decision contract (ordering, backoff, attempt-limit gating) extending the existing replay-readiness helper.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-sqlite-migration-runner-release-check.md`, and the existing `listPresenterLocalSyncQueueEntriesReadyForReplay` helper plus queue entry contracts in `packages/db/src/presenter-repository-contracts.ts`
- Add a Zod-validated replay policy (max attempts, backoff base/multiplier/cap in seconds) and a pure decision function that, given validated queue entries, the policy, and the current time, returns the entries eligible to replay now plus directives for entries that have exhausted their attempt budget
- Reuse `listPresenterLocalSyncQueueEntriesReadyForReplay` for ordering and conflict/failed blocking; layer backoff (skip an entry whose `lastAttemptedAt` + computed delay is still in the future) and attempt-limit exhaustion (surface as an `exhausted` directive, never an automatic API call) on top
- Keep this slice pure decision logic in `packages/db` alongside the existing readiness helper; do not add a running scheduler loop, timers, Tauri commands, event-bus wiring, live API replay, or GraphQL changes
- Add focused unit tests covering ordering, backoff gating, attempt-limit exhaustion, and conflict/failed blocking, with no live database, network, Tauri, event bus, or API replay

## Out of scope
Running scheduler loop/timers · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with the replay-readiness helper and queue entry contracts
- [ ] Add the replay policy schema and pure decision function
- [ ] Add focused decision tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the replay decision contract slice
- [ ] Session handoff

## Done when
A Zod-validated replay policy and a pure decision function order eligible entries, gate retries by backoff, surface attempt-limit exhaustion, and block behind conflicts/failures (reusing the readiness helper), covered by focused tests with no live integrations, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Scaffold the `apps/desktop` workspace (package.json, tsconfig, vitest, lint integration) so the local sync queue persistence, migration runner, and replay decision can be wired into a desktop composition root — or address any replay-decision findings first.
