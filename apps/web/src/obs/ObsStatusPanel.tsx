import type { ReactElement } from "react";
import type {
  ObsActionLogEntry,
  ObsConnectionProfile,
  ObsRecordingState,
  ObsStreamState
} from "./types.js";

/**
 * OBS STATUS panel. Shows the connection (label + coarse status + the opaque
 * connectionRef — never a secret), the coarse stream + recording state as
 * badges, and the most recent action-log line so the operator can see what just
 * happened after a gated switch settles. Read-only; every field is secret-free.
 */
export interface ObsStatusPanelProps {
  readonly connection: ObsConnectionProfile;
  readonly streamState: ObsStreamState | null;
  readonly recordingState: ObsRecordingState | null;
  readonly latestLogEntry: ObsActionLogEntry | null;
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

export const ObsStatusPanel = (props: ObsStatusPanelProps): ReactElement => {
  const { connection, streamState, recordingState, latestLogEntry } = props;
  const streamStatus = streamState?.streamStatus;
  const recordingStatus = recordingState?.recordingStatus;

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
