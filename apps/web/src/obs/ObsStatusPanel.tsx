import type { ReactElement } from "react";
import type { StreamGateDirection } from "./ObsStreamGate.js";
import type {
  ObsActionLogEntry,
  ObsConnectionProfile,
  ObsRecordingState,
  ObsStreamState
} from "./types.js";

/**
 * OBS STATUS panel. Shows the connection (label + coarse status + the opaque
 * connectionRef — never a secret), the coarse stream + recording state as
 * badges, the gated stream control (Go live / Stop stream), and the most recent
 * action-log line so the operator can see what just happened after a gated action
 * settles. Every field is secret-free.
 *
 * The stream control is the highest-stakes action on the surface: clicking it does
 * NOT start/stop the stream — it STARTS the human-confirm gate (the screen turns
 * the click into a `requestObsAction` and shows the loud confirm step), exactly
 * like the scene list's switch button. Which button shows depends on the coarse
 * stream status: live → "Stop stream" (stop); off/unknown → "Go live" (start).
 */
export interface ObsStatusPanelProps {
  readonly connection: ObsConnectionProfile;
  readonly streamState: ObsStreamState | null;
  readonly recordingState: ObsRecordingState | null;
  readonly latestLogEntry: ObsActionLogEntry | null;
  readonly onRequestStreamAction: (direction: StreamGateDirection) => void;
  readonly busy: boolean;
}

const streamLabel = (status: string | undefined): string => {
  if (status === "active") {
    return "Streaming";
  }

  if (status === "inactive") {
    return "Stream off";
  }

  return "Stream unknown";
};

const recordingLabel = (status: string | undefined): string => {
  if (status === "active") {
    return "Recording";
  }

  if (status === "paused") {
    return "Recording paused";
  }

  if (status === "inactive") {
    return "Recording off";
  }

  return "Recording unknown";
};

/**
 * The gated stream control to offer for a coarse stream status. Live → a stop
 * control; off → a start control; unknown → a start control (going live is the
 * recoverable direction when the true state is unknown).
 */
const streamControl = (
  status: string | undefined
): { readonly direction: StreamGateDirection; readonly label: string } =>
  status === "active"
    ? { direction: "stop", label: "Stop stream" }
    : { direction: "start", label: "Go live" };

export const ObsStatusPanel = (props: ObsStatusPanelProps): ReactElement => {
  const { connection, streamState, recordingState, latestLogEntry } = props;
  const streamStatus = streamState?.streamStatus;
  const recordingStatus = recordingState?.recordingStatus;
  const control = streamControl(streamStatus);

  return (
    <section className="obs-status" aria-label="OBS status">
      <header className="obs-status__header">
        <div>
          <h2 className="obs-status__title">{connection.label}</h2>
          {/* The opaque vault ref — shown to prove there is no secret here. */}
          <p className="obs-status__ref" aria-label="Connection reference">
            {connection.connectionRef}
          </p>
        </div>
        <span
          className={`obs-conn-badge obs-conn-badge--${connection.connectionStatus}`}
        >
          {connection.connectionStatus}
        </span>
      </header>

      <div className="obs-status__state" aria-label="Live output state">
        <span
          className={`obs-state-badge obs-state-badge--stream-${streamStatus ?? "unknown"}`}
        >
          {streamLabel(streamStatus)}
        </span>
        <span
          className={`obs-state-badge obs-state-badge--rec-${recordingStatus ?? "unknown"}`}
        >
          {recordingLabel(recordingStatus)}
        </span>
      </div>

      <div className="obs-status__stream-control" aria-label="Live stream control">
        <button
          type="button"
          className={`obs-stream-button obs-stream-button--${control.direction}`}
          disabled={props.busy}
          onClick={(): void => {
            props.onRequestStreamAction(control.direction);
          }}
        >
          {control.label}
        </button>
      </div>

      {latestLogEntry !== null ? (
        <p className="obs-status__log" aria-label="Latest action">
          <span className={`obs-log-outcome obs-log-outcome--${latestLogEntry.outcome}`}>
            {latestLogEntry.outcome}
          </span>{" "}
          {latestLogEntry.reason}
        </p>
      ) : null}
    </section>
  );
};
