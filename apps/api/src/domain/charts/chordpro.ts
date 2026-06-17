import { z } from "zod";

/**
 * ChordPro domain for the Charts module.
 *
 * `parseChordPro` turns ChordPro source text into a validated, structured
 * `ChordProDocument` (title/artist/key directives, named sections, and inline
 * `[chord]lyric` segments). `transposeChordProDocument` shifts every chord (and
 * the document key) by a semitone offset using a fixed sharp enharmonic policy.
 * Both are pure: no I/O, deterministic, and Zod-validated, per the Charts plan.
 */
export const ChartSectionKindSchema = z.enum([
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "instrumental",
  "tag",
  "outro",
  "other"
]);

export const ChartSegmentSchema = z
  .object({
    chord: z.string().min(1).optional(),
    lyric: z.string()
  })
  .strict();

export const ChartLineSchema = z
  .object({
    segments: z.array(ChartSegmentSchema)
  })
  .strict();

export const ChartSectionSchema = z
  .object({
    kind: ChartSectionKindSchema,
    label: z.string().min(1).optional(),
    lines: z.array(ChartLineSchema)
  })
  .strict();

export const ChordProDocumentSchema = z
  .object({
    artist: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    sections: z.array(ChartSectionSchema),
    title: z.string().min(1).optional()
  })
  .strict();

export type ChartSectionKind = z.infer<typeof ChartSectionKindSchema>;
export type ChartSegment = z.infer<typeof ChartSegmentSchema>;
export type ChartLine = z.infer<typeof ChartLineSchema>;
export type ChartSection = z.infer<typeof ChartSectionSchema>;
export type ChordProDocument = z.infer<typeof ChordProDocumentSchema>;

interface MutableSection {
  kind: ChartSectionKind;
  label: string | undefined;
  lines: ChartLine[];
}

const SECTION_START_ALIASES: Readonly<Record<string, ChartSectionKind>> = {
  sob: "bridge",
  soc: "chorus",
  soi: "instrumental",
  sop: "prechorus",
  sov: "verse"
};

const SECTION_END_ALIASES: ReadonlySet<string> = new Set(["eob", "eoc", "eoi", "eop", "eov"]);

const SECTION_KINDS: ReadonlySet<string> = new Set(ChartSectionKindSchema.options);

const splitOnce = (value: string, separator: string): readonly [string, string | undefined] => {
  const index = value.indexOf(separator);

  return index === -1 ? [value, undefined] : [value.slice(0, index), value.slice(index + 1)];
};

const sectionStartKind = (name: string): ChartSectionKind | undefined => {
  if (name in SECTION_START_ALIASES) {
    return SECTION_START_ALIASES[name];
  }

  if (name.startsWith("start_of_")) {
    const kind = name.slice("start_of_".length);

    return SECTION_KINDS.has(kind) ? (kind as ChartSectionKind) : "other";
  }

  return undefined;
};

const isSectionEnd = (name: string): boolean =>
  SECTION_END_ALIASES.has(name) || name.startsWith("end_of_");

const parseChartLine = (text: string): ChartLine => {
  const segments: ChartSegment[] = [];
  const firstBracket = text.indexOf("[");

  if (firstBracket === -1) {
    return { segments: text.length > 0 ? [{ lyric: text }] : [] };
  }

  if (firstBracket > 0) {
    segments.push({ lyric: text.slice(0, firstBracket) });
  }

  const pattern = /\[([^\]]+)\]([^[]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const chord = match[1];
    const lyric = match[2] ?? "";

    segments.push(chord !== undefined ? { chord, lyric } : { lyric });
  }

  return { segments };
};

export const parseChordPro = (source: string): ChordProDocument => {
  const sections: ChartSection[] = [];
  let current: MutableSection | undefined;
  let title: string | undefined;
  let artist: string | undefined;
  let key: string | undefined;

  const flush = (): void => {
    if (current !== undefined && current.lines.length > 0) {
      sections.push(
        ChartSectionSchema.parse({
          kind: current.kind,
          lines: current.lines,
          ...(current.label !== undefined ? { label: current.label } : {})
        })
      );
    }
    current = undefined;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const directive = /^\{([^}]*)\}$/.exec(line);

    if (directive !== null) {
      const [nameRaw, valueRaw] = splitOnce(directive[1] ?? "", ":");
      const name = nameRaw.trim().toLowerCase();
      const value = valueRaw?.trim();
      const startKind = sectionStartKind(name);

      if (name === "title" || name === "t") {
        title = value;
      } else if (name === "artist" || name === "subtitle" || name === "st") {
        artist = value;
      } else if (name === "key") {
        key = value;
      } else if (startKind !== undefined) {
        flush();
        current = { kind: startKind, label: value, lines: [] };
      } else if (isSectionEnd(name)) {
        flush();
      }

      continue;
    }

    if (current === undefined) {
      current = { kind: "other", label: undefined, lines: [] };
    }

    current.lines.push(parseChartLine(line));
  }

  flush();

  return ChordProDocumentSchema.parse({
    sections,
    ...(title !== undefined ? { title } : {}),
    ...(artist !== undefined ? { artist } : {}),
    ...(key !== undefined ? { key } : {})
  });
};

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

export const transposeChordProDocument = (
  document: ChordProDocument,
  semitones: number
): ChordProDocument => {
  const parsed = ChordProDocumentSchema.parse(document);

  return ChordProDocumentSchema.parse({
    sections: parsed.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        segments: line.segments.map((segment) =>
          segment.chord !== undefined
            ? { ...segment, chord: transposeChord(segment.chord, semitones) }
            : segment
        )
      }))
    })),
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.artist !== undefined ? { artist: parsed.artist } : {}),
    ...(parsed.key !== undefined ? { key: transposeChord(parsed.key, semitones) } : {})
  });
};
