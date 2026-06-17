import { describe, expect, it } from "vitest";
import {
  PadLayerSchema,
  PlayArrangementSchema,
  PlayCueSchema,
  PlaySectionSchema,
  PlaybackStateSchema,
  TrackSetSchema,
  parsePlaybackState,
  parseTrackSet
} from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";

const baseTrackSet = {
  createdAt: ISO,
  defaultKey: "G",
  songRef: "song-1",
  tempoBpm: 120,
  tenantId: "tenant-1",
  trackRefs: [
    { muted: false, role: "click", trackRef: "media-click" },
    { muted: false, role: "stem", trackRef: "media-stem" }
  ],
  trackSetId: "ts-1",
  updatedAt: ISO
} as const;

const baseArrangement = {
  arrangementRef: "arr-1",
  defaultKey: "G",
  label: "Default",
  sectionOrder: ["verse-1", "chorus-1"],
  songRef: "song-1",
  tempoBpm: 120,
  tenantId: "tenant-1"
} as const;

const baseSection = {
  arrangementRef: "arr-1",
  clickEnabledDefault: true,
  kind: "verse",
  lengthBars: 8,
  sectionId: "verse-1",
  tenantId: "tenant-1"
} as const;

const baseCue = {
  action: "play",
  createdAt: ISO,
  cueId: "cue-1",
  fireMode: "manual",
  label: "Start",
  markerOffsetBeats: 0,
  sectionId: "verse-1",
  tenantId: "tenant-1",
  trackSetId: "ts-1",
  updatedAt: ISO
} as const;

