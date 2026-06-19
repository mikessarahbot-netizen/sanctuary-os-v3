import { useCallback, useEffect, useState, type ReactElement } from "react";
import { parseChordProSource, type ChordProLine } from "./chordpro.js";
import type { Chart, ChartDetailState } from "./types.js";

/**
 * Chart DETAIL view. Shows the chart title, its default key, and a simple
 * rendered representation of the ChordPro source (chords positioned above
 * lyrics, directives shown as section labels). Renders the discriminated
 * `ChartDetailState` so loading / error / missing / loaded are all explicit.
 *
 * The loaded view also exposes a WRITE path: an "Edit" button reveals a textarea
 * pre-filled with the chart's `chordProSource`, with Save / Cancel. Save calls
 * the injected `onSave` (the screen runs the real `updateChartSource` mutation
 * and feeds the updated chart back through `state`), so the read view re-renders
 * the persisted ChordPro. The component owns only the local edit UI state
 * (draft text + saving / error status); the chart data stays owned by the
 * screen.
 */
export interface ChartDetailProps {
  readonly state: ChartDetailState;
  readonly onSave?: (chordProSource: string) => Promise<Chart>;
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
          <span className="chordpro-chord">{segment.chord ?? " "}</span>
          <span className="chordpro-lyric">{segment.lyric}</span>
        </span>
      ))}
    </div>
  );
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

type EditStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "error"; readonly message: string };

interface ChartSourceEditorProps {
  readonly chart: Chart;
  readonly onSave: (chordProSource: string) => Promise<Chart>;
}

const ChartSourceEditor = (props: ChartSourceEditorProps): ReactElement => {
  const { chart, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chart.chordProSource);
  const [status, setStatus] = useState<EditStatus>({ kind: "idle" });

  // When the underlying chart changes identity (selecting a different chart, or
  // a save replacing it), leave edit mode and re-seed the draft from the source.
  useEffect(() => {
    setEditing(false);
    setDraft(chart.chordProSource);
    setStatus({ kind: "idle" });
  }, [chart.chartId, chart.chordProSource]);

  const beginEdit = useCallback((): void => {
    setDraft(chart.chordProSource);
    setStatus({ kind: "idle" });
    setEditing(true);
  }, [chart.chordProSource]);

  const cancelEdit = useCallback((): void => {
    setDraft(chart.chordProSource);
    setStatus({ kind: "idle" });
    setEditing(false);
  }, [chart.chordProSource]);

  const saveEdit = useCallback((): void => {
    setStatus({ kind: "saving" });
    onSave(draft)
      .then((): void => {
        // The screen feeds the updated chart back via `state`; the seeding
        // effect above then resets editing/draft. Settle status here too in
        // case this editor instance is reused for the same chartId.
        setStatus({ kind: "idle" });
        setEditing(false);
      })
      .catch((error: unknown): void => {
        setStatus({ kind: "error", message: errorMessage(error) });
      });
  }, [draft, onSave]);

  if (!editing) {
    return (
      <div className="chart-detail__actions">
        <button type="button" className="chart-edit-button" onClick={beginEdit}>
          Edit
        </button>
      </div>
    );
  }

  const saving = status.kind === "saving";

  return (
    <form
      className="chart-editor"
      aria-label="Edit ChordPro source"
      onSubmit={(event): void => {
        event.preventDefault();
        saveEdit();
      }}
    >
      <label className="chart-editor__label" htmlFor="chart-editor-source">
        ChordPro source
      </label>
      <textarea
        id="chart-editor-source"
        className="chart-editor__textarea"
        value={draft}
        spellCheck={false}
        disabled={saving}
        onChange={(event): void => {
          setDraft(event.target.value);
        }}
      />
      {status.kind === "error" ? (
        <p className="charts-error" role="alert">
          Could not save chart: {status.message}
        </p>
      ) : null}
      <div className="chart-editor__actions">
        <button
          type="submit"
          className="chart-edit-button chart-edit-button--primary"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="chart-edit-button"
          onClick={cancelEdit}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const ChartDetail = (props: ChartDetailProps): ReactElement => {
  const { state, onSave } = props;

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
      {onSave !== undefined ? (
        <ChartSourceEditor chart={chart} onSave={onSave} />
      ) : null}
      <div className="chordpro" aria-label="ChordPro source">
        {lines.map(renderLine)}
      </div>
    </section>
  );
};
