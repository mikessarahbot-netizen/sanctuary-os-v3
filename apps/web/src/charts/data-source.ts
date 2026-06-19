import { createChartsClient, type ChartsDataSource } from "./client.js";
import { SAMPLE_CHARTS, findSampleChart } from "./sample-data.js";

/**
 * Resolves which Charts data source the app uses.
 *
 * Demo mode renders seeded `SAMPLE_CHARTS` so the screen is populated without a
 * live API (used for screenshots and as the safe default). Live mode talks to
 * the GraphQL endpoint via `createChartsClient`. Selection precedence:
 *   1. an explicit `mode` argument (used by tests / callers),
 *   2. the `?demo` / `?source=live` URL query,
 *   3. the `VITE_DATA_SOURCE` env value (`demo` | `live`),
 *   4. default `demo` (so a fresh `pnpm --filter @sanctuary-os/web dev` renders).
 */
export type ChartsDataSourceMode = "demo" | "live";

export const createDemoChartsDataSource = (): ChartsDataSource => ({
  listCharts: (): Promise<readonly typeof SAMPLE_CHARTS[number][]> =>
    Promise.resolve(SAMPLE_CHARTS),
  getChart: (chartId: string): Promise<typeof SAMPLE_CHARTS[number] | null> =>
    Promise.resolve(findSampleChart(chartId) ?? null)
});

const modeFromSearch = (search: string): ChartsDataSourceMode | undefined => {
  const params = new URLSearchParams(search);

  if (params.has("demo")) {
    return "demo";
  }

  const source = params.get("source");

  if (source === "live" || source === "demo") {
    return source;
  }

  return undefined;
};

const modeFromEnv = (envValue: string | undefined): ChartsDataSourceMode | undefined => {
  if (envValue === "live" || envValue === "demo") {
    return envValue;
  }

  return undefined;
};

export interface ResolveChartsDataSourceOptions {
  readonly mode?: ChartsDataSourceMode;
  readonly search?: string;
  readonly envValue?: string;
  readonly endpoint?: string;
}

export const resolveChartsDataSourceMode = (
  options: ResolveChartsDataSourceOptions = {}
): ChartsDataSourceMode =>
  options.mode ??
  modeFromSearch(options.search ?? "") ??
  modeFromEnv(options.envValue) ??
  "demo";

export const resolveChartsDataSource = (
  options: ResolveChartsDataSourceOptions = {}
): ChartsDataSource => {
  const mode = resolveChartsDataSourceMode(options);

  if (mode === "demo") {
    return createDemoChartsDataSource();
  }

  return createChartsClient(
    options.endpoint !== undefined ? { endpoint: options.endpoint } : {}
  );
};
