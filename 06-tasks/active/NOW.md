# NOW

## Task
Play module, slice 2: the Play persistence contracts (`packages/db/src/play-repository-contracts.ts`) — tenant-scoped Zod persistence records + per-operation input schemas + read/write option guards + `PlayQueryPersistenceRepository` / `PlayCommandPersistenceRepository` interfaces, mirroring the Charts persistence contracts. (Slice 1 — Play domain + pure logic — is DONE and green at `4d4fc73`.)

## Module
Building Play from `05-plans/play-module-plan.md` (authoritative; full slice breakdown 1–10 backend, 11–12 UI). Backend-first per granted discretion; mobile/desktop UI slices await a scaffold decision.

## Session protocol (in force)
See `agents.md` › "Session continuity protocol": commit + push at clean breakpoints; the Play plan + this NOW.md + `docs/session-summary.md` are the handoff (a fresh session resumes from them).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Mirror `packages/db/src/charts-repository-contracts.ts` exactly in shape
- Add `packages/db/src/play-repository-contracts.ts`: `PlayPersistenceReadOptions`/`PlayPersistenceWriteOptions` (reuse `RepositoryReadOptions`/`WriteOptions` + require `actorId` via superRefine); one `*PersistenceRecordSchema` per object (TrackSet, PlayArrangement, PlaySection, PlayCue, PadLayer, PlaybackState — the durable persistence shapes from the plan's persistence-model section, snake_case-mappable, JSON for `trackRefs`/`sectionOrder`); per-operation `*PersistenceInputSchema`; `readOperation`/`writeOperation` wrappers; `PlayQueryPersistenceRepository` + `PlayCommandPersistenceRepository` interfaces (list/get per object, save/upsert, update, remove cue, setPlaybackState)
- Export from the db barrel
- Contract tests (round-trip parse, `.strict()` rejection, actor-id requirement, key invariants) mirroring `charts-repository-contracts.test.ts`

## Out of scope
Migration (slice 3) · SQLite adapter (slice 4) · GraphQL/service · offline-sync · UI

## Progress
- [ ] Re-sync with the Charts persistence contracts + the Play plan persistence-model section
- [ ] `play-repository-contracts.ts` (records + inputs + options + repo interfaces)
- [ ] Barrel export
- [ ] Contract tests
- [ ] Run lint, typecheck, test green
- [ ] Release check + session-summary + NOW.md advance
- [ ] Commit + push

## Done when
The Play persistence contracts exist (records + per-operation inputs + option guards + query/command repository interfaces) with contract tests, default gates green, committed and pushed.

## Next task after this
Play slice 3: the Play migration artifact (`packages/db/src/play-migrations.ts`, `PlayInitialSchemaMigration` — six tables + indexes + CHECKs), then slices 4–10 per `05-plans/play-module-plan.md` (SQLite adapter → GraphQL+service → persistence service → offline queue → replay → events → desktop replay runtime). UI slices 11–12 await the scaffold decision.
