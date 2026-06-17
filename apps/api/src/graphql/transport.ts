import { randomUUID } from "node:crypto";
import { graphql, type GraphQLError, type GraphQLSchema } from "graphql";
import type { AuthBoundary } from "../auth/index.js";
import { isPresenterDomainError } from "../domain/presenter/index.js";

/**
 * Transport-agnostic GraphQL request handler for the API.
 *
 * It is deliberately not bound to a concrete Node `http`/framework listener: it
 * takes a parsed `{ headers, body }` request and returns a `{ status, body }`
 * response, so a thin server binding can be added separately. It resolves the
 * actor from the `Authorization` header via the injected `AuthBoundary`,
 * conveys `requestId` from the idempotency header (generating one if absent),
 * executes the schema, and redacts resolver error messages while preserving any
 * `extensions.code` (so future typed domain errors can carry conflict codes).
 */
export interface PresenterGraphqlRequestBody {
  readonly operationName?: string;
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export interface PresenterGraphqlHttpRequest {
  readonly body: PresenterGraphqlRequestBody;
  readonly headers: Readonly<Record<string, string>>;
}

export interface PresenterGraphqlResponseError {
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export interface PresenterGraphqlHttpResponse {
  readonly body: {
    readonly data?: Readonly<Record<string, unknown>> | null;
    readonly errors?: readonly PresenterGraphqlResponseError[];
  };
  readonly status: number;
}

export interface PresenterGraphqlRequestHandlerDependencies {
  readonly authBoundary: AuthBoundary;
  readonly generateRequestId?: () => string;
  readonly requestIdHeaderName?: string;
  readonly schema: GraphQLSchema;
}

const REDACTED_RESOLVER_ERROR = "The request could not be completed.";

const lowercaseHeaders = (
  headers: Readonly<Record<string, string>>
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

const extractErrorCode = (error: GraphQLError): string | undefined => {
  const code = error.extensions["code"];

  return typeof code === "string" ? code : undefined;
};

const formatError = (error: GraphQLError): PresenterGraphqlResponseError => {
  // Typed domain errors carry a stable conflict code and a pre-redacted message.
  if (isPresenterDomainError(error.originalError)) {
    return {
      extensions: { code: error.originalError.code },
      message: error.originalError.safeMessage
    };
  }

  const code = extractErrorCode(error);
  // Other resolver/internal failures carry an originalError; redact their text.
  // Schema validation/syntax errors are safe to surface verbatim.
  const message = error.originalError !== undefined ? REDACTED_RESOLVER_ERROR : error.message;

  return { message, ...(code !== undefined ? { extensions: { code } } : {}) };
};

const unauthenticated = (
  message: string,
  code: string
): PresenterGraphqlHttpResponse => ({
  body: { errors: [{ extensions: { code }, message }] },
  status: 401
});

export const createPresenterGraphqlRequestHandler = (
  dependencies: PresenterGraphqlRequestHandlerDependencies
): ((request: PresenterGraphqlHttpRequest) => Promise<PresenterGraphqlHttpResponse>) => {
  const requestIdHeaderName = (dependencies.requestIdHeaderName ?? "x-request-id").toLowerCase();
  const generateRequestId = dependencies.generateRequestId ?? ((): string => randomUUID());

  return async (request) => {
    const headers = lowercaseHeaders(request.headers);
    const authHeader = headers["authorization"];

    if (authHeader === undefined || authHeader.length === 0) {
      return unauthenticated("Authentication is required.", "AUTHENTICATION_REQUIRED");
    }

    let actor;
    try {
      actor = await dependencies.authBoundary.resolveActor(authHeader);
    } catch {
      return unauthenticated("Authentication failed.", "AUTHENTICATION_FAILED");
    }

    const requestId = headers[requestIdHeaderName] ?? generateRequestId();
    const result = await graphql({
      contextValue: { actor, requestId },
      schema: dependencies.schema,
      source: request.body.query,
      variableValues: request.body.variables
    });
    const errors = result.errors?.map(formatError);

    return {
      body: {
        ...(result.data !== undefined && result.data !== null ? { data: result.data } : {}),
        ...(errors !== undefined ? { errors } : {})
      },
      status: 200
    };
  };
};
