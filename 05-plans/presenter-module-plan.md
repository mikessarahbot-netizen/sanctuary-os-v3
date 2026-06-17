# Presenter Module Plan

## Scope v1
Service-linked slide plans · scripture slides · lyrics slides · announcement slides · sermon note slides · media placeholders · presenter run order · output state · style templates · operator-safe live control

## Out of scope v1
Full slide designer · generic livestream hosting · automatic stream start/stop · advanced lower thirds · Play audio engine · chart rendering · OBS scene implementation · sermon manuscript editing

## Domain objects
Presentation · SlideGroup · Slide · ScriptureReference · PresenterStyleTemplate · PresenterOutputState

## Domain boundaries
| Object | Owns | Does not own |
|---|---|---|
| Presentation | Service ref, run order, slide groups, output readiness | Planning service lifecycle, assignment status |
| SlideGroup | Group type, item ref, ordered slides, operator notes | Source song catalog, sermon manuscript |
| Slide | Text blocks, scripture text refs, media refs, display timing hints | Raw media storage, CCLI reporting |
| ScriptureReference | Translation label, passage ref, imported display text metadata | Bible licensing vendor credentials |
| PresenterStyleTemplate | Theme tokens, typography choices, safe-area defaults | Global brand management |
| PresenterOutputState | Current group/slide, preview/live selection, blackout/freeze flags | OBS scenes, stream lifecycle, Play playback state |

## GraphQL (queries)
`presentation(serviceId)` · `presenterStyleTemplates` · `presenterOutputState(presentationId)` · `scripturePreview(input)`

## GraphQL (mutations)
`createPresentationFromService` · `updateSlideGroup` · `updateSlide` · `reorderSlides` · `applyPresenterStyleTemplate` · `importScriptureSlides` · `setPresenterOutputState`

## Desktop/local control
- Desktop app owns high-frequency preview/live navigation and local output rendering.
- API owns durable presentation structure, service linkage, style templates, and validated state snapshots.
- Local output state may continue from cached presentation data when internet is unavailable.
- Local-only navigation events should reconcile back to the API when connectivity returns.

## WebSocket events emitted
`presentation.updated` · `presenter.outputStateChanged`

## Safety and privacy rules
- Stream start/stop and OBS scene automation remain outside Presenter v1 and require human confirmation when added.
- Scripture import adapters must not store vendor credentials or expose raw vendor failures.
- Slides may reference media assets but must not persist raw media payloads in API or DB records.
- Presenter AI assistance, when added, must return reviewable slide suggestions and validated output before any write.

## Offline-first rules
- Presenter must keep the current service presentation available locally for live service use.
- Local navigation, blackout, freeze, and selected slide state must keep working without network access.
- Local edits queue for sync only when explicitly supported by an implementation slice and must surface conflict status.

## First implementation order
1. Define Presenter domain schemas and service contracts without UI, DB adapters, vendor SDKs, or OBS control.
2. Add GraphQL contract/resolver shells that Zod-validate inputs and delegate to services.
3. Add in-memory Presenter repositories for contract tests and development composition.
4. Add desktop/local event contract for output state handoff.
5. Run a Presenter API contract release-check before persistence or UI work.

## Acceptance for first implementation task
- Domain and API names match this plan.
- Queries and mutations are tenant-scoped and role-checked in services.
- Output-state mutations validate payloads and publish only validated events.
- No stream-start, stream-stop, OBS automation, vendor SDK calls, or raw media persistence are added.
- Offline-critical Presenter state is modeled separately from server persistence concerns.
