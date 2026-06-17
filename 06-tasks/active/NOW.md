# NOW

## Task
Add in-memory Presenter persistence repository adapters.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, current Presenter service contracts, and `packages/db/src/presenter-repository-contracts.ts`
- Implement in-memory Presenter query and command repository adapters that satisfy the new persistence repository interfaces
- Cover saved presentations, themes, output targets, and slide add/update/reorder/remove mutations needed by current services
- Preserve tenant scope, request/actor audit metadata, opaque IDs, deterministic test seams, Zod validation, adapter isolation, and no raw media payload storage
- Keep this slice persistence-adapter-only: no SQL adapter, no database migration, no WebSocket server, no UI, no OBS automation, no stream start/stop
- Add focused tests for tenant isolation, operation validation, mutation behavior, audit metadata requirements, defensive copying, and compatibility with current Presenter in-memory service needs
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
PostgreSQL Presenter adapters · database migrations · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [ ] Re-sync with required docs and current Presenter persistence contracts
- [ ] Add in-memory Presenter persistence repository adapters
- [ ] Add focused Presenter persistence adapter tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter has tested in-memory persistence repository adapters that satisfy the saved-presentation/output-target contracts, preserve tenant/audit scope and adapter isolation, align with current service needs, pass default gates, and are committed, pushed, and documented in session handoff.

## Next task after this
Run a Presenter API/event/persistence release-check before SQL adapter work, or start PostgreSQL Presenter persistence adapters if the release-check is already complete.
