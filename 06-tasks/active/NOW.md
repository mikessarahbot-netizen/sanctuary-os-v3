# NOW

## Task
Add a desktop Presenter replay runtime assembly factory that composes the migrated store, the replay pass binding, and the scheduler from injected adapters.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-local-sync-queue-plan.md`, `07-reviews/architecture/presenter-desktop-replay-scheduler-release-check.md`, and the desktop building blocks (`createPresenterDesktopLocalSyncQueueStore`, `runPresenterDesktopReplayPass`, `createPresenterDesktopReplayScheduler`)
- Add an async `createPresenterDesktopReplayRuntime` that: builds the migrated store from an injected SQLite client + clock; binds a `runPass` that calls `runPresenterDesktopReplayPass` with the store repository, the injected actor/command service/policy, `now = clock()`, and optional error classifier/safe message; and creates the scheduler with injected connectivity/interval and optional result/error callbacks
- Return the migration result, the repository, and the scheduler so the Tauri shell only supplies concrete adapters
- Add an availability-guarded `node:sqlite` smoke that builds the runtime, enqueues an entry, runs one online pass via the scheduler, and confirms the entry is synced; plus a default test that an offline runtime pass skips
- Keep the slice assembly-only; do not add Tauri commands, real timers, a real network command service, or OS packaging

## Out of scope
Tauri/Rust shell · real desktop windows · real network command service · real timer/connectivity wiring at startup · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [ ] Re-sync with the store, pass, and scheduler building blocks
- [ ] Add the runtime assembly factory
- [ ] Add an availability-guarded end-to-end smoke and a default offline test
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the runtime assembly slice
- [ ] Session handoff

## Done when
A single assembly factory composes the migrated store, the replay pass binding, and the scheduler from injected adapters and returns the migration result, repository, and scheduler, covered by an availability-guarded end-to-end smoke and a default offline test, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Begin the Tauri shell wiring (concrete SQLite client, `setInterval`/connectivity adapters, authenticated actor, network-backed command service, and an error classifier for its error shapes) — a native/tooling slice; surface the Rust toolchain requirement and address any assembly findings first.
