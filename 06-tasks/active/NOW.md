# NOW

## Task
Bind the Presenter GraphQL request handler to a concrete Node `http` listener so the API can serve requests.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/api/src/graphql/transport.ts`, and `apps/api/src/graphql/presenter-schema.ts`
- Add a thin Node `http` adapter that reads a JSON request body, invokes `createPresenterGraphqlRequestHandler`, and writes the `{ status, body }` as JSON, with injected dependencies (schema, auth boundary, port/host) so it stays testable
- Validate the request body (Zod) and reject malformed JSON / non-POST / wrong path with appropriate status codes; never log secrets or tokens
- Add a `createPresenterGraphqlHttpServer` factory returning a startable/stoppable server handle (do not bind to a fixed port in tests)
- Add unit tests for the request/response adapter using a fake request object (no real socket) covering a valid POST, malformed body, and a non-POST method; optionally a listen/stop smoke on an ephemeral port
- Keep this slice the `http` binding only; do not add deployment config, TLS, the desktop tail, or wire planning

## Out of scope
Deployment/runtime/TLS config · service-side conflict detection · desktop process main / Tauri spawn / UI · planning schema wiring · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the transport handler and schema factory
- [ ] Add the Node `http` request/response adapter over the handler
- [ ] Add the `createPresenterGraphqlHttpServer` start/stop factory
- [ ] Add adapter unit tests (valid POST / malformed body / non-POST)
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the http listener slice
- [ ] Session handoff

## Done when
A thin Node `http` adapter serves the Presenter GraphQL handler (request parsing, method/path checks, JSON response), is covered by fake-request unit tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Wire the Presenter command service to throw `PresenterDomainError` per real conflict condition (with tests), then return to the desktop tail (process `main`, Tauri sidecar spawn, minimal status UI).
