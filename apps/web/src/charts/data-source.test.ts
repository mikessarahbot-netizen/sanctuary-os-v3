import { describe, expect, it } from "vitest";
import {
  createDemoChartsDataSource,
  resolveChartsDataSourceMode
} from "./data-source.js";
import { SAMPLE_CHARTS } from "./sample-data.js";

describe("resolveChartsDataSourceMode", () => {
  it("defaults to demo", () => {
    expect(resolveChartsDataSourceMode()).toBe("demo");
  });

  it("honors an explicit mode argument first", () => {
    expect(resolveChartsDataSourceMode({ mode: "live", search: "?demo" })).toBe("live");
  });

  it("reads ?demo from the query string", () => {
    expect(resolveChartsDataSourceMode({ search: "?demo", envValue: "live" })).toBe("demo");
  });

  it("reads ?source=live from the query string", () => {
    expect(resolveChartsDataSourceMode({ search: "?source=live" })).toBe("live");
  });

  it("falls back to the env value", () => {
    expect(resolveChartsDataSourceMode({ envValue: "live" })).toBe("live");
  });
});

describe("createDemoChartsDataSource", () => {
  it("lists the seeded sample charts", async () => {
    const charts = await createDemoChartsDataSource().listCharts();

    expect(charts).toEqual(SAMPLE_CHARTS);
  });

  it("resolves a single chart by id", async () => {
    const chart = await createDemoChartsDataSource().getChart("chart-cornerstone");

    expect(chart?.title).toBe("Cornerstone");
  });

  it("resolves null for an unknown chart id", async () => {
    const chart = await createDemoChartsDataSource().getChart("missing");

    expect(chart).toBeNull();
  });

  it("persists an updated ChordPro source across later reads and preserves other fields", async () => {
    const source = createDemoChartsDataSource();
    const before = await source.getChart("chart-cornerstone");

    if (before === null) {
      throw new Error("Expected the seeded chart.");
    }

    const updated = await source.updateChartSource(
      "chart-cornerstone",
      "{title: Cornerstone}\n[C]Edited line"
    );

    expect(updated.chordProSource).toBe("{title: Cornerstone}\n[C]Edited line");
    // Identity / unrelated fields are preserved; only updatedAt changes.
    expect(updated.title).toBe("Cornerstone");
    expect(updated.defaultKey).toBe(before.defaultKey);
    expect(updated.songRef).toBe(before.songRef);
    expect(updated.createdAt).toBe(before.createdAt);

    // The write persists for subsequent reads from the same source instance.
    const after = await source.getChart("chart-cornerstone");
    expect(after?.chordProSource).toBe("{title: Cornerstone}\n[C]Edited line");
    const listed = await source.listCharts();
    expect(
      listed.find((chart) => chart.chartId === "chart-cornerstone")?.chordProSource
    ).toBe("{title: Cornerstone}\n[C]Edited line");
  });

  it("applies defaultKey when provided", async () => {
    const source = createDemoChartsDataSource();

    const updated = await source.updateChartSource(
      "chart-cornerstone",
      "[D]Edited",
      "D"
    );

    expect(updated.defaultKey).toBe("D");
  });

  it("does not mutate the shared SAMPLE_CHARTS fixture", async () => {
    const source = createDemoChartsDataSource();
    await source.updateChartSource("chart-cornerstone", "[C]Edited");

    expect(
      SAMPLE_CHARTS.find((chart) => chart.chartId === "chart-cornerstone")
        ?.chordProSource
    ).not.toContain("Edited");
  });

  it("rejects when updating an unknown chart id", async () => {
    await expect(
      createDemoChartsDataSource().updateChartSource("missing", "[C]x")
    ).rejects.toThrow("Chart not found: missing");
  });
});
