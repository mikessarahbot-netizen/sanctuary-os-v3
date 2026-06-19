import { useMemo, type ReactElement } from "react";
import { ChartsScreen } from "./charts/ChartsScreen.js";
import {
  resolveChartsDataSource,
  resolveChartsDataSourceMode
} from "./charts/data-source.js";

/**
 * App root. Resolves the Charts data source (demo vs live) from the URL query
 * and `VITE_API_URL` / `VITE_DATA_SOURCE` env, then renders the read surface.
 * Demo mode is the default so the app renders a populated screen with no API.
 */
export const App = (): ReactElement => {
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

  const mode = resolveChartsDataSourceMode(baseOptions);
  const dataSource = useMemo(
    () => resolveChartsDataSource(baseOptions),
    [baseOptions]
  );

  return <ChartsScreen dataSource={dataSource} mode={mode} />;
};
