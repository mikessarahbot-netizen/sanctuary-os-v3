# NOW

## Task
Add Presenter GraphQL contract and resolver scaffolding based on the Presenter domain schemas.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current API layout
- Add Presenter service contract schemas/interfaces for planned query and mutation operations
- Add Presenter GraphQL SDL placeholders and resolver shells that Zod-validate GraphQL input/context and delegate to Presenter services
- Use planned API names from `05-plans/presenter-module-plan.md`
- Keep resolvers thin; role checks, transactions, event publication, repositories, and persistence stay in future service slices
- Add focused tests for operation names, actor/request propagation, resolver-side validation, destructive intent requirements, service error propagation, and exclusion of stream/OBS/raw-media controls
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
Presenter service implementations · repositories · database migrations · UI screens · desktop output windows · Tauri commands · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current API layout
- [x] Add Presenter service contract schemas/interfaces
- [x] Add Presenter GraphQL SDL and resolver shells
- [x] Add focused Presenter GraphQL tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter has typed GraphQL contract/resolver scaffolding aligned with `05-plans/presenter-module-plan.md`; resolver inputs are Zod-validated and delegated to service contracts; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add in-memory Presenter services/repositories for GraphQL contract tests and development composition.
