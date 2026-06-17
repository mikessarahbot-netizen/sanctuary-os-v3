# NOW

## Task
Add Presenter persistence contracts for saved presentations and output targets.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current Presenter domain/API/service/event contracts
- Define Presenter persistence operation schemas and repository interfaces for saved presentations, themes, output targets, and slide mutations needed by current services
- Preserve tenant scope, request/actor audit metadata, opaque IDs, Zod validation, and no raw media payload storage
- Keep this slice contract-only or in-memory-adapter-aligned: no SQL adapter, no database migration, no WebSocket server, no UI, no OBS automation, no stream start/stop
- Add focused tests for operation validation, tenant/audit metadata requirements, rejection of secrets/raw-media/vendor fields, and compatibility with current in-memory service needs
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
PostgreSQL Presenter adapters · database migrations · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Add Presenter persistence operation schemas and repository interfaces
- [x] Add focused Presenter persistence contract tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Presenter has typed, tested persistence contracts for saved presentations and output targets aligned with the current service/event surface; contracts require tenant/audit scope, reject out-of-scope data, and preserve adapter isolation; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add in-memory Presenter persistence repository adapters or run a Presenter API/event/persistence release-check before SQL adapter work.
