# NOW

## Task
OBS module, slice 10 (FINAL OBS backend slice): AI assist — a reviewable action SUGGESTION that creates a `requested`, origin="ai-suggested" ObsActionIntent which can NEVER auto-confirm or auto-dispatch (the slice-7 gate still blocks it; a human must confirm). Smallest PII-free projection; injected AI port; Zod-validated output. (OBS slices 1–9 done + green at `8ea9265`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). AI may only SUGGEST an action (→ a `requested` intent); it can never confirm or dispatch. Mirror the Community+ AI-assist pattern (`apps/api/src/services/community/ai-draft.ts` + the planning AI pattern). Charts + Play + Community+ backends complete; OBS slices 1–9 done.

## Safety / AI non-negotiables (this slice)
- AI output is Zod-validated; malformed → typed error, no intent created.
- The AI suggestion becomes an ObsActionIntent with status `requested`, origin `ai-suggested` — it goes through the SAME slice-7 confirm→dispatch gate. AI can NEVER reach confirmed/dispatched. (Already structurally guaranteed by slice 7; add a test re-proving an AI-suggested intent can't self-dispatch.)
- The AI projection is PII-free + SECRET-FREE (scene/source refs + coarse state only — no connection secrets).
- The AI provider is an INJECTED port (faked in tests) — NO real API calls in tests.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 10)
- Continue on `feature/presenter-domain-contracts`
- Read the plan's AI-assist section + `02-standards/ai-prompt-standards.md` + `04-prompts/` (mirror the spec format; the Community comms-drafter spec `04-prompts/comms-drafter-community.md` is the closest example) + `apps/api/src/services/community/ai-draft.ts` (the injected-port + PII-free projection + Zod-validated output + create-draft pattern to mirror)
- Add the OBS AI-assist capability: a versioned prompt spec in `04-prompts/` (e.g. an "obs-action-suggester"), a Zod output schema for the suggested action (action kind + target scene/source ref + rationale — refs only, no secrets), an injected `ObsAiSuggestionPort`, and a service operation (`suggestObsActionWithAi`) on both adapters that builds the smallest PII-free/secret-free projection (current scene/source catalog refs + coarse stream state), calls the port, Zod-validates, runs the pure eligibility checker, and creates a `requested` ObsActionIntent with origin `ai-suggested` (which CANNOT self-confirm/dispatch — the slice-7 gate holds)
- Update both the in-memory and persistence adapters + the service interface consistently
- Tests: AI port faked — (a) the projection is PII-free + secret-free (no host/password/token/streamKey, no PII); (b) malformed AI output rejected by Zod (typed error, no intent); (c) the produced intent is origin="ai-suggested" + status `requested` and CANNOT be dispatched without a human confirmObsAction (re-prove the gate); (d) tenant scope; (e) a valid fake suggestion round-trips

## Done when
The OBS AI-suggestion capability exists (PII-free/secret-free projection, Zod-validated output, injected port, suggestion→requested intent that can't self-dispatch), covered by faked-port tests proving the gate + PII/secret-free + validation, gates green, committed and pushed. Then write `07-reviews/architecture/obs-backend-release-check.md` (consolidated, slices 1–10) — and `06-tasks/active/NOW.md` records that the autonomously-buildable backend across ALL FOUR modules (Charts, Play, Community+, OBS) is COMPLETE.

## Next task after this (the build's remaining frontier — needs the user)
The remaining Sanctuary OS work is the parts that are NOT autonomously gate-verifiable and need the user's decisions: the UIs for every module (Charts/Play/Community+/OBS) which need a frontend scaffold + surface decision + visual verification; the live integrations (real obs-websocket in packages/obs-agent, the comms send carrier, the desktop/mobile app shells + their replay runtimes' live wiring); and the network-executor `$input: JSON!` gap (presenter+play). All of these need the user. The autonomous backend build will be complete after this slice.
