/**
 * Client-side ChordPro transposition for the Charts detail view.
 *
 * This is a faithful, presentation-side port of the server domain's transpose
 * logic (`apps/api/src/domain/charts/chordpro.ts`): the same chord regex, the
 * same `NOTE_TO_SEMITONE` / `SHARP_NOTES` maps, the same slash-chord handling,
 * and the same fixed *sharp* enharmonic policy (e.g. `Bb` -> `A#`). It is ported
 * locally rather than imported so the web app never depends on api package
 * internals, mirroring how `chordpro.ts` already re-declares the render helper.
 *
 * `transposeChordProSource` is a VIEW transform: it shifts only the `[chord]`
 * tokens inside the source (lyrics, directives, and any other text pass through
 * byte-for-byte), so the detail view can re-render a transposed chart without a
 * server round-trip and without mutating the stored source. All functions here
 * are pure and deterministic; no I/O.
 */

const SHARP_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
] as const;

const NOTE_TO_SEMITONE: Readonly<Record<string, number>> = {
  A: 9,
  "A#": 10,
  Ab: 8,
  B: 11,
  Bb: 10,
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  Db: 1,
  E: 4,
  Eb: 3,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  Gb: 6
};

const transposeNote = (note: string, semitones: number): string => {
  const base = NOTE_TO_SEMITONE[note];

  if (base === undefined) {
    return note;
  }

  return SHARP_NOTES[(((base + semitones) % 12) + 12) % 12] ?? note;
};

const CHORD_PATTERN = /^([A-G][#b]?)(.*?)(\/[A-G][#b]?)?$/;

/**
 * Transpose a single chord token (e.g. `G`, `Am7`, `C/E`) by `semitones`,
 * keeping the quality suffix and shifting an optional slash bass note. Tokens
 * that do not start with a note letter (e.g. `N.C.`) pass through unchanged.
 */
export const transposeChord = (chord: string, semitones: number): string => {
  const match = CHORD_PATTERN.exec(chord);
  const root = match?.[1];

  if (match === null || root === undefined) {
    return chord;
  }

  const quality = match[2] ?? "";
  const bassPart = match[3];
  const bass =
    bassPart !== undefined ? `/${transposeNote(bassPart.slice(1), semitones)}` : "";

  return `${transposeNote(root, semitones)}${quality}${bass}`;
};

const CHORD_TOKEN_PATTERN = /\[([^\]]+)\]/g;

/**
 * Transpose every `[chord]` token in raw ChordPro `source` by `semitones`,
 * leaving all other text (lyrics, `{directives}`, whitespace) untouched. A zero
 * offset returns an equivalent source. This is the view-only transform the
 * detail surface renders; it never mutates or persists the stored chart.
 */
export const transposeChordProSource = (source: string, semitones: number): string =>
  source.replace(CHORD_TOKEN_PATTERN, (_match, chord: string): string =>
    `[${transposeChord(chord, semitones)}]`
  );

/**
 * Transpose a bare key label (e.g. the chart's `defaultKey`) by `semitones`
 * using the same chord algorithm, so the displayed key matches the transposed
 * chords' enharmonic spelling.
 */
export const transposeKey = (key: string, semitones: number): string =>
  transposeChord(key, semitones);
