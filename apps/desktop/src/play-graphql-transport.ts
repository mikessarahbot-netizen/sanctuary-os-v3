import { z } from "zod";
import type {
  PlayGraphqlTransport,
  PlayGraphqlTransportResponse
} from "./play-network-command-service.js";

/**
 * Concrete `fetch`-based GraphQL transport for the Play replay executor.
 *
 * It POSTs the GraphQL request to an injected endpoint with an injected `fetch`,
 * so the desktop runtime supplies the real network primitive (or a fake in
 * tests). A non-OK HTTP status throws (a transport fault the replay classifier
 * treats as retryable); an OK response is parsed into the `{ data, errors }`
 * envelope the executor expects. The body is validated, so a malformed response
 * surfaces clearly rather than mis-parsing.
 */
export interface PlayFetchResponse {
  readonly json: () => Promise<unknown>;
  readonly ok: boolean;
  readonly status: number;
}

export type PlayFetchLike = (
  url: string,
  init: {
    readonly body: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
  }
) => Promise<PlayFetchResponse>;

export interface PlayFetchGraphqlTransportDependencies {
  readonly endpoint: string;
  readonly fetch: PlayFetchLike;
}

const GraphqlResponseSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).nullable().optional(),
    errors: z
      .array(
        z
          .object({
            extensions: z.record(z.string(), z.unknown()).optional(),
            message: z.string()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

export const createPlayFetchGraphqlTransport = (
  dependencies: PlayFetchGraphqlTransportDependencies
): PlayGraphqlTransport => {
  return async (request): Promise<PlayGraphqlTransportResponse> => {
    const response = await dependencies.fetch(dependencies.endpoint, {
      body: JSON.stringify({
        operationName: request.operationName,
        query: request.query,
        variables: request.variables
      }),
      headers: { "content-type": "application/json", ...request.headers },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(
        `Play GraphQL transport request failed with HTTP ${String(response.status)}.`
      );
    }

    const parsed = GraphqlResponseSchema.parse(await response.json());
    const errors = parsed.errors?.map((error) => ({
      message: error.message,
      ...(error.extensions !== undefined ? { extensions: error.extensions } : {})
    }));

    return {
      ...(parsed.data !== undefined ? { data: parsed.data } : {}),
      ...(errors !== undefined ? { errors } : {})
    };
  };
};
