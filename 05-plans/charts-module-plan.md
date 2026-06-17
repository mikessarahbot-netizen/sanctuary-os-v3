# Charts Module Plan

## Scope v1
ChordPro chart source for song arrangements · ChordPro parse + render model (sections, chord/lyric lines) · transpose and capo display · per-musician chart preferences (transpose, capo, instrument, font size, chord visibility) · per-musician chart annotations (highlights, notes, repeat/section markers) · offline-first chart availability for rehearsal and service · song/arrangement references from the catalog

## Out of scope v1
Song catalog ownership · CCLI/SongSelect licensing or import · audio playback or click/pad tracks (Play owns those) · automatic AI chart generation writes · raw media/audio storage · realtime multi-musician co-editing · print/PDF export pipeline · notation (staff) rendering

## Domain objects
Chart · ChartArrangement · ChordProDocument · ChartSection · ChartAnnotation · MusicianChartPreference

## Domain boundaries
| Object | Owns | Does not own |
|---|---|---|
| Chart | Tenant-scoped chart identity, song/arrangement refs, default key, ChordPro source ref, metadata | Song catalog source data, licensing, playback, attendance |
| ChartArrangement | Arrangement label, default key, section order, capo baseline | Song authorship, CCLI contracts, track stems |
| ChordProDocument | Validated ChordPro source text + parsed section/line model | Free-form rich media, notation, audio |
| ChartSection | Section kind (verse/chorus/bridge/intro/tag), ordered chord/lyric lines | Cross-song references, playback cues |
| ChartAnnotation | Per-musician marks tied to a chart section/line position (highlight, note, repeat) | The chart source content, other musicians' marks |
| MusicianChartPreference | Per-musician per-chart transpose offset, capo, instrument, font size, chord visibility | The chart source, global theme, other musicians' prefs |

## API and storage surfaces
- GraphQL/HTTP is the cross-device persistence boundary for charts, arrangements, annotations, and preferences.
- ChordPro source is stored as validated text plus a derived render model; the render model is computable from the source and is never the source of truth.
- Song and arrangement references are opaque IDs from the catalog/`songLibraryProfile`; Charts does not mutate the catalog.
- Transpose/capo are display transforms over the stored source; they never rewrite the stored ChordPro unless the musician explicitly saves a new arrangement.
- Mobile Charts keeps charts, annotations, and preferences available offline; non-destructive edits queue for sync (reuse the local-sync-queue pattern).

## GraphQL (queries)
`charts(filter)` · `chart(id)` · `chartsForSong(songRef)` · `chartArrangements(songRef)` · `musicianChartPreference(chartId)` · `chartAnnotations(chartId)`

## GraphQL (mutations)
`createChart(input)` · `updateChartSource(input)` · `createChartArrangement(input)` · `setMusicianChartPreference(input)` · `addChartAnnotation(input)` · `updateChartAnnotation(input)` · `removeChartAnnotation(input)`

## Pure rendering/transform rules
- ChordPro parsing is a pure function: source text → validated `ChordProDocument` (sections, chord/lyric lines, directives).
- Transpose is a pure function over the parsed model: shift each chord by a semitone offset using a fixed enharmonic policy; invalid chords pass through unchanged and are flagged.
- Capo display derives the shown chord shapes from key − capo without mutating the source.
- Rendering must be deterministic and tenant/musician-scoped where preferences apply.

## Offline and failure rules
- A chart loaded for a service must remain viewable, transposable, and annotatable if internet drops.
- Per-musician transpose/capo/preferences and annotations apply locally without a live API connection.
- If API sync fails, local edits to preferences and annotations queue for later replay (non-destructive only); the stored chart source is never silently overwritten.
- Catalog/licensing unavailability must not block viewing an already-available chart.

## Privacy and safety rules
- No secrets, CCLI/SongSelect credentials, or vendor tokens are stored in Charts domain records.
- Tenant scope is required for every persisted chart, arrangement, annotation, and preference read/write.
- Per-musician annotations and preferences are scoped to their owning musician within the tenant.
- Destructive actions (chart/arrangement deletion) require explicit intent and audit metadata.
- AI-generated chart suggestions must be reviewable before they change stored charts.

## AI assist rules
- AI may suggest section labels, chord corrections, or a transposed arrangement as reviewable suggestions.
- AI may not invent catalog/song entries and must respect `bannedOrPausedSongIds`.
- AI callers request the smallest necessary ChurchContext projection; output is Zod-validated and shown before any write.
- No PII is sent to AI unless `aiPolicyProfile.piiSharingAllowed = true`.

## Acceptance for first implementation task
- Charts domain and API names match this plan.
- ChordPro parse + transpose are pure, deterministic, Zod-validated functions with no I/O.
- Persisted charts/arrangements/annotations/preferences are tenant-scoped, role-checked, audited, and Zod-validated.
- Per-musician preferences and annotations are scoped to the owning musician and never mutate the shared chart source.
- Offline contracts keep an available chart viewable/transposable/annotatable without a live API connection.
