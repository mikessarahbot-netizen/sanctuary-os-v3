# NOW

## Task
Wire Presenter service mutations to emit validated events after durable in-memory state changes.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current Presenter domain/API/service/event contracts
- Add optional event publisher dependencies to the in-memory Presenter service adapter
- Emit validated Presenter events after successful in-memory state changes for presentation updates, slide changes, output blanking, and output restoration where the current service/run-mode contracts support them
- Preserve service-owned role checks, tenant scope, Zod validation, and no event publication before a mutation succeeds
- Keep the slice adapter/local only: no WebSocket server, no desktop event bus wiring, no database migrations, no SQL adapters, no OBS automation, no stream start/stop
- Add focused tests for event publication after successful mutations, no publication after rejected mutations, payload tenant/aggregate correctness, and event ordering
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
WebSocket server wiring · desktop event bus wiring · PostgreSQL Presenter adapters · database migrations · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Add event publisher dependency to Presenter in-memory services
- [x] Emit validated Presenter events after successful state changes
- [x] Add focused Presenter event publication tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter in-memory service mutations publish validated Presenter events only after successful state changes; failed mutations publish nothing; event payloads carry correct tenant, aggregate, schema version, actor, and request scope; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add Presenter persistence contracts for saved presentations and output targets, or run a Presenter API/event release-check if the service/event surface needs audit before persistence.
