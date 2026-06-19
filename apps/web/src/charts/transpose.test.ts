import { describe, expect, it } from "vitest";
import { transposeChord, transposeChordProSource, transposeKey } from "./transpose.js";

describe("transposeChord", () => {
  it("shifts the root up and preserves the quality", () => {
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("Am7", 3)).toBe("Cm7");
    expect(transposeChord("Fmaj7", 1)).toBe("F#maj7");
  });

  it("shifts the bass note of a slash chord", () => {
    expect(transposeChord("C/E", 1)).toBe("C#/F");
    // The musician's canonical example: G/B up two semitones -> A/C#.
    expect(transposeChord("G/B", 2)).toBe("A/C#");
  });

  it("wraps around the octave in both directions", () => {
    expect(transposeChord("B", 2)).toBe("C#");
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("G", -2)).toBe("F");
    expect(transposeChord("C", -1)).toBe("B");
  });

  it("uses the fixed sharp enharmonic policy", () => {
    // Flats in the input resolve to their sharp spelling on output.
    expect(transposeChord("Bb", 0)).toBe("A#");
    expect(transposeChord("Eb", 0)).toBe("D#");
    expect(transposeChord("F", 1)).toBe("F#");
    expect(transposeChord("A", 1)).toBe("A#");
  });

  it("passes non-chord tokens through unchanged", () => {
    expect(transposeChord("N.C.", 2)).toBe("N.C.");
  });
});

describe("transposeChordProSource", () => {
  it("transposes every chord token up", () => {
    expect(transposeChordProSource("[G]Amazing [G7]grace", 2)).toBe(
      "[A]Amazing [A7]grace"
    );
  });

  it("transposes every chord token down", () => {
    expect(transposeChordProSource("[G]Amazing [Em]grace", -2)).toBe(
      "[F]Amazing [Dm]grace"
    );
  });

  it("wraps the octave (G -> A at +2)", () => {
    expect(transposeChordProSource("[G]sound", 2)).toBe("[A]sound");
  });

  it("transposes slash-chord bass notes", () => {
    expect(transposeChordProSource("[G/B]here", 2)).toBe("[A/C#]here");
  });

  it("applies the sharp enharmonic policy (Bb -> A#)", () => {
    expect(transposeChordProSource("[Bb]flat", 0)).toBe("[A#]flat");
  });

  it("leaves lyrics, directives, and other text untouched", () => {
    const source = "{title: Amazing Grace}\n{key: G}\nThat [G]saved a [Em]wretch";
    expect(transposeChordProSource(source, 2)).toBe(
      "{title: Amazing Grace}\n{key: G}\nThat [A]saved a [F#m]wretch"
    );
  });

  it("is a no-op at zero semitones", () => {
    const source = "{start_of_verse}\n[G]Amazing [G7]grace how [C]sweet the [G]sound";
    expect(transposeChordProSource(source, 0)).toBe(source);
  });
});

describe("transposeKey", () => {
  it("shifts a bare key label using the chord algorithm", () => {
    expect(transposeKey("G", 2)).toBe("A");
    expect(transposeKey("D", 1)).toBe("D#");
    expect(transposeKey("C", 0)).toBe("C");
  });
});
