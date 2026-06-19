import { createObsClient, type ObsDataSource } from "./client.js";
import { createSampleObsDataSource } from "./sample-data.js";

/**
 * Resolves which OBS data source the app uses.
 *
 * Demo mode renders the seeded sample console (a stateful in-memory source that
 * replays the request -> confirm -> dispatch gate) so the screen is populated and
 * the gated flow works without a live API (used for screenshots and as the safe
 * default). Live mode talks to the GraphQL endpoint via `createObsClient`.
 * Selection precedence mirrors the Charts/Play/Community surfaces
 * (`apps/web/src/charts/data-source.ts`):
 *   1. an explicit `mode` argument (used by tests / callers),
 *   2. the `?demo` / `?source=live` URL query,
 *   3. the `VITE_DATA_SOURCE` env value (`demo` | `live`),
 *   4. default `demo` (so a fresh `pnpm --filter @sanctuary-os/web dev` renders).
 */
export type ObsDataSourceMode = "demo" | "live";

export const createDemoObsDataSource = (): ObsDataSource =>
  createSampleObsDataSource();

const modeFromSearch = (search: string): ObsDataSourceMode | undefined => {
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

const modeFromEnv = (envValue: string | undefined): ObsDataSourceMode | undefined => {
  if (envValue === "live" || envValue === "demo") {
    return envValue;
  }

  return undefined;
};

export interface ResolveObsDataSourceOptions {
  readonly mode?: ObsDataSourceMode;
  readonly search?: string;
  readonly envValue?: string;
  readonly endpoint?: string;
}

export const resolveObsDataSourceMode = (
  options: ResolveObsDataSourceOptions = {}
): ObsDataSourceMode =>
  options.mode ??
  modeFromSearch(options.search ?? "") ??
  modeFromEnv(options.envValue) ??
  "demo";

export const resolveObsDataSource = (
  options: ResolveObsDataSourceOptions = {}
): ObsDataSource => {
  const mode = resolveObsDataSourceMode(options);

  if (mode === "demo") {
    return createDemoObsDataSource();
  }

  return createObsClient(
    options.endpoint !== undefined ? { endpoint: options.endpoint } : {}
  );
};
