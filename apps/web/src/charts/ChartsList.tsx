import type { ReactElement } from "react";
import type { ChartsLoadState } from "./types.js";

/**
 * Charts LIST view. Renders the discriminated `ChartsLoadState` so loading,
 * error, empty, and populated states are all explicit. Each row shows the chart
 * title (falling back to its key), its default key, and song ref, and is
 * selectable to open the detail view.
 */
export interface ChartsListProps {
  readonly state: ChartsLoadState;
  readonly selectedChartId: string | null;
  readonly onSelect: (chartId: string) => void;
}

export const ChartsList = (props: ChartsListProps): ReactElement => {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <div className="charts-list" role="status" aria-busy="true">
        <p className="charts-empty">Loading charts…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="charts-list" role="alert">
        <p className="charts-error">Could not load charts: {state.message}</p>
      </div>
    );
  }

  if (state.charts.length === 0) {
    return (
      <div className="charts-list">
        <p className="charts-empty">No charts yet.</p>
      </div>
    );
  }

  return (
    <ul className="charts-list" aria-label="Charts">
      {state.charts.map((chart) => {
        const isSelected = chart.chartId === props.selectedChartId;
        const label = chart.title ?? `Untitled (${chart.defaultKey})`;

        return (
          <li key={chart.chartId}>
            <button
              type="button"
              className={isSelected ? "chart-row chart-row--selected" : "chart-row"}
              aria-current={isSelected ? "true" : undefined}
              onClick={(): void => {
                props.onSelect(chart.chartId);
              }}
            >
              <span className="chart-row__title">{label}</span>
              <span className="chart-row__meta">
                <span className="chart-key">Key {chart.defaultKey}</span>
                <span className="chart-songref">{chart.songRef}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
