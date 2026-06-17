# NOW

## Task
Add in-memory Presenter services/repositories for GraphQL contract tests and development composition.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current Presenter domain/API contracts
- Add in-memory Presenter repository/service adapters that implement the service contracts behind the GraphQL resolver shells
- Preserve tenant scope, role-check ownership in services, Zod validation, and opaque IDs at boundaries
- Support the planned Presenter query/mutation contracts enough for local development composition and tests
- Keep persistence adapter-free: no database migrations or SQL adapters in this slice
- Add focused tests for tenant scoping, role enforcement, command validation, mutation behavior, and GraphQL composition through in-memory services
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
PostgreSQL Presenter adapters · database migrations · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [ ] Re-sync with required docs and current Presenter contracts
- [ ] Add in-memory Presenter repository/service adapters
- [ ] Add local development composition helpers if needed
- [ ] Add focused Presenter service/composition tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter GraphQL resolver shells can be composed with in-memory Presenter services for local tests/development; services validate inputs, enforce tenant/role boundaries, and keep all out-of-scope integrations absent; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add Presenter persistence contracts or WebSocket event payload contracts, depending on the smallest safe continuation after in-memory service composition.
