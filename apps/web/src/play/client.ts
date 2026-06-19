import type {
  PlayCue,
  PlaySection,
  TrackSet,
  TrackSetDetail
} from "./types.js";

/**
 * Minimal typed GraphQL client for the Play read surface.
 *
 * POSTs the `trackSets` / `trackSet` / `playSections` / `playCues` queries to a
 * configurable endpoint (the api's Node http listener serves POST `/graphql`;
 * see `apps/api/src/graphql/http-server.ts`). It does not import server
 * internals — the request/response shapes are declared locally. The endpoint
 * defaults to the same-origin `/graphql`, which the Vite dev server proxies to
 * the demo API (see `apps/web/vite.config.mts`) so live mode is same-origin and
 * needs no CORS. This mirrors `apps/web/src/charts/client.ts` (same auth header
 * + `executeQuery` plumbing); the two surfaces are kept independent on purpose.
 */
export const DEFAULT_API_URL = "/graphql";

/**
 * Demo bearer token for live mode. The local demo API (`apps/api/src/demo`)
 * resolves every request to a fixed demo actor and only requires the
 * `Authorization` header to be present and non-empty — no real secret.
 */
export const DEFAULT_AUTH_TOKEN = "demo-web-operator";

const TRACK_SET_FIELDS = `
  arrangementRef
  createdAt
  defaultKey
  serviceRef
  songRef
  tempoBpm
  tenantId
  title
  trackRefs {
    label
    muted
    role
    trackRef
  }
  trackSetId
  updatedAt
`;

const PLAY_SECTION_FIELDS = `
  arrangementRef
  clickEnabledDefault
  kind
  label
  lengthBars
  padLayerRef
  sectionId
  tenantId
`;

const PLAY_CUE_FIELDS = `
  action
  createdAt
  cueId
  fireMode
  label
  markerOffsetBeats
  padLayerRef
  sectionId
  targetSectionRef
  tenantId
  trackSetId
  updatedAt
`;

const LIST_TRACK_SETS_QUERY = `query ListTrackSets { trackSets { ${TRACK_SET_FIELDS} } }`;

const GET_TRACK_SET_QUERY = `query GetTrackSet($id: ID!) { trackSet(id: $id) { ${TRACK_SET_FIELDS} } }`;

const LIST_PLAY_SECTIONS_QUERY = `query ListPlaySections($arrangementRef: ID!) { playSections(arrangementRef: $arrangementRef) { ${PLAY_SECTION_FIELDS} } }`;

const LIST_PLAY_CUES_QUERY = `query ListPlayCues($trackSetId: ID!) { playCues(trackSetId: $trackSetId) { ${PLAY_CUE_FIELDS} } }`;

interface GraphqlError {
  readonly message: string;
}

interface GraphqlResponse<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly GraphqlError[];
}

interface ListTrackSetsData {
  readonly trackSets: readonly TrackSet[];
}

interface GetTrackSetData {
  readonly trackSet: TrackSet | null;
}

interface ListPlaySectionsData {
  readonly playSections: readonly PlaySection[];
}

interface ListPlayCuesData {
  readonly playCues: readonly PlayCue[];
}

export interface PlayClientOptions {
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
  options: PlayClientOptions,
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
    throw new Error(`Play request failed with HTTP ${String(response.status)}.`);
  }

  const payload = (await response.json()) as GraphqlResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("Play response did not include data.");
  }

  return payload.data;
};

export interface PlayDataSource {
  readonly listTrackSets: () => Promise<readonly TrackSet[]>;
  readonly getTrackSetDetail: (trackSetId: string) => Promise<TrackSetDetail | null>;
}

export const createPlayClient = (
  options: PlayClientOptions = {}
): PlayDataSource => ({
  listTrackSets: async (): Promise<readonly TrackSet[]> => {
    const data = await executeQuery<ListTrackSetsData>(
      options,
      LIST_TRACK_SETS_QUERY,
      {}
    );

    return data.trackSets;
  },
  getTrackSetDetail: async (
    trackSetId: string
  ): Promise<TrackSetDetail | null> => {
    const trackSetData = await executeQuery<GetTrackSetData>(
      options,
      GET_TRACK_SET_QUERY,
      { id: trackSetId }
    );
    const { trackSet } = trackSetData;

    if (trackSet === null) {
      return null;
    }

    // Sections live on the track set's arrangement; only query them when the
    // track set references one. Cues are scoped directly to the track set.
    const sections =
      trackSet.arrangementRef === null
        ? []
        : (
            await executeQuery<ListPlaySectionsData>(
              options,
              LIST_PLAY_SECTIONS_QUERY,
              { arrangementRef: trackSet.arrangementRef }
            )
          ).playSections;

    const cuesData = await executeQuery<ListPlayCuesData>(
      options,
      LIST_PLAY_CUES_QUERY,
      { trackSetId }
    );

    return { cues: cuesData.playCues, sections, trackSet };
  }
});
