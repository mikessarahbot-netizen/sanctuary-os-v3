import {
  PLAY_REPLAY_MUTATION_DOCUMENTS,
  type PlayReplayCommandExecutor
} from "@sanctuary-os/api/play";

/**
 * Network-backed Play replay command executor.
 *
 * It issues the existing Play GraphQL mutations over an injected transport so
 * the desktop replay runtime can re-send offline edits to the API. It holds no
 * live transport of its own: the caller supplies the `transport` (a `fetch`-style
 * function) and an auth-token provider. Each command carries its own `requestId`,
 * sent as an idempotency header so the server can dedupe replays. Only success or
 * failure matters for replay, so the mutations select a minimal confirmation
 * field and the executor returns nothing on success.
 */
export interface PlayGraphqlError {
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export interface PlayGraphqlTransportRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly operationName: string;
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface PlayGraphqlTransportResponse {
  readonly data?: Readonly<Record<string, unknown>> | null;
  readonly errors?: readonly PlayGraphqlError[];
}

export type PlayGraphqlTransport = (
  request: PlayGraphqlTransportRequest
) => Promise<PlayGraphqlTransportResponse>;

export interface PlayNetworkReplayCommandExecutorDependencies {
  readonly authToken: () => string | Promise<string>;
  readonly requestIdHeaderName?: string;
  readonly transport: PlayGraphqlTransport;
}

/**
 * Error thrown when a Play replay mutation fails. It carries the GraphQL errors
 * and, when present, the first error's `extensions.code`, which the replay error
 * classifier uses to decide a terminal domain failure vs a retryable transport
 * failure.
 */
export class PlayNetworkReplayError extends Error {
  readonly code: string | undefined;
  readonly errors: readonly PlayGraphqlError[];
  readonly extensions: Readonly<Record<string, unknown>> | undefined;

  constructor(message: string, errors: readonly PlayGraphqlError[]) {
    super(message);
    this.name = "PlayNetworkReplayError";
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
 * valid against the executable Play schema. Each declares its real typed `input`
 * (e.g. `SaveTrackSetInput!`), not `JSON!`, so the documents validate against the
 * server's typed mutations.
 */
const REPLAY_MUTATIONS = PLAY_REPLAY_MUTATION_DOCUMENTS;

export const createPlayNetworkReplayCommandExecutor = (
  dependencies: PlayNetworkReplayCommandExecutorDependencies
): PlayReplayCommandExecutor => {
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
      throw new PlayNetworkReplayError(
        `Play replay mutation ${operationName} failed.`,
        response.errors
      );
    }

    if (
      response.data === undefined ||
      response.data === null ||
      response.data[operationName] === undefined ||
      response.data[operationName] === null
    ) {
      throw new PlayNetworkReplayError(
        `Play replay mutation ${operationName} returned no data.`,
        []
      );
    }
  };

  return {
    addPlayCue: (command) => run("addPlayCue", command),
    reorderPlaySections: (command) => run("reorderPlaySections", command),
    savePadLayer: (command) => run("savePadLayer", command),
    savePlayArrangement: (command) => run("savePlayArrangement", command),
    savePlaySection: (command) => run("savePlaySection", command),
    saveTrackSet: (command) => run("saveTrackSet", command),
    setPlaybackState: (command) => run("setPlaybackState", command),
    updatePlayCue: (command) => run("updatePlayCue", command),
    updateTrackSetMembers: (command) => run("updateTrackSetMembers", command)
  };
};
