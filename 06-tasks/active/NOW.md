# NOW

## Task
Community+ module, slice 10 (final backend slice): AI assist — reviewable draft suggestions (e.g. a communication draft) using the smallest PII-free ChurchContext projection, Zod-validated AI output, that NEVER auto-sends (drafts enter the human-confirm gate as origin="ai-drafted"). (Community+ slices 1–9 done + green at `7f07105`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module. Charts + Play backends complete. AFTER this slice the Community+ backend is complete → write the consolidated release check.

## Privacy / AI non-negotiables (this slice)
- AI receives only the smallest PII-free ChurchContext projection; NO PII unless `aiPolicyProfile.piiSharingAllowed = true` (and even then, prefer PII-free). Respect `bannedOrPausedSongIds`/equivalent exclusions if relevant.
- AI output is Zod-validated before use. AI may DRAFT, never SEND: a drafted communication is `origin="ai-drafted"`, status `draft`, and must pass through the existing human-confirmation gate (slice 5) to be queued/sent.
- The AI provider is behind an INJECTED port (fake in tests) — do not make real API calls in tests. Default to the latest Claude model in any real wiring, but keep it injected/config-driven.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 10)
- Continue on `feature/presenter-domain-contracts`
- Read the plan's "AI assist" section + `02-standards/ai-prompt-standards.md` + `04-prompts/` (existing versioned prompt specs — mirror their format) + `packages/ai-engine` (if it has an injected AI port / output-validation pattern to reuse) + any existing AI-assist usage in other modules (search the repo) to mirror the established pattern
- Add the Community+ AI-assist capability: a prompt spec in `04-prompts/` (versioned), a Zod output schema for the suggestion (e.g. a communication draft: subject?/body refs — PII-free inputs), and a service operation (`draftCommunicationWithAi` or per the plan) that builds the smallest PII-free projection, calls the injected AI port, Zod-validates the result, and creates a `draft` message with `origin="ai-drafted"` (which CANNOT self-send — enforced by the slice-5/7 gate)
- Wire it where appropriate (service + optionally a GraphQL mutation that returns the reviewable draft, marked clearly as draft-only). Mirror how other modules expose AI assist if they do.
- Tests: the AI port is faked; assert (a) the projection handed to AI is PII-free, (b) malformed AI output is rejected by Zod, (c) the produced message is origin="ai-drafted" + draft and CANNOT be queued/sent without a human confirmation (the gate still blocks it), (d) tenant scope

## Done when
The Community+ AI-assist draft capability exists (PII-free projection, Zod-validated output, injected AI port, draft-only via the confirm gate), covered by faked-port tests proving PII-free + validation + the no-auto-send gate, gates green, committed and pushed. Then write `07-reviews/architecture/community-backend-release-check.md` (consolidated, slices 1–10).

## Next task after this
The OBS module (final module): author `05-plans/obs-module-plan.md` (note: OBS involves obs-websocket v5 + obs-agent; stream-start/stop + scene/source changes REQUIRE human-confirm gates per the non-negotiables — model these as confirmation-gated, never-auto operations), then build its backend slice-by-slice. There is an `obs-integrator` skill that may help. UI slices for all modules await the user's surface decision.
