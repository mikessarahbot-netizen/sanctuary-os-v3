import { useCallback, useState, type ReactElement } from "react";
import type {
  PlaybackState,
  PlaybackTransportStatus,
  PlayCue,
  PlayDetailState,
  PlaySection
} from "./types.js";
import type { SetPlaybackStateInput } from "./client.js";

/**
 * Track set DETAIL view. Shows the track set title, its default key / tempo /
 * song ref, the ordered sections of its arrangement, and its cues. Renders the
 * discriminated `PlayDetailState` so loading / error / missing / loaded are all
 * explicit.
 *
 * The loaded view also exposes a WRITE path: a PLAYBACK panel that shows the
 * durable `PlaybackState` (transport status + active section + click on/off) and
 * lets the operator SET it — Play / Pause / Stop buttons drive `transportStatus`,
 * and selecting a section sets the active section. Each control calls the
 * injected `onSetPlaybackState` (the screen runs the real `setPlaybackState`
 * mutation and feeds the returned state back through `playback.state`), so the
 * panel re-renders the persisted state. The component owns only the local
 * saving / error status; the playback data stays owned by the screen. Mirrors
 * the write-affordance shape of `apps/web/src/charts/ChartDetail`.
 */
export interface PlayDetailPlayback {
  readonly state: PlaybackState | null;
  readonly onSet: (input: SetPlaybackStateInput) => Promise<PlaybackState>;
}

export interface PlayDetailProps {
  readonly state: PlayDetailState;
  readonly playback?: PlayDetailPlayback;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

const TRANSPORT_LABELS: Readonly<Record<PlaybackTransportStatus, string>> = {
  paused: "Paused",
  playing: "Playing",
  stopped: "Stopped"
};

// The transport buttons, in transport order. Each sets `transportStatus` while
// preserving the rest of the current playback state.
const TRANSPORT_CONTROLS: readonly {
  readonly status: PlaybackTransportStatus;
  readonly label: string;
}[] = [
  { label: "Play", status: "playing" },
  { label: "Pause", status: "paused" },
  { label: "Stop", status: "stopped" }
];

type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "error"; readonly message: string };

const sectionLabel = (section: PlaySection): string =>
  section.label ?? section.kind;

interface PlaybackPanelProps {
  readonly playback: PlayDetailPlayback;
  readonly trackSetId: string;
  readonly sections: readonly PlaySection[];
}

/**
 * Build the next `setPlaybackState` input from the current durable state plus a
 * single changed field. When no state exists yet the panel starts from a stopped
 * baseline (position 0, click off, no active section). Optional refs are carried
 * forward only when set (conditional spread) so the input omits them rather than
 * sending null under `exactOptionalPropertyTypes`.
 */
const buildInput = (
  trackSetId: string,
  current: PlaybackState | null,
  change: {
    readonly transportStatus?: PlaybackTransportStatus;
    readonly activeSectionRef?: string;
  }
): SetPlaybackStateInput => {
  const transportStatus =
    change.transportStatus ?? current?.transportStatus ?? "stopped";
  // Carry forward the existing refs unless a change overrides them. Nulls from
  // the read shape collapse to `undefined` so these are `string | undefined`.
  const activeSectionRef =
    change.activeSectionRef ?? current?.activeSectionRef ?? undefined;
  const activePadLayerRef = current?.activePadLayerRef ?? undefined;

  return {
    clickEnabled: current?.clickEnabled ?? false,
    positionBeats: current?.positionBeats ?? 0,
    trackSetId,
    transportStatus,
    ...(activeSectionRef !== undefined ? { activeSectionRef } : {}),
    ...(activePadLayerRef !== undefined ? { activePadLayerRef } : {})
  };
};

const PlaybackPanel = (props: PlaybackPanelProps): ReactElement => {
  const { playback, trackSetId, sections } = props;
  const { state, onSet } = playback;
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const saving = status.kind === "saving";

  const submit = useCallback(
    (change: {
      readonly transportStatus?: PlaybackTransportStatus;
      readonly activeSectionRef?: string;
    }): void => {
      setStatus({ kind: "saving" });
      onSet(buildInput(trackSetId, state, change))
        .then((): void => {
          // The screen feeds the updated state back via `playback.state`; settle
          // status here so the panel re-enables once the write resolves.
          setStatus({ kind: "idle" });
        })
        .catch((error: unknown): void => {
          setStatus({ kind: "error", message: errorMessage(error) });
        });
    },
    [onSet, state, trackSetId]
  );

  const transportStatus: PlaybackTransportStatus =
    state?.transportStatus ?? "stopped";
  const activeSectionRef = state?.activeSectionRef ?? null;
  const clickEnabled = state?.clickEnabled ?? false;
  const activeSection = sections.find(
    (section) => section.sectionId === activeSectionRef
  );
  const activeSectionText =
    activeSection !== undefined
      ? sectionLabel(activeSection)
      : (activeSectionRef ?? "None");

  return (
    <div className="play-panel" aria-label="Playback">
      <h3 className="play-panel__title">Playback</h3>
      <div className="playback">
        <div className="playback__status-row">
          <span
            className={`playback__status playback__status--${transportStatus}`}
            role="status"
            aria-label={`Transport ${TRANSPORT_LABELS[transportStatus]}`}
          >
            {TRANSPORT_LABELS[transportStatus]}
          </span>
          <dl className="playback__facts">
            <div>
              <dt>Active section</dt>
              <dd className="playback__section">{activeSectionText}</dd>
            </div>
            <div>
              <dt>Click</dt>
              <dd>{clickEnabled ? "on" : "off"}</dd>
            </div>
          </dl>
        </div>

        <div
          className="playback__transport"
          role="group"
          aria-label="Transport controls"
        >
          {TRANSPORT_CONTROLS.map((control) => {
            const isCurrent = control.status === transportStatus;

            return (
              <button
                key={control.status}
                type="button"
                className={
                  isCurrent
                    ? "playback__button playback__button--active"
                    : "playback__button"
                }
                aria-pressed={isCurrent}
                disabled={saving}
                onClick={(): void => {
                  submit({ transportStatus: control.status });
                }}
              >
                {control.label}
              </button>
            );
          })}
          {saving ? (
            <span className="playback__saving" role="status">
              Saving…
            </span>
          ) : null}
        </div>

        {sections.length > 0 ? (
          <div className="playback__sections" aria-label="Set active section">
            <span className="playback__sections-label">Set active section</span>
            <ul className="play-list">
              {sections.map((section) => {
                const isActive = section.sectionId === activeSectionRef;

                return (
                  <li className="play-section" key={section.sectionId}>
                    <button
                      type="button"
                      className={
                        isActive
                          ? "playback__section-button playback__section-button--active"
                          : "playback__section-button"
                      }
                      aria-pressed={isActive}
                      disabled={saving}
                      onClick={(): void => {
                        submit({ activeSectionRef: section.sectionId });
                      }}
                    >
                      <span className="play-section__label">
                        {sectionLabel(section)}
                      </span>
                      <span className="play-section__meta">
                        <span className="play-tag">{section.kind}</span>
                        {isActive ? <span>active</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {status.kind === "error" ? (
          <p className="charts-error" role="alert">
            Could not set playback: {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
};

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
  const { state, playback } = props;

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

      {playback !== undefined ? (
        <PlaybackPanel
          playback={playback}
          trackSetId={trackSet.trackSetId}
          sections={detail.sections}
        />
      ) : null}

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
