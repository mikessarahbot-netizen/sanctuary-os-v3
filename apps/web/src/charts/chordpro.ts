/**
 * Tiny, presentation-only ChordPro reader for the detail view.
 *
 * This is deliberately a lightweight UI helper, not a port of the server's
 * `parseChordPro` domain logic: it splits a line into `[chord]lyric` segments
 * and recognizes `{directive}` / `{directive: value}` lines so the detail view
 * can render chords above lyrics. Pure and deterministic; no I/O.
 */
export interface ChordSegment {
  readonly chord: string | null;
  readonly lyric: string;
}

export type ChordProLine =
  | { readonly kind: "directive"; readonly name: string; readonly value: string | null }
  | { readonly kind: "blank" }
  | { readonly kind: "lyric"; readonly segments: readonly ChordSegment[] };

const parseDirective = (line: string): ChordProLine | null => {
  const match = /^\{([^:}]+)(?::\s*([^}]*))?\}$/.exec(line.trim());

  if (match === null) {
    return null;
  }

  const name = (match[1] ?? "").trim();
  const rawValue = match[2];
  const value = rawValue !== undefined && rawValue.trim().length > 0 ? rawValue.trim() : null;

  return { kind: "directive", name, value };
};

const parseLyricLine = (line: string): readonly ChordSegment[] => {
  const segments: ChordSegment[] = [];
  const pattern = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let pendingChord: string | null = null;
  let match: RegExpExecArray | null = pattern.exec(line);

  while (match !== null) {
    const lyric = line.slice(lastIndex, match.index);

    if (lyric.length > 0 || pendingChord !== null) {
      segments.push({ chord: pendingChord, lyric });
    }

    pendingChord = match[1] ?? "";
    lastIndex = match.index + match[0].length;
    match = pattern.exec(line);
  }

  const trailing = line.slice(lastIndex);

  if (trailing.length > 0 || pendingChord !== null) {
    segments.push({ chord: pendingChord, lyric: trailing });
  }

  return segments;
};

export const parseChordProLine = (line: string): ChordProLine => {
  if (line.trim().length === 0) {
    return { kind: "blank" };
  }

  const directive = parseDirective(line);

  if (directive !== null) {
    return directive;
  }

  return { kind: "lyric", segments: parseLyricLine(line) };
};

export const parseChordProSource = (source: string): readonly ChordProLine[] =>
  source.split("\n").map(parseChordProLine);
