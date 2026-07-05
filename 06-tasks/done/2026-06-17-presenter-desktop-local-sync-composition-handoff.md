# Presenter Desktop Local Sync Composition Root Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop-local Presenter sync composition root (`createPresenterDesktopLocalSyncQueueStore`) and its tests are complete and pushed (`462537c`). The release check is written under `07-reviews/architecture/presenter-desktop-local-sync-composition-release-check.md` (pass with follow-ups). All default gates pass.

The next session should add `runPresenterDesktopReplayPass` in `apps/desktop`: a single replay pass that reads ready entries from the repository, applies `decidePresenterLocalSyncQueueReplay`, marks eligible entries `replaying`, maps them with `mapPresenterLocalSyncQueueEntryToReplayCommand`, calls the matching injected `PresenterCommandService` method, and marks `synced`/`failed` (and `exhausted` entries `failed`). This will add `@sanctuary-os/api` as a desktop dependency. Test with an in-memory fake repository and fake command service.

After the pass, rich conflict-vs-failure classification, a timer wrapper, and offline/online gating are the remaining desktop replay-runtime slices, then the actual Tauri shell.

Open questions:
- None.
