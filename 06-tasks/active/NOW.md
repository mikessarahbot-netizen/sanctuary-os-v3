# NOW

## Task
Community+ module, slice 9: the Community WebSocket events — add the module's events (member/household/group/attendance/communication) to the API event union with `.strict()` payloads + tenant/aggregate scope superRefines, emitted after durable commits. PII-FREE payloads (refs/counts only — never names/contact values). Mirror the presenter/play events. (Community+ slices 1–8 done + green at `1ba26ff`.)

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (authoritative). Strictest-privacy module. Charts + Play backends complete.

## Privacy non-negotiable (this slice especially)
Event payloads must carry NO PII — only opaque refs (memberRef, groupId, messageId, occasionRef) + status/counts. A subscriber must not learn names/contact values from an event. Add a test asserting the event payloads reject/῀omit PII keys.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone (after slice 10).

## In scope (slice 9)
- Continue on `feature/presenter-domain-contracts`
- Mirror the presenter/play events: read `apps/api/src/events/index.ts` (the union + the presenter/play event payloads + scope superRefines + how play emits after durable commits in `services/play/in-memory.ts`) and `apps/api/src/services/community/in-memory.ts` (the commit points to hook emission)
- Add `.strict()` PII-FREE Community event payloads per the plan (e.g. `member.updated`, `communityGroup.updated`, `attendance.recorded`, `communication.queued`, `communication.sent` — match the plan's exact event set) to the API event union, each with the tenant/aggregate scope superRefine
- Wire emission via the injected event publisher (same mechanism play uses) after the relevant durable commits in the in-memory service; do NOT emit on the persistence path if play doesn't (match the established scope)
- Tests: event payload validation (valid + scope-mismatch rejected) + a PII-FREE payload assertion + emit-after-commit wiring tests
- Do not change the GraphQL surface

## Done when
The Community+ events are in the API event union with strict PII-free payloads + scope superRefines, emitted after durable commits, covered by validation + PII-free + wiring tests, gates green, committed and pushed.

## Next task after this
Community+ slice 10: AI assist — reviewable draft suggestions (e.g. a communication draft) using the smallest PII-free ChurchContext projection, Zod-validated output, NEVER auto-sending (drafts go through the human-confirm gate; origin="ai-drafted"); mirror `04-prompts/` spec conventions + the ai-prompt-standards. After slice 10 the COMMUNITY+ BACKEND IS COMPLETE → write `07-reviews/architecture/community-backend-release-check.md`. Then the OBS module (final; obs-websocket + human-confirm gates). UI slices await the user's surface decision.
