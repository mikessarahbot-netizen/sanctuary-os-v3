import { describe, expect, it, vi } from "vitest";
import { createPlayClient, DEFAULT_API_URL } from "./client.js";
import { SAMPLE_TRACK_SETS, findSampleTrackSetDetail } from "./sample-data.js";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });

const queryOf = (init: RequestInit | undefined): string => {
  const body = init?.body;

  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  return (JSON.parse(body) as { query: string }).query;
};

const detail = findSampleTrackSetDetail("track-set-build-my-life");

if (detail === undefined) {
  throw new Error("Expected the seeded sample track set detail.");
}

describe("createPlayClient", () => {
  it("POSTs the trackSets query to the configured endpoint and returns the list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { trackSets: SAMPLE_TRACK_SETS } }))
    );

    const trackSets = await createPlayClient({
      endpoint: "http://example.test/graphql",
      fetchImpl
    }).listTrackSets();

    expect(trackSets).toEqual(SAMPLE_TRACK_SETS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://example.test/graphql");
    expect(init?.method).toBe("POST");
    expect(queryOf(init)).toContain("trackSets");
  });

  it("defaults the endpoint to the api http listener path", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { trackSets: [] } }))
    );

    await createPlayClient({ fetchImpl }).listTrackSets();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DEFAULT_API_URL);
  });

  it("assembles a track set detail from the trackSet, playSections, and playCues queries", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const query = queryOf(init);

      if (query.includes("trackSet(id:")) {
        return Promise.resolve(jsonResponse({ data: { trackSet: detail.trackSet } }));
      }

      if (query.includes("playSections(")) {
        return Promise.resolve(
          jsonResponse({ data: { playSections: detail.sections } })
        );
      }

      if (query.includes("playCues(")) {
        return Promise.resolve(jsonResponse({ data: { playCues: detail.cues } }));
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const result = await createPlayClient({ fetchImpl }).getTrackSetDetail(
      "track-set-build-my-life"
    );

    expect(result).toEqual(detail);
    // trackSet -> playSections (arrangementRef present) -> playCues.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(queryOf(fetchImpl.mock.calls[0]?.[1])).toContain("GetTrackSet");
    expect(queryOf(fetchImpl.mock.calls[1]?.[1])).toContain("ListPlaySections");
    expect(queryOf(fetchImpl.mock.calls[2]?.[1])).toContain("ListPlayCues");
  });

  it("returns null and does not query sections/cues when the track set is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { trackSet: null } }))
    );

    const result = await createPlayClient({ fetchImpl }).getTrackSetDetail("missing");

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips the playSections query when the track set has no arrangementRef", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const query = queryOf(init);

      if (query.includes("trackSet(id:")) {
        return Promise.resolve(
          jsonResponse({
            data: { trackSet: { ...detail.trackSet, arrangementRef: null } }
          })
        );
      }

      if (query.includes("playCues(")) {
        return Promise.resolve(jsonResponse({ data: { playCues: [] } }));
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const result = await createPlayClient({ fetchImpl }).getTrackSetDetail(
      "track-set-build-my-life"
    );

    expect(result?.sections).toEqual([]);
    // trackSet + playCues only — no playSections call.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws the first GraphQL error message", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ errors: [{ message: "Unauthorized." }] }))
    );

    await expect(
      createPlayClient({ fetchImpl }).listTrackSets()
    ).rejects.toThrow("Unauthorized.");
  });

  it("throws when the HTTP status is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("nope", { status: 500 }))
    );

    await expect(createPlayClient({ fetchImpl }).listTrackSets()).rejects.toThrow(
      "HTTP 500"
    );
  });
});
