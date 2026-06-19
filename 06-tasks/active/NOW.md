# NOW

## Task
OBS module, slice 8: the persistence-backed OBS service over the slice-4 SQLite adapter + a composition that applies `ObsInitialSchemaMigration` via the runner. The confirm→dispatch gate MUST hold identically on the persistence path. Mirror the other modules' persistence slices. (OBS slices 1–7 done + green at `3fc118d`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). The injected ObsControlPort is the only thing that touches OBS; dispatch remains the sole port-mutate caller, refusing unless confirmed — on BOTH the in-memory and persistence paths. Charts + Play + Community+ backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 8)
- Continue on `feature/presenter-domain-contracts`
- Mirror `apps/api/src/services/{charts,play,community}/persistence.ts` + `composition.ts` (+ their tests) exactly
- Add `apps/api/src/services/obs/persistence.ts`: a persistence-backed `ObsQueryService`/`ObsCommandService` delegating to `createObsQuerySqlRepository`/`createObsCommandSqlRepository` over an injected executor (+ injected clock + id generator + the slice-5 ObsControlPort + the error classifier — same deps the in-memory service takes). Translate domain ops → persistence ops and persistence records → domain records (field-by-field; re-apply brands via the domain schemas on read). Preserve tenant scope, typed ObsDomainError, the pure eligibility checker on requestObsAction, and — critically — the confirm→dispatch gate: dispatch is the ONLY method that calls a port mutate method and refuses unless status=confirmed, with the audit-log write on every step (same structure as in-memory).
- Add `apps/api/src/services/obs/composition.ts`: `createObsPersistenceSelection` (in-memory vs sql) + `migrateObsSqliteSchema` applying `ObsInitialSchemaMigration` via `createSqliteMigrationRunner`
- Keep the in-memory service as the test double; do not change the GraphQL surface
- Export from the obs services barrel
- Tests: a recording/fake-executor service test (domain↔persistence mapping, tenant scope, not-found → typed error, AND the dispatch gate still enforced — dispatch-without-confirm rejected, port NEVER called) + a `node:sqlite` integration test (migrate via runner → save connection → refresh catalog via the fake port → request→confirm→dispatch an action → assert the port called once + audit rows + the confirm-before-dispatch gate over real SQLite)

## Done when
A persistence-backed OBS service satisfies the interfaces over the slice-4 adapter with tenant scope + the eligibility + confirm→dispatch gate (dispatch sole port caller, refuses unless confirmed, audited), the migration is applied via the runner, covered by a fake-executor test + a `node:sqlite` integration test, gates green, committed and pushed.

## Next task after this
OBS slice 9: WebSocket events (OBS state events — stream started/stopped, scene changed — into the API event union; PII-free + SECRET-FREE coarse payloads + scope superRefines, emitted after durable commits). Then slice 10: AI assist (reviewable action SUGGESTION → a `requested`, origin="ai-suggested" intent that can NEVER auto-confirm/dispatch; PII-free projection; injected AI port). After OBS slice 10 the OBS backend is COMPLETE → write `07-reviews/architecture/obs-backend-release-check.md`, and the autonomously-buildable backend across ALL modules is done. Slices 11–13 (real obs-websocket, desktop agent runtime, operator UI) + all module UIs await the user.
