# NOW

## Task
Implement adapter-free API job status contracts for Planning CCLI reporting polling.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Extend the API async job boundary with validated job status records and lookup contracts
- Support status lookup for `ccli-reporting` jobs created by the adapter-free dispatcher
- Preserve tenant scope, actor/request-safe metadata, job IDs, job type, enqueue order, status timestamps, and safe error messages
- Add focused API tests for queued job status, tenant-scoped lookup, malformed status rejection, and missing job behavior
- Keep concrete queue infrastructure, worker execution, retries, GraphQL polling endpoints, CCLI/SongSelect vendor calls, credentials, reporting file generation, and UI out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production queue/broker · worker execution · retry policies · GraphQL polling resolver · CCLI/SongSelect credentials · vendor reporting submission · file exports · UI · notifications

## Progress
- [ ] Re-sync with required docs and current implementation
- [ ] Add validated adapter-free job status contracts
- [ ] Add focused CCLI reporting job status tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
API async job handoffs, especially Planning `ccli-reporting`, expose tenant-scoped adapter-free job status records suitable for future polling; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
