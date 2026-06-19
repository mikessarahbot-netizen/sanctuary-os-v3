import type { ReactElement } from "react";
import { parseChordProSource, type ChordProLine } from "./chordpro.js";
import type { ChartDetailState } from "./types.js";

/**
 * Chart DETAIL view. Shows the chart title, its default key, and a simple
 * rendered representation of the ChordPro source (chords positioned above
 * lyrics, directives shown as section labels). Renders the discriminated
 * `ChartDetailState` so loading / error / missing / loaded are all explicit.
 */
export interface ChartDetailProps {
  readonly state: ChartDetailState;
}

const renderLine = (line: ChordProLine, index: number): ReactElement => {
  if (line.kind === "blank") {
    return <div className="chordpro-blank" key={index} aria-hidden="true" />;
  }

  if (line.kind === "directive") {
    const text = line.value === null ? line.name : `${line.name}: ${line.value}`;

    return (
      <div className="chordpro-directive" key={index}>
        {text}
      </div>
    );
  }

  return (
    <div className="chordpro-line" key={index}>
      {line.segments.map((segment, segmentIndex) => (
        <span className="chordpro-segment" key={segmentIndex}>
          <span className="chordpro-chord">{segment.chord ?? " "}</span>
          <span className="chordpro-lyric">{segment.lyric}</span>
        </span>
      ))}
    </div>
  );
};

export const ChartDetail = (props: ChartDetailProps): ReactElement => {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <section className="chart-detail" role="status" aria-busy="true">
        <p className="charts-empty">Loading chart…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="chart-detail" role="alert">
        <p className="charts-error">Could not load chart: {state.message}</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="chart-detail">
        <p className="charts-empty">Select a chart to view its details.</p>
      </section>
    );
  }

  const { chart } = state;
  const title = chart.title ?? `Untitled (${chart.defaultKey})`;
  const lines = parseChordProSource(chart.chordProSource);

  return (
    <section className="chart-detail" aria-label="Chart detail">
      <header className="chart-detail__header">
        <h2 className="chart-detail__title">{title}</h2>
        <dl className="chart-detail__facts">
          <div>
            <dt>Default key</dt>
            <dd className="chart-key">{chart.defaultKey}</dd>
          </div>
          <div>
            <dt>Song ref</dt>
            <dd className="chart-songref">{chart.songRef}</dd>
          </div>
        </dl>
      </header>
      <div className="chordpro" aria-label="ChordPro source">
        {lines.map(renderLine)}
      </div>
    </section>
  );
};
