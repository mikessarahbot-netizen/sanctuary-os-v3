import { createChartsClient, type ChartsDataSource } from "./client.js";
import { createSampleChartStore } from "./sample-data.js";
import type { Chart } from "./types.js";

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

export const createDemoChartsDataSource = (): ChartsDataSource => {
  // Per-instance mutable store so demo-mode writes (`updateChartSource`) persist
  // across later reads without touching the shared `SAMPLE_CHARTS` fixture.
  const charts = createSampleChartStore();
  const findChart = (chartId: string): Chart | undefined =>
    charts.find((chart) => chart.chartId === chartId);

  return {
    listCharts: (): Promise<readonly Chart[]> =>
      Promise.resolve(charts.map((chart) => ({ ...chart }))),
    getChart: (chartId: string): Promise<Chart | null> => {
      const chart = findChart(chartId);

      return Promise.resolve(chart === undefined ? null : { ...chart });
    },
    updateChartSource: (
      chartId: string,
      chordProSource: string,
      defaultKey?: string
    ): Promise<Chart> => {
      const existing = findChart(chartId);

      if (existing === undefined) {
        return Promise.reject(new Error(`Chart not found: ${chartId}`));
      }

      // Mirror the live command service: overwrite the source (and key when
      // given), bump `updatedAt`, and preserve every other field. Replace the
      // stored element so the change persists for later reads in this session.
      const updated: Chart = {
        ...existing,
        chordProSource,
        updatedAt: new Date().toISOString(),
        ...(defaultKey !== undefined ? { defaultKey } : {})
      };
      const index = charts.indexOf(existing);
      charts.splice(index, 1, updated);

      return Promise.resolve({ ...updated });
    }
  };
};

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
