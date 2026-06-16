# NOW

## Task
Implement adapter-free API job status transition contracts for Planning CCLI reporting workers.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Extend the API async job boundary with validated job status transition inputs
- Support adapter-free transitions for queued jobs to `running`, `succeeded`, or `failed`
- Preserve tenant scope, actor/request-safe metadata, job IDs, job type, enqueue order, original enqueue timestamp, updated timestamp, and bounded safe error messages
- Reject cross-tenant updates, missing jobs, illegal status regressions, failed transitions without safe messages, and non-failed transitions with safe messages
- Add focused API tests for valid transitions, missing/cross-tenant behavior, failed safe-message behavior, and illegal transition rejection
- Keep concrete worker execution, queue infrastructure, retry policies, GraphQL polling endpoints, CCLI/SongSelect vendor calls, credentials, reporting file generation, and UI out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Production queue/broker · worker execution · retry policies · GraphQL polling resolver · CCLI/SongSelect credentials · vendor reporting submission · file exports · UI · notifications

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add validated adapter-free job status transition contracts
- [x] Add focused CCLI reporting job transition tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
API async job handoffs, especially Planning `ccli-reporting`, can update tenant-scoped adapter-free status records through validated transition contracts; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
