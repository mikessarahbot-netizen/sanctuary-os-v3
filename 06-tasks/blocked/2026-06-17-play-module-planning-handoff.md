# Handoff — Play module planning + backend slice 1

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: Charts backend complete (slices 1–7b), all green + pushed. Charts mobile UI (slice 8) deferred pending a mobile-scaffold decision with the user.

## Resume
1. Read order: `agents.md` (note "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `06-tasks/active/NOW.md`.
2. Author `05-plans/play-module-plan.md` mirroring `05-plans/charts-module-plan.md`, then build Play backend slice 1 per `NOW.md`.

## Pattern to mirror
- `05-plans/charts-module-plan.md` — plan structure (domain objects, offline-first, pure rules, slice breakdown)
- The Charts build itself as the reference implementation rhythm: domain/pure-logic → persistence contracts → migration → SQLite adapter → GraphQL + in-memory service → persistence-backed service → offline-sync queue → replay. Reuse the same packages/apps layout and test discipline (recording-executor + node:sqlite smokes; --max-warnings=0; injected clocks; no Date.now in libs).

## Open decision (for the user)
Charts mobile UI requires scaffolding the bare `apps/mobile` Expo/React-Native workspace. Either scaffold it now (and build Charts + Play mobile UIs) or continue backend-first (Play → Community+ → OBS) and return to mobile later. Default: backend-first.

## Upcoming
Play backend slices, then Community+, then OBS. Mobile UIs (Charts, Play, …) once the mobile-app scaffold is decided.
