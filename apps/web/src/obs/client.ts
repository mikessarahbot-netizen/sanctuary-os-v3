import type {
  ObsActionIntent,
  ObsActionLogEntry,
  ObsConnectionProfile,
  ObsConsole,
  ObsRecordingState,
  ObsScene,
  ObsStreamState
} from "./types.js";

/**
 * Minimal typed GraphQL client for the OBS control surface.
 *
 * POSTs the `obsConnectionProfiles` / `obsScenes` / `obsStreamState` /
 * `obsRecordingState` / `obsActionLog` read queries and the
 * `requestObsAction` / `confirmObsAction` / `dispatchObsAction` gated mutations to
 * a configurable endpoint (the api's Node http listener serves POST `/graphql`;
 * see `apps/api/src/graphql/http-server.ts`). It does not import server internals
 * — the request/response shapes are declared locally. The endpoint defaults to the
 * same-origin `/graphql`, which the Vite dev server proxies to the demo API (see
 * `apps/web/vite.config.mts`) so live mode is same-origin and needs no CORS. This
 * mirrors `apps/web/src/charts/client.ts` and the other surfaces (same auth header
 * + `executeQuery` plumbing); the surfaces are kept independent on purpose.
 *
 * THE GATE: a scene switch is a three-step flow — `requestObsAction` proposes a
 * `requested` intent and NEVER touches OBS; `confirmObsAction` records the human
 * confirmation (with a reason); `dispatchObsAction` is the only call that reaches
 * OBS, and the server refuses it unless the intent is `confirmed`. The screen
 * calls `confirmAction` then `dispatchAction` only from the operator's explicit
 * Confirm click, so a dispatch can never fire without a confirmation.
 *
 * SAFETY: the selected `ObsConnectionProfile` fields are PII-/secret-free —
 * `connectionProfileId` + the opaque `connectionRef` (a vault handle) + `label` +
 * coarse `connectionStatus`. No host / port / password / stream-key scalar exists
 * on any OBS type, so this client can never request — and the surface can never
 * render — a connection secret.
 */
export const DEFAULT_API_URL = "/graphql";

/**
 * Demo bearer token for live mode. The local demo API (`apps/api/src/demo`)
 * resolves every request to a fixed demo actor and only requires the
 * `Authorization` header to be present and non-empty — no real secret.
 */
export const DEFAULT_AUTH_TOKEN = "demo-web-operator";

/**
 * The GraphQL SDL enum value for a scene switch. The domain value is hyphenated
 * (`switch-scene`); the SDL enum name is underscored and the api's enum value map
 * translates it back. The client sends the SDL literal.
 */
export const SWITCH_SCENE_ACTION_KIND = "switch_scene";

/**
 * The SDL enum values for the two stream actions — going LIVE and going OFF-AIR.
 * Same hyphenated-domain (`start-stream` / `stop-stream`) → underscored-SDL
 * mapping as the scene switch; the client sends the SDL literal and these carry no
 * `targetSceneRef` (a stream action targets the whole output, not a scene).
 */
export const START_STREAM_ACTION_KIND = "start_stream";
export const STOP_STREAM_ACTION_KIND = "stop_stream";

/**
 * The SDL action `kind` for the two stream actions. Used to type the stream-gate
 * flow so a `start_stream` and a `stop_stream` are distinguished without strings
 * leaking into the surface.
 */
export type StreamActionKind =
  | typeof START_STREAM_ACTION_KIND
  | typeof STOP_STREAM_ACTION_KIND;

/**
 * The action `origin` for an operator-initiated switch (as opposed to an
 * `ai_suggested` nudge). Every action this surface starts is human-originated.
 */
const HUMAN_ACTION_ORIGIN = "human";

const CONNECTION_FIELDS = `
  connectionProfileId
  connectionRef
  connectionStatus
  label
  obsWebsocketVersion
  tenantId
`;

const SCENE_FIELDS = `
  connectionProfileId
  displayName
  isCurrentProgramScene
  obsSceneRef
  orderHint
  sceneId
  tenantId
`;

const STREAM_STATE_FIELDS = `
  connectionProfileId
  streamStatus
  tenantId
  updatedAt
`;

const RECORDING_STATE_FIELDS = `
  connectionProfileId
  recordingStatus
  tenantId
  updatedAt
`;

const ACTION_LOG_FIELDS = `
  actionIntentRef
  logEntryId
  occurredAt
  outcome
  reason
  safeMessage
`;

// The intent projection the gated mutations return. No secret field exists to
// select; `safeFailureMessage` is the redacted failure detail (failed only).
const ACTION_INTENT_FIELDS = `
  actionIntentId
  kind
  origin
  status
  targetSceneRef
  safeFailureMessage
`;

const LIST_CONNECTIONS_QUERY = `query ListObsConnections { obsConnectionProfiles { ${CONNECTION_FIELDS} } }`;

