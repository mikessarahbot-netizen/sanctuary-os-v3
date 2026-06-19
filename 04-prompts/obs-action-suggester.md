# Prompt: OBS Action Suggester

## Version
`obs-action-suggestion.v1`

## Purpose
Propose a single *reviewable* next OBS output action — e.g. "switch to the
`Lower Third` scene for the announcements" — for a tenant's own OBS Studio,
grounded only in the secret-free, PII-free scene/source catalog projection and
the coarse stream/recording state. The result becomes a `requested`,
`origin = "ai-suggested"` `ObsActionIntent` (refs only) that a human must confirm
and dispatch through the slice-7 confirm→dispatch gate. The model never confirms,
never dispatches, never starts/stops a stream or switches a scene directly, and
never advances the intent. AI suggests; a human decides.

## Required inputs (secret-free, PII-free projection only)
connectionProfileRef (an opaque id — **not** the `connectionRef` vault handle) ·
connectionStatus · streamStatus · recordingStatus · scenes (`obsSceneRef` +
display label + `isCurrentProgramScene`, refs only) · sources (`obsSourceRef` +
`kindLabel` + coarse mute/active hints, refs only) · sceneItems (`obsSceneItemId`
+ `obsSceneRef` + `obsSourceRef` + coarse `visibleHint`, refs only) ·
serviceSegmentLabels (the smallest `ChurchContext` slice — non-PII service-order
segment labels to reason about *when* a scene change might help) · operatorIntent
(a short non-PII hint, e.g. "moving into announcements") · aiPolicyProfile
(piiSharingAllowed, humanReviewRequiredFor)

## Forbidden
- Emit any OBS host, port, password, auth token, stream key, connection URL, or
  the `connectionRef` vault handle — the projection carries an opaque id only
- Emit any PII (OBS controls production hardware/scenes, not people; none is
  present and none may be invented)
- Invent a scene, source, or scene-item not present in the supplied catalog —
  every `targetSceneRef` / `targetSourceRef` / `targetSceneItemId` must be a ref
  drawn from the projection
- Emit a raw obs-websocket payload, bitrate, dropped-frame count, or any
  high-frequency telemetry
- Confirm, dispatch, start, stop, or otherwise advance the action (suggestions
  only; the human-confirm gate is mandatory and structural)
- Suggest a `start-stream` while `streamStatus = active`, or a `stop-stream`
  while `streamStatus = inactive` (the eligibility checker rejects these anyway)

## Output (JSON only)
```json
{ "status", "kind", "targetSceneRef", "targetSourceRef", "targetSceneItemId", "desiredVisible", "desiredMuted", "rationale", "needsReview" }
```
- `status`: `"suggested"` | `"insufficient_context"` | `"blocked"`
- `kind`: one of `"start-stream"` | `"stop-stream"` | `"switch-scene"` |
  `"toggle-source-visibility"` | `"toggle-source-mute"`
- Per-kind target refs (refs only, drawn from the projection):
  - `switch-scene` ⇒ `targetSceneRef`
  - `toggle-source-visibility` ⇒ `targetSourceRef` + `targetSceneItemId` + `desiredVisible`
  - `toggle-source-mute` ⇒ `targetSourceRef` + `desiredMuted`
  - `start-stream` / `stop-stream` ⇒ no target refs
- `rationale`: a short, non-PII explanation of why this action helps now
- `needsReview`: always `true` — an AI suggestion is never auto-advanced

## Fallback
On `insufficient_context` or `blocked`, or when the output fails Zod validation,
no `ObsActionIntent` is created and the caller surfaces a typed
`ObsDomainError(VALIDATION_FAILED)`. The AI output is untrusted until
`ObsAiActionSuggestionSchema`-validated; a malformed, secret-bearing, or
off-catalog suggestion is rejected before any persistence. Even a well-formed
suggestion is only ever a `requested` intent — it can never reach
`confirmObsAction` / `dispatchObsAction` without a human.
