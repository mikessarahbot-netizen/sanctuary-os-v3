# NOW

## Task
OBS module, slice 5: the `ObsControlPort` interface + a faked/in-memory adapter — the obs-websocket boundary the service will depend on (real impl deferred to slice 11). NO real obs-websocket. (OBS slices 1–4 done + green at `f92d70e`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Final module. The port is the ONLY thing that touches OBS; the service calls it only after the confirm gate. Charts + Play + Community+ backends complete.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 5)
- Continue on `feature/presenter-domain-contracts`
- Read the plan's "ObsControlPort" boundary section + how other modules define injected ports/fakes (the Community `CommunicationSendPort` in `apps/api/src/services/community/`, the AI port in `ai-draft.ts`, the Play network command service in `apps/desktop/src/play-network-command-service.ts`) to match the established port/fake convention
- Add the `ObsControlPort` interface (likely `apps/api/src/services/obs/control-port.ts` or per the established location): methods covering connect/getSceneList/getCurrentProgramScene/setCurrentProgramScene/setSceneItemEnabled/setInputMute/startStream/stopStream/startRecord/stopRecord/getStreamStatus/getRecordStatus (per the plan's action set) — each returning Zod-validated, secret-free results; a typed `ObsControlError` carrying a redacted `safeMessage` (never secrets/raw connection details)
- Add a faked/in-memory `ObsControlPort` adapter: simulates an OBS instance (a configurable scene/source catalog + stream/recording state) so the service + tests can drive it deterministically; injectable failure modes (disconnected, action-rejected) for testing the classifier later
- Export from a services/obs barrel (create it)
- Tests: the fake honors connect/scene-switch/source-toggle/stream start-stop transitions; returns secret-free results; surfaces injected failures as typed `ObsControlError` with redacted messages; deterministic

## Out of scope
The GraphQL/service (slice 6) · the action-gate flow (slice 7) · persistence service (slice 8) · real obs-websocket v5 (slice 11) · desktop runtime/UI

## Done when
The `ObsControlPort` interface + a deterministic faked adapter exist (secret-free results, typed redacted errors, injectable failures), covered by tests, gates green, committed and pushed.

## Next task after this
OBS slice 6: GraphQL + in-memory service (`apps/api/src/domain/obs/{contracts,errors}.ts`, `apps/api/src/services/obs/in-memory.ts`, `apps/api/src/graphql/obs.ts`) — read-only queries + connection/catalog management + the action REQUEST surface; the actual confirm→dispatch gate is slice 7. Then 7 (action gate), 8 (persistence service), 9 (events), 10 (AI assist). Slices 11–13 await user decisions. After OBS backend: the autonomously-buildable backend is complete; remaining is UIs + live integrations (need the user).
