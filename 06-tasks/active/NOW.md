# NOW

## Task
Add a Presenter local sync queue plan.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-output-window-contract-release-check.md`, current Presenter domain/API/persistence contracts, and existing Planning offline/sync guidance
- Add a Presenter local sync queue plan under `05-plans/` or a closely scoped planning document that defines offline-safe queued edit scope, queue record shape, conflict states, retry/replay behavior, tenant/audit metadata, storage ownership, and validation expectations
- Keep the plan aligned with desktop-owned run mode, API-owned saved presentation persistence, and existing event transport boundaries
- Document explicit out-of-scope items and first implementation acceptance criteria
- Run docs-compatible validation gates
- Commit and push the slice
- Run session handoff

## Out of scope
Production queue code · SQLite schema/migrations · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with required docs and current Presenter contracts
- [ ] Draft Presenter local sync queue plan
- [ ] Check plan against offline/failure/privacy rules
- [ ] Run validation
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter local sync queue planning is documented, validated, committed, pushed, and handoff documents identify the exact next task.

## Next task after this
Add Presenter local sync queue contracts if the plan is clean, or address any planning findings first.
