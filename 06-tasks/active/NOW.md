# NOW

## Task
Play module, slice 5: the Play GraphQL surface + in-memory service — `apps/api/src/domain/play/{contracts,errors}.ts`, `apps/api/src/services/play/in-memory.ts`, and `apps/api/src/graphql/play.ts`, merged into the executable schema. Mirror the Charts slice 5. (Play slices 1–4 done + green at `46fed50`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative; slices 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined to NOW.md + summary + commit/push per backend slice (consolidated release check at the Play-backend milestone); gates are the per-slice verification.

## In scope (slice 5)
- Continue on `feature/presenter-domain-contracts`
- Mirror the Charts slice-5 files exactly: `apps/api/src/domain/charts/contracts.ts` + `errors.ts`, `apps/api/src/services/charts/in-memory.ts`, `apps/api/src/graphql/charts.ts`, and how charts merges into `apps/api/src/graphql/presenter-schema.ts` + maps errors in `transport.ts`
- Add `apps/api/src/domain/play/contracts.ts` (service operation envelopes `{ actor, requestId, input }` + `PlayQueryService`/`PlayCommandService` interfaces; reuse the slice-1 domain records + the resolved-sequence projection) and `errors.ts` (`PlayDomainError` + `PLAY_DOMAIN_ERROR_CODES`: TRACK_SET/ARRANGEMENT/SECTION/CUE/PAD_LAYER/PLAYBACK_STATE_NOT_FOUND, VALIDATION_FAILED, AUTHORIZATION_FAILED)
- Add `apps/api/src/services/play/in-memory.ts` (tenant-scoped, Zod-validated, injected clock + id generator; per-musician/role checks where applicable; `removePlayCue` requires explicit confirmation intent), the test double
- Add `apps/api/src/graphql/play.ts` (SDL: enums + 9 types + 9 queries + 10 mutations from the plan) + resolvers, merged into the executable schema; map `PlayDomainError → extensions.code` in `transport.ts`
- In-memory only this slice (persistence-backed service is slice 6)
- Tests: service unit tests (tenant isolation, validation→typed error, CRUD round-trips, confirmation gate on removePlayCue) + resolver/schema tests (a query, a mutation, an error→extensions.code path)

## Done when
The Play GraphQL surface is served by an in-memory tenant-scoped Zod-validated service wired into the executable schema with typed error mapping, covered by service + resolver tests, gates green, committed and pushed.

## Next task after this
Play slice 6: persistence-backed Play service over the slice-4 adapter + composition/migration usage (mirror Charts slice 6). Then 7 (offline queue), 8 (replay), 9 (events), 10 (desktop replay runtime). UI 11–12 await the scaffold decision.
