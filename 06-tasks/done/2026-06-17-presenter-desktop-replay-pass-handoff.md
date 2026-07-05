# Presenter Desktop Replay Pass Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop Presenter local sync queue replay pass (`runPresenterDesktopReplayPass`) and its tests are complete and pushed (`86ddd21`). The release check is written under `07-reviews/architecture/presenter-desktop-replay-pass-release-check.md` (pass with follow-ups). All four workspaces' gates pass.

With this slice the Presenter local sync queue offline-edit pipeline is functional end to end at the logic level: enqueue → migrate local store → decide eligibility (backoff/limits) → mark replaying → map to command → call injected command service → mark synced/failed.

The next session should add injected conflict-vs-failure classification to the pass: stale revision/validation/authorization/tenant-mismatch errors become `conflict` (via `markConflict` with validated details); transient errors stay retryable `failed`. Default the classifier to `failed`. Test with fakes.

After classification, a desktop replay scheduler wrapper (interval + offline/online gating) and the Tauri shell wiring are the remaining runtime slices.

Open questions:
- The concrete error shapes the production network `PresenterCommandService` will throw are not yet defined; the classifier is injected so the desktop can map them once that transport exists.
