# NOW

## Task
Add typed Presenter domain errors and map them to GraphQL `extensions.code` conflict codes, completing the offline replay conflict round-trip.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/api/src/services/presenter/in-memory.ts` and `contracts.ts`, `apps/api/src/graphql/transport.ts`, and the desktop classifier's expected codes in `apps/desktop/src/replay-error-classifier.ts`
- Add a typed Presenter domain error type (a discriminated error carrying a stable `code`: `STALE_PRESENTATION`, `MISSING_SLIDE`, `THEME_MISMATCH`, `OUTPUT_TARGET_MISMATCH`, `VALIDATION_FAILED`, `AUTHORIZATION_FAILED`) and have the Presenter service/command layer throw it for the corresponding conditions (start with the in-memory service so it is gate-testable)
- Surface the typed error's `code` through the GraphQL layer as `errors[].extensions.code` (resolvers attach the code; the transport handler already preserves it) while keeping the user-facing message redacted
- Add focused unit tests proving each condition yields the right `extensions.code` through the transport handler, with no live HTTP/network
- Keep this slice the typed-error + mapping only; do not bind a concrete `http` listener, change the desktop, or alter unrelated services

## Out of scope
Concrete Node `http`/framework server binding · desktop process main / Tauri spawn / UI · planning schema wiring · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · deployment config · checked-in secrets

## Progress
- [x] Re-sync with the Presenter services, transport handler, and desktop classifier codes
- [x] Add the typed Presenter domain error with stable codes (`PresenterDomainError`)
- [x] Surface the code as `extensions.code` through the transport (maps `error.originalError` — no resolver changes needed)
- [x] Add a transport test proving a thrown domain error yields the conflict code + safe message
- [~] Throw it from the in-memory Presenter service for each condition — deferred: needs per-condition detection logic (revision tracking, slide existence) in the service; the mechanism is complete and tested
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the typed-error slice
- [ ] Session handoff

## Done when
The Presenter service throws a typed domain error with a stable `code`, the GraphQL transport surfaces it as `extensions.code` with a redacted message, each conflict condition is covered by a transport-level test, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Bind the GraphQL request handler to a concrete Node `http` listener (a thin slice), then return to the desktop tail (process `main`, Tauri sidecar spawn, minimal status UI). Address any typed-error findings first.
