# NOW

## Task
Community+ module, slice 2: the persistence contracts (`packages/db/src/community-repository-contracts.ts`) — tenant-scoped Zod persistence records + per-operation input schemas + read/write option guards + query/command repository interfaces, mirroring the Charts/Play persistence contracts. (Community+ slice 1 — domain + pure logic — done + green at `b612bf1`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module: NO raw PII in records (opaque contactChannelRefs + consent only); tenant-scope everything; AI-bound projections PII-free. Charts + Play backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 2)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-repository-contracts.ts` + `packages/db/src/play-repository-contracts.ts` exactly in shape
- Add `packages/db/src/community-repository-contracts.ts`: `CommunityPersistenceReadOptions`/`WriteOptions` (reuse RepositoryReadOptions/WriteOptions + inlined superRefine requiring actorId); a `*PersistenceRecordSchema` per object (Member, Household, CommunityGroup, GroupMembership, AttendanceRecord, CommunicationMessage, CommunicationRecipient, EngagementSummary — durable persistence shapes mirroring the slice-1 domain records; plain storage strings; opaque contact refs only — NO raw PII columns; JSON for any array fields); per-operation `*PersistenceInputSchema`; readOperation/writeOperation wrappers; `CommunityQueryPersistenceRepository` + `CommunityCommandPersistenceRepository` interfaces (list/get per object + the writes from the plan, incl. the comms confirmation-gated path shape)
- Export from the db barrel
- Contract tests mirroring the charts/play contract tests (round-trip parse, .strict() rejection, actor-id requirement, key invariants, and a persistence-record PII-free assertion for EngagementSummary)

## Out of scope
Migration (slice 3) · adapter (slice 4) · GraphQL/service · the web UI · send integration

## Done when
The Community+ persistence contracts exist (records + per-op inputs + option guards + query/command interfaces) with contract tests (incl. PII-free EngagementSummary), gates green, committed and pushed.

## Next task after this
Community+ slice 3: the migration artifact (`packages/db/src/community-migrations.ts`). Then slices 4–10 per `05-plans/community-plus-module-plan.md` (adapter → GraphQL+service → comms lifecycle/confirmation gate → persistence service → engagement rollup → events → AI assist). Slices 11–13 await user decisions. After Community+: the OBS module.
