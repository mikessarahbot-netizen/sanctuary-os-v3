import type { Chart } from "./types.js";

/**
 * Minimal typed GraphQL client for the Charts read surface.
 *
 * POSTs the `charts` / `chart` queries to a configurable endpoint (the api's
 * Node http listener serves POST `/graphql`; see
 * `apps/api/src/graphql/http-server.ts`). It does not import server internals —
 * the request/response shapes are declared locally. The endpoint is read from
 * `VITE_API_URL` and falls back to the same-origin `/graphql`, which the Vite
 * dev server proxies to the demo API (see `apps/web/vite.config.mts`) so live
 * mode is same-origin and needs no CORS.
 */
export const DEFAULT_API_URL = "/graphql";

/**
 * Demo bearer token for live mode. The local demo API (`apps/api/src/demo`)
 * resolves every request to a fixed demo actor and only requires the
 * `Authorization` header to be present and non-empty — no real secret.
 */
export const DEFAULT_AUTH_TOKEN = "demo-web-operator";

const CHARTS_FIELDS = `
  arrangementRef
  chartId
  chordProSource
  createdAt
  defaultKey
  songRef
  tenantId
  title
  updatedAt
`;

const LIST_CHARTS_QUERY = `query ListCharts { charts { ${CHARTS_FIELDS} } }`;

const GET_CHART_QUERY = `query GetChart($id: ID!) { chart(id: $id) { ${CHARTS_FIELDS} } }`;

interface GraphqlError {
  readonly message: string;
}

interface GraphqlResponse<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly GraphqlError[];
}

interface ListChartsData {
  readonly charts: readonly Chart[];
}

interface GetChartData {
  readonly chart: Chart | null;
}

export interface ChartsClientOptions {
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
  options: ChartsClientOptions,
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
    throw new Error(`Charts request failed with HTTP ${String(response.status)}.`);
  }

  const payload = (await response.json()) as GraphqlResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("Charts response did not include data.");
  }

  return payload.data;
};

export interface ChartsDataSource {
  readonly listCharts: () => Promise<readonly Chart[]>;
  readonly getChart: (chartId: string) => Promise<Chart | null>;
}

export const createChartsClient = (
  options: ChartsClientOptions = {}
): ChartsDataSource => ({
  listCharts: async (): Promise<readonly Chart[]> => {
    const data = await executeQuery<ListChartsData>(options, LIST_CHARTS_QUERY, {});

    return data.charts;
  },
  getChart: async (chartId: string): Promise<Chart | null> => {
    const data = await executeQuery<GetChartData>(options, GET_CHART_QUERY, {
      id: chartId
    });

    return data.chart;
  }
});
