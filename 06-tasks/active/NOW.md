# NOW

## Task
Community+ module, slice 1: the Community domain + pure logic — strict Zod records for the 8 objects + enums, and the pure logic (esp. the consent-aware audience resolver). Backend, no persistence/I/O. Mirror the Charts/Play domain slice.

## Module / authority
Building Community+ from `05-plans/community-plus-module-plan.md` (just authored; authoritative). Community+ = the people/relationships module (members, households, groups, attendance, comms, engagement) — the STRICTEST PRIVACY surface. Charts + Play backends are complete.

## Privacy non-negotiables (this module especially)
- NO raw PII (phone/email/address) in domain records — only opaque `contactChannelRef`s + consent flags (per the plan; raw values live in an external contact-vault boundary).
- Tenant-scope every record. No PII to AI unless `aiPolicyProfile.piiSharingAllowed = true`; AI-bound projections (EngagementSummary etc.) are PII-free BY CONSTRUCTION (refs + counts only).
- Outbound comms require a human-confirmation gate; AI may draft (`origin="ai-drafted"`) but never send. Consent enforced in the pure audience resolver (non-consented suppressed).
- No secrets/credentials in records; redacted safeMessages only in logs.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. Ceremony streamlined per backend slice; consolidated release check at the Community+-backend milestone.

## In scope (slice 1)
- Continue on `feature/presenter-domain-contracts`
- Mirror `apps/api/src/domain/charts/` + `apps/api/src/domain/play/` (schemas + pure logic + index + tests)
- Add `apps/api/src/domain/community/` (or the name matching the plan): strict `.strict()` Zod records for Member, Household, CommunityGroup, GroupMembership, AttendanceRecord, CommunicationMessage, CommunicationRecipient, EngagementSummary + enums, with invariants from the plan; mark PII fields per the plan (opaque refs only — do NOT add raw PII fields)
- Add the pure logic: the consent-aware audience resolver (pure: members + consent + message → eligible recipients, non-consented suppressed, flagged not dropped) + any other pure rules the plan lists (e.g. engagement rollup computation if pure). No I/O, no Date.now.
- Export via the domain barrel
- Unit tests: schema validity/invariants, PII-free EngagementSummary (a test asserting the AI-projectable type cannot carry PII), consent suppression in the audience resolver, pure-rule determinism

## Out of scope
Persistence/contracts (slice 2+) · GraphQL/service · comms send transport · the web admin UI (slice 12, deferred) · offline attendance (optional slice 13)

## Done when
The Community+ domain records + enums + pure logic (incl. consent-aware audience resolver) exist with invariants and tests (incl. a PII-free-projection test), gates green, committed and pushed.

## Next task after this
Community+ slice 2: persistence contracts (`packages/db/src/community-repository-contracts.ts`). Then slices 3–10 per `05-plans/community-plus-module-plan.md` (migration → adapter → GraphQL+service → comms lifecycle/confirmation gate → persistence service → engagement rollup → events → AI assist). Slices 11 (send integration, behind a carrier decision), 12 (web UI), 13 (optional offline attendance) await user decisions. After Community+: the OBS module.
