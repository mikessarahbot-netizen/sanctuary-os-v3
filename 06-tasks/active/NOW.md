# NOW

## Task
Play module, slice 9: the Play WebSocket events — add `trackSet.updated`, `play.playbackStateChanged`, `play.cueFired` to the API event union with `.strict()` payloads + tenant/aggregate scope superRefines, emitted after durable commits. Mirror the presenter events. (Play slices 1–8 done + green at `8bfaad9`.)

## Module / authority
Building Play from `05-plans/play-module-plan.md` (authoritative; slices 1–10 backend, 11–12 UI). Backend-first.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the Play plan + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Play-backend milestone (after slice 10); gates are the per-slice verification.

## In scope (slice 9)
- Continue on `feature/presenter-domain-contracts`
- Read `apps/api/src/events/index.ts` (the current event union — enumerates planning + presenter events) and the presenter event definitions + their tests to mirror the tenant/aggregate scope superRefine pattern exactly
- Add three `.strict()` Play event payload schemas to the API event union: `trackSet.updated` (tenant + trackSetId scope), `play.playbackStateChanged` (tenant + trackSetId; carries the coarse PlaybackState snapshot fields), `play.cueFired` (tenant + trackSetId + cueId) — each with the tenant/aggregate scope superRefine like the presenter events
- Wire emission points minimally: the Play service/coordinator emit these only AFTER durable state commits (mirror how presenter wires its event emission); keep the high-frequency playhead OFF this union (durable/coarse only, per the plan)
- Export/extend the union as the presenter events are
- Tests: event payload validation (valid + scope-mismatch rejected) + the emit-after-commit wiring (mirror the presenter event tests)

## Out of scope
The desktop Play replay runtime (slice 10) · UI · changing the high-frequency local-bus playhead (stays ephemeral)

## Done when
The three Play events are in the API event union with strict payloads + scope superRefines, emitted after durable commits, covered by validation + wiring tests, gates green, committed and pushed.

## Next task after this
Play slice 10: the desktop Play replay runtime (Node sidecar; mirror the presenter desktop replay runtime — replay-pass + scheduler + error-classifier + runtime-bootstrap + sidecar-entry for Play, on synchronous node:sqlite, engine/transport-agnostic via injected fetch/auth/connectivity). After slice 10 the PLAY BACKEND IS COMPLETE → write `07-reviews/architecture/play-backend-release-check.md` (consolidated). UI slices 11–12 (desktop Play surface, mobile read-only) await the scaffold decision. After Play: author the Community+ module plan, then OBS.
