import { describe, expect, it } from "vitest";
import { parseChordProLine, parseChordProSource } from "./chordpro.js";

describe("parseChordProLine", () => {
  it("parses a directive without a value", () => {
    expect(parseChordProLine("{start_of_verse}")).toEqual({
      kind: "directive",
      name: "start_of_verse",
      value: null
    });
  });

  it("parses a directive with a value", () => {
    expect(parseChordProLine("{title: Amazing Grace}")).toEqual({
      kind: "directive",
      name: "title",
      value: "Amazing Grace"
    });
  });

  it("treats whitespace-only lines as blank", () => {
    expect(parseChordProLine("   ")).toEqual({ kind: "blank" });
  });

  it("splits a lyric line into chord/lyric segments", () => {
    const line = parseChordProLine("[G]Amazing [G7]grace");

    expect(line).toEqual({
      kind: "lyric",
      segments: [
        { chord: "G", lyric: "Amazing " },
        { chord: "G7", lyric: "grace" }
      ]
    });
  });

  it("keeps leading lyrics that precede the first chord", () => {
    const line = parseChordProLine("That [G]saved");

    expect(line).toEqual({
      kind: "lyric",
      segments: [
        { chord: null, lyric: "That " },
        { chord: "G", lyric: "saved" }
      ]
    });
  });
});

describe("parseChordProSource", () => {
  it("returns one parsed line per source line", () => {
    const lines = parseChordProSource("{title: X}\n\n[C]Hi");

    expect(lines.map((line) => line.kind)).toEqual(["directive", "blank", "lyric"]);
  });
});
