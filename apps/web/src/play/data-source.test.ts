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
});
