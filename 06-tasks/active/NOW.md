# NOW

## Task
Add Presenter PostgreSQL persistence migrations and repository adapters.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-api-event-persistence-release-check.md`, `packages/db/src/presenter-repository-contracts.ts`, and current Planning SQL migration/adapter patterns
- Add Presenter SQL migration definitions for saved presentations, slides, slide blocks, scripture passages/verses, media cues, themes, output targets, presentation-output target links, and audit metadata needed by the current persistence contracts
- Implement PostgreSQL-compatible Presenter query and command repository adapters satisfying `PresenterQueryPersistenceRepository` and `PresenterCommandPersistenceRepository`
- Preserve tenant scope, actor/request audit metadata, mutation intent, transaction propagation, row validation, opaque IDs, no raw media payload storage, no OBS/stream automation, and no checked-in secrets
- Use recording-executor tests only; no live PostgreSQL requirement in the default gates
- Add focused DB tests for migration shape, tenant predicates, audit inserts, operation validation, transaction behavior, row parsing, slide ordering, output target links, and rejection of raw media/secret/vendor fields
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL integration · migration runner execution · API runtime composition · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [ ] Re-sync with required docs and current DB patterns
- [ ] Add Presenter SQL migration definitions
- [ ] Add Presenter PostgreSQL query and command repository adapters
- [ ] Add focused Presenter SQL persistence tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter has tested PostgreSQL-compatible migrations and repository adapters satisfying the current persistence contracts, preserving tenant/audit scope and adapter isolation, passing default live-DB-free gates, committed and pushed with handoff documentation.

## Next task after this
Wire API runtime composition to select in-memory/test or production Presenter persistence adapters, or address any SQL persistence release-check findings first.
