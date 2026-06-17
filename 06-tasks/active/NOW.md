# NOW

## Task
Community+ module, slice 5: the GraphQL surface + in-memory service — `apps/api/src/domain/community/{contracts,errors}.ts`, `apps/api/src/services/community/in-memory.ts`, `apps/api/src/graphql/community.ts`, merged into the executable schema. Mirror the Charts/Play slice 5. (Community+ slices 1–4 done + green at `f417e35`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module. Charts + Play backends complete.

## Privacy non-negotiables (this module)
- Tenant-scope every read/write. No raw PII in records (opaque contact refs only). AI-bound projections PII-free.
- Outbound comms require a human-confirmation gate (mirror the confirmation-intent pattern); AI may draft, never send. Consent enforced in the audience resolver (already built in slice 1).

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 5)
- Continue on `feature/presenter-domain-contracts`
- Mirror the Charts/Play slice-5 files exactly: `apps/api/src/domain/{charts,play}/contracts.ts` + `errors.ts`, `apps/api/src/services/{charts,play}/in-memory.ts`, `apps/api/src/graphql/{charts,play}.ts`, and how they merge into `apps/api/src/graphql/presenter-schema.ts` + map errors in `transport.ts`
- Add `apps/api/src/domain/community/contracts.ts` (service operation envelopes `{ actor, requestId, input }` + `CommunityQueryService`/`CommunityCommandService` interfaces; reuse the slice-1 domain records + the pure audience resolver / message lifecycle) and `errors.ts` (`CommunityDomainError` + codes: MEMBER/HOUSEHOLD/GROUP/MEMBERSHIP/ATTENDANCE/MESSAGE/RECIPIENT/SUMMARY_NOT_FOUND, VALIDATION_FAILED, AUTHORIZATION_FAILED, plus a CONFIRMATION_REQUIRED / CONSENT-type code as the plan needs)
- Add `apps/api/src/services/community/in-memory.ts` (tenant-scoped, Zod-validated, injected clock + id generator; the communication lifecycle uses the pure message-lifecycle + audience resolver; outbound send is gated/queued behind confirmation; AI-draft cannot send), the test double
- Add `apps/api/src/graphql/community.ts` (SDL: enums + types + queries + mutations from the plan; comms-send mutation requires a confirmation intent) + resolvers, merged into the executable schema; map `CommunityDomainError → extensions.code` in `transport.ts`
- In-memory only this slice (persistence-backed service is slice 7); send transport stays a faked port (slice 11)
- Tests: service unit tests (tenant isolation, validation→typed error, CRUD round-trips, consent suppression, confirmation gate blocks unconfirmed/AI send) + resolver/schema tests (a query, a mutation, an error→extensions.code path, a confirmation-gate path)

## Done when
The Community+ GraphQL surface is served by an in-memory tenant-scoped Zod-validated service (with the consent + confirmation gates) wired into the executable schema with typed error mapping, covered by service + resolver tests, gates green, committed and pushed.

## Next task after this
Community+ slice 6: communications lifecycle + confirmation-gate hardening (if not fully covered in 5). Then 7 (persistence-backed service over the slice-4 adapter), 8 (engagement rollup recompute), 9 (WebSocket events), 10 (AI assist). Slices 11–13 await user decisions. After Community+: the OBS module.
