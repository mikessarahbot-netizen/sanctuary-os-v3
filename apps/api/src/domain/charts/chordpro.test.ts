import { describe, expect, it } from "vitest";
import {
  parseChordPro,
  transposeChord,
  transposeChordProDocument,
  type ChordProDocument
} from "./chordpro.js";

describe("parseChordPro", () => {
  it("parses directives, sections, and inline chords", () => {
    const source = [
      "{title: Amazing Grace}",
      "{artist: John Newton}",
      "{key: G}",
      "{start_of_verse}",
      "[G]Amazing [G7]grace how [C]sweet the [G]sound",
      "{end_of_verse}",
      "{start_of_chorus: Refrain}",
      "[D]Praise [G]Him"
    ].join("\n");

    expect(parseChordPro(source)).toEqual({
      artist: "John Newton",
      key: "G",
      sections: [
        {
          kind: "verse",
          lines: [
            {
              segments: [
                { chord: "G", lyric: "Amazing " },
                { chord: "G7", lyric: "grace how " },
                { chord: "C", lyric: "sweet the " },
                { chord: "G", lyric: "sound" }
              ]
            }
          ]
        },
        {
          kind: "chorus",
          label: "Refrain",
          lines: [{ segments: [{ chord: "D", lyric: "Praise " }, { chord: "G", lyric: "Him" }] }]
        }
      ],
      title: "Amazing Grace"
    });
  });

  it("collects directive-free lines into a default section with leading lyrics", () => {
    expect(parseChordPro("Amazing [D]grace")).toEqual({
      sections: [
        {
          kind: "other",
          lines: [{ segments: [{ lyric: "Amazing " }, { chord: "D", lyric: "grace" }] }]
        }
      ]
    });
  });

  it("ignores blank lines and unknown directives", () => {
    expect(parseChordPro("\n{x_unknown}\n[A]hi\n")).toEqual({
      sections: [{ kind: "other", lines: [{ segments: [{ chord: "A", lyric: "hi" }] }] }]
    });
  });
});

describe("transposeChord", () => {
  it("shifts the root up and preserves the quality", () => {
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("Am7", 3)).toBe("Cm7");
    expect(transposeChord("Fmaj7", 1)).toBe("F#maj7");
  });

  it("shifts the bass note of a slash chord", () => {
    expect(transposeChord("C/E", 1)).toBe("C#/F");
  });

  it("wraps around the octave in both directions", () => {
    expect(transposeChord("B", 2)).toBe("C#");
    expect(transposeChord("G", -2)).toBe("F");
    expect(transposeChord("C", -1)).toBe("B");
  });

  it("passes non-chord tokens through unchanged", () => {
    expect(transposeChord("N.C.", 2)).toBe("N.C.");
  });
});

describe("transposeChordProDocument", () => {
  it("transposes every chord and the document key", () => {
    const document: ChordProDocument = parseChordPro("{key: G}\n[G]hi [Am]there");

    expect(transposeChordProDocument(document, 2)).toEqual({
      key: "A",
      sections: [
        {
          kind: "other",
          lines: [{ segments: [{ chord: "A", lyric: "hi " }, { chord: "Bm", lyric: "there" }] }]
        }
      ]
    });
  });

  it("is a no-op at zero semitones", () => {
    const document = parseChordPro("[C]test");

    expect(transposeChordProDocument(document, 0)).toEqual(document);
  });
});
