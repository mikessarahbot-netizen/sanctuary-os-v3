# Planning API Contract Release Check

Date: 2026-06-16
Branch: `feature/planning-api-contract-release-check`
Base: `feature/planning-readiness-domain` at `504431d`

## Scope
Audited the current Planning API/domain/service/GraphQL contracts against:

- `05-plans/api-plan.md`
- `05-plans/planning-module-plan.md`
- `02-standards/engineering-rules.md`
- `06-tasks/active/NOW.md`

This review covers contract readiness only. It does not add runtime features, public operations, UI, vendor adapters, database migrations, queue workers, or notification delivery.

## Release Gate Result
Not ready for a GraphQL contract release until the readiness enum serialization mismatch is fixed and covered by an executable SDL/schema check.

## Findings

### P1 - `PlanningReadinessBand` does not match the service/domain value for `needs-attention`

GraphQL declares `PlanningReadinessBand.needs_attention` because GraphQL enum values cannot contain hyphens (`apps/api/src/graphql/planning.ts:94`). The domain, DB contract, event payload, and readiness service use and return `needs-attention` (`apps/api/src/domain/planning/readiness.ts:250`, `packages/db/src/planning-repository-contracts.ts:35`, `apps/api/src/events/index.ts:20`, `apps/api/src/services/planning/readiness.ts:99`).

Impact: any real GraphQL execution of `serviceReadiness` or `refreshReadinessScore` that returns a needs-attention result will not serialize against the declared enum unless a resolver-level mapper is introduced or the SDL field is changed away from a GraphQL enum. Current resolver tests call resolver functions directly and assert raw JS values, so they do not exercise GraphQL enum serialization.

Recommended fix: add explicit enum mapping at the GraphQL boundary, for example `needs-attention` <-> `needs_attention`, and add a schema/execution test that covers both `serviceReadiness` and `refreshReadinessScore` returning the middle band.

### P2 - GraphQL SDL is only string-checked, not executable-schema checked

The Planning GraphQL tests assert that expected SDL snippets exist (`apps/api/src/graphql/planning.test.ts:300`, `apps/api/src/graphql/planning.test.ts:341`) and then invoke resolver functions directly (`apps/api/src/graphql/planning.test.ts:560`, `apps/api/src/graphql/planning.test.ts:743`, `apps/api/src/graphql/planning.test.ts:898`, `apps/api/src/graphql/planning.test.ts:1132`). This is useful for delegation, but it does not validate that the SDL can be composed with the root schema, that enum values serialize correctly, or that field nullability matches returned values.

Impact: contract-shape defects can pass `pnpm test` while failing in a real GraphQL server. The readiness enum mismatch above is the immediate example.

Recommended fix: add a focused Planning GraphQL contract test that builds the schema from `planningGraphqlTypeDefs` plus the root scaffolding and executes representative query/mutation selections for all released Planning operations.

## Passing Checks Observed

- Planning v1 GraphQL coverage is broad: planned queries and mutations are declared in SDL (`apps/api/src/graphql/planning.ts:461`, `apps/api/src/graphql/planning.ts:474`), including recent CCLI usage, CCLI reporting job, rehearsal asset visibility, and rehearsal acknowledgement contracts.
- Resolvers remain thin: they parse context/input with Zod and delegate to services (`apps/api/src/graphql/planning.ts:705`, `apps/api/src/graphql/planning.ts:778`, `apps/api/src/graphql/planning.ts:924`).
- Service-owned role checks are present for command, query, readiness, CCLI usage, rehearsal asset visibility, and rehearsal acknowledgement services (`apps/api/src/services/planning/commands.ts:815`, `apps/api/src/services/planning/queries.ts:312`, `apps/api/src/services/planning/readiness.ts:122`, `apps/api/src/services/planning/ccli-usage.ts:285`).
- Tenant and aggregate scope guards validate repository/service returns before exposing data (`apps/api/src/services/planning/commands.ts:825`, `apps/api/src/services/planning/queries.ts:322`, `apps/api/src/services/planning/ccli-usage.ts:294`, `apps/api/src/services/planning/rehearsal-assets.ts:216`, `apps/api/src/services/planning/rehearsal-acknowledgements.ts:239`).
- Publish/cancel requires explicit confirmation intent before destructive service status transitions (`apps/api/src/services/planning/commands.ts:156`) and publishes validated `service.published` events only after the service update path (`apps/api/src/services/planning/commands.ts:451`).
- AI setlist generation validates the ChurchContext projection and AI output, returns `needsReview: true`, and does not persist generated setlists (`apps/api/src/services/planning/commands.ts:121`, `apps/api/src/services/planning/commands.ts:581`, `packages/church-context/src/projection-contracts.ts:86`).
- Event handoff is adapter-free and validates event-specific payload/schema-version pairs (`apps/api/src/events/index.ts:43`).
- CCLI reporting uses an adapter-free job + poll boundary with validated payloads, status records, tenant lookups, and safe failed-job messages (`apps/api/src/jobs/index.ts:14`, `apps/api/src/jobs/index.ts:70`, `apps/api/src/jobs/index.ts:129`, `apps/api/src/services/planning/ccli-usage.ts:195`).
- Planning v1 domain coverage aligns with the plan: service CRUD/order/items, assignment status, readiness, AI setlist generation, template duplication, CCLI usage, rehearsal asset visibility, and rehearsal acknowledgements are represented in service/repository contracts.

## Out Of Scope Confirmed

No evidence found in this slice of new vendor CCLI/SongSelect calls, media storage, queue workers, notification delivery, database migrations, UI, OBS control, or raw media payload handling.

## Validation

Passed on 2026-06-16:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` - 15 API test files, 137 API tests; 1 church-context test file, 5 tests; 2 DB test files, 14 tests.

## Recommended Next Slice

Fix the GraphQL readiness band contract and add executable Planning GraphQL contract coverage. After that, rerun the release-check gates and use the same review file as the acceptance artifact for the next release-readiness pass.
