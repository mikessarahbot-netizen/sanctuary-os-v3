# NOW

## Task
Play module, slice 6: the persistence-backed Play service over the slice-4 SQLite adapter + a composition that applies `PlayInitialSchemaMigration` via the migration runner. Mirror Charts slice 6. (Play slices 1–5 done + green at `5e36886`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative; slices 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined to NOW.md + summary + commit/push per backend slice; consolidated release check at the Play-backend milestone; gates are the per-slice verification.

## In scope (slice 6)
- Continue on `feature/presenter-domain-contracts`
- Mirror `apps/api/src/services/charts/persistence.ts` + `composition.ts` (+ their tests) exactly
- Add `apps/api/src/services/play/persistence.ts`: a persistence-backed `PlayQueryService`/`PlayCommandService` delegating to `createPlayQuerySqlRepository`/`createPlayCommandSqlRepository` over an injected executor; translate domain ops → persistence ops and persistence records → domain records (field-by-field; the domain records are branded, persistence are plain — re-apply brands via the domain schemas on read); preserve tenant scope, role checks, typed `PlayDomainError`; inject the clock
- Add `apps/api/src/services/play/composition.ts`: `createPlayPersistenceSelection` (in-memory vs sql by config) + `migratePlaySqliteSchema` applying `PlayInitialSchemaMigration` via `createSqliteMigrationRunner`
- Keep the in-memory service as the test double; do not change the GraphQL surface
- Export from the play services barrel
- Tests: a recording/fake-executor service test (domain↔persistence mapping, tenant scope, not-found → typed error) + a `node:sqlite` integration test (migrate via runner → service CRUD round-trip)

## Done when
A persistence-backed Play service satisfies the Play service interfaces over the slice-4 adapter with tenant scope + validation + typed errors, the migration is applied via the runner, covered by a fake-executor test + a `node:sqlite` integration test, gates green, committed and pushed.

## Next task after this
Play slice 7: the Play offline-sync queue (contracts + SQLite/in-memory repo + queue migration), mirroring the Charts queue. Then 8 (replay decision + coordinator), 9 (WebSocket events), 10 (desktop replay runtime). UI 11–12 await the scaffold decision.

## Known follow-up (flagged as a background task)
GraphQL enum hyphen/underscore mismatch affects BOTH Charts and Play: SDL enum values are underscored (`pad_change`, `click_toggle`, Charts `section_marker`) but the Zod/domain enums use hyphens (`pad-change`, `click-toggle`, `section-marker`), so those values can't round-trip through GraphQL. Needs a normalization layer (resolver-level map or aligned enums) + tests, across both modules. Not blocking Play backend slices.
