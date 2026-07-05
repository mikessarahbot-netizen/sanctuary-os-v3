# Presenter Local Sync Queue Replay Decision Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The pure Presenter local sync queue replay decision contract (`decidePresenterLocalSyncQueueReplay`) and its tests are complete and pushed (`eedd0a6`). The release check is written under `07-reviews/architecture/presenter-local-sync-queue-replay-decision-release-check.md` (pass with follow-ups). All default gates pass.

The next session should add a pure replay coordinator that maps an eligible queue entry's operation to the existing Presenter command shape (operation name + command input + tenant/actor/`requestId` options), placed in `apps/api` where the Presenter command contracts live, with no live transport.

After the coordinator, scaffolding `apps/desktop` as its own workspace becomes the gating step for wiring the persistence selection, migration runner, replay decision, and replay coordinator into a desktop composition root and replay loop.

The local sync queue storage + decision layer in `packages/db` is now complete: contracts, migration + migration runner, SQLite adapter, SQLite executor, persistence composition, and replay decision — all with no-live-engine default tests plus `node:sqlite` availability-guarded smokes.

Open questions:
- None.
