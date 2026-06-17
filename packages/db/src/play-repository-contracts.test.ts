import { describe, expect, it } from "vitest";
import {
  PadLayerPersistenceRecordSchema,
  PlaybackStatePersistenceRecordSchema,
  PlayCuePersistenceRecordSchema,
  PlayPersistenceWriteOptionsSchema,
  TrackSetPersistenceRecordSchema
} from "./index.js";

const trackSet = {
  arrangementRef: "arrangement_1",
  createdAt: "2026-06-17T08:00:00.000Z",
  defaultKey: "G",
  schemaVersion: "play.v1",
  serviceRef: "service_1",
  songRef: "song_1",
  tempoBpm: 120,
  tenantId: "tenant_1",
  title: "Grace",
  trackRefs: [
    { label: "Click", muted: false, role: "click", trackRef: "media_click" },
    { muted: false, role: "stem", trackRef: "media_stem" }
  ],
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const cue = {
  action: "jump",
  createdAt: "2026-06-17T08:00:00.000Z",
  cueId: "cue_1",
  fireMode: "manual",
  label: "To chorus",
  markerOffsetBeats: 0,
  sectionId: "section_1",
  targetSectionRef: "section_2",
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const padLayer = {
  gain: 0.5,
  key: "G",
  label: "Warm pad",
  loop: true,
  padLayerRef: "pad_1",
  padMediaRef: "media_pad",
  sectionScopeRef: "section_1",
  songRef: "song_1",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

describe("Play persistence contracts", () => {
  it("accepts a valid track-set record", () => {
    expect(TrackSetPersistenceRecordSchema.parse(trackSet)).toEqual(trackSet);
  });

  it("rejects an unknown track-set field", () => {
    expect(() => TrackSetPersistenceRecordSchema.parse({ ...trackSet, extra: true })).toThrow();
  });

  it("requires the play schema version", () => {
    expect(() =>
      TrackSetPersistenceRecordSchema.parse({ ...trackSet, schemaVersion: "play.v2" })
    ).toThrow();
  });

  it("rejects a non-positive tempo", () => {
    expect(() => TrackSetPersistenceRecordSchema.parse({ ...trackSet, tempoBpm: 0 })).toThrow();
  });

  it("rejects more than one click member", () => {
    expect(() =>
      TrackSetPersistenceRecordSchema.parse({
        ...trackSet,
        trackRefs: [
          { muted: false, role: "click", trackRef: "media_click_a" },
          { muted: false, role: "click", trackRef: "media_click_b" }
        ]
      })
    ).toThrow("at most one click member");
  });

  it("rejects duplicate track members", () => {
    expect(() =>
      TrackSetPersistenceRecordSchema.parse({
        ...trackSet,
        trackRefs: [
          { muted: false, role: "stem", trackRef: "media_dup" },
          { muted: false, role: "guide", trackRef: "media_dup" }
        ]
      })
    ).toThrow("unique by trackRef");
  });

  it("accepts a valid jump cue", () => {
    expect(PlayCuePersistenceRecordSchema.parse(cue)).toEqual(cue);
  });

  it("rejects a jump cue without a target section", () => {
    expect(() =>
      PlayCuePersistenceRecordSchema.parse({
        action: "jump",
        createdAt: "2026-06-17T08:00:00.000Z",
        cueId: "cue_1",
        fireMode: "manual",
        label: "To chorus",
        markerOffsetBeats: 0,
        sectionId: "section_1",
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow("require a targetSectionRef");
  });

  it("rejects a pad-change cue without a pad layer", () => {
    expect(() =>
      PlayCuePersistenceRecordSchema.parse({
        action: "pad-change",
        createdAt: "2026-06-17T08:00:00.000Z",
        cueId: "cue_1",
        fireMode: "manual",
        label: "Swap pad",
        markerOffsetBeats: 0,
        sectionId: "section_1",
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow("require a padLayerRef");
  });

  it("accepts a valid pad-layer record", () => {
    expect(PadLayerPersistenceRecordSchema.parse(padLayer)).toEqual(padLayer);
  });

  it("rejects a pad gain above one", () => {
    expect(() => PadLayerPersistenceRecordSchema.parse({ ...padLayer, gain: 1.5 })).toThrow();
  });

  it("rejects a pad gain below zero", () => {
    expect(() => PadLayerPersistenceRecordSchema.parse({ ...padLayer, gain: -0.1 })).toThrow();
  });

  it("rejects a negative playback position", () => {
    expect(() =>
      PlaybackStatePersistenceRecordSchema.parse({
        clickEnabled: true,
        positionBeats: -1,
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        transportStatus: "playing",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow();
  });

  it("requires an actor on write options", () => {
    expect(() =>
      PlayPersistenceWriteOptionsSchema.parse({
        context: { requestId: "request_1", tenantId: "tenant_1" },
        intent: "update"
      })
    ).toThrow("require an actor");
  });
});
