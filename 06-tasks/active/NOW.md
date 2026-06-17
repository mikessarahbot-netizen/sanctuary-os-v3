# NOW

## Task
Community+ module, slice 4: the SQLite adapter (`packages/db/src/community-sql-repository.ts`) — command + query SQL repositories over an injected executor, mirroring `charts-sql-repository.ts`/`play-sql-repository.ts`. (Community+ slices 1–3 done + green at `a4a4bbe`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module: tenant-scope every statement; opaque contact refs only (no raw PII). Charts + Play backends complete.

## Reconcile (carried from slice 3)
The slice-2 `CommunicationMessagePersistenceRecordSchema` carries a `schemaVersion` field, but the slice-3 DDL puts `schema_version` only on `members` (per the plan). Resolve cleanly in this slice and keep gates green — pick the consistent option: either (a) derive/default the message `schemaVersion = "community.v1"` on read (not a stored column) and don't write it, OR (b) drop `schemaVersion` from the message contract to match the plan/DDL and the charts/play "schema_version on the primary aggregate only" precedent. Prefer the smallest change that keeps the contract round-trip honest; note what you chose.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 4)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-sql-repository.ts` + `packages/db/src/play-sql-repository.ts` exactly (and their tests): `createCommunityQuerySqlRepository` + `createCommunityCommandSqlRepository` over a `Pick<PlanningSqlExecutor,"query">` executor (+ injected `clock` for the command repo); positional `?` SQL; tenant filtering on every statement; row→contract mapping validated through the slice-2 contracts; boolean ↔ 0/1; JSON (de)serialization for the `*_json` columns (contact_channel_refs, audience, segment_refs, household member_refs, etc.); the confirmation-gated message-status write; partial-unique-aware upserts; remove paths as tenant-scoped DELETEs
- Implement all query reads + command writes from the slice-2 repository interfaces
- Export from the db barrel
- Tests: recording-executor unit tests (tenant-scoped SQL, params, mapping, JSON encode/decode, the no-raw-PII mapping) + a `node:sqlite` smoke (apply CommunityInitialSchemaMigration → save member/household/group/membership/attendance → draft→confirm→queue a message → list round-trips)

## Done when
The Community+ SQLite adapter implements both repositories with tenant filtering + validated mapping + JSON encoding + the confirmation-gated write, the schemaVersion reconciliation is resolved, covered by recording-executor tests + a `node:sqlite` smoke, gates green, committed and pushed.

## Next task after this
Community+ slice 5: GraphQL + in-memory service (`apps/api/src/domain/community/{contracts,errors}.ts`, `services/community/in-memory.ts`, `graphql/community.ts`) per the plan. Then 6 (comms lifecycle/confirmation gate), 7 (persistence service), 8 (engagement rollup), 9 (events), 10 (AI assist). Slices 11–13 await user decisions. After Community+: the OBS module.
