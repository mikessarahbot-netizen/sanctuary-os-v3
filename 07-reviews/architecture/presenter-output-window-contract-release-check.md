# Presenter Output-Window Contract Release Check

Date: 2026-06-16  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `ddf381c`

## Result

Pass with follow-ups. The Presenter desktop output-window contract layer is ready for the current contract checkpoint: it adds strict Zod validation for desktop output-window state, local/offline run-mode status, and active-slide render contexts while avoiding real window creation, Tauri commands, desktop event-bus wiring, GraphQL/API coupling changes, OBS control, stream actions, raw media payloads, and secrets.

## Scope Reviewed

- `apps/api/src/domain/presenter/contracts.ts`
- `apps/api/src/domain/presenter/contracts.test.ts`
- `apps/desktop/README.md`
- `05-plans/presenter-module-plan.md`
- `02-standards/engineering-rules.md`
- `07-reviews/architecture/presenter-event-transport-release-check.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Strict Zod validation | Pass | `PresenterDesktopOutputWindowSchema`, `PresenterDesktopRunModeStatusSchema`, and `PresenterOutputWindowRenderContextSchema` are strict objects exported with typed parser helpers. |
| Tenant consistency | Pass | Render contexts reject output windows, active slides, and themes whose tenant differs from the render context tenant. Existing loaded run-mode state also validates presentation/output-target tenant scope. |
| Output window identity | Pass | Desktop windows require an opaque `windowId`, `windowRef`, `outputTargetId`, display name, lifecycle state, role, safe blank state, and tenant ID. |
| Output role/kind | Pass | Desktop output roles are constrained to `main`, `confidence`, and `stage-display`, matching the existing output target kind vocabulary. |
| Safe blank state | Pass | Failed output windows must include a failure reason and remain safe blanked; render contexts reject globally blanked output that is not safe blanked. |
| Confidence output eligibility | Pass | Main output windows cannot be confidence-eligible; confidence windows must be marked eligible; disabled confidence output windows must remain safe blanked. |
| Active slide render context | Pass | Render contexts validate active slide tenant and presentation ID against the context, and include theme plus local status needed for a desktop renderer to decide what to display. |
| Local/offline status metadata | Pass | Local status captures online/degraded/offline API state, last reachable/offline timestamps, local playback readiness, pending sync queue size, and sync state; tests reject inconsistent offline and queued/synced combinations. |
| Forbidden payload fields | Pass | Tests reject OBS scene fields, stream-control flags, raw media payload fields, and vendor/secret-like fields at the desktop output boundary. |
| No real desktop wiring | Pass | The slice adds contracts, tests, and README documentation only; `apps/desktop/README.md` explicitly states no real windows, desktop event bus, OBS, streams, raw media, or secrets are introduced. |
| No GraphQL/API coupling changes | Pass | The new contracts live in the shared Presenter domain export. No GraphQL SDL/resolvers, API services, event transport, persistence adapters, or runtime composition were changed. |
| Checked-in secrets | Pass | Reviewed code and docs introduce no secret values, environment variables, connection strings, or vendor tokens. |

## Validation

Validation commands run for this release-check slice:

- Pass: `pnpm --filter @sanctuary-os/api test -- src/domain/presenter/contracts.test.ts` (22 files, 198 passed, 2 skipped)
- Pass: `pnpm lint`
- Pass: `pnpm typecheck`
- Pass: `pnpm test` (workspace: church-context 5 passed, db 85 passed, api 198 passed/2 skipped)

## Follow-Ups

- Add a local sync queue plan next so offline Presenter run-mode status has a durable queue contract and conflict surface before desktop implementation.
- Add desktop event-bus and Tauri output-window wiring only after the contract layer and release checks remain green.
- When real output-window adapters are added, verify `windowRef` values are sanitized/log-safe and never carry OS secrets or raw display-manager payloads.