const SCENES_QUERY = `query ObsScenes($connectionProfileId: ID!) { obsScenes(connectionProfileId: $connectionProfileId) { ${SCENE_FIELDS} } }`;

const STREAM_STATE_QUERY = `query ObsStreamState($connectionProfileId: ID!) { obsStreamState(connectionProfileId: $connectionProfileId) { ${STREAM_STATE_FIELDS} } }`;

const RECORDING_STATE_QUERY = `query ObsRecordingState($connectionProfileId: ID!) { obsRecordingState(connectionProfileId: $connectionProfileId) { ${RECORDING_STATE_FIELDS} } }`;

const ACTION_LOG_QUERY = `query ObsActionLog($connectionProfileId: ID!) { obsActionLog(connectionProfileId: $connectionProfileId) { ${ACTION_LOG_FIELDS} } }`;

const REQUEST_ACTION_MUTATION = `mutation RequestObsAction($input: RequestObsActionInput!) { requestObsAction(input: $input) { ${ACTION_INTENT_FIELDS} } }`;

const CONFIRM_ACTION_MUTATION = `mutation ConfirmObsAction($input: ConfirmObsActionInput!) { confirmObsAction(input: $input) { ${ACTION_INTENT_FIELDS} } }`;

const DISPATCH_ACTION_MUTATION = `mutation DispatchObsAction($input: DispatchObsActionInput!) { dispatchObsAction(input: $input) { ${ACTION_INTENT_FIELDS} } }`;

// A successful switch-scene dispatch updates the OBS instance (via the port), but
// the durable scene catalog snapshot the read queries serve is only reconciled by
// `refreshObsCatalog`. The screen calls this after a dispatch settles so the
// program-scene highlight reflects the live result.
const REFRESH_CATALOG_MUTATION = `mutation RefreshObsCatalog($input: RefreshObsCatalogInput!) { refreshObsCatalog(input: $input) { __typename } }`;

interface GraphqlError {
  readonly message: string;
}

interface GraphqlResponse<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly GraphqlError[];
}

interface ListConnectionsData {
  readonly obsConnectionProfiles: readonly ObsConnectionProfile[];
}

interface ScenesData {
  readonly obsScenes: readonly ObsScene[];
}

interface StreamStateData {
  readonly obsStreamState: ObsStreamState | null;
}

interface RecordingStateData {
  readonly obsRecordingState: ObsRecordingState | null;
}

interface ActionLogData {
  readonly obsActionLog: readonly ObsActionLogEntry[];
}

interface RequestActionData {
  readonly requestObsAction: ObsActionIntent;
}

interface ConfirmActionData {
  readonly confirmObsAction: ObsActionIntent;
}

interface DispatchActionData {
  readonly dispatchObsAction: ObsActionIntent;
}

/**
 * Local mirror of the server `RequestObsActionInput` for a scene switch (see
 * `apps/api/src/graphql/obs.ts`). The surface only ever requests a
 * `switch_scene`, so `kind` is fixed and `targetSceneRef` is required.
 */
export interface RequestSwitchSceneInput {
  readonly connectionProfileId: string;
  readonly requestedByRef: string;
  readonly targetSceneRef: string;
}

/**
 * Local mirror of `RequestObsActionInput` for a stream action (`start_stream` /
 * `stop_stream`). Unlike a scene switch there is no `targetSceneRef` — the action
 * targets the whole live output — so the input carries only the connection, the
 * actor, and which of the two stream kinds is requested.
 */
export interface RequestStreamActionInput {
  readonly connectionProfileId: string;
  readonly requestedByRef: string;
  readonly kind: StreamActionKind;
}

export interface ConfirmActionInput {
  readonly actionIntentId: string;
  readonly confirmedByRef: string;
  readonly reason: string;
}

export interface DispatchActionInput {
  readonly actionIntentId: string;
}

export interface ObsClientOptions {
  readonly authToken?: string;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
}

const resolveEndpoint = (endpoint: string | undefined): string =>
  endpoint ?? DEFAULT_API_URL;

const resolveFetch = (fetchImpl: typeof fetch | undefined): typeof fetch => {
  if (fetchImpl !== undefined) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation is available in this environment.");
  }

  return globalThis.fetch.bind(globalThis);
};

