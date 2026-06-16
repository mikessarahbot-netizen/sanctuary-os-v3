# NOW

## Task
Implement Planning generate-setlist command contracts.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Add adapter-free contract support for the planned Planning `generateSetlist(input)` mutation
- Define Zod-validated generate-setlist input/output, command service boundary, and AI prompt request/result contract types needed by the service layer
- Enforce Planning command roles, tenant scope, and human-review semantics for AI-generated setlist suggestions before any persisted write
- Preserve existing Planning GraphQL query/mutation resolver contracts and command/query service behavior
- Add focused API tests for input validation, role checks, tenant/request propagation, AI-result validation, reviewable result shape, and no automatic service mutation
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · vendor SDK integrations · direct Claude/OpenAI calls · automatic writes to service items · CCLI/SongSelect implementation · GraphQL resolver wiring · GraphQL server runtime

## Progress
- [x] Add generate-setlist command/prompt contract schemas
- [x] Add Planning command service generateSetlist boundary
- [x] Add focused API contract tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning `generateSetlist(input)` command contracts are Zod-validated, tenant-scoped, role-gated, reviewable-before-write, adapter-free, covered by focused API tests, committed, pushed, and documented in session handoff.

## Next task after this
Wire Planning GraphQL `generateSetlist(input)` resolver contracts to the Planning command service.
