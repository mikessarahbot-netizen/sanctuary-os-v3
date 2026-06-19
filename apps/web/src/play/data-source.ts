import { createPlayClient, type PlayDataSource } from "./client.js";
import { SAMPLE_TRACK_SETS, findSampleTrackSetDetail } from "./sample-data.js";
import type { TrackSet, TrackSetDetail } from "./types.js";

/**
 * Resolves which Play data source the app uses.
 *
 * Demo mode renders seeded `SAMPLE_TRACK_SETS` so the screen is populated
 * without a live API (used for screenshots and as the safe default). Live mode
 * talks to the GraphQL endpoint via `createPlayClient`. Selection precedence
 * mirrors the Charts surface (`apps/web/src/charts/data-source.ts`):
 *   1. an explicit `mode` argument (used by tests / callers),
 *   2. the `?demo` / `?source=live` URL query,
 *   3. the `VITE_DATA_SOURCE` env value (`demo` | `live`),
 *   4. default `demo` (so a fresh `pnpm --filter @sanctuary-os/web dev` renders).
 */
export type PlayDataSourceMode = "demo" | "live";

export const createDemoPlayDataSource = (): PlayDataSource => ({
  listTrackSets: (): Promise<readonly TrackSet[]> =>
    Promise.resolve(SAMPLE_TRACK_SETS.map((trackSet) => ({ ...trackSet }))),
  getTrackSetDetail: (trackSetId: string): Promise<TrackSetDetail | null> => {
    const detail = findSampleTrackSetDetail(trackSetId);

    return Promise.resolve(detail === undefined ? null : { ...detail });
  }
});

const modeFromSearch = (search: string): PlayDataSourceMode | undefined => {
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

const modeFromEnv = (envValue: string | undefined): PlayDataSourceMode | undefined => {
  if (envValue === "live" || envValue === "demo") {
    return envValue;
  }

  return undefined;
};

export interface ResolvePlayDataSourceOptions {
  readonly mode?: PlayDataSourceMode;
  readonly search?: string;
  readonly envValue?: string;
  readonly endpoint?: string;
}

export const resolvePlayDataSourceMode = (
  options: ResolvePlayDataSourceOptions = {}
): PlayDataSourceMode =>
  options.mode ??
  modeFromSearch(options.search ?? "") ??
  modeFromEnv(options.envValue) ??
  "demo";

export const resolvePlayDataSource = (
  options: ResolvePlayDataSourceOptions = {}
): PlayDataSource => {
  const mode = resolvePlayDataSourceMode(options);

  if (mode === "demo") {
    return createDemoPlayDataSource();
  }

  return createPlayClient(
    options.endpoint !== undefined ? { endpoint: options.endpoint } : {}
  );
};
