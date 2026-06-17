# NOW

## Task
Author the Play module plan (`05-plans/play-module-plan.md`), then begin Play backend slice 1 — mirroring the Charts/Presenter plan format and build rhythm.

## Milestone + why this task
Charts BACKEND is complete end-to-end (slices 1–7b: ChordPro core, persistence contracts, migration, SQLite adapter, GraphQL + in-memory service, persistence-backed service, offline-sync queue, replay decision/status/coordinator — all green and pushed).

The remaining Charts work — **slice 8, the Charts mobile UI** — is DEFERRED: `apps/mobile` is a bare workspace, and scaffolding the Expo/React-Native app (navigation, GraphQL client, local-queue integration, RN test setup) is a larger architectural step with several shaping sub-decisions and is hard to verify autonomously. It is flagged for a decision with the user. To keep making verifiable progress meanwhile, advance the next backend module (Play), which is well-served by the established slice-by-slice + gate-green pattern.

## Session protocol (in force)
See `agents.md` › "Session continuity protocol": commit + push at clean breakpoints, write the handoff, hand off to a fresh session.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Read `00-product/vision.md`, `01-architecture/system-map.md`, and `05-plans/charts-module-plan.md` (+ any presenter plan) as the format reference
- Author `05-plans/play-module-plan.md`: the Play module domain objects, offline-first storage model, pure render/transform rules, GraphQL surface, service + persistence + offline-sync shape, and a slice-by-slice breakdown — mirroring the Charts plan's structure and rigor
- Then build Play backend slice 1 (the first domain/pure-logic slice per the new plan), with tests + gates green, committed + pushed, and the usual slice ceremony

## Out of scope
The Charts mobile UI / `apps/mobile` scaffold (deferred — needs a user decision) · Community+ / OBS modules (after Play)

## Progress
- [ ] Read vision + system map + the Charts plan (format reference)
- [ ] Author `05-plans/play-module-plan.md`
- [ ] Play backend slice 1 (domain/pure-logic) + tests + gates green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push

## Done when
`05-plans/play-module-plan.md` exists with a clear slice breakdown, and Play backend slice 1 is implemented, gate-green, committed, and pushed.

## Decision flagged for the user
Charts mobile UI (slice 8) needs the bare `apps/mobile` Expo/React-Native workspace scaffolded — a larger architectural step. Decide whether to (a) scaffold the mobile app now and build the Charts mobile UI, or (b) continue backend-first through Play → Community+ → OBS and return to mobile UIs later. Proceeding with (b) by default.