const executeQuery = async <TData>(
  options: ObsClientOptions,
  query: string,
  variables: Readonly<Record<string, unknown>>
): Promise<TData> => {
  const doFetch = resolveFetch(options.fetchImpl);
  const response = await doFetch(resolveEndpoint(options.endpoint), {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${options.authToken ?? DEFAULT_AUTH_TOKEN}`,
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`OBS request failed with HTTP ${String(response.status)}.`);
  }

  const payload = (await response.json()) as GraphqlResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("OBS response did not include data.");
  }

  return payload.data;
};

/**
 * The data source the OBS screen renders against. Injected so the same component
 * renders against demo sample data, a live GraphQL endpoint, or a test double. The
 * three action methods are the gated flow; `loadConsole` re-reads the whole
 * console (used on mount and after a dispatch settles, so the program scene and
 * action log refresh from the source of truth).
 */
export interface ObsDataSource {
  readonly loadConsole: (connectionProfileId?: string) => Promise<ObsConsole>;
  readonly requestSwitchScene: (
    input: RequestSwitchSceneInput
  ) => Promise<ObsActionIntent>;
  /**
   * Request a `start_stream` / `stop_stream` action — the highest-stakes operator
   * action (going live / off-air to the congregation). Proposes a `requested`
   * intent and NEVER touches OBS, exactly like `requestSwitchScene`; the confirm /
   * dispatch / refreshCatalog steps that follow are identical (the only difference
   * is the action `kind` and the absent `targetSceneRef`).
   */
  readonly requestStreamAction: (
    input: RequestStreamActionInput
  ) => Promise<ObsActionIntent>;
  readonly confirmAction: (input: ConfirmActionInput) => Promise<ObsActionIntent>;
  readonly dispatchAction: (input: DispatchActionInput) => Promise<ObsActionIntent>;
  readonly refreshCatalog: (connectionProfileId: string) => Promise<void>;
}

export const createObsClient = (options: ObsClientOptions = {}): ObsDataSource => {
  const loadConsole = async (connectionProfileId?: string): Promise<ObsConsole> => {
    const connectionsData = await executeQuery<ListConnectionsData>(
      options,
      LIST_CONNECTIONS_QUERY,
      {}
    );
    const connection =
      connectionProfileId === undefined
        ? (connectionsData.obsConnectionProfiles[0] ?? null)
        : (connectionsData.obsConnectionProfiles.find(
            (profile) => profile.connectionProfileId === connectionProfileId
          ) ?? null);

    if (connection === null) {
      return {
        actionLog: [],
        connection: null,
        recordingState: null,
        scenes: [],
        streamState: null
      };
    }

    const id = connection.connectionProfileId;
    const [scenesData, streamData, recordingData, logData] = await Promise.all([
      executeQuery<ScenesData>(options, SCENES_QUERY, { connectionProfileId: id }),
      executeQuery<StreamStateData>(options, STREAM_STATE_QUERY, {
        connectionProfileId: id
      }),
      executeQuery<RecordingStateData>(options, RECORDING_STATE_QUERY, {
        connectionProfileId: id
      }),
      executeQuery<ActionLogData>(options, ACTION_LOG_QUERY, {
        connectionProfileId: id
      })
    ]);

    return {
      actionLog: logData.obsActionLog,
      connection,
      recordingState: recordingData.obsRecordingState,
      scenes: scenesData.obsScenes,
      streamState: streamData.obsStreamState
    };
  };

  return {
    loadConsole,
    requestSwitchScene: async (
      input: RequestSwitchSceneInput
    ): Promise<ObsActionIntent> => {
      const data = await executeQuery<RequestActionData>(
        options,
        REQUEST_ACTION_MUTATION,
        {
          input: {
            connectionProfileId: input.connectionProfileId,
            kind: SWITCH_SCENE_ACTION_KIND,
            origin: HUMAN_ACTION_ORIGIN,
            requestedByRef: input.requestedByRef,
            targetSceneRef: input.targetSceneRef
          }
        }
      );

      return data.requestObsAction;
    },
    requestStreamAction: async (
      input: RequestStreamActionInput
    ): Promise<ObsActionIntent> => {
      // Same request mutation as a scene switch — only `kind` differs and there is
      // no `targetSceneRef` (a stream action targets the whole live output). This
      // proposes a `requested` intent and never reaches OBS.
      const data = await executeQuery<RequestActionData>(
        options,
        REQUEST_ACTION_MUTATION,
        {
          input: {
            connectionProfileId: input.connectionProfileId,
            kind: input.kind,
            origin: HUMAN_ACTION_ORIGIN,
            requestedByRef: input.requestedByRef
          }
        }
      );

      return data.requestObsAction;
    },
    confirmAction: async (input: ConfirmActionInput): Promise<ObsActionIntent> => {
      const data = await executeQuery<ConfirmActionData>(
        options,
        CONFIRM_ACTION_MUTATION,
        {
          input: {
            actionIntentId: input.actionIntentId,
            confirmationIntent: { confirmed: true, reason: input.reason },
            confirmedByRef: input.confirmedByRef
          }
        }
      );

      return data.confirmObsAction;
    },
    dispatchAction: async (input: DispatchActionInput): Promise<ObsActionIntent> => {
      const data = await executeQuery<DispatchActionData>(
        options,
        DISPATCH_ACTION_MUTATION,
        { input: { actionIntentId: input.actionIntentId } }
      );

      return data.dispatchObsAction;
    },
    refreshCatalog: async (connectionProfileId: string): Promise<void> => {
      await executeQuery<{ readonly refreshObsCatalog: { readonly __typename: string } }>(
        options,
        REFRESH_CATALOG_MUTATION,
        { input: { connectionProfileId } }
      );
    }
  };
};
