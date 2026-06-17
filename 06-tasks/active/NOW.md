# NOW

## Task
Add a pure Presenter local sync queue replay coordinator that maps an eligible queue entry to the existing Presenter command shape (no live transport).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `03-context/church-context-schema.md`, `05-plans/presenter-local-sync-queue-plan.md`, `05-plans/presenter-local-sync-queue-storage-plan.md`, `07-reviews/architecture/presenter-local-sync-queue-replay-decision-release-check.md`, the queue entry contracts in `packages/db/src/presenter-repository-contracts.ts`, and the existing Presenter service/command contracts under `apps/api/src/services/presenter` and `apps/api/src/domain/presenter`
- Add a pure mapping that turns a validated queue entry's discriminated operation (`updatePresentation`, `addSlide`, `updateSlide`, `reorderSlides`, `applyPresenterTheme`, `setOutputTarget`) into a replay command descriptor: the target operation name plus the existing Presenter command input and an options object carrying tenant/actor/`requestId` for idempotency
- Validate inputs and outputs with the existing Zod contracts; reject queue operations that do not map to an approved non-destructive command
- Add focused unit tests covering each mapped operation and rejection of unmapped/forbidden shapes, with no live database, network, Tauri, event bus, or API call
- Keep this slice pure mapping logic; do not add live API replay transport, a scheduler loop, Tauri commands, event-bus wiring, or GraphQL changes

## Out of scope
Live API replay transport · running scheduler loop/timers · desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · GraphQL/API replay changes · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [ ] Re-sync with queue contracts and the Presenter command contracts
- [ ] Add the pure queue-entry-to-command replay mapping
- [ ] Add focused mapping tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the replay coordinator slice
- [ ] Session handoff

## Done when
A pure mapping turns each approved queue operation into a validated Presenter command descriptor with tenant/actor/request idempotency scope, rejects unmapped shapes, is covered by focused tests with no live integrations, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Scaffold the `apps/desktop` workspace (package.json, tsconfig, vitest, lint integration) so the persistence selection, migration runner, replay decision, and replay coordinator can be wired into a desktop composition root — or address any coordinator findings first.
