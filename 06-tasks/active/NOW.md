# NOW

## Task
Add a Presenter local sync queue replay scheduling decision contract (pure policy logic, no live Tauri/event-bus/API).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-composition-release-check.md`, and the existing local sync queue contracts/`listPresenterLocalSyncQueueEntriesReadyForReplay` helper
- Add a Zod-validated replay policy (max attempts, backoff base/multiplier/cap) and a pure decision function that, given validated queue entries, the policy, and the current time, returns the ordered entries eligible to replay now plus directives for entries that have exhausted retries
- Honor existing rules: replay in `queuedAt` order per presentation, block later entries behind a `conflict` or non-retryable `failed` entry, respect backoff so an entry is not retried before its next eligible time, and surface attempt-limit exhaustion as a stop directive (no automatic API call)
- Add focused unit tests covering ordering, backoff gating, attempt-limit exhaustion, and conflict/failed blocking, with no live database, network, Tauri, event bus, or API replay
- Keep the slice decision-logic-only; do not add a running scheduler loop, Tauri commands, event-bus wiring, real API replay, or GraphQL changes

## Out of scope
Production queue runner loop · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs, contracts, and replay-readiness helper
- [ ] Add the replay policy schema and pure decision function
- [ ] Add focused decision tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the replay decision contract slice
- [ ] Session handoff

## Done when
A Zod-validated replay policy and a pure replay decision function order eligible entries, gate retries by backoff, block behind conflicts/failures, and surface attempt-limit exhaustion, covered by focused tests with no live integrations, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the replay decision contract into a desktop replay coordinator contract that maps eligible entries to existing Presenter API command shapes (still no live Tauri/event-bus/API), or address any decision-contract findings first.
