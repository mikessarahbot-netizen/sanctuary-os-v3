# Planning API Contract Release Check

Date: 2026-06-16
Branch: `feature/planning-readiness-domain`

## Scope
Release check for the current Planning API contract layer against:
- `05-plans/api-plan.md`
- `05-plans/planning-module-plan.md`
- `02-standards/engineering-rules.md`

Checked surfaces:
- Planning GraphQL SDL and resolvers in `apps/api/src/graphql/planning.ts`
- Planning service contracts in `apps/api/src/services/planning/`
- Planning readiness domain in `apps/api/src/domain/planning/`
- API event and job handoff boundaries in `apps/api/src/events/` and `apps/api/src/jobs/`
- Planning persistence contracts in `packages/db/src/planning-repository-contracts.ts`
- Planning setlist ChurchContext contracts in `packages/church-context/src/`

## Evidence
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- Planning GraphQL exposes the planned v1 service/service-item/assignment/readiness/song-library/setlist operations plus approved follow-on CCLI and rehearsal tracking contracts.
- Planning resolvers parse GraphQL args/context with Zod and delegate to services.
- Planning services own role checks, tenant-scope assertions, event/job handoff, and domain validation.
- Planning persistence contracts validate adapter-free read/write operation shapes with tenant/request/actor metadata.

## Gate Results
| Category | Result | Notes |
|---|---|---|
| Thin GraphQL boundary | Pass | `apps/api/src/graphql/planning.ts` validates context/input and delegates to Planning services; no domain logic or vendor calls are in resolvers. |
| Zod trust-boundary validation | Pass | GraphQL args/context, service commands/queries, AI prompt outputs, event envelopes, job requests/statuses, and DB operation shapes are Zod-validated. |
| Tenant scoping | Pass | Service and repository adapter tests cover tenant-scoped reads/writes and mismatch rejection across services, queries, CCLI usage, rehearsal tracking, and readiness. |
| Service-owned role checks | Pass | Planning command, query, readiness, CCLI usage, rehearsal asset visibility, and rehearsal acknowledgement services each assert allowed roles before repository or integration handoff. |
| Human confirmation for publish/cancel | Pass | `UpdatePlanningServiceCommandSchema` requires `confirmationIntent` before `published` or `canceled` status transitions. |
| Validated event handoff | Pass | Planning publishes validated `service.published`, `assignment.statusChanged`, and `readiness.updated` envelopes with tenant, actor, request, aggregate, schema version, and payload validation. |
| Validated async job handoff | Pass | CCLI reporting uses validated job request/status contracts and job polling, with tenant-scoped lookup and safe error-message bounds. |
| AI setlist safety | Pass | Setlist generation uses a validated ChurchContext projection, validates untrusted generator output, returns human-review-required suggestions, and does not persist service items. |
| Planning v1 domain coverage | Pass with follow-up | Service CRUD, ordered items, song refs, notes, assignments, readiness, templates, CCLI usage, rehearsal asset visibility, and rehearsal acknowledgements are contract-covered. Production DB adapters, UI, realtime transport, notification delivery, and vendor adapters remain future slices. |
| Plan alignment | Pass with documented drift | `05-plans/planning-module-plan.md` lists the first GraphQL operations and v1 scope. Current GraphQL also includes approved follow-on operations for CCLI jobs, CCLI usage logs, rehearsal asset visibility, and rehearsal acknowledgements based on completed active tasks and handoffs. |
| Security/privacy | Pass | No secrets, vendor credentials, raw media payloads, or PII-to-AI paths were added in this contract layer; ChurchContext setlist projections use AI-safe schemas. |
| Rollback risk | Low | Current release-check is documentation-only; underlying Planning contract slices are additive and covered by tests. |

## Findings
### P1: No Blocking Contract Defects Found
The current Planning API contract layer satisfies the active standards for thin resolvers, service-owned role checks, tenant scoping, Zod validation, explicit publish/cancel confirmation, validated event/job handoff, and AI review-before-write behavior.

### P2: Planning GraphQL Surface Exceeds The Original Plan List
`05-plans/planning-module-plan.md` lists the initial GraphQL query/mutation set, while the implemented API also exposes CCLI reporting job, CCLI usage log, rehearsal asset visibility, and rehearsal acknowledgement operations. This is acceptable drift because those operations are in Planning v1 domain scope and were introduced through later active tasks, but the plan should be refreshed before a public API freeze.

Recommended next action:
- Update `05-plans/planning-module-plan.md` with the now-approved Planning GraphQL v1 extension operations before moving this branch toward a PR/release tag.

### P3: Production Integration Work Remains Deliberately Out Of Scope
The current layer is adapter-free and well-tested, but production database adapters, actual Auth0 claim resolution, WebSocket transport, queue workers, CCLI vendor calls, notification delivery, media storage, and UI workflows are not implemented here.

Recommended next action:
- Choose the next implementation slice from one production boundary at a time, starting with plan documentation refresh or the first production adapter needed by the app surface.

## Recommendation
Go for the Planning API contract layer as an internal foundation checkpoint. Continue with a small follow-up slice to refresh `05-plans/planning-module-plan.md` so the plan reflects the approved CCLI and rehearsal tracking GraphQL extensions before starting the next module or production adapter.
