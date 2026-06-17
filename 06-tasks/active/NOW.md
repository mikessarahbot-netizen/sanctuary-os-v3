# NOW

## Task
Add API WebSocket/event transport wiring for validated Presenter events.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-api-event-persistence-release-check.md`, `07-reviews/architecture/presenter-persistence-composition-release-check.md`, current `apps/api/src/events/` contracts, and Presenter service event publication code
- Add an API event transport boundary for validated `presentation.updated`, `presenter.slideChanged`, `presenter.outputBlanked`, and `presenter.outputRestored` envelopes
- Keep the transport adapter-injected and live-network-free in default tests; use recording/in-memory clients only
- Preserve `publishAfterCommit` validation, event ordering, tenant/aggregate envelope checks, actor/request payload scope, and no publication of rejected payloads
- Add focused tests for Presenter event subscription/dispatch behavior, malformed envelope rejection, tenant-scoped routing metadata, and no OBS/stream/raw-media payload support
- Document any new API event transport surface if needed
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and current event contracts
- [x] Add API event transport boundary for Presenter events
- [x] Add focused event transport tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Validated Presenter event envelopes can be dispatched through an API event transport boundary in tests without live network dependencies, preserving post-commit semantics and safety exclusions, committed and pushed with handoff documentation.

## Next task after this
Run a focused Presenter event transport release check, or address any transport findings first.
