# NOW

## Task
Implement Planning readiness input contracts for rehearsal acknowledgements and CCLI status.

## In scope
- Continue from pushed branch `feature/planning-readiness-domain`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/api-plan.md`, and `05-plans/planning-module-plan.md`
- Extend adapter-free Planning readiness domain/service contracts so readiness inputs can represent rehearsal acknowledgement readiness signals alongside existing rehearsal asset visibility and CCLI current-status checks
- Keep readiness calculation deterministic, tenant-scoped, and free of persistence adapter, GraphQL resolver, UI, media storage, chart rendering, notification, or vendor integration changes
- Preserve existing readiness, command, query, CCLI, rehearsal visibility, rehearsal acknowledgement, and GraphQL behavior
- Add focused domain/API tests for new readiness input validation and scoring behavior
- Run lint, typecheck, and tests
- Commit and push the completed slice
- Run session handoff

## Out of scope
Database migrations · concrete production persistence adapter · UI components · media storage · chart rendering · notifications · mobile rehearsal UX · GraphQL resolver wiring · GraphQL server runtime · CCLI/SongSelect vendor calls

## Progress
- [ ] Add readiness input fields for rehearsal acknowledgement signals
- [ ] Update deterministic readiness scoring and recommendations
- [ ] Add focused domain/API tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Planning readiness contracts account for rehearsal acknowledgement readiness signals and CCLI current-status inputs, remain adapter-free and tenant-scoped, are covered by focused tests, pass repository gates, are committed, pushed, and documented in session handoff.

## Next task after this
Select the next approved Planning/API implementation slice from `05-plans/planning-module-plan.md`.
