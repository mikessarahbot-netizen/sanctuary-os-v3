# NOW

## Task
Add the desktop Presenter local sync queue replay pass that drives an injected command service from the queue, marking outcomes.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-local-sync-queue-plan.md`, `07-reviews/architecture/presenter-desktop-local-sync-composition-release-check.md`, and the building blocks: `PresenterLocalSyncQueuePersistenceRepository` + `decidePresenterLocalSyncQueueReplay` (`@sanctuary-os/db`) and `mapPresenterLocalSyncQueueEntryToReplayCommand` + `PresenterCommandService` (`@sanctuary-os/api`)
- Add `@sanctuary-os/api` as an `apps/desktop` workspace dependency
- Add `runPresenterDesktopReplayPass`: read ready entries from the repository, apply `decidePresenterLocalSyncQueueReplay` with an injected policy/now, mark each `exhausted` entry `failed`, and for each `eligible` entry mark it `replaying`, map it to the command via the coordinator, call the matching `PresenterCommandService` method, then mark `synced` on success or `failed` (with a redacted safe message) on error
- Return a structured pass summary (synced/failed/exhausted ids); keep it a single pass with no timer/interval loop, no Tauri, no real transport, and no offline/online detection
- Add focused tests with an in-memory fake repository and a fake command service covering: a clean sync, an error → failed, an exhausted → failed, and backoff/blocking (no eligible entry); no live database, network, Tauri, or API

## Out of scope
Timer/interval scheduler loop · offline/online detection · rich conflict-vs-failure error classification (follow-up) · Tauri/Rust shell · real desktop windows · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [x] Re-sync with the decision, coordinator, repository, and command service contracts
- [x] Add `@sanctuary-os/api` desktop dependency and the replay pass
- [x] Add focused replay-pass tests with fakes
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the replay pass slice
- [ ] Session handoff

## Done when
A single replay pass reads ready entries, decides eligibility, marks `replaying`/`synced`/`failed`/exhausted-`failed`, drives the injected command service through the coordinator, returns a structured summary, is covered by focused fake-backed tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add rich conflict-vs-failure classification to the replay pass (stale revision/validation/authorization/tenant-mismatch → `conflict` with details; transient → retryable `failed`), then a timer wrapper and offline/online gating — addressing any replay-pass findings first.
