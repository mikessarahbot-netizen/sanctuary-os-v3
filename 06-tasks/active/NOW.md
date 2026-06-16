# NOW

## Task
Implement an adapter-free validated Planning event publisher for realtime event handoff.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Add a test-only or adapter-free event publisher implementation for API Planning events
- Validate `service.published`, `assignment.statusChanged`, and `readiness.updated` event envelopes at the publisher boundary
- Preserve event ordering, tenant scope, actor/request-safe metadata, aggregate IDs, schema versions, and payload shapes for assertions
- Add focused API tests that exercise Planning command/readiness services through the event publisher
- Keep concrete WebSocket server, persistence, external broker, delivery retries, UI, and notification fanout out of scope
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Concrete WebSocket transport · production event broker · durable event store · retry queues · UI subscribers · mobile/desktop clients · notifications · vendor integrations

## Progress
- [x] Re-sync with required docs and current implementation
- [x] Add validated adapter-free Planning event publisher
- [x] Add focused command/readiness event publisher tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Planning service event publication can be exercised through a validated adapter-free event publisher that records realtime handoff events in order; gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
