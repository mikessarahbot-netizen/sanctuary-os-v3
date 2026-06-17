# NOW

## Task
Add Presenter local sync queue SQLite local repository adapter scaffolding.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-migration-artifact-release-check.md`, and current Presenter local sync queue repository contracts/migration artifacts
- Add adapter scaffolding for SQLite-compatible Presenter local sync queue persistence under `packages/db`
- Validate stored rows with the existing Presenter local sync queue repository schemas before insert/update and after read mapping
- Preserve tenant-scoped lookup/update boundaries, request idempotency metadata, base revision, retry metadata, conflict details, safe failure text, and original queued payloads
- Add focused adapter tests using an in-memory/recording SQLite-compatible executor or equivalent test boundary without requiring a live database by default
- Keep the slice adapter-scaffolding-only; do not add production replay scheduling, desktop UI, Tauri/event-bus wiring, GraphQL/API replay changes, or external integrations
- Run lint, typecheck, and tests
- Commit and push the adapter scaffolding slice
- Run session handoff

## Out of scope
Production queue runner · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs, contracts, and migration artifacts
- [x] Add local sync queue SQLite adapter scaffolding
- [x] Add focused adapter tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push adapter scaffolding slice
- [ ] Session handoff

## Done when
Presenter local sync queue local repository adapter scaffolding validates rows at boundaries, preserves tenant/replay/idempotency/conflict metadata, has focused tests, default gates pass, the adapter slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Run a focused Presenter local sync queue SQLite adapter scaffolding release check, or address any adapter findings first.
