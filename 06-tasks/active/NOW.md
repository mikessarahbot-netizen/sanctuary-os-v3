# NOW

## Task
OBS module (final module), slice 1: the OBS domain + pure logic — strict Zod records for the 8 objects + enums, and the pure logic (esp. the action-eligibility/precondition checker). Backend, no port/persistence/I/O. Mirror the Charts/Play/Community domain slices. (OBS plan authored at `dae2863`-next.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (just authored; authoritative). OBS = the tenant-scoped control surface for a church's own OBS Studio via obs-websocket v5 (switch scenes, toggle sources, start/stop stream/recording). Charts + Play + Community+ backends complete.

## OBS non-negotiables (critical)
- Human-confirm gate is STRUCTURAL: the three-step `request → confirm → dispatch` model — every output action (`affectsLiveOutput=true`) must be confirmed before dispatch; no path (event/scheduled/AI) auto-confirms or auto-dispatches. AI may only create a `requested`, `origin="ai-suggested"` intent.
- NO secrets in domain records: OBS host/port/password/token/stream-key live ONLY in a vault, referenced by an opaque `connectionRef`. No secret fields/columns anywhere (assert this in a test).
- Online-only output actions (no offline queue — replaying start-stream could go live unattended). Coarse state only (no per-frame telemetry).
- The obs-websocket connection is an INJECTED port (faked in tests) — NO real obs-websocket calls in tests.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 1)
- Continue on `feature/presenter-domain-contracts`
- Mirror `apps/api/src/domain/{charts,play,community}/` (schemas + pure logic + index + tests)
- Add `apps/api/src/domain/obs/`: strict `.strict()` Zod records (branded IDs, tenant-scoped) for ObsConnectionProfile (opaque `connectionRef` only — NO host/password/secret fields), Scene, Source, SceneItem, StreamState, RecordingState, ObsActionIntent (confirmation-gated; `affectsLiveOutput`, status request→confirmed→dispatched/failed/cancelled, `origin`), ObsActionLogEntry (append-only audit) + enums, with the plan's invariants
- Add the pure logic: an action-eligibility/precondition checker (pure: intent + current scene/source/stream state → eligible/ineligible-with-reason, flagged not thrown) + the pure action-status transition map (request→confirm→dispatch/fail/cancel; no skipping confirm)
- Export via the domain barrel
- Unit tests: schema validity/invariants, a NO-SECRETS assertion (ObsConnectionProfile/records reject host/password/token/streamKey keys), eligibility checker (eligible + flagged-ineligible), the transition map (confirm required before dispatch), determinism

## Out of scope
Persistence/contracts (slice 2+) · the ObsControlPort (slice 5) · GraphQL/service · the action gate service flow (slice 7) · real obs-websocket (slice 11) · desktop runtime/UI (slices 12-13, deferred)

## Done when
The OBS domain records + enums + pure logic (eligibility checker + transition map) exist with invariants and tests (incl. the no-secrets assertion + confirm-before-dispatch), gates green, committed and pushed.

## Next task after this
OBS slice 2: persistence contracts (`packages/db/src/obs-repository-contracts.ts`). Then slices 3–10 per `05-plans/obs-module-plan.md` (migration → adapter → ObsControlPort+fake → GraphQL+service → action gate → persistence service → events → AI assist). Slices 11–13 (real obs-websocket port, desktop agent runtime, operator UI) await user decisions (OBS connection/vault + UI surface). After OBS backend: the autonomously-buildable backend is complete; remaining is UIs + live integrations (need the user).
