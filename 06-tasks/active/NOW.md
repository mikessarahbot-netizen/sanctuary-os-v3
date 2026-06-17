# NOW

## Task
Add a desktop sidecar status reporter (`getStatus` via `countByStatus` + `summarizePresenterLocalSyncQueue`) and expose it from the runtime.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/desktop/src/replay-runtime.ts`, `apps/desktop/src/sidecar-entry.ts`, and the new `countByStatus`/`summarizePresenterLocalSyncQueue` in `@sanctuary-os/db`
- Add a `getStatus(actor)` (or context-scoped) capability to the desktop runtime/sidecar handle that calls `repository.countByStatus` and returns `summarizePresenterLocalSyncQueue(counts)` plus the last replay-pass result
- Surface it on the runtime assembly and the sidecar handle so a future IPC/UI can read it
- Add focused tests (fake repository returning counts → expected summary; last-result tracking) with no live engine, plus a `node:sqlite` smoke if consistent
- Keep this slice the status reporter only; the Tauri command/IPC channel and the UI rendering are the next slice
- Default tests only; no live network/IPC

## Out of scope
Tauri command/IPC channel · desktop status UI rendering · packaging · deployment · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the runtime, sidecar handle, and the new db status helpers
- [ ] Add `getStatus` to the runtime/sidecar handle (counts → summary + last result)
- [ ] Add focused tests (fake repository + last-result tracking)
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the status-reporter slice
- [ ] Session handoff

## Done when
The desktop runtime/sidecar exposes a `getStatus` that returns the queue summary (and last replay result), covered by focused tests with no live engine, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add the Tauri command/IPC channel and a minimal desktop status UI rendering the summary with operator retry/cancel — addressing any reporter findings first.
