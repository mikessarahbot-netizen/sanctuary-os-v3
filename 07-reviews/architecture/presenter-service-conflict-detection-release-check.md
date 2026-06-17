# Presenter Service Conflict Detection Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `897f4b5`

## Result

Pass. The in-memory Presenter command service now throws the typed `PresenterDomainError` for every conflict condition it can detect, replacing the previous generic errors. This completes the offline replay conflict round-trip with real detection: a replayed edit that hits one of these conditions produces `extensions.code` through the GraphQL transport, which the desktop classifier maps to a `conflict` entry.

## Scope Reviewed

- `apps/api/src/services/presenter/in-memory.ts`
- `apps/api/src/services/presenter/in-memory.test.ts`
- `apps/api/src/services/presenter/presenter-domain-error.test.ts`
- `apps/api/src/domain/presenter/errors.ts`
- `apps/desktop/src/replay-error-classifier.ts`

## Findings

| Condition | Code | Evidence |
| --- | --- | --- |
| Presentation not found | `STALE_PRESENTATION` | `findTenantPresentation` throws when the presentation is absent. |
| Cross-tenant / role denied | `AUTHORIZATION_FAILED` | `findTenantPresentation` tenant mismatch and `assertPresenterCommandRole`. |
| Unknown theme | `THEME_MISMATCH` | `ensureTenantTheme`. |
| Unknown / missing slide | `MISSING_SLIDE` | add-slide insertion point, update/reorder slide lookups. |
| Output target tenant mismatch | `OUTPUT_TARGET_MISMATCH` | `setOutputTarget` tenant check. |
| Reorder / keep-one invariants | `VALIDATION_FAILED` | reorder count/active-slide and remove-slide minimum. |

| Area | Status | Evidence |
| --- | --- | --- |
| Code alignment | Pass | All six codes match the desktop classifier's `CONFLICT_CODE_TO_KIND` map. |
| Redacted messages | Pass | Each `safeMessage` is operator-safe; no internal detail or IDs are leaked. |
| Per-code tests | Pass | `presenter-domain-error.test.ts` asserts each condition throws the expected `code` (6 tests). |
| Existing tests | Pass | The four in-memory assertions that checked old messages were updated; all 9 in-memory tests still pass. |
| Query path untouched | Pass | The read-role check stays a generic error (queries are not replayed). |

## Validation

All gates passed on 2026-06-17 at commit `897f4b5`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- presenter-domain-error.test.ts in-memory.test.ts` | 15 tests pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 230 + 2 skipped; desktop 42; church-context 5) |

## Follow-Ups

- `STALE_PRESENTATION` currently fires on a missing presentation; once the API tracks a base revision, also throw it when the queued `baseRevision` is behind the server revision.
- Apply the same typed errors in the SQL-backed command path when it gains conflict detection.
- Desktop tail: the process `main`, Tauri sidecar spawn/supervision, and a minimal status UI remain.
