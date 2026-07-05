import { createServer, type Server } from "node:http";
import { z } from "zod";
import type { AuthBoundary } from "../auth/index.js";
import {
  createPresenterGraphqlRequestHandler,
  type PresenterGraphqlHttpRequest,
  type PresenterGraphqlHttpResponse
} from "./transport.js";
import type { GraphQLSchema } from "graphql";

/**
 * Thin Node `http` binding for the Presenter GraphQL transport handler.
 *
 * The request/response adaptation (method/path checks, JSON body parsing,
 * serialization) is a pure function so it is testable without a socket; the
 * server factory wraps it with `node:http`. Only POST to the configured path is
 * served; the handler resolves auth and executes the schema. No secret is logged.
 */
const JSON_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json"
};

const GraphqlRequestBodySchema = z
  .object({
    operationName: z.string().min(1).optional(),
    query: z.string().min(1),
    variables: z.record(z.string(), z.unknown()).optional()
  })
  .strip();

export type PresenterGraphqlRequestHandler = (
  request: PresenterGraphqlHttpRequest
) => Promise<PresenterGraphqlHttpResponse>;

export interface PresenterGraphqlHttpInvocation {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly rawBody: string;
}

export interface PresenterGraphqlHttpResult {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

const errorResult = (status: number, message: string): PresenterGraphqlHttpResult => ({
  body: JSON.stringify({ errors: [{ message }] }),
  headers: JSON_HEADERS,
  status
});

const normalizeHeaders = (
  headers: Readonly<Record<string, string | readonly string[] | undefined>>
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === "string") {
        return [[key, value]];
      }

      const first = value?.[0];

      return typeof first === "string" ? [[key, first]] : [];
    })
  );

const pathOf = (rawPath: string | undefined): string => (rawPath ?? "").split("?")[0] ?? "";

export const handlePresenterGraphqlHttpInvocation = async (
  handler: PresenterGraphqlRequestHandler,
  invocation: PresenterGraphqlHttpInvocation,
  options: { readonly path: string }
): Promise<PresenterGraphqlHttpResult> => {
  if (pathOf(invocation.path) !== options.path) {
    return errorResult(404, "Not found.");
  }

  if ((invocation.method ?? "").toUpperCase() !== "POST") {
    return errorResult(405, "Method not allowed.");
  }

  let parsedBody;
  try {
    parsedBody = GraphqlRequestBodySchema.parse(JSON.parse(invocation.rawBody));
  } catch {
    return errorResult(400, "Invalid GraphQL request body.");
  }

  const response = await handler({
    body: {
      query: parsedBody.query,
      ...(parsedBody.operationName !== undefined
        ? { operationName: parsedBody.operationName }
        : {}),
      ...(parsedBody.variables !== undefined ? { variables: parsedBody.variables } : {})
    },
    headers: normalizeHeaders(invocation.headers)
  });

  return {
    body: JSON.stringify(response.body),
    headers: JSON_HEADERS,
    status: response.status
  };
};

export interface PresenterGraphqlHttpServerDependencies {
  readonly authBoundary: AuthBoundary;
  /**
   * Optional non-GraphQL route handler, consulted BEFORE the GraphQL path.
   * Returns a result to serve the invocation itself, or `undefined` to fall
   * through to the GraphQL transport (which 404s unknown paths as before).
   * Used by the demo server to mount the voice bridge's `POST /voice/ask`.
   */
  readonly extraInvocationHandler?: (
    invocation: PresenterGraphqlHttpInvocation
  ) => Promise<PresenterGraphqlHttpResult | undefined>;
  readonly generateRequestId?: () => string;
  readonly path?: string;
  readonly schema: GraphQLSchema;
}

export const createPresenterGraphqlHttpServer = (
  dependencies: PresenterGraphqlHttpServerDependencies
): Server => {
  const path = dependencies.path ?? "/graphql";
  const handler = createPresenterGraphqlRequestHandler({
    authBoundary: dependencies.authBoundary,
    schema: dependencies.schema,
    ...(dependencies.generateRequestId !== undefined
      ? { generateRequestId: dependencies.generateRequestId }
      : {})
  });

  return createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const invocation: PresenterGraphqlHttpInvocation = {
        headers: request.headers,
        method: request.method,
        path: request.url,
        rawBody: Buffer.concat(chunks).toString("utf8")
      };
      const respond = async (): Promise<PresenterGraphqlHttpResult> => {
        const extra =
          dependencies.extraInvocationHandler !== undefined
            ? await dependencies.extraInvocationHandler(invocation)
            : undefined;

        return extra ?? handlePresenterGraphqlHttpInvocation(handler, invocation, { path });
      };

      void respond()
        .then((result) => {
          response.writeHead(result.status, result.headers);
          response.end(result.body);
        })
        .catch(() => {
          response.writeHead(500, JSON_HEADERS);
          response.end(JSON.stringify({ errors: [{ message: "Internal server error." }] }));
        });
    });
  });
};
