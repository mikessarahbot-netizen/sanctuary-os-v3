# NOW

## Task
Charts module, slice 1: the pure ChordPro domain — Zod schemas + a deterministic parse and transpose with no I/O.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, `01-architecture/system-map.md`, `03-context/church-context-schema.md`, and the `apps/api/src/domain/presenter` structure (mirror its style)
- Add `apps/api/src/domain/charts`: strict Zod schemas for `ChordProDocument`, `ChartSection`, `ChartLine`, `ChartSegment` (chord?/lyric), and a chart `Key`/chord representation
- Add `parseChordPro(source)` — a pure function turning ChordPro text into a validated `ChordProDocument` (directives for title/artist/key, section delimiters for verse/chorus/bridge/intro/tag/instrumental, and inline `[chord]lyric` segments)
- Add `transposeChordProDocument(document, semitones)` — a pure transform shifting every chord (root + optional bass) by a semitone offset with a fixed sharp enharmonic policy; non-chord tokens pass through unchanged
- Export the charts domain from the api domain barrel
- Add focused unit tests (parse of a multi-section chart, inline chords, directives; transpose up/down with wrap-around, slash chords, pass-through) with no I/O
- Keep this slice pure domain logic; no persistence, GraphQL, service, or mobile wiring

## Out of scope
Charts persistence/db contracts · GraphQL/API surface · per-musician preferences/annotations storage · offline sync · mobile UI · CCLI/catalog · AI suggestions · notation rendering

## Progress
- [x] Re-sync with the Charts plan and presenter domain style
- [x] Add the ChordPro Zod schemas (document/section/line/segment/kind)
- [x] Add `parseChordPro` (pure: directives, sections, inline chords, default section)
- [x] Add `transposeChord` + `transposeChordProDocument` (pure: root/bass shift, sharp policy, key transpose)
- [x] Add 9 focused parse + transpose unit tests
- [x] Run lint, typecheck, and tests
- [ ] Commit and push the ChordPro core slice
- [ ] Session handoff

## Done when
The ChordPro domain parses source into a validated document and transposes it deterministically, both pure and covered by focused tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next Charts slice (the persistence/db contracts).

## Next task after this
Charts slice 2: the Charts persistence contracts in `packages/db` (Chart, ChartArrangement, ChartAnnotation, MusicianChartPreference) mirroring the presenter persistence contracts, tenant-scoped and Zod-validated.
