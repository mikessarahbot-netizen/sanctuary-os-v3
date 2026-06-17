# Presenter Local Sync Queue Replay Coordinator Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `31e062d`

## Result

Pass with follow-ups. The slice adds `mapPresenterLocalSyncQueueEntryToReplayCommand`, a pure mapping from a validated Presenter local sync queue entry to the existing Presenter service command shape, so a desktop replay runtime can re-issue offline edits through the normal command path. The replay runtime supplies the authenticated actor (the queue stores only `actorId`); the mapping reuses the entry's `requestId` for idempotency and requires the actor's tenant to match the entry's tenant. It is pure mapping — no I/O, no service call, no live transport — and adds no desktop/Tauri/event-bus wiring, no GraphQL/API replay transport, and no checked-in secret.

## Scope Reviewed

- `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.ts`
- `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.test.ts`
- `apps/api/src/services/presenter/contracts.ts`
- `apps/api/src/services/presenter/index.ts`
- `apps/api/src/auth/index.ts`
- `packages/db/src/presenter-repository-contracts.ts`
- `05-plans/presenter-local-sync-queue-plan.md`
- `02-standards/engineering-rules.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Operation coverage | Pass | All six approved queue operations (`updatePresentation`, `addSlide`, `updateSlide`, `reorderSlides`, `applyPresenterTheme`, `setOutputTarget`) map to their existing command schemas via an exhaustive discriminated switch; each is unit-tested. |
| Boundary validation | Pass | The entry is parsed through `PresenterLocalSyncQueueEntryPersistenceRecordSchema`, the actor through `AuthenticatedActorSchema`, and each command through its command schema, so malformed input is rejected (a test covers a malformed entry). |
| Idempotency scope | Pass | The mapping reuses the entry's `requestId` as the command `requestId`, preserving the local idempotency key for replay. |
| Tenant safety | Pass | The mapping throws when the supplied actor's tenant differs from the entry's tenant; a test covers the rejection. |
| Actor reconstruction | Pass | Because the queue stores only `actorId`, the actor is injected by the caller (the replay runtime), keeping role/permission resolution out of the queue; the original `actorId` remains in the queue record for local audit correlation. |
| Schema-family alignment | Pass | The slide and output-target payloads validate cleanly against both the `packages/db` persistence schemas (on enqueue) and the `apps/api` domain command schemas (on map), confirming the two families remain structurally aligned. |
| Purity | Pass | The mapping performs no I/O and calls no service; it only validates and reshapes data. |
| No-integration tests | Pass | All 8 tests are pure and need no database, network, Tauri, event bus, or API. |
| Out-of-scope avoidance | Pass | The slice adds only the coordinator, its test, and the barrel export. No live replay transport, scheduler loop, desktop code, Tauri command, event bus, or GraphQL change is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `31e062d`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- local-sync-queue-replay-coordinator.test.ts` | 8 tests pass |
| `pnpm --filter @sanctuary-os/api typecheck` | Pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 3 packages) |
| `pnpm test` | All workspace tests pass (api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- The destructive `removeSlide` and `createPresentationFromService` commands are intentionally not mappable from the queue (out of the approved offline edit scope); revisit only if the queue scope changes.
- Scaffold `apps/desktop` as its own workspace so the persistence selection, migration runner, replay decision, and this replay coordinator can be wired into a desktop replay loop that calls the live `PresenterCommandService`.
- The replay loop that consumes the decision + coordinator (transport, retries, marking entries replaying/synced/failed) remains a later desktop-owned slice.
