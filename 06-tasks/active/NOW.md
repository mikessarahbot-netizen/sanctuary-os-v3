# NOW

## Task
Add Presenter WebSocket event payload contracts.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current Presenter domain/API/service contracts
- Add validated Presenter event payload schemas for `presentation.updated`, `presenter.slideChanged`, `presenter.outputBlanked`, and `presenter.outputRestored`
- Align event envelopes with API event rules: tenant ID, actor ID where available, aggregate ID, event type, schema version, and request/audit scope where applicable
- Keep events contract-only: no WebSocket server, no persistence publication, no OBS automation, no stream start/stop, no desktop event bus wiring
- Add focused tests for schema validation, tenant consistency, event type names, schema versioning, and rejection of OBS/stream/raw-media/secret-like fields
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Event publishing from Presenter services · WebSocket server wiring · desktop event bus wiring · PostgreSQL Presenter adapters · database migrations · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Add Presenter event payload schemas
- [x] Add focused Presenter event contract tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter has typed, tested event payload contracts for the planned WebSocket events; payloads are Zod-validated, tenant-scoped, versioned, and free of out-of-scope controls or secrets; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Wire Presenter service mutations to emit validated events after durable in-memory state changes, or add Presenter persistence contracts if event publication needs a persistence boundary first.
