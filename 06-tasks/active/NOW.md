# NOW

## Task
Add Presenter local sync queue contracts.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-module-plan.md`, `05-plans/presenter-local-sync-queue-plan.md`, current Presenter domain/API/persistence contracts, and existing offline/release-check notes
- Add strict Presenter local sync queue schemas/types/parser helpers for queue entries, queued operations, conflict details, retry metadata, and status transitions
- Cover approved non-destructive Presenter command operations from the plan and reject destructive operations, local run-mode actions, OBS/stream controls, raw media, vendor tokens, secrets, and unknown fields
- Add focused tests for valid queue entries, tenant/presentation/actor/request metadata, status transition validation, conflict detail validation, replay readiness ordering, and forbidden payloads
- Keep contracts adapter-free and storage-free
- Run focused tests plus lint, typecheck, and full tests
- Commit and push the slice
- Run session handoff

## Out of scope
Production queue runner · SQLite schema/migrations · local persistence adapter · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Implement local sync queue schemas/types/parser helpers
- [x] Add focused queue contract tests
- [x] Run validation
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter local sync queue contracts are Zod-validated, tested, committed, pushed, and handoff documents identify the exact next task.

## Next task after this
Run a focused release check for Presenter local sync queue contracts, or address any contract findings first.
