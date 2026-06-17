# NOW

## Task
Add Presenter domain contracts and local run-mode schemas.

## In scope
- Continue from pushed branch `feature/presenter-module-plan`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, `05-plans/presenter-module-plan.md`, and current app/package layout
- Add the first typed Presenter contract surface for v1 domain objects: Presentation, SlideGroup, Slide, ScriptureReference, PresenterStyleTemplate, and PresenterOutputState
- Add local desktop run-mode action/state schemas for loading a presentation, slide navigation, blackout/freeze output, and preview/live selection
- Add service contract schemas for Presenter queries/mutations that keep tenant scope, actor role context, request IDs, and explicit destructive intent where applicable
- Use Zod validation, explicit exported return types, opaque string IDs at boundaries, and no `any`
- Keep implementation adapter-free: no UI, GraphQL resolvers, persistence adapters, media storage, Bible API, OBS control, vendor SDKs, or deployment config
- Add focused tests for schema validation, tenant scope, offline-safe loaded presentation state, output blackout/freeze actions, destructive intent requirements, and rejection of secret-like fields
- Run lint, typecheck, and tests
- Commit and push the slice
- Run session handoff

## Out of scope
GraphQL resolver implementation · UI screens · desktop output windows · Tauri commands · persistence adapters · database migrations · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with required docs and current app/package layout
- [x] Identify where Presenter contracts should live
- [x] Add Presenter domain and run-mode schemas
- [x] Add Presenter service contract schemas
- [x] Add focused Presenter contract tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter has a typed, tested contract surface for domain records, service operations, and local run-mode actions aligned with `05-plans/presenter-module-plan.md`; default gates pass; the slice is committed, pushed, and documented in session handoff.

## Next task after this
Add Presenter GraphQL contract/resolver shells that Zod-validate inputs and delegate to Presenter services.
