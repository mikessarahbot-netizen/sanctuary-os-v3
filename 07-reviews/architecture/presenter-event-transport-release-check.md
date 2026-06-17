# Presenter Event Transport Release Check

Date: 2026-06-16  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `1c26fac`

## Result

Pass with follow-ups. The API event transport boundary is ready for the current Presenter contract slice: it validates Presenter event envelopes before transport delivery, wraps events with tenant/aggregate/type route metadata, supports injected transport clients, keeps default tests live-network-free, and does not wire desktop output windows, OBS control, stream actions, raw media payloads, or vendor secrets.

## Scope Reviewed

- `apps/api/src/events/index.ts`
- `apps/api/src/events/index.test.ts`
- `apps/api/src/services/presenter/in-memory.ts`
- `apps/api/src/services/presenter/in-memory.test.ts`
- `apps/api/README.md`
- `05-plans/api-plan.md`
- `05-plans/presenter-module-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| `publishAfterCommit` validation | Pass | `createApiEventTransportPublisher` calls `validateApiEventEnvelope` before creating a transport message or calling the injected client. Invalid Presenter payloads reject with no deliveries. |
| Presenter event envelope validation | Pass | Presenter payload schemas are strict and versioned for `presentation.updated`, `presenter.slideChanged`, `presenter.outputBlanked`, and `presenter.outputRestored`. Tenant and aggregate scope are checked against the payload presentation/tenant. |
| Tenant/aggregate route metadata | Pass | `ApiEventTransportMessageSchema` requires route `tenantId`, `aggregateId`, and `eventType`; schema refinement rejects route/event mismatches. |
| Subscription filtering | Pass | The in-memory transport client filters by tenant, optional aggregate, and optional event types. Cross-tenant delivery is covered by tests. |
| Event ordering | Pass | The in-memory transport records deliveries in send/subscription order, and Presenter service publication chains `publishAfterCommit` calls sequentially. |
| Adapter injection | Pass | Transport is represented by `ApiEventTransportClient`; Presenter services still depend only on the generic `EventPublisher` interface. |
| Live-network-free defaults | Pass | Default transport tests use `createInMemoryApiEventTransportClient`; no WebSocket server or external broker is started. |
| GraphQL-to-transport coupling | Pass | The transport boundary lives under `apps/api/src/events/`; Presenter services and GraphQL contracts are not coupled to a transport implementation. |
| Desktop event bus wiring | Pass | No desktop event bus, output window, or Tauri integration is introduced in this slice. |
| OBS/stream/raw-media payload support | Pass | Strict Presenter event payload schemas reject OBS scene fields, stream control flags, raw media payload fields, and vendor token fields. |
| Checked-in secrets | Pass | The reviewed event transport code and docs do not introduce secrets or environment values. |

## Validation

Validation commands run for this release-check slice:

- Pass: `pnpm --filter @sanctuary-os/api test -- events/index.test.ts presenter` (22 files, 193 passed, 2 skipped)
- Pass: `pnpm --filter @sanctuary-os/api test:integration:postgres` (2 files, 2 passed, 2 skipped)
- Pass: `pnpm lint`
- Pass: `pnpm typecheck`
- Pass: `pnpm test` (workspace: church-context 5 passed, db 85 passed, api 193 passed/2 skipped)

## Follow-Ups

- Add the production WebSocket/SSE adapter later with explicit authentication, tenant-scoped subscription authorization, and backpressure behavior.
- Add Presenter desktop run-mode/output-window contracts next so the desktop layer can consume these events without introducing live output-window wiring prematurely.
- Add a local sync queue/replay plan before offline Presenter delivery work.
- Decide durable outbox/replay semantics when the API moves from in-memory transport tests to production event delivery.
