import { useMemo, useState, type ReactElement } from "react";
import { ChartsScreen } from "./charts/ChartsScreen.js";
import {
  resolveChartsDataSource,
  resolveChartsDataSourceMode
} from "./charts/data-source.js";
import { PlayScreen } from "./play/PlayScreen.js";
import {
  resolvePlayDataSource,
  resolvePlayDataSourceMode
} from "./play/data-source.js";
import { CommunityScreen } from "./community/CommunityScreen.js";
import {
  resolveCommunityDataSource,
  resolveCommunityDataSourceMode
} from "./community/data-source.js";

/**
 * App root. Resolves the Charts, Play, and Community data sources (demo vs live)
 * from the URL query and `VITE_API_URL` / `VITE_DATA_SOURCE` env, then renders the
 * selected read surface behind a simple top-level tab nav. Demo mode is the
 * default so the app renders populated screens with no API. Charts is the
 * initial tab so the existing surface is unchanged on load.
 */
type Surface = "charts" | "play" | "community";

export const App = (): ReactElement => {
  const [surface, setSurface] = useState<Surface>("charts");

  const search = typeof window === "undefined" ? "" : window.location.search;
  const envValue = import.meta.env.VITE_DATA_SOURCE;
  const endpoint = import.meta.env.VITE_API_URL;

  const baseOptions = useMemo(
    () => ({
      search,
      ...(typeof envValue === "string" ? { envValue } : {}),
      ...(typeof endpoint === "string" ? { endpoint } : {})
    }),
    [search, envValue, endpoint]
  );

  const chartsMode = resolveChartsDataSourceMode(baseOptions);
  const chartsDataSource = useMemo(
    () => resolveChartsDataSource(baseOptions),
    [baseOptions]
  );

  const playMode = resolvePlayDataSourceMode(baseOptions);
  const playDataSource = useMemo(
    () => resolvePlayDataSource(baseOptions),
    [baseOptions]
  );

  const communityMode = resolveCommunityDataSourceMode(baseOptions);
  const communityDataSource = useMemo(
    () => resolveCommunityDataSource(baseOptions),
    [baseOptions]
  );

  return (
    <div className="app">
      <nav className="app-nav" aria-label="Surfaces">
        <button
          type="button"
          className={surface === "charts" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"}
          aria-current={surface === "charts" ? "page" : undefined}
          onClick={(): void => {
            setSurface("charts");
          }}
        >
          Charts
        </button>
        <button
          type="button"
          className={surface === "play" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"}
          aria-current={surface === "play" ? "page" : undefined}
          onClick={(): void => {
            setSurface("play");
          }}
        >
          Play
        </button>
        <button
          type="button"
          className={
            surface === "community" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"
          }
          aria-current={surface === "community" ? "page" : undefined}
          onClick={(): void => {
            setSurface("community");
          }}
        >
          Community
        </button>
      </nav>
      {surface === "charts" ? (
        <ChartsScreen dataSource={chartsDataSource} mode={chartsMode} />
      ) : surface === "play" ? (
        <PlayScreen dataSource={playDataSource} mode={playMode} />
      ) : (
        <CommunityScreen dataSource={communityDataSource} mode={communityMode} />
      )}
    </div>
  );
};
