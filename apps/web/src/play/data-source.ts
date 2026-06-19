import {
  createPlayClient,
  type PlayDataSource,
  type SetPlaybackStateInput
} from "./client.js";
import {
  SAMPLE_TRACK_SETS,
  findSampleTrackSetDetail,
  SAMPLE_PLAYBACK_STATES
} from "./sample-data.js";
import type { PlaybackState, TrackSet, TrackSetDetail } from "./types.js";

const DEMO_TENANT_ID = "tenant-demo";

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

export const createDemoPlayDataSource = (): PlayDataSource => {
  // Per-instance mutable playback store so demo-mode writes (`setPlaybackState`)
  // persist across later reads without touching the shared sample fixture. Seeded
  // from `SAMPLE_PLAYBACK_STATES` so a track set with an initial state renders
  // populated; track sets with no seed resolve `null` until first written.
  const playbackStates = new Map<string, PlaybackState>(
    SAMPLE_PLAYBACK_STATES.map((state) => [state.trackSetId, { ...state }])
  );

  return {
    listTrackSets: (): Promise<readonly TrackSet[]> =>
      Promise.resolve(SAMPLE_TRACK_SETS.map((trackSet) => ({ ...trackSet }))),
    getTrackSetDetail: (trackSetId: string): Promise<TrackSetDetail | null> => {
      const detail = findSampleTrackSetDetail(trackSetId);

      return Promise.resolve(detail === undefined ? null : { ...detail });
    },
    getPlaybackState: (trackSetId: string): Promise<PlaybackState | null> => {
      const state = playbackStates.get(trackSetId);

      return Promise.resolve(state === undefined ? null : { ...state });
    },
    setPlaybackState: (input: SetPlaybackStateInput): Promise<PlaybackState> => {
      // Mirror the live command service: build a fresh durable state from the
      // input (full overwrite, not a merge), bump `updatedAt`, and store it so
      // the change persists for later reads in this session. Optional refs are
      // normalized to `null` (the read shape) only when present in the input.
      const next: PlaybackState = {
        activePadLayerRef: input.activePadLayerRef ?? null,
        activeSectionRef: input.activeSectionRef ?? null,
        clickEnabled: input.clickEnabled,
        positionBeats: input.positionBeats,
        tenantId: DEMO_TENANT_ID,
        trackSetId: input.trackSetId,
        transportStatus: input.transportStatus,
        updatedAt: new Date().toISOString()
      };
      playbackStates.set(input.trackSetId, next);

      return Promise.resolve({ ...next });
    }
  };
};

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
