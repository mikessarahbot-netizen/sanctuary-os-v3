import { describe, expect, it } from "vitest";
import {
  createPresenterFetchGraphqlTransport,
  type PresenterFetchLike,
  type PresenterFetchResponse
} from "./graphql-transport.js";

interface FakeFetch {
  readonly calls: readonly { readonly init: { readonly body: string }; readonly url: string }[];
  readonly fetch: PresenterFetchLike;
}

const createFakeFetch = (response: {
  readonly json: unknown;
  readonly ok: boolean;
  readonly status: number;
}): FakeFetch => {
  const calls: { readonly init: { readonly body: string }; readonly url: string }[] = [];

  return {
    get calls() {
      return calls;
    },
    fetch: (url, init): Promise<PresenterFetchResponse> => {
      calls.push({ init: { body: init.body }, url });

      return Promise.resolve({
        json: () => Promise.resolve(response.json),
        ok: response.ok,
        status: response.status
      });
    }
  };
};

const request = {
  headers: { Authorization: "Bearer token_1", "x-request-id": "request_1" },
  operationName: "updatePresentation",
  query: "mutation updatePresentation($input: JSON!) { updatePresentation(input: $input) { presentationId } }",
  variables: { input: { presentationId: "presentation_1" } }
} as const;

describe("createPresenterFetchGraphqlTransport", () => {
  it("posts the GraphQL request and returns the data envelope", async () => {
    const fake = createFakeFetch({
      json: { data: { updatePresentation: { presentationId: "presentation_1" } } },
      ok: true,
      status: 200
    });
    const transport = createPresenterFetchGraphqlTransport({
      endpoint: "https://api.example/graphql",
      fetch: fake.fetch
    });

    const response = await transport(request);

    expect(response).toEqual({
      data: { updatePresentation: { presentationId: "presentation_1" } }
    });
    expect(fake.calls[0]?.url).toBe("https://api.example/graphql");
    expect(JSON.parse(fake.calls[0]?.init.body ?? "{}")).toEqual({
      operationName: "updatePresentation",
      query: request.query,
      variables: { input: { presentationId: "presentation_1" } }
    });
  });

  it("returns the GraphQL errors envelope", async () => {
    const fake = createFakeFetch({
      json: { errors: [{ extensions: { code: "STALE_PRESENTATION" }, message: "stale" }] },
      ok: true,
      status: 200
    });
    const transport = createPresenterFetchGraphqlTransport({
      endpoint: "https://api.example/graphql",
      fetch: fake.fetch
    });

    const response = await transport(request);

    expect(response.errors?.[0]?.extensions?.["code"]).toBe("STALE_PRESENTATION");
  });

  it("throws on a non-OK HTTP status", async () => {
    const fake = createFakeFetch({ json: {}, ok: false, status: 503 });
    const transport = createPresenterFetchGraphqlTransport({
      endpoint: "https://api.example/graphql",
      fetch: fake.fetch
    });

    await expect(transport(request)).rejects.toThrow("HTTP 503");
  });
});
