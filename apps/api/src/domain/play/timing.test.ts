import { describe, expect, it } from "vitest";
import {
  DEFAULT_METER,
  barsBeatsToBeats,
  barsBeatsToSeconds,
  beatsToBarsBeats,
  beatsToSeconds,
  secondsToBarsBeats,
  secondsToBeats,
  transposePlayKey,
  type Meter
} from "./timing.js";

describe("bars/beats <-> beats", () => {
  it("converts bars and beats to total beats in 4/4 by default", () => {
    expect(barsBeatsToBeats({ bars: 2, beats: 1 })).toBe(9);
    expect(barsBeatsToBeats({ bars: 0, beats: 0 })).toBe(0);
  });

  it("honors a non-4/4 meter", () => {
    const threeFour: Meter = { beatUnit: 4, beatsPerBar: 3 };

    expect(barsBeatsToBeats({ bars: 2, beats: 0 }, threeFour)).toBe(6);
  });

  it("splits total beats back into bars and beats", () => {
    expect(beatsToBarsBeats(9)).toEqual({ bars: 2, beats: 1 });
  });

  it("round-trips bars/beats through total beats", () => {
    for (const position of [
      { bars: 0, beats: 0 },
      { bars: 1, beats: 2 },
      { bars: 7, beats: 3 }
    ]) {
      expect(beatsToBarsBeats(barsBeatsToBeats(position))).toEqual(position);
    }
  });
});

describe("beats <-> seconds", () => {
  it("converts beats to seconds at a tempo", () => {
    expect(beatsToSeconds(4, 120)).toBe(2);
    expect(beatsToSeconds(0, 120)).toBe(0);
  });

  it("converts seconds to beats at a tempo", () => {
    expect(secondsToBeats(2, 120)).toBe(4);
  });

  it("round-trips beats through seconds at several tempos", () => {
    for (const tempo of [60, 90, 120, 137]) {
      expect(secondsToBeats(beatsToSeconds(8, tempo), tempo)).toBeCloseTo(8, 10);
    }
  });
});

describe("bars/beats <-> seconds", () => {
  it("places a bars/beats position at the right number of seconds", () => {
    // 1 bar (4 beats) at 120 BPM = 2s; +2 beats = 1s more => 3s.
    expect(barsBeatsToSeconds({ bars: 1, beats: 2 }, 120)).toBe(3);
  });

  it("round-trips a position through seconds deterministically", () => {
    const meter: Meter = { beatUnit: 4, beatsPerBar: 4 };
    const position = { bars: 3, beats: 1 };
    const seconds = barsBeatsToSeconds(position, 100, meter);

    expect(secondsToBarsBeats(seconds, 100, meter)).toEqual(position);
    // Determinism: same inputs, same output, twice.
    expect(barsBeatsToSeconds(position, 100, meter)).toBe(seconds);
  });

  it("uses 4/4 as the default meter", () => {
    expect(barsBeatsToSeconds({ bars: 1, beats: 0 }, 120, DEFAULT_METER)).toBe(
      barsBeatsToSeconds({ bars: 1, beats: 0 }, 120)
    );
  });

  it("rejects a non-positive tempo", () => {
    expect(() => barsBeatsToSeconds({ bars: 1, beats: 0 }, 0)).toThrow();
  });
});

describe("transposePlayKey", () => {
  it("transposes a key using the Charts sharp-enharmonic policy", () => {
    expect(transposePlayKey("G", 2)).toBe("A");
    expect(transposePlayKey("F", 1)).toBe("F#");
    expect(transposePlayKey("B", 2)).toBe("C#");
  });

  it("leaves a sharp/natural key unchanged at zero semitones", () => {
    expect(transposePlayKey("G", 0)).toBe("G");
    expect(transposePlayKey("F#", 0)).toBe("F#");
  });

  it("re-spells a flat key to its sharp equivalent (fixed sharp-enharmonic policy)", () => {
    // Matches Charts transposeChord: flats normalize to sharps even at zero.
    expect(transposePlayKey("Bb", 0)).toBe("A#");
    expect(transposePlayKey("Eb", 2)).toBe("F");
  });

  it("passes a non-chord-shaped key through unchanged (flagged passthrough)", () => {
    expect(transposePlayKey("H?", 2)).toBe("H?");
  });
});
