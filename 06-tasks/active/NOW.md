# NOW

## Task
OBS module, slice 7 (THE SAFETY CORE): the action GATE — `confirmObsAction` (human-confirm step) + `dispatchObsAction` (the ONLY operation that calls the OBS port, and ONLY when status=confirmed) + the action-log audit write + an error classifier over `ObsControlError`. (OBS slices 1–6 done + green at `2cdb53f`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). This slice enforces the non-negotiable: NO stream/scene-affecting action reaches OBS without an explicit human confirmation. Charts + Play + Community+ backends complete.

## Safety non-negotiables (this slice is the whole point)
- `dispatchObsAction` MUST refuse unless the intent's status is `confirmed` — verified structurally (no other path calls the port mutate methods) AND by test.
- `confirmObsAction` is the human gate: requires `confirmationIntent { confirmed: true, reason }` + records `confirmedByRef` + audits; AI-suggested intents (origin) require a human confirm — they can NEVER self-confirm or self-dispatch.
- Every dispatch (success OR failure) writes an append-only `ObsActionLogEntry` audit row with a redacted `safeMessage` — never secrets.
- Re-confirm/replay protection: a dispatched/terminal intent cannot be re-dispatched.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 7)
- Continue on `feature/presenter-domain-contracts`
- Extend `ObsCommandService` (apps/api/src/domain/obs/contracts.ts) with confirmObsAction + dispatchObsAction (+ cancelObsAction) and implement in apps/api/src/services/obs/in-memory.ts:
  - confirmObsAction: load the `requested` intent (tenant+actor scoped) → run the pure action-lifecycle `confirm` transition (requires the confirmation) → persist `confirmed` + write an audit row. Reject if not found / already past requested / AI self-confirm without a human.
  - dispatchObsAction: load the intent → REFUSE unless status=confirmed (ObsDomainError NOT_CONFIRMED) → run the pure `dispatch` transition → call the matching ObsControlPort method (setCurrentProgramScene/startStream/etc.) → on success set `succeeded` + audit; on ObsControlError classify (retryable vs terminal) + set `failed` with the redacted safeMessage + audit. This is the ONLY method that calls a port mutate method.
  - cancelObsAction: cancel a requested/confirmed intent (no port call) + audit.
- Add an error classifier (apps/api/src/services/obs/error-classifier.ts or inline): ObsControlError → terminal vs retryable, redacted safeMessage, mirroring the play/community classifiers.
- Wire the new mutations into apps/api/src/graphql/obs.ts (confirm/dispatch/cancel mutations; dispatch returns the updated intent) + resolvers; update the GraphQL test mock service stub for the grown interface.
- Tests: confirm→dispatch happy path (port called once, intent succeeded, 2 audit rows); dispatch WITHOUT confirm rejected (NOT_CONFIRMED, port NEVER called — assert via fake/spy); AI-suggested can't self-confirm/dispatch; port failure → failed + redacted audit + classified; re-dispatch of a terminal intent rejected; tenant isolation. Update both in-memory and graphql tests.

## Done when
The confirm→dispatch gate is enforced (dispatch is the sole port-calling op, refuses unless confirmed, AI can't self-dispatch, every dispatch audited with redacted messages, terminals not re-dispatchable), covered by tests proving the port is never called without a human confirmation, gates green, committed and pushed.

## Next task after this
OBS slice 8: persistence-backed service over the slice-4 adapter + composition/migration (mirror the other modules' persistence slices) — the gate must hold identically on the persistence path. Then 9 (events: OBS state events into the API event union, PII-free/secret-free), 10 (AI assist: reviewable action suggestion → requested intent, never auto-confirm). Slices 11–13 (real obs-websocket, desktop agent runtime, operator UI) await user decisions. After OBS slice 10 the OBS backend is COMPLETE → consolidated release check, and the autonomously-buildable backend across all modules is done.
