import { describe, expect, it, vi } from "vitest";
import { createChartsClient, DEFAULT_API_URL } from "./client.js";
import { SAMPLE_CHARTS } from "./sample-data.js";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });

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
});
