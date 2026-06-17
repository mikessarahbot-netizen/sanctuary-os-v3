# Presenter Desktop Replay Scheduler Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop Presenter replay scheduler (`createPresenterDesktopReplayScheduler`) and its tests are complete and pushed (`c0b9112`). The release check is written under `07-reviews/architecture/presenter-desktop-replay-scheduler-release-check.md` (pass with follow-ups). All four workspaces' gates pass.

The desktop replay runtime is now complete and fully injected at the logic level: the migrated store, the replay pass (with conflict classification), and the scheduler (offline gating + injected interval).

The next session should add `createPresenterDesktopReplayRuntime`: an async assembly factory that composes the migrated store, a `runPass` binding, and the scheduler from injected adapters, returning the migration result, repository, and scheduler. Add an availability-guarded `node:sqlite` end-to-end smoke (build runtime → enqueue → one online scheduler pass → entry synced) plus a default offline test.

After the assembly factory, the only remaining Presenter offline-sync work is the Tauri shell wiring (concrete SQLite client, `setInterval`/connectivity adapters, authenticated actor, network-backed command service, error classifier). That is a native/tooling slice requiring the Rust toolchain and is not unit-testable via the current gates — worth confirming the toolchain/approach before starting.

Open questions:
- Tauri shell tooling (Rust toolchain availability) and the production network command service contract are not yet established.
