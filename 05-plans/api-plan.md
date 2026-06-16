# API Plan

## Purpose
Central orchestration layer. Exposes GraphQL, enforces auth, assembles ChurchContext, coordinates integrations, publishes realtime events.

## Layer map
```
graphql/        → resolvers + schema (thin, delegate to services)
services/       → use-case logic, transaction boundaries
domain/         → pure business rules
integrations/   → vendor adapters (Claude, Whisper, CCLI, Twilio, Auth0, storage)
auth/           → role resolution, tenant scoping
context/        → ChurchContext builders
events/         → WebSocket publishing
jobs/           → async/scheduled tasks
```

## Request lifecycle
1. Parse and Zod-validate GraphQL input.
2. Resolve identity through Auth0 claims.
3. Load tenant and role grants.
4. Delegate to a service function.
5. Run domain logic and persistence in the service layer.
6. Publish validated events after successful commits.
7. Return typed response data without leaking internal/vendor errors.

## Auth/tenancy
- Auth0 → identity
- Every query/mutation tenant-scoped
- Role grants enforced in services, not resolvers
- Roles: super_admin · church_admin · worship_leader · planner · musician · volunteer · viewer
- Cross-tenant access is denied by default, including background jobs and integration callbacks

## Validation rule
Zod at: GraphQL input · AI output · webhook/event payloads · integration adapters

## Error model
- User-correctable errors return stable codes and concise messages
- Vendor failures are normalized by integration adapters
- Validation failures do not expose raw payloads
- Authorization failures do not reveal whether cross-tenant resources exist

## Async ops (use job + poll pattern)
Bulk notifications · attendance forecast · large comms drafts · CCLI reporting · media processing

## AI service pattern
Resolver → Service (validate + assemble context) → ai-engine fn → Zod validate → log usage → return to client with `needsReview` flag

## Event rules
- Events are emitted only after durable state changes commit
- Event payloads include tenant ID, actor ID when available, aggregate ID, event type, and schema version
- Stream-start, stream-stop, destructive mutations, and AI-suggested writes require human-confirmed intent before event publication

## First scaffold expectations
- Create folders only when the active task calls for scaffolding
- Keep resolvers thin and unimplemented until their service contracts are defined
- Do not add vendor SDK calls outside `integrations/`
- Do not bypass ChurchContext builders for AI features
