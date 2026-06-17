# NOW

## Task
Add a Presenter local sync queue status summary: a repository count-by-status capability and a pure summary the sidecar can report.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `packages/db/src/presenter-repository-contracts.ts`, `packages/db/src/presenter-local-sync-queue-sql-repository.ts`, and the desktop runtime
- Add a `countByStatus(context)` (or `listEntries` + a pure counter) capability to `PresenterLocalSyncQueuePersistenceRepository` returning tenant-scoped counts per status (`queued`, `replaying`, `synced`, `conflict`, `failed`, `cancelled`), with the SQLite adapter implementation and tests (recording-executor + `node:sqlite` smoke)
- Add a pure `summarizePresenterLocalSyncQueue` helper turning the counts into an operator status object (totals, pending, needs-attention = conflict + failed), with unit tests
- Keep this slice the status data + summary only; do not add the IPC channel, the UI, or the Tauri command (next slice)
- Default tests only; no live database/network by default

## Out of scope
Sidecar↔webview IPC channel · desktop status UI · Tauri commands · packaging · deployment · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the queue repository contract and SQLite adapter
- [ ] Add the count-by-status capability to the contract + SQLite adapter
- [ ] Add adapter tests (recording executor + `node:sqlite` smoke)
- [ ] Add the pure `summarizePresenterLocalSyncQueue` helper with tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the status-summary slice
- [ ] Session handoff

## Done when
The queue repository exposes a tenant-scoped count-by-status capability with SQLite adapter tests, a pure summary helper derives an operator status object, both are covered by default tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Expose the status from the sidecar to the Tauri webview (a status channel/Tauri command) and render a minimal desktop status UI with operator retry/cancel — addressing any status-summary findings first.
