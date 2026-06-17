# Presenter Typed Domain Error + Conflict-Code Mapping Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `b05b30f`

## Result

Pass with follow-ups. The slice adds `PresenterDomainError` (a stable `code` from the conflict taxonomy the desktop classifier expects, plus a pre-redacted `safeMessage`) and maps it through the GraphQL transport to `errors[].extensions.code`. This completes the offline replay conflict round-trip end to end: a service throwing the typed error now produces a conflict code the desktop replay classifier turns into a `conflict` entry, instead of a generic retryable `failed`. No resolver changes were required — the transport reads `error.originalError`. Wiring the in-memory service to detect and throw each condition is a follow-up; the mechanism is complete and tested.

## Scope Reviewed

- `apps/api/src/domain/presenter/errors.ts`
- `apps/api/src/domain/presenter/index.ts`
- `apps/api/src/graphql/transport.ts` (`formatError`)
- `apps/api/src/graphql/transport.test.ts`
- `apps/desktop/src/replay-error-classifier.ts` (expected codes)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Typed error | Pass | `PresenterDomainError` carries one of the six conflict codes and a redacted `safeMessage`; `isPresenterDomainError` is a type guard. |
| Code alignment | Pass | The codes (`STALE_PRESENTATION`, `MISSING_SLIDE`, `THEME_MISMATCH`, `OUTPUT_TARGET_MISMATCH`, `VALIDATION_FAILED`, `AUTHORIZATION_FAILED`) match the desktop classifier's `CONFLICT_CODE_TO_KIND` map exactly. |
| Transport mapping | Pass | `formatError` checks `error.originalError`; a domain error yields `{ message: safeMessage, extensions: { code } }`, while other resolver errors stay redacted. A transport test proves a thrown `STALE_PRESENTATION` surfaces the code + safe message. |
| No resolver coupling | Pass | The mapping lives in the transport, so the 13 presenter resolvers are untouched. |
| Round-trip | Pass | Service throws → `extensions.code` → desktop `createPresenterReplayErrorClassifier` → `conflict` entry with the mapped kind; both ends are unit-tested. |
| Service detection | Deferred | The in-memory/SQL services still throw generic errors for real conditions; emitting the typed error per condition (revision tracking, slide existence) needs domain logic and is a follow-up. |

## Validation

All gates passed on 2026-06-17 at commit `b05b30f`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- transport.test.ts` | 6 tests pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 218 + 2 skipped; desktop 42; church-context 5) |

## Follow-Ups

- Wire the Presenter command service to throw `PresenterDomainError` for each real condition (stale base revision, missing slide, theme/output-target mismatch, validation, authorization), with tests per condition.
- Bind the GraphQL request handler to a concrete Node `http` listener (thin slice) so the API serves requests.
- Desktop tail: process `main`, Tauri sidecar spawn/supervision, minimal status UI.
