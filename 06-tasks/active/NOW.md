# NOW

## Milestone
**All three module backends are complete: Charts, Play, Community+** (each domain → persistence → GraphQL → services → events, offline-sync where applicable, AI assist where applicable). All green and pushed at `3dc6ac3`. Gates: db 403 · api 572 (+2 skipped) · desktop 89 · church-context 5. See the three `*-backend-release-check.md` files in `07-reviews/architecture/`.

## Task
Author the OBS module plan (`05-plans/obs-module-plan.md`) — the FINAL module — then begin its backend slice 1. Mirror the established plan format + backend rhythm.

## OBS non-negotiables (critical)
OBS controls live streaming via obs-websocket v5. Per the engineering rules: **stream-start, stream-stop, and OBS scene/source automation REQUIRE a human-confirmation gate** — model every such action as a confirmation-gated, never-auto operation (like the Community+ comms send gate / Charts removeChartAnnotation intent). The OBS connection is an INJECTED port (faked in tests) — NO real obs-websocket calls in tests. Tenant-scope everything; no secrets/credentials (OBS host/password) in domain records — only opaque connection refs.

## Direction context
All UIs remain deferred (no frontend exists; not autonomously gate-verifiable — needs the user to pick a surface). Per the standing `/goal` (never countermanded), proceeding hands-off with the last gate-verifiable backend module (OBS), then the build's remaining work is UIs + the deferred integration/UI slices — which need the user. Concern logged: there is still no runnable UI. Will switch to a UI or stop on the user's word ("runnable" / "stop").

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (this step)
- Continue on `feature/presenter-domain-contracts`
- Read `00-product/vision.md` + `01-architecture/system-map.md` + `01-architecture/` integrations (for OBS's role + obs-agent), `02-standards/engineering-rules.md` (the human-confirm non-negotiable), and `05-plans/{charts,play,community-plus}-module-plan.md` (format references). There is an `obs-integrator` skill + a `packages/obs-agent` workspace — check them.
- Author `05-plans/obs-module-plan.md`: domain objects (OBS connection ref, scene, source, stream/recording state, scene-action intent), the human-confirm-gated command model, the injected obs-websocket port boundary, persistence model (SQLite, no secrets), GraphQL surface (confirmation-gated mutations), service shape, events, and a numbered backend slice breakdown (marking backend vs UI). Flag assumptions.
- Then build OBS backend slice 1 (domain/pure-logic), tests + gates green, ceremony, commit/push

## Done when
`05-plans/obs-module-plan.md` exists with a clear slice breakdown + the human-confirm-gate model, and OBS backend slice 1 is implemented, gate-green, committed, and pushed.

## Next
OBS backend slices. After OBS: the remaining build is UIs (Charts/Play/Community+/OBS) + the deferred integration slices (live comms carrier, send transport) — all of which need the user (surface decision + visual verification + external-account/connection decisions). At that point the autonomously-buildable backend is essentially complete.
