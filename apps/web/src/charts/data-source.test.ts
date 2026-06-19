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
});
