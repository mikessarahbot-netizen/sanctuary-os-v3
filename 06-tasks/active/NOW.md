# NOW

## Task
Integrate the Planning setlist ChurchContext projection into the generateSetlist service boundary.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `04-prompts/setlist-generator.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Use the validated `planning-setlist` ChurchContext projection contract in the API Planning command service boundary for `generateSetlist`
- Keep GraphQL resolvers thin and preserve the existing generated-setlist GraphQL contract
- Validate projection payloads before constructing the setlist prompt request
- Preserve AI-safe context, tenant/request metadata, banned/paused-song enforcement, human-review behavior, and no automatic service-item writes
- Add focused service tests for projection usage, metadata propagation, and invalid projection rejection
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production ChurchContext persistence · vendor AI adapter implementation · GraphQL SDL changes · UI components · prompt text changes · automatic service mutations · CCLI/SongSelect credentials

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Wire Planning setlist projection validation into `generateSetlist`
- [x] Add focused service tests for projection usage and rejection paths
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
`generateSetlist` receives and validates the smallest AI-safe Planning setlist ChurchContext projection at the service boundary before prompt execution; existing behavior is preserved; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
