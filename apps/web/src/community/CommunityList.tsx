import type { ReactElement } from "react";
import type { CommunityLoadState } from "./types.js";

/**
 * Community LIST view. Renders the discriminated `CommunityLoadState` so loading,
 * error, empty, and populated states are all explicit. Each row shows the group
 * label, its kind, and whether it is archived, and is selectable to open the
 * detail view. Mirrors `apps/web/src/play/PlayList`. Every field shown is
 * PII-safe (a group label + enum kind).
 */
export interface CommunityListProps {
  readonly state: CommunityLoadState;
  readonly selectedGroupId: string | null;
  readonly onSelect: (groupId: string) => void;
}

export const CommunityList = (props: CommunityListProps): ReactElement => {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <div className="charts-list" role="status" aria-busy="true">
        <p className="charts-empty">Loading groups…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="charts-list" role="alert">
        <p className="charts-error">Could not load groups: {state.message}</p>
      </div>
    );
  }

  if (state.groups.length === 0) {
    return (
      <div className="charts-list">
        <p className="charts-empty">No groups yet.</p>
      </div>
    );
  }

  return (
    <ul className="charts-list" aria-label="Community groups">
      {state.groups.map((group) => {
        const isSelected = group.groupId === props.selectedGroupId;

        return (
          <li key={group.groupId}>
            <button
              type="button"
              className={isSelected ? "chart-row chart-row--selected" : "chart-row"}
              aria-current={isSelected ? "true" : undefined}
              onClick={(): void => {
                props.onSelect(group.groupId);
              }}
            >
              <span className="chart-row__title">{group.label}</span>
              <span className="chart-row__meta">
                <span className="play-tag">{group.kind}</span>
                {group.archived ? <span className="chart-songref">archived</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
