import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoServer, DemoAuthBoundary } from "./server.js";

/**
 * Gate test for the runnable demo server.
 *
 * Boots the composed demo server on an ephemeral port, performs real HTTP POSTs
 * to `/graphql`, and asserts the seeded Charts round-trip end-to-end (and that a
 * mutation persists into a subsequent query). This proves the server actually
 * runs over a socket — not just that the resolver functions resolve — so the
 * parent can rely on `pnpm --filter @sanctuary-os/api dev` serving live data.
 */
interface GraphqlChart {
  readonly chartId: string;
  readonly defaultKey: string;
  readonly title: string | null;
}

interface GraphqlBody<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly { readonly message: string }[];
}

const DEMO_AUTH_HEADER = "Bearer demo-token";

describe("createDemoServer", () => {
  const servers: Server[] = [];

  const startServer = async (server: Server): Promise<string> => {
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;

    return `http://127.0.0.1:${String(address.port)}/graphql`;
  };

  const postGraphql = async <TData>(
    endpoint: string,
    body: Readonly<Record<string, unknown>>
  ): Promise<GraphqlBody<TData>> => {
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers: { authorization: DEMO_AUTH_HEADER, "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(200);

    return (await response.json()) as GraphqlBody<TData>;
  };

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          })
      )
    );
  });

  it("serves the seeded charts over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{ readonly charts: readonly GraphqlChart[] }>(endpoint, {
      query: "{ charts { chartId title defaultKey } }"
    });

    expect(payload.errors).toBeUndefined();
    const titles = (payload.data?.charts ?? []).map((chart) => chart.title);
    expect(titles).toContain("Amazing Grace");
    expect(titles).toContain("How Great Thou Art");
    expect(titles).toContain("Cornerstone");
  });

  it("resolves a single seeded chart by id over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{ readonly chart: GraphqlChart | null }>(endpoint, {
      query: "query GetChart($id: ID!) { chart(id: $id) { chartId title defaultKey } }",
      variables: { id: "chart-cornerstone" }
    });

    expect(payload.errors).toBeUndefined();
    expect(payload.data?.chart).toEqual({
      chartId: "chart-cornerstone",
      defaultKey: "C",
      title: "Cornerstone"
    });
  });

  it("round-trips a saveChart mutation into a follow-up query over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const mutation = await postGraphql<{ readonly saveChart: GraphqlChart }>(endpoint, {
      query:
        "mutation Save($input: SaveChartInput!) { saveChart(input: $input) { chartId title defaultKey } }",
      variables: {
        input: {
          chartId: "chart-demo-roundtrip",
          chordProSource: "{title: Demo Round Trip}\n[A]Live [D]from the [E]server",
          defaultKey: "A",
          songRef: "song-demo-roundtrip",
          title: "Demo Round Trip"
        }
      }
    });

    expect(mutation.errors).toBeUndefined();
    expect(mutation.data?.saveChart.chartId).toBe("chart-demo-roundtrip");

    const query = await postGraphql<{ readonly chart: GraphqlChart | null }>(endpoint, {
      query: "query GetChart($id: ID!) { chart(id: $id) { chartId title } }",
      variables: { id: "chart-demo-roundtrip" }
    });

    expect(query.errors).toBeUndefined();
    expect(query.data?.chart).toEqual({
      chartId: "chart-demo-roundtrip",
      title: "Demo Round Trip"
    });
  });

  it("rejects a request with no Authorization header", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const response = await fetch(endpoint, {
      body: JSON.stringify({ query: "{ charts { chartId } }" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(401);
  });
});

describe("DemoAuthBoundary", () => {
  it("resolves every request to the fixed demo actor", async () => {
    const actor = await new DemoAuthBoundary().resolveActor("Bearer anything");

    expect(actor.tenantId).toBe("tenant-demo");
    expect(actor.actorId).toBe("demo-actor");
    expect(actor.roles).toContain("worship_leader");
  });
});
