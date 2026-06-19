import type { ReactElement } from "react";
import type { PlayLoadState } from "./types.js";

/**
 * Play LIST view. Renders the discriminated `PlayLoadState` so loading, error,
 * empty, and populated states are all explicit. Each row shows the track set
 * title (falling back to its song ref), its default key, and tempo, and is
 * selectable to open the detail view. Mirrors `apps/web/src/charts/ChartsList`.
 */
export interface PlayListProps {
  readonly state: PlayLoadState;
  readonly selectedTrackSetId: string | null;
  readonly onSelect: (trackSetId: string) => void;
}

export const PlayList = (props: PlayListProps): ReactElement => {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <div className="charts-list" role="status" aria-busy="true">
        <p className="charts-empty">Loading track sets…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="charts-list" role="alert">
        <p className="charts-error">Could not load track sets: {state.message}</p>
      </div>
    );
  }

  if (state.trackSets.length === 0) {
    return (
      <div className="charts-list">
        <p className="charts-empty">No track sets yet.</p>
      </div>
    );
  }

  return (
    <ul className="charts-list" aria-label="Track sets">
      {state.trackSets.map((trackSet) => {
        const isSelected = trackSet.trackSetId === props.selectedTrackSetId;
        const label = trackSet.title ?? trackSet.songRef;

        return (
          <li key={trackSet.trackSetId}>
            <button
              type="button"
              className={isSelected ? "chart-row chart-row--selected" : "chart-row"}
              aria-current={isSelected ? "true" : undefined}
              onClick={(): void => {
                props.onSelect(trackSet.trackSetId);
              }}
            >
              <span className="chart-row__title">{label}</span>
              <span className="chart-row__meta">
                <span className="chart-key">Key {trackSet.defaultKey}</span>
                <span className="chart-songref">{trackSet.tempoBpm} bpm</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
