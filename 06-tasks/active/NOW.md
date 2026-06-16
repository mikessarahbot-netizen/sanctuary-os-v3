# NOW

## Task
Implement Planning setlist ChurchContext projection contracts in the API context layer.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `04-prompts/setlist-generator.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Define Zod-validated API context projection contracts for `planning-setlist`
- Include only AI-safe setlist inputs: service context, non-PII song library candidates, recent usage summary, church preferences, planning constraints, target set length, AI policy flags, context metadata, and request metadata
- Add an adapter-free context helper that validates `planning-setlist` projection payloads without vendor AI, persistence, GraphQL, or UI
- Add focused API context tests for projection validation, PII exclusion, banned/paused song IDs, and request metadata
- Preserve existing Planning command, query, readiness, GraphQL, rehearsal, and CCLI behavior
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Vendor AI calls · persistence adapters · GraphQL resolver changes · prompt execution · UI components · production ChurchContext assembly · CCLI/SongSelect credentials · automatic service item writes

## Progress
- [x] Define shared Planning setlist ChurchContext projection schemas
- [x] Add API planning-setlist projection request/envelope contracts
- [x] Add adapter-free API context projection envelope helper
- [x] Add focused API and shared context tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
The API context layer can validate and wrap AI-safe Planning setlist ChurchContext projection payloads with request metadata; focused and full gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Integrate the Planning setlist ChurchContext projection into the generateSetlist service boundary.
