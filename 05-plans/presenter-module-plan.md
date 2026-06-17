# Presenter Module Plan

## Scope v1
Slide deck creation · scripture slides · service item slide attachments · lyric and reading slides · media cues · output routing · presenter run mode · style templates · Planning service import · local fail-safe presentation playback

## Out of scope v1
Full design suite · sermon manuscript editor · generic livestream hosting · automatic OBS scene control · cloud video processing · full DAW playback · automatic destructive changes to Planning services

## Domain objects
Presentation · Slide · SlideBlock · ScripturePassage · MediaCue · OutputTarget · PresenterTheme

## Domain boundaries
| Object | Owns | Does not own |
|---|---|---|
| Presentation | Service-linked slide order, slide refs, run state, output target refs | Planning service lifecycle, volunteer assignments, song licensing |
| Slide | Content blocks, layout, notes, timing hints, background refs | Raw media storage, chart rendering, audio playback |
| SlideBlock | Text, scripture, lyric, image, video placeholder, lower-third content | Song catalog source data, Bible licensing contracts |
| ScripturePassage | Translation ref, reference text, verse ranges, display grouping | Bible API credentials, theological commentary |
| MediaCue | Cue label, target slide, asset ref, playback hint | Media transcoding, Play track state |
| OutputTarget | Screen/window/output identifier, safe blank state, confidence output flag | OBS connection state, operating system display management |
| PresenterTheme | Typography tokens, colors, spacing, lower-third style | Global UI design system ownership |

## API and storage surfaces
- GraphQL/HTTP remains the cross-device control and persistence boundary for saved presentations.
- Desktop Presenter owns local run mode, output windows, confidence display, and offline fail-safe playback.
- Planning service import reads service items and song refs through API/DB boundaries; Presenter does not mutate Planning services during import.
- Media assets are referenced by opaque IDs/URLs from a future storage boundary; raw media payload storage is out of scope for the first Presenter plan.

## GraphQL (queries)
`presentations(filter)` · `presentation(id)` · `presentationForService(serviceId)` · `presenterThemes(filter)` · `outputTargets(input)`

## GraphQL (mutations)
`createPresentationFromService(input)` · `updatePresentation(input)` · `addSlide(input)` · `updateSlide(input)` · `reorderSlides(input)` · `removeSlide(input)` · `applyPresenterTheme(input)` · `setOutputTarget(input)`

## Desktop run-mode actions
`loadPresentation` · `goToSlide` · `nextSlide` · `previousSlide` · `blankOutput` · `restoreOutput` · `toggleConfidenceOutput`

## WebSocket events emitted
`presentation.updated` · `presenter.slideChanged` · `presenter.outputBlanked` · `presenter.outputRestored`

## Offline and failure rules
- A loaded presentation must remain runnable locally if internet drops.
- Existing local slides, scripture text, media refs, and theme data must remain available during a service.
- If API sync fails, local run mode continues and queues non-destructive presentation edits for later sync.
- Output failure must fall back to a visible safe blank state without affecting Planning or Play.
- OBS disconnection must not block Presenter run mode; OBS automation is a future opt-in integration with human confirmation.

## Privacy and safety rules
- No secrets, Bible API credentials, raw media payloads, or vendor tokens are stored in Presenter domain records.
- Tenant scope is required for every persisted presentation read/write.
- Destructive actions such as presentation deletion require explicit intent and audit metadata.
- Stream start/stop and OBS automation remain outside Presenter v1 and require human confirmation in future slices.
- AI-generated slide suggestions must be reviewable before they change saved presentations.

## AI assist rules
- AI may suggest slide outlines, scripture grouping, lower-thirds, or concise announcement copy.
- AI callers must request the smallest necessary ChurchContext projection.
- AI output must be Zod-validated and shown as reviewable suggestions before writes.
- No PII is sent to AI unless `aiPolicyProfile.piiSharingAllowed = true`.

## Acceptance for first implementation task
- Presenter domain and API names match this plan.
- Presentation imports are tenant-scoped and read Planning data without mutating Planning services.
- Saved presentation writes are service-owned, role-checked, audited, and Zod-validated.
- Desktop run-mode contracts support local fail-safe navigation without requiring a live API connection.
- WebSocket event payloads use validated schemas and are emitted only after durable state changes commit.
