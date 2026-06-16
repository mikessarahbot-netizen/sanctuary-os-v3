# NOW

## Task
Implement an adapter-free validated API job dispatcher for Planning CCLI reporting handoff.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add an adapter-free job dispatcher implementation for API async job requests
- Validate `ccli-reporting` job requests at the dispatcher boundary
- Preserve tenant scope, actor/request-safe metadata, job type, deterministic ordering, and job IDs for assertions
- Add focused API tests for dispatcher validation, ordering, malformed request rejection, and CCLI reporting job handoff
- Keep concrete queue infrastructure, retries, polling endpoints, CCLI/SongSelect vendor calls, credentials, reporting file generation, and UI out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production queue/broker · retry worker · polling GraphQL/API endpoint · CCLI/SongSelect credentials · vendor reporting submission · file exports · UI · notifications

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add validated adapter-free API job dispatcher
- [x] Add focused CCLI reporting job handoff tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
API async job requests, especially Planning `ccli-reporting`, can be exercised through a validated adapter-free dispatcher that records ordered job handoffs with tenant/actor/request-safe metadata; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
