# NOW

## Task
Add injected conflict-vs-failure classification to the desktop replay pass so stale/validation/authorization errors become `conflict` and transient errors stay retryable `failed`.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-local-sync-queue-plan.md`, `07-reviews/architecture/presenter-desktop-replay-pass-release-check.md`, and `apps/desktop/src/replay-pass.ts` plus the queue conflict-detail contract in `@sanctuary-os/db`
- Add a `ReplayErrorClassification` result (`conflict` with a validated `PresenterLocalSyncConflictDetailPersistence`, or retryable `failed` with a safe message) and an injectable `ReplayErrorClassifier` dependency; default the classifier to `failed`
- On a command-service error, run the classifier: a `conflict` classification calls `markConflict` (transition `replaying -> conflict`) with the details; a `failed` classification calls `markFailed` as today
- Track conflicted entries in the pass result alongside synced/failed/exhausted
- Add focused tests with fakes covering: default (failed), an injected classifier returning conflict (markConflict with details), and a classifier returning failed with a custom message; no live database, network, Tauri, or API
- Keep the slice classification-only; do not add a timer loop, offline/online detection, Tauri commands, or a real network command service

## Out of scope
Timer/interval scheduler loop · offline/online detection · Tauri/Rust shell · real desktop windows · real network command service · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [x] Re-sync with the replay pass and the conflict-detail contract
- [x] Add the classification result, classifier dependency, and conflict branch
- [x] Add focused classification tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the classification slice
- [ ] Session handoff

## Done when
The replay pass classifies command-service errors via an injected classifier (defaulting to failed), marks conflicts with validated details and transient errors failed, reports conflicted entries in its result, is covered by focused fake-backed tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add a desktop replay scheduler wrapper (interval + offline/online gating) around the pass, then begin the Tauri shell wiring — addressing any classification findings first.
