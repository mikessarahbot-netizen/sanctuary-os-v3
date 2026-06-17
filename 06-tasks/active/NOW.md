# NOW

## Task
Add opt-in live PostgreSQL coverage for Presenter persistence composition.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-persistence-composition-release-check.md`, `apps/api/src/services/presenter/composition.ts`, `packages/db/src/presenter-migrations.ts`, `packages/db/src/presenter-sql-repository.ts`, and the Planning opt-in PostgreSQL smoke test pattern
- Add an opt-in live PostgreSQL smoke test for Presenter runtime persistence composition in the API package
- Skip by default unless `SANCTUARY_OS_PRESENTER_POSTGRES_URL` is set
- Use an isolated schema name validated by Zod, apply the Presenter initial migration, exercise SQL-backed Presenter query and command repositories through API runtime composition, and clean up the schema afterward
- Document the environment variables, command, schema behavior, and no-secrets rule in API/DB docs
- Preserve default live-DB-free gates, tenant/audit scope, repository contract boundaries, no raw media payload storage, no OBS/stream automation, and no checked-in secrets
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Always-on live PostgreSQL requirement · production deployment config · migration runner execution outside the smoke harness · WebSocket server wiring · desktop event bus wiring · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [x] Re-sync with required docs and current Presenter SQL/runtime patterns
- [x] Add opt-in Presenter PostgreSQL integration smoke test
- [x] Document local command and no-secrets behavior
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter SQL-backed persistence can be exercised through API runtime composition by an opt-in live PostgreSQL smoke test that is skipped by default, documented, committed, pushed, and validated by default live-DB-free gates.

## Next task after this
Start the next Presenter delivery slice, likely WebSocket server wiring for validated Presenter events, or address any live PostgreSQL coverage findings first.
