# NOW

## Task
Community+ module, slice 7: the persistence-backed Community service over the slice-4 SQLite adapter + a composition that applies `CommunityInitialSchemaMigration` via the migration runner. Mirror Charts slice 6 / Play slice 6. (Community+ slices 1–5 done + green at `cbfe161`; slice 6's comms lifecycle + confirmation gate were delivered inside slice 5's in-memory service.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module. Charts + Play backends complete.

## Note on slice numbering
Plan slice 6 ("Communications lifecycle + confirmation gate") was implemented within slice 5's in-memory service (full draft→reviewed→confirmed→queued→sent lifecycle, consent suppression, human-confirm gate, AI-can't-send — all tested). So this slice is the persistence-backed service (plan slice 7); any remaining comms hardening (recipient delivery-status tracking, bulk) folds into this + slice 9 (events).

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (this slice)
- Continue on `feature/presenter-domain-contracts`
- Mirror `apps/api/src/services/charts/persistence.ts` + `composition.ts` and `apps/api/src/services/play/persistence.ts` + `composition.ts` (+ their tests) exactly
- Add `apps/api/src/services/community/persistence.ts`: a persistence-backed `CommunityQueryService`/`CommunityCommandService` delegating to `createCommunityQuerySqlRepository`/`createCommunityCommandSqlRepository` over an injected executor; translate domain ops → persistence ops and persistence records → domain records (field-by-field; re-apply brands via the domain schemas on read); preserve tenant scope, role checks, typed `CommunityDomainError`, the consent gate (audience resolver) and the human-confirm gate (message lifecycle); inject the clock + id generator + the faked send port
- Add `apps/api/src/services/community/composition.ts`: `createCommunityPersistenceSelection` (in-memory vs sql) + `migrateCommunitySqliteSchema` applying `CommunityInitialSchemaMigration` via `createSqliteMigrationRunner`
- Keep the in-memory service as the test double; do not change the GraphQL surface
- Export from the community services barrel
- Tests: a recording/fake-executor service test (domain↔persistence mapping, tenant scope, not-found → typed error, consent + confirmation gates still enforced through the persistence path) + a `node:sqlite` integration test (migrate via runner → member/household/group/attendance + draft→confirm→queue message round-trip)

## Done when
A persistence-backed Community service satisfies the interfaces over the slice-4 adapter with tenant scope + validation + typed errors + the consent/confirmation gates, the migration is applied via the runner, covered by a fake-executor test + a `node:sqlite` integration test, gates green, committed and pushed.

## Next task after this
Community+ slice 8: engagement rollup recompute (service-level, over the persisted data). Then 9 (WebSocket events: member/group/attendance/communication events into the API event union), 10 (AI assist: reviewable draft suggestions, PII-free projections, no auto-send). Slices 11–13 await user decisions. After Community+: the OBS module (final module; involves obs-websocket + human-confirm gates).