const basePadLayer = {
  gain: 0.5,
  key: "G",
  loop: true,
  padLayerRef: "pad-1",
  padMediaRef: "media-pad",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const basePlaybackState = {
  clickEnabled: true,
  positionBeats: 0,
  tenantId: "tenant-1",
  trackSetId: "ts-1",
  transportStatus: "stopped",
  updatedAt: ISO
} as const;

describe("TrackSetSchema", () => {
  it("accepts a valid tenant-scoped track set", () => {
    expect(() => parseTrackSet(baseTrackSet)).not.toThrow();
  });

  it("rejects a non-positive tempoBpm", () => {
    expect(TrackSetSchema.safeParse({ ...baseTrackSet, tempoBpm: 0 }).success).toBe(false);
    expect(TrackSetSchema.safeParse({ ...baseTrackSet, tempoBpm: -1 }).success).toBe(false);
  });

  it("rejects duplicate track members by trackRef", () => {
    const result = TrackSetSchema.safeParse({
      ...baseTrackSet,
      trackRefs: [
        { muted: false, role: "stem", trackRef: "dupe" },
        { muted: true, role: "guide", trackRef: "dupe" }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than one click member", () => {
    const result = TrackSetSchema.safeParse({
      ...baseTrackSet,
      trackRefs: [
        { muted: false, role: "click", trackRef: "click-a" },
        { muted: false, role: "click", trackRef: "click-b" }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("allows zero or one click member", () => {
    expect(
      TrackSetSchema.safeParse({
        ...baseTrackSet,
        trackRefs: [{ muted: false, role: "stem", trackRef: "only-stem" }]
      }).success
    ).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      TrackSetSchema.safeParse({ ...baseTrackSet, rawAudio: "bytes" }).success
    ).toBe(false);
  });
});

describe("PlayArrangementSchema", () => {
  it("accepts a valid arrangement", () => {
    expect(PlayArrangementSchema.safeParse(baseArrangement).success).toBe(true);
  });

  it("accepts a loopSectionRef that is in sectionOrder", () => {
    expect(
      PlayArrangementSchema.safeParse({ ...baseArrangement, loopSectionRef: "chorus-1" })
        .success
    ).toBe(true);
  });

  it("rejects a loopSectionRef absent from sectionOrder", () => {
    expect(
      PlayArrangementSchema.safeParse({ ...baseArrangement, loopSectionRef: "bridge-9" })
        .success
    ).toBe(false);
  });

  it("rejects empty-string entries in sectionOrder", () => {
    expect(
      PlayArrangementSchema.safeParse({ ...baseArrangement, sectionOrder: ["verse-1", ""] })
        .success
    ).toBe(false);
  });

  it("rejects a non-positive tempoBpm", () => {
    expect(
      PlayArrangementSchema.safeParse({ ...baseArrangement, tempoBpm: 0 }).success
    ).toBe(false);
  });
});

describe("PlaySectionSchema", () => {
  it("accepts a valid section", () => {
    expect(PlaySectionSchema.safeParse(baseSection).success).toBe(true);
  });

  it("rejects a negative lengthBars", () => {
    expect(
      PlaySectionSchema.safeParse({ ...baseSection, lengthBars: -1 }).success
    ).toBe(false);
  });

  it("rejects a non-integer lengthBars", () => {
    expect(
      PlaySectionSchema.safeParse({ ...baseSection, lengthBars: 2.5 }).success
    ).toBe(false);
  });

  it("rejects a kind outside the enum", () => {
    expect(
      PlaySectionSchema.safeParse({ ...baseSection, kind: "solo" }).success
    ).toBe(false);
  });
});

describe("PlayCueSchema", () => {
  it("accepts a plain play cue", () => {
    expect(PlayCueSchema.safeParse(baseCue).success).toBe(true);
  });

  it("requires targetSectionRef when action is jump", () => {
    expect(
      PlayCueSchema.safeParse({ ...baseCue, action: "jump" }).success
    ).toBe(false);
    expect(
      PlayCueSchema.safeParse({
        ...baseCue,
        action: "jump",
        targetSectionRef: "chorus-1"
      }).success
    ).toBe(true);
  });

  it("requires padLayerRef when action is pad-change", () => {
    expect(
      PlayCueSchema.safeParse({ ...baseCue, action: "pad-change" }).success
    ).toBe(false);
    expect(
      PlayCueSchema.safeParse({ ...baseCue, action: "pad-change", padLayerRef: "pad-1" })
        .success
    ).toBe(true);
  });

  it("rejects a negative markerOffsetBeats", () => {
    expect(
      PlayCueSchema.safeParse({ ...baseCue, markerOffsetBeats: -1 }).success
    ).toBe(false);
  });

  it("rejects an action outside the enum", () => {
    expect(PlayCueSchema.safeParse({ ...baseCue, action: "fade" }).success).toBe(false);
  });
});

describe("PadLayerSchema", () => {
  it("accepts a valid pad layer", () => {
    expect(PadLayerSchema.safeParse(basePadLayer).success).toBe(true);
  });

  it("accepts gain at the 0 and 1 bounds", () => {
    expect(PadLayerSchema.safeParse({ ...basePadLayer, gain: 0 }).success).toBe(true);
    expect(PadLayerSchema.safeParse({ ...basePadLayer, gain: 1 }).success).toBe(true);
  });

  it("rejects gain below 0 or above 1", () => {
    expect(PadLayerSchema.safeParse({ ...basePadLayer, gain: -0.1 }).success).toBe(false);
    expect(PadLayerSchema.safeParse({ ...basePadLayer, gain: 1.1 }).success).toBe(false);
  });
});

describe("PlaybackStateSchema", () => {
  it("accepts a valid coarse snapshot", () => {
    expect(() => parsePlaybackState(basePlaybackState)).not.toThrow();
  });

  it("rejects a negative positionBeats", () => {
    expect(
      PlaybackStateSchema.safeParse({ ...basePlaybackState, positionBeats: -1 }).success
    ).toBe(false);
  });

  it("allows a fractional (coarse) positionBeats", () => {
    expect(
      PlaybackStateSchema.safeParse({ ...basePlaybackState, positionBeats: 3.25 }).success
    ).toBe(true);
  });

  it("rejects a transportStatus outside the enum", () => {
    expect(
      PlaybackStateSchema.safeParse({ ...basePlaybackState, transportStatus: "buffering" })
        .success
    ).toBe(false);
  });
});
