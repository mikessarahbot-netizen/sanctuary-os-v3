# NOW

## Milestone
The **entire Play module backend is complete (slices 1–10)**, including the desktop replay runtime — all green and pushed at `16f856d`. Charts backend is also complete. Gates: db 347 · api 408 (+2 skipped) · desktop 89 · church-context 5.

## Task
Author the Community+ module plan (`05-plans/community-plus-module-plan.md`), then begin its backend slice 1 — mirroring the Charts/Play plan format and the proven backend build rhythm.

## Direction context
All UIs remain deferred (no frontend exists; a UI is not autonomously gate-verifiable — needs the user to pick a surface + eyeball it; see the prior NOW.md decision section / `docs/session-summary.md`). Per the user's "continue at your discretion" + the goal hook, proceeding hands-off with GATE-VERIFIABLE backend: Community+ (plan → backend), then OBS. UIs (Charts + Play) and the live-server network-executor gap await the user.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at each module-backend milestone.

## In scope (this step)
- Continue on `feature/presenter-domain-contracts`
- Read `00-product/vision.md` + `01-architecture/system-map.md` (to learn what Community+ is) and `05-plans/charts-module-plan.md` / `05-plans/play-module-plan.md` (format references)
- Author `05-plans/community-plus-module-plan.md`: domain objects, privacy posture (Community+ likely involves people/PII — apply the no-PII-to-AI rule + tenant scope rigorously), pure rules, persistence model, GraphQL surface, service + offline-sync shape (if offline-first applies), and a numbered backend slice breakdown, marking backend vs UI slices. Flag assumptions where the vision underspecifies.
- Then build Community+ backend slice 1 (domain/pure-logic), tests + gates green, ceremony, commit/push

## Done when
`05-plans/community-plus-module-plan.md` exists with a clear slice breakdown, and Community+ backend slice 1 is implemented, gate-green, committed, and pushed.

## Next
Community+ backend slices, then the OBS module (plan → backend; note OBS involves obs-websocket + human-confirm gates for stream/scene actions — partial autonomous verifiability). UIs for all modules await the user's surface decision.

## Tracked follow-ups
- GraphQL enum hyphen/underscore mismatch (Charts + Play) — background task `task_85338bf7`.
- Network-executor `$input: JSON!` vs typed server inputs (presenter + play) — live-server replay gap; needs a JSON scalar / typed documents.
- `play.cueFired` emits on `addPlayCue` until a real fire-cue transport action exists.
- Play scope assumptions (audio engine / MIDI / media storage deferred) — confirm with product owner.
