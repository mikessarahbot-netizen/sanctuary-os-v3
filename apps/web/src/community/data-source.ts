import { createCommunityClient, type CommunityDataSource } from "./client.js";
import {
  SAMPLE_COMMUNITY_GROUPS,
  findSampleCommunityGroupDetail
} from "./sample-data.js";
import type { CommunityGroup, CommunityGroupDetail } from "./types.js";

/**
 * Resolves which Community+ data source the app uses.
 *
 * Demo mode renders seeded `SAMPLE_COMMUNITY_GROUPS` so the screen is populated
 * without a live API (used for screenshots and as the safe default). Live mode
 * talks to the GraphQL endpoint via `createCommunityClient`. Selection precedence
 * mirrors the Charts/Play surfaces (`apps/web/src/charts/data-source.ts`):
 *   1. an explicit `mode` argument (used by tests / callers),
 *   2. the `?demo` / `?source=live` URL query,
 *   3. the `VITE_DATA_SOURCE` env value (`demo` | `live`),
 *   4. default `demo` (so a fresh `pnpm --filter @sanctuary-os/web dev` renders).
 */
export type CommunityDataSourceMode = "demo" | "live";

export const createDemoCommunityDataSource = (): CommunityDataSource => ({
  listCommunityGroups: (): Promise<readonly CommunityGroup[]> =>
    Promise.resolve(SAMPLE_COMMUNITY_GROUPS.map((group) => ({ ...group }))),
  getCommunityGroupDetail: (
    groupId: string
  ): Promise<CommunityGroupDetail | null> => {
    const detail = findSampleCommunityGroupDetail(groupId);

    return Promise.resolve(detail === undefined ? null : { ...detail });
  }
});

const modeFromSearch = (search: string): CommunityDataSourceMode | undefined => {
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

const modeFromEnv = (
  envValue: string | undefined
): CommunityDataSourceMode | undefined => {
  if (envValue === "live" || envValue === "demo") {
    return envValue;
  }

  return undefined;
};

export interface ResolveCommunityDataSourceOptions {
  readonly mode?: CommunityDataSourceMode;
  readonly search?: string;
  readonly envValue?: string;
  readonly endpoint?: string;
}

export const resolveCommunityDataSourceMode = (
  options: ResolveCommunityDataSourceOptions = {}
): CommunityDataSourceMode =>
  options.mode ??
  modeFromSearch(options.search ?? "") ??
  modeFromEnv(options.envValue) ??
  "demo";

export const resolveCommunityDataSource = (
  options: ResolveCommunityDataSourceOptions = {}
): CommunityDataSource => {
  const mode = resolveCommunityDataSourceMode(options);

  if (mode === "demo") {
    return createDemoCommunityDataSource();
  }

  return createCommunityClient(
    options.endpoint !== undefined ? { endpoint: options.endpoint } : {}
  );
};
