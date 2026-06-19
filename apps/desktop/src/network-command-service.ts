import {
  PRESENTER_REPLAY_MUTATION_DOCUMENTS,
  type PresenterReplayCommandExecutor
} from "@sanctuary-os/api/presenter";

/**
 * Network-backed Presenter replay command executor.
 *
 * It issues the existing Presenter GraphQL mutations over an injected transport
 * so the desktop replay runtime can re-send offline edits to the API. It holds
 * no live transport of its own: the caller supplies the `transport` (a
 * `fetch`-style function) and an auth-token provider. Each command carries its
 * own `requestId`, sent as an idempotency header so the server can dedupe
 * replays. Only success or failure matters for replay, so the mutations select
 * a minimal confirmation field and the executor returns nothing on success.
 */
export interface PresenterGraphqlError {
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export interface PresenterGraphqlTransportRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly operationName: string;
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface PresenterGraphqlTransportResponse {
  readonly data?: Readonly<Record<string, unknown>> | null;
  readonly errors?: readonly PresenterGraphqlError[];
}

export type PresenterGraphqlTransport = (
  request: PresenterGraphqlTransportRequest
) => Promise<PresenterGraphqlTransportResponse>;

export interface PresenterNetworkReplayCommandExecutorDependencies {
  readonly authToken: () => string | Promise<string>;
  readonly requestIdHeaderName?: string;
  readonly transport: PresenterGraphqlTransport;
}

/**
 * Error thrown when a Presenter replay mutation fails. It carries the GraphQL
 * errors and, when present, the first error's `extensions.code`, which the
 * replay error classifier uses to decide conflict vs retryable failure.
 */
export class PresenterNetworkReplayError extends Error {
  readonly code: string | undefined;
  readonly errors: readonly PresenterGraphqlError[];
  readonly extensions: Readonly<Record<string, unknown>> | undefined;

  constructor(message: string, errors: readonly PresenterGraphqlError[]) {
    super(message);
    this.name = "PresenterNetworkReplayError";
    this.errors = errors;
    const firstExtensions = errors[0]?.extensions;
    this.extensions = firstExtensions;
    const code = firstExtensions?.["code"];
    this.code = typeof code === "string" ? code : undefined;
  }
}

/**
 * The replay mutation documents are owned by `@sanctuary-os/api` so the strings
 * the desktop sends are the exact strings the api schema-validation test proves
 * valid against the executable Presenter schema. Each declares its real typed
 * `input` (e.g. `UpdatePresentationInput!`), not `JSON!`, so the documents
 * validate against the server's typed mutations.
 */
const REPLAY_MUTATIONS = PRESENTER_REPLAY_MUTATION_DOCUMENTS;

export const createPresenterNetworkReplayCommandExecutor = (
  dependencies: PresenterNetworkReplayCommandExecutorDependencies
): PresenterReplayCommandExecutor => {
  const requestIdHeaderName = dependencies.requestIdHeaderName ?? "x-request-id";

  const run = async (
    operationName: keyof typeof REPLAY_MUTATIONS,
    command: { readonly input: unknown; readonly requestId: string }
  ): Promise<void> => {
    const token = await dependencies.authToken();
    const response = await dependencies.transport({
      headers: {
        Authorization: `Bearer ${token}`,
        [requestIdHeaderName]: command.requestId
      },
      operationName,
      query: REPLAY_MUTATIONS[operationName],
      variables: { input: command.input }
    });

    if (response.errors !== undefined && response.errors.length > 0) {
      throw new PresenterNetworkReplayError(
        `Presenter replay mutation ${operationName} failed.`,
        response.errors
      );
    }

    if (
      response.data === undefined ||
      response.data === null ||
      response.data[operationName] === undefined ||
      response.data[operationName] === null
    ) {
      throw new PresenterNetworkReplayError(
        `Presenter replay mutation ${operationName} returned no data.`,
        []
      );
    }
  };

  return {
    addSlide: (command) => run("addSlide", command),
    applyPresenterTheme: (command) => run("applyPresenterTheme", command),
    reorderSlides: (command) => run("reorderSlides", command),
    setOutputTarget: (command) => run("setOutputTarget", command),
    updatePresentation: (command) => run("updatePresentation", command),
    updateSlide: (command) => run("updateSlide", command)
  };
};
