# NOW

## Task
OBS module, slice 2: the persistence contracts (`packages/db/src/obs-repository-contracts.ts`) — tenant-scoped Zod persistence records + per-operation input schemas + read/write option guards + query/command repository interfaces, mirroring the Charts/Play/Community contracts. (OBS slice 1 — domain + pure logic — done + green at `72c7b0b`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Final module. NO secrets in records (opaque connectionRef only); online-only output actions; structural confirm-before-dispatch gate. Charts + Play + Community+ backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 2)
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/{charts,play,community}-repository-contracts.ts` exactly in shape
- Add `packages/db/src/obs-repository-contracts.ts`: `ObsPersistenceReadOptions`/`WriteOptions` (reuse RepositoryReadOptions/WriteOptions + inlined superRefine requiring actorId); a `*PersistenceRecordSchema` per object (ObsConnectionProfile [opaque connectionRef — NO secret columns], Scene, Source, SceneItem, StreamState, RecordingState, ObsActionIntent, ObsActionLogEntry — durable storage shapes mirroring the slice-1 domain records; plain strings; JSON for array fields); a `ObsStorageSchemaVersionSchema = z.literal("obs.v1")`; per-operation `*PersistenceInputSchema`; readOperation/writeOperation wrappers; `ObsQueryPersistenceRepository` + `ObsCommandPersistenceRepository` interfaces (list/get per object, the connection-profile upsert, scene/source catalog snapshot upserts, stream/recording state upsert, the action-intent lifecycle writes [save/setStatus respecting the confirm-before-dispatch invariant], the append-only action-log insert)
- Export from the db barrel
- Contract tests mirroring the other modules' contract tests (round-trip parse, .strict() rejection, actor-id requirement, key invariants, and a NO-SECRETS assertion that ObsConnectionProfile rejects host/password/token/streamKey keys)

## Out of scope
Migration (slice 3) · adapter (slice 4) · ObsControlPort · GraphQL/service · the action-gate flow · real obs-websocket · runtime/UI

## Done when
The OBS persistence contracts exist (records + per-op inputs + option guards + query/command interfaces, no secret columns) with contract tests (incl. no-secrets), gates green, committed and pushed.

## Next task after this
OBS slice 3: the migration artifact (`packages/db/src/obs-migrations.ts`). Then slices 4–10 per `05-plans/obs-module-plan.md` (adapter → ObsControlPort+fake → GraphQL+service → action gate → persistence service → events → AI assist). Slices 11–13 await user decisions. After OBS backend: the autonomously-buildable backend is complete; remaining is UIs + live integrations (need the user).
