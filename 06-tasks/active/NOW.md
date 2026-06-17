# NOW

## Task
Play module, slice 1: the Play domain + pure logic — strict Zod schemas for the six records + enums, and the pure `sequence.ts`/`timing.ts` (arrangement sequence resolution, cue resolution, beat↔time transform, optional key transpose). Backend, no persistence/I/O.

## Module
Building the Play module from `05-plans/play-module-plan.md` (just authored). Play = the desktop playback surface: track sets, arrangements, sections, cues, pad layers, and a durable resumable PlaybackState; offline-first; references opaque media IDs (no raw audio in v1; audio engine/MIDI deferred). Backend slices 1–10 are verifiable now; UI slices 11–12 await a scaffold decision.

## Session protocol (in force)
See `agents.md` › "Session continuity protocol": commit + push at clean breakpoints, write the handoff, hand off to a fresh session. Charts backend (slices 1–7b) is complete + pushed.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `05-plans/play-module-plan.md` (the authoritative plan) and the Charts domain slice as the pattern: `apps/api/src/domain/charts/chordpro.ts` + `chordpro.test.ts` + `index.ts`
- Add `apps/api/src/domain/play/`: strict Zod `.strict()` schemas (branded IDs, tenant-scoped) for TrackSet, PlayArrangement, PlaySection, PlayCue, PadLayer, PlaybackState + the enums (PlaySectionKind, PlayCueAction, PlayCueFireMode, TransportStatus, TrackRole), with the superRefine invariants from the plan (tempoBpm>0, jump⇒targetSectionRef, pad-change⇒padLayerRef, 0≤gain≤1, etc.)
- Add the pure logic: `sequence.ts` (arrangement sequence resolution + cue resolution; flag unresolved entries, don't throw) and `timing.ts` (beat/bar↔time over tempoBpm + meter; deterministic), plus optional key transpose reusing the Charts sharp-enharmonic policy. All pure, no I/O, no Date.now.
- Export via `apps/api/src/domain/play/index.ts` and the domain barrel if there is one
- Unit tests: schema validity/invariants, sequence/cue resolution (including flagged-unresolved), timing determinism/round-trip

## Out of scope
Persistence/contracts (slice 2+) · GraphQL/service · offline-sync · the desktop/mobile UI (slices 11–12, await scaffold decision) · the actual audio engine/MIDI

## Progress
- [ ] Re-sync with the Play plan + the Charts domain slice pattern
- [ ] Play record schemas + enums (with invariants)
- [ ] Pure `sequence.ts` + `timing.ts` (+ optional transpose)
- [ ] Unit tests
- [ ] Run lint, typecheck, test green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push

## Done when
The Play domain records + enums + pure logic exist with invariants and tests, default gates green, committed and pushed.

## Next task after this
Play slice 2: the Play persistence contracts (`packages/db/src/play-repository-contracts.ts`), mirroring the Charts persistence contracts. Then slices 3–10 per `05-plans/play-module-plan.md` (migration → adapter → GraphQL+service → persistence service → offline queue → replay → events → desktop replay runtime). UI slices 11–12 await the scaffold decision.
