# Charts ChordPro Domain Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `ac5124c`

## Result

Pass. Charts module slice 1 adds the pure ChordPro domain: strict Zod schemas plus `parseChordPro` and `transposeChordProDocument`/`transposeChord`. Both are pure, deterministic, and Zod-validated with no I/O, matching the Charts plan's render/transform rules.

## Scope Reviewed

- `apps/api/src/domain/charts/chordpro.ts` + `chordpro.test.ts`
- `apps/api/src/domain/charts/index.ts`, `apps/api/src/domain/index.ts`
- `05-plans/charts-module-plan.md`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Schemas | Pass | Strict `ChordProDocument`/`ChartSection`/`ChartLine`/`ChartSegment` with a `ChartSectionKind` enum; chord optional, lyric required. |
| Parsing | Pass | `parseChordPro` handles title/artist/key directives, `start_of_*`/`eo*` section delimiters (with optional labels), inline `[chord]lyric` segments with leading lyrics, a default `other` section for directive-free lines, and ignores blank/unknown directives; covered by three tests. |
| Transpose | Pass | `transposeChord` shifts root and optional bass with a fixed sharp enharmonic policy, preserves quality, wraps the octave both ways, and passes non-chord tokens through; `transposeChordProDocument` transposes every chord and the document key; six tests including a zero-semitone no-op. |
| Purity | Pass | No I/O; deterministic; both entry points re-validate through the schemas. |
| Plan alignment | Pass | Names and behavior match the Charts plan's "pure rendering/transform rules" and domain objects. |
| Gate safety | Pass | All nine tests are pure; the four workspaces stay green (db 143, api 239 + 2 skipped, desktop 54, church-context 5). |

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- chordpro.test.ts` | 9 tests pass |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 143; api 239 + 2 skipped; desktop 54; church-context 5) |

## Follow-Ups

- Charts slice 2: persistence contracts in `packages/db` (Chart, ChartArrangement, ChartAnnotation, MusicianChartPreference), tenant-scoped and Zod-validated, mirroring the presenter persistence contracts.
- Later: a render model for display (chord-over-lyric positioning), capo display derivation, and the GraphQL surface.
- Consider a flat-key enharmonic option for keys conventionally written with flats (a display preference, not a parse concern).
