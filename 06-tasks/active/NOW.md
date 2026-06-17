# NOW

## Task
Wire the in-memory Presenter command service to throw `PresenterDomainError` for real conflict conditions, completing the conflict path with actual detection.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `02-standards/engineering-rules.md`, `apps/api/src/services/presenter/in-memory.ts`, `apps/api/src/domain/presenter/errors.ts`, and the desktop classifier codes
- Have the in-memory Presenter command service throw the typed `PresenterDomainError` for the conditions it can detect: missing presentation/slide (`MISSING_SLIDE`), unknown theme (`THEME_MISMATCH`), unknown/invalid output target (`OUTPUT_TARGET_MISMATCH`), and tenant/authorization mismatch (`AUTHORIZATION_FAILED`); use validation failures (`VALIDATION_FAILED`) where inputs violate invariants
- Where a base-revision is tracked or can be added cheaply, throw `STALE_PRESENTATION`; otherwise document it as still pending the revision-tracking work
- Keep each thrown error's `safeMessage` operator-safe and redacted
- Add focused service unit tests for each thrown code, and (optionally) one transport-level test confirming the code surfaces as `extensions.code`
- Keep this slice service-side detection only; do not change the desktop, the transport, deployment, or unrelated services

## Out of scope
Concrete deployment/process entry · desktop process main / Tauri spawn / UI · planning wiring · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · checked-in secrets

## Progress
- [ ] Re-sync with the in-memory service, the typed error, and the codes
- [ ] Throw `PresenterDomainError` for each detectable condition in the in-memory command service
- [ ] Add service unit tests per thrown code
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the conflict-detection slice
- [ ] Session handoff

## Done when
The in-memory Presenter command service throws the typed `PresenterDomainError` for each detectable conflict condition with a redacted message, each is covered by a unit test, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Desktop tail: add the thin process `main`, the Tauri sidecar spawn/supervision, and a minimal status UI surfacing pending/conflict/failed entries — addressing any conflict-detection findings first.
