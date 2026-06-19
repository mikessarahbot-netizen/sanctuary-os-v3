import type { ReactElement } from "react";
import type { PlayCue, PlayDetailState, PlaySection } from "./types.js";

/**
 * Track set DETAIL view. Shows the track set title, its default key / tempo /
 * song ref, the ordered sections of its arrangement, and its cues. Renders the
 * discriminated `PlayDetailState` so loading / error / missing / loaded are all
 * explicit. Read-only — mirrors the shape of `apps/web/src/charts/ChartDetail`
 * without the write path.
 */
export interface PlayDetailProps {
  readonly state: PlayDetailState;
}

const renderSection = (section: PlaySection): ReactElement => (
  <li className="play-section" key={section.sectionId}>
    <span className="play-section__label">{section.label ?? section.kind}</span>
    <span className="play-section__meta">
      <span className="play-tag">{section.kind}</span>
      <span>{section.lengthBars} bars</span>
      <span>{section.clickEnabledDefault ? "click on" : "click off"}</span>
    </span>
  </li>
);

const renderCue = (cue: PlayCue): ReactElement => (
  <li className="play-cue" key={cue.cueId}>
    <span className="play-cue__label">{cue.label}</span>
    <span className="play-cue__meta">
      <span className="play-tag">{cue.action}</span>
      <span>{cue.fireMode}</span>
      <span>@ beat {cue.markerOffsetBeats}</span>
    </span>
  </li>
);

export const PlayDetail = (props: PlayDetailProps): ReactElement => {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <section className="chart-detail" role="status" aria-busy="true">
        <p className="charts-empty">Loading track set…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="chart-detail" role="alert">
        <p className="charts-error">Could not load track set: {state.message}</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="chart-detail">
        <p className="charts-empty">Select a track set to view its details.</p>
      </section>
    );
  }

  const { detail } = state;
  const { trackSet } = detail;
  const title = trackSet.title ?? trackSet.songRef;

  return (
    <section className="chart-detail" aria-label="Track set detail">
      <header className="chart-detail__header">
        <h2 className="chart-detail__title">{title}</h2>
        <dl className="chart-detail__facts">
          <div>
            <dt>Default key</dt>
            <dd className="chart-key">{trackSet.defaultKey}</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>{trackSet.tempoBpm} bpm</dd>
          </div>
          <div>
            <dt>Song ref</dt>
            <dd className="chart-songref">{trackSet.songRef}</dd>
          </div>
        </dl>
      </header>

      <div className="play-panel" aria-label="Arrangement sections">
        <h3 className="play-panel__title">Sections</h3>
        {detail.sections.length === 0 ? (
          <p className="charts-empty">No sections for this arrangement.</p>
        ) : (
          <ul className="play-list">{detail.sections.map(renderSection)}</ul>
        )}
      </div>

      <div className="play-panel" aria-label="Cues">
        <h3 className="play-panel__title">Cues</h3>
        {detail.cues.length === 0 ? (
          <p className="charts-empty">No cues for this track set.</p>
        ) : (
          <ul className="play-list">{detail.cues.map(renderCue)}</ul>
        )}
      </div>
    </section>
  );
};
