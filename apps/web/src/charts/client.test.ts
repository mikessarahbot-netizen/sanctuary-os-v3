import { describe, expect, it, vi } from "vitest";
import { createChartsClient, DEFAULT_API_URL } from "./client.js";
import { SAMPLE_CHARTS } from "./sample-data.js";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });

const requestBody = (init: RequestInit | undefined): string => {
  const body = init?.body;

  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  return body;
};

describe("createChartsClient", () => {
  it("POSTs the charts query to the configured endpoint and returns the list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { charts: SAMPLE_CHARTS } }))
    );

    const charts = await createChartsClient({
      endpoint: "http://example.test/graphql",
      fetchImpl
    }).listCharts();

    expect(charts).toEqual(SAMPLE_CHARTS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://example.test/graphql");
    expect(init?.method).toBe("POST");
    const body = init?.body;
    expect(typeof body).toBe("string");
    expect(body as string).toContain("charts");
  });

  it("defaults the endpoint to the api http listener path", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { chart: SAMPLE_CHARTS[0] } }))
    );

    await createChartsClient({ fetchImpl }).getChart("chart-amazing-grace");

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DEFAULT_API_URL);
  });

  it("throws the first GraphQL error message", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ errors: [{ message: "Unauthorized." }] }))
    );

    await expect(
      createChartsClient({ fetchImpl }).listCharts()
    ).rejects.toThrow("Unauthorized.");
  });

  it("throws when the HTTP status is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("nope", { status: 500 }))
    );

    await expect(createChartsClient({ fetchImpl }).listCharts()).rejects.toThrow(
      "HTTP 500"
    );
  });

  it("POSTs the updateChartSource mutation with the input and returns the chart", async () => {
    const [firstChart] = SAMPLE_CHARTS;

    if (firstChart === undefined) {
      throw new Error("Expected at least one sample chart.");
    }

    const updated = { ...firstChart, chordProSource: "[C]New source" };
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { updateChartSource: updated } }))
    );

    const chart = await createChartsClient({ fetchImpl }).updateChartSource(
      firstChart.chartId,
      "[C]New source"
    );

    expect(chart).toEqual(updated);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    const body = JSON.parse(requestBody(init)) as {
      query: string;
      variables: { input: Record<string, unknown> };
    };
    expect(body.query).toContain("mutation UpdateChartSource");
    expect(body.query).toContain("$input: UpdateChartSourceInput!");
    expect(body.variables.input).toEqual({
      chartId: firstChart.chartId,
      chordProSource: "[C]New source"
    });
  });

  it("includes defaultKey in the mutation input only when provided", async () => {
    const [firstChart] = SAMPLE_CHARTS;

    if (firstChart === undefined) {
      throw new Error("Expected at least one sample chart.");
    }

    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { updateChartSource: firstChart } }))
    );

    await createChartsClient({ fetchImpl }).updateChartSource(
      firstChart.chartId,
      "[C]New source",
      "E"
    );

    const body = JSON.parse(requestBody(fetchImpl.mock.calls[0]?.[1])) as {
      variables: { input: Record<string, unknown> };
    };
    expect(body.variables.input).toEqual({
      chartId: firstChart.chartId,
      chordProSource: "[C]New source",
      defaultKey: "E"
    });
  });
});
