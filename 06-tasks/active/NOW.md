# NOW

## Task
Add Presenter GraphQL contract and resolver shells.

## In scope
- Continue from pushed branch `feature/presenter-module-plan`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current Presenter domain/service contracts
- Add Presenter GraphQL SDL/query/mutation contract surface matching the Presenter plan and service contract names
- Add resolver shells that Zod-validate GraphQL-style args/context and delegate to injected Presenter query/command services
- Keep resolvers thin and free of domain logic, persistence, vendor SDKs, OBS control, UI, or desktop output implementation
- Add tests for SDL operation names, resolver validation, tenant/actor context propagation, delegation, service error propagation, and rejection of stream/OBS/raw-media fields
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Presenter service implementation · persistence adapters · database migrations · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and Presenter contract code
- [x] Add Presenter GraphQL SDL/operation contracts
- [x] Add thin Presenter resolver shells
- [x] Add focused Presenter GraphQL tests
- [x] Run lint, typecheck, and tests
- [x] Commit and push slice
- [x] Session handoff

## Done when
Presenter GraphQL contract/resolver shells exist, validate inputs/context with Zod, delegate to Presenter services, preserve tenant/request/actor context, reject out-of-scope fields, pass default gates, and are committed/pushed with handoff.

## Next task after this
Add in-memory Presenter services/repositories for contract tests and development composition.
