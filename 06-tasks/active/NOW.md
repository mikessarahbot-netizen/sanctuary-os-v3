# NOW

## Task
Wire API runtime composition to select Presenter persistence adapters.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-api-event-persistence-release-check.md`, current Presenter API service composition, and `packages/db/src/presenter-sql-repository.ts`
- Add an API composition boundary for Presenter persistence selection that mirrors existing Planning runtime composition patterns where appropriate
- Support explicit in-memory/test Presenter persistence and production PostgreSQL Presenter persistence adapter construction without a live DB requirement in default tests
- Preserve tenant scope, actor/request propagation, repository contract boundaries, no raw media payload storage, no OBS/stream automation, no checked-in secrets, and no direct GraphQL-to-DB coupling
- Add focused API tests for adapter selection, default/test mode behavior, production adapter construction, and prevention of accidental live database work in unit tests
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Live PostgreSQL integration · migration runner execution · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current API/DB composition patterns
- [x] Add Presenter persistence composition boundary
- [x] Add focused API composition tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter API composition can select in-memory/test or production PostgreSQL persistence adapters through a tested boundary, preserving service/repository isolation and passing default live-DB-free gates, committed and pushed with handoff documentation.

## Next task after this
Run a focused Presenter persistence composition release check, or address any composition findings first.
