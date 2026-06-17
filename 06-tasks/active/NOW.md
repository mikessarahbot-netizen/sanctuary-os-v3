# NOW

## Task
Add a desktop replay scheduler that runs the replay pass on an injected interval with offline/online gating.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-local-sync-queue-plan.md`, `07-reviews/architecture/presenter-desktop-replay-conflict-classification-release-check.md`, and `apps/desktop/src/replay-pass.ts`
- Add `createPresenterDesktopReplayScheduler` that wraps a `runPass` callback (defaulting to `runPresenterDesktopReplayPass`-shaped) with: a `runOnce` that checks an injected `isOnline` predicate and skips when offline (returning a skipped marker) or runs the pass and returns its result; and `start`/`stop` that drive `runOnce` via an injected interval abstraction (`schedule`/`cancel`) so no real timer is used in tests
- Make connectivity, the interval abstraction, and the pass runner injected; the scheduler holds no transport and never throws out of a scheduled tick (errors are captured per tick)
- Add focused tests with fakes covering: skip-when-offline, run-when-online (delegates to the pass), start schedules and stop cancels via the fake interval, and a tick error is contained
- Keep the slice scheduler-only; do not add Tauri commands, real `setInterval` wiring at the call site, a real network command service, or OS packaging

## Out of scope
Tauri/Rust shell · real desktop windows · real network command service · real timer wiring at startup · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [x] Re-sync with the replay pass and runtime expectations
- [x] Add the scheduler with offline gating and injected interval
- [x] Add focused scheduler tests with fakes
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the scheduler slice
- [ ] Session handoff

## Done when
A replay scheduler runs the pass on an injected interval, skips while offline, contains per-tick errors, and starts/stops cleanly, covered by focused fake-backed tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Begin the Tauri shell wiring for the desktop app (injecting a real SQLite client, interval, connectivity, authenticated actor, and network command service into the composition root + scheduler) — a larger slice with Rust/tooling considerations; address any scheduler findings first.
