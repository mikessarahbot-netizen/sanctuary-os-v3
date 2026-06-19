import { describe, expect, it } from "vitest";
import {
  createDemoPlayDataSource,
  resolvePlayDataSourceMode
} from "./data-source.js";
import { SAMPLE_TRACK_SETS } from "./sample-data.js";

describe("resolvePlayDataSourceMode", () => {
  it("defaults to demo", () => {
    expect(resolvePlayDataSourceMode()).toBe("demo");
  });

  it("honors an explicit mode argument first", () => {
    expect(resolvePlayDataSourceMode({ mode: "live", search: "?demo" })).toBe("live");
  });

  it("reads ?demo from the query string", () => {
    expect(resolvePlayDataSourceMode({ search: "?demo", envValue: "live" })).toBe("demo");
  });

  it("reads ?source=live from the query string", () => {
    expect(resolvePlayDataSourceMode({ search: "?source=live" })).toBe("live");
  });

  it("falls back to the env value", () => {
    expect(resolvePlayDataSourceMode({ envValue: "live" })).toBe("live");
  });
});

describe("createDemoPlayDataSource", () => {
  it("lists the seeded sample track sets", async () => {
    const trackSets = await createDemoPlayDataSource().listTrackSets();

    expect(trackSets).toEqual(SAMPLE_TRACK_SETS);
  });

  it("resolves a single track set's detail by id with its sections and cues", async () => {
    const detail = await createDemoPlayDataSource().getTrackSetDetail(
      "track-set-build-my-life"
    );

    expect(detail?.trackSet.title).toBe("Build My Life");
    expect(detail?.sections.map((section) => section.sectionId)).toEqual([
      "section-bml-intro",
      "section-bml-verse",
      "section-bml-chorus"
    ]);
    expect(detail?.cues.map((cue) => cue.cueId)).toEqual([
      "cue-bml-start",
      "cue-bml-to-chorus"
    ]);
  });

  it("resolves null for an unknown track set id", async () => {
    const detail = await createDemoPlayDataSource().getTrackSetDetail("missing");

    expect(detail).toBeNull();
  });

  it("resolves the seeded initial playback state for Build My Life", async () => {
    const state = await createDemoPlayDataSource().getPlaybackState(
      "track-set-build-my-life"
    );

    expect(state).toEqual({
      activePadLayerRef: null,
      activeSectionRef: "section-bml-intro",
      clickEnabled: true,
      positionBeats: 0,
      tenantId: "tenant-demo",
      trackSetId: "track-set-build-my-life",
      transportStatus: "stopped",
      updatedAt: "2026-04-12T17:30:00.000Z"
    });
  });

  it("resolves null playback state for a track set with no seed", async () => {
    const state = await createDemoPlayDataSource().getPlaybackState(
      "track-set-goodness-of-god"
    );

    expect(state).toBeNull();
  });

  it("persists a setPlaybackState write for later reads in the same session", async () => {
    const dataSource = createDemoPlayDataSource();

    const updated = await dataSource.setPlaybackState({
      activeSectionRef: "section-bml-chorus",
      clickEnabled: false,
      positionBeats: 16,
      trackSetId: "track-set-build-my-life",
      transportStatus: "playing"
    });

    expect(updated.transportStatus).toBe("playing");
    expect(updated.activeSectionRef).toBe("section-bml-chorus");
    expect(updated.clickEnabled).toBe(false);

    const reread = await dataSource.getPlaybackState("track-set-build-my-life");
    expect(reread?.transportStatus).toBe("playing");
    expect(reread?.activeSectionRef).toBe("section-bml-chorus");
  });

  it("normalizes an omitted active section ref to null on read", async () => {
    const dataSource = createDemoPlayDataSource();

    const updated = await dataSource.setPlaybackState({
      clickEnabled: true,
      positionBeats: 0,
      trackSetId: "track-set-goodness-of-god",
      transportStatus: "stopped"
    });

    expect(updated.activeSectionRef).toBeNull();
    expect(updated.activePadLayerRef).toBeNull();
  });

  it("keeps per-instance playback writes isolated between data sources", async () => {
    const first = createDemoPlayDataSource();
    await first.setPlaybackState({
      clickEnabled: true,
      positionBeats: 0,
      trackSetId: "track-set-build-my-life",
      transportStatus: "playing"
    });

    // A fresh data source re-seeds from the fixture, so the prior write does not
    // leak across instances.
    const second = createDemoPlayDataSource();
    const state = await second.getPlaybackState("track-set-build-my-life");
    expect(state?.transportStatus).toBe("stopped");
  });
});
