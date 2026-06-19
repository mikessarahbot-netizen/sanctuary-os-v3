# NOW

## Task
OBS module, slice 9: the OBS WebSocket events — add the durable OBS state events (e.g. stream started/stopped, scene changed, action dispatched) to the API event union with `.strict()` SECRET-FREE + PII-FREE coarse payloads + tenant/aggregate scope superRefines, emitted after durable commits. Mirror the play/community events. (OBS slices 1–8 done + green at `0ee0e4d`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Event payloads must carry NO secrets (no host/password/token/streamKey/connection details) and NO PII — only opaque refs (connectionProfileRef, sceneRef, actionIntentId) + coarse status. High-frequency telemetry stays off the union. Charts + Play + Community+ backends complete; OBS slices 1–8 done.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 9)
- Continue on `feature/presenter-domain-contracts`
- Mirror the play/community events: read `apps/api/src/events/index.ts` (the union + the play/community payloads + scope superRefines + how community/play emit after durable commits in their `in-memory.ts`) and `apps/api/src/services/obs/in-memory.ts` (the durable commit points — a successful dispatch [stream/scene change], a catalog refresh, a confirmed action — to hook emission)
- Add `.strict()` SECRET-FREE + PII-FREE OBS event payloads to the API event union per the plan's event set (e.g. `obs.streamStateChanged`, `obs.programSceneChanged`, `obs.actionDispatched` — match the plan's exact names; use the plan's authoritative set over looser wording here), each with the tenant/aggregate scope superRefine (tenant + connectionProfileRef / actionIntentId)
- Wire emission via the injected event publisher (same mechanism community/play use — optional injected publisher, a publishObsEvents reducer, per-event factories, awaited AFTER the durable commit) in `apps/api/src/services/obs/in-memory.ts`. Emit only on SUCCESS (a succeeded dispatch / a real state change) — never on a `requested`/`failed`-without-state-change. Match the established in-memory-only emission scope.
- Tests: event payload validation (valid + scope-mismatch rejected) + a SECRET-FREE + PII-FREE payload assertion (reject host/password/token/streamKey + name/contact keys) + emit-after-commit wiring (a successful dispatch emits the right event; no emission on a rejected/unconfirmed action)
- Do not change the GraphQL surface

## Done when
The OBS events are in the API event union with strict secret-free + PII-free payloads + scope superRefines, emitted after successful durable commits, covered by validation + secret/PII-free + wiring tests, gates green, committed and pushed.

## Next task after this
OBS slice 10 (final OBS backend slice): AI assist — a reviewable action SUGGESTION that creates a `requested`, origin="ai-suggested" ObsActionIntent which can NEVER auto-confirm/dispatch (the slice-7 gate still blocks it); smallest PII-free projection; injected AI port; Zod-validated output. After slice 10 the OBS backend is COMPLETE → write `07-reviews/architecture/obs-backend-release-check.md`, and the autonomously-buildable backend across ALL FOUR modules (Charts, Play, Community+, OBS) is done. Then the remaining build is UIs + live integrations (real obs-websocket, desktop/mobile shells, operator UIs) — all of which need the user (surface decision + external connections + visual verification).
