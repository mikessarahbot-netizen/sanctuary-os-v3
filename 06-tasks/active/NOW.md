# NOW

## Task
Build the API HTTP/GraphQL server transport: an injected-`fetch`-style request handler that resolves the actor from the auth header, conveys `requestId`, executes the GraphQL schema, and maps service errors to `extensions.code` conflict codes.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/api/src/graphql/index.ts`, `apps/api/src/graphql/presenter.ts`, `apps/api/src/auth/index.ts`, and the desktop network executor's assumed conventions (bearer auth, `x-request-id`, `extensions.code`)
- Add a transport-agnostic GraphQL request handler (`{ headers, body }` → `{ status, body }`) that parses the request, resolves the `AuthenticatedActor` via an injected `AuthBoundary.resolveActor` from the `Authorization` header, derives `requestId` from the `x-request-id` header (or a generated fallback), builds the GraphQL context, executes the schema, and serializes `{ data, errors }`
- Map domain/service errors to GraphQL `errors[].extensions.code` using the conflict codes the desktop classifier expects (`STALE_PRESENTATION`, `MISSING_SLIDE`, `THEME_MISMATCH`, `OUTPUT_TARGET_MISMATCH`, `VALIDATION_FAILED`, `AUTHORIZATION_FAILED`); redact internal error text
- Add focused unit tests (fake auth boundary + in-memory services) covering a successful mutation, an unauthenticated request, an idempotency-key passthrough, and a conflict-code mapping, with no live HTTP server, network, or secret
- Keep this slice the request-handler contract only; do not bind a concrete Node `http`/framework listener, add deployment config, or change desktop code

## Out of scope
Concrete Node `http`/framework server binding · deployment/runtime config · desktop process main / Tauri spawn / UI · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the GraphQL schema, context, auth boundary, and desktop conventions
- [ ] Add the transport-agnostic GraphQL request handler with actor/requestId resolution
- [ ] Add the service-error → `extensions.code` conflict mapping
- [ ] Add focused unit tests (success / unauthenticated / idempotency / conflict)
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the API transport slice
- [ ] Session handoff

## Done when
A transport-agnostic GraphQL request handler resolves the actor and `requestId`, executes the schema, and maps service errors to the conflict codes the desktop expects, covered by fake-boundary unit tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Bind the request handler to a concrete Node `http` listener (separate slice), then return to the desktop tail: the process `main`, the Tauri sidecar spawn/supervision, and a minimal status UI.
