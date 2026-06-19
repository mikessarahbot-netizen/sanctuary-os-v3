import { useId, useState, type ReactElement } from "react";

/**
 * The OBS STREAM human-confirm GATE.
 *
 * This is the deliberate stop between an operator asking to go LIVE (or OFF-AIR)
 * and that change reaching OBS. Starting/stopping the stream is the highest-stakes
 * operator action on this surface — it is what the whole congregation does or does
 * not see — so it goes through the SAME request → confirm-with-reason → dispatch
 * gate the scene switch uses. It is rendered only once a `requestObsAction`
 * (`start_stream` / `stop_stream`) has proposed a `requested` intent; nothing has
 * been dispatched yet. The operator must type a reason and explicitly press
 * Confirm — only then does the screen call `confirmObsAction` and then
 * `dispatchObsAction`. Cancel aborts with no dispatch.
 *
 * The step is intentionally loud (a danger banner + a danger-styled Confirm) and
 * its copy varies by direction so the operator cannot confuse going live with
 * going off-air.
 */
export type StreamGateDirection = "start" | "stop";

export interface ObsStreamGateProps {
  readonly direction: StreamGateDirection;
  readonly status: "awaiting-confirm" | "working";
  readonly errorMessage: string | null;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

interface StreamGateCopy {
  readonly warning: string;
  readonly summary: string;
  readonly placeholder: string;
  readonly confirmIdle: string;
  readonly confirmWorking: string;
}

const START_COPY: StreamGateCopy = {
  confirmIdle: "Confirm and GO LIVE",
  confirmWorking: "Going live…",
  placeholder: "e.g. Service is starting",
  summary: "START the live stream the congregation sees?",
  warning: "This GOES LIVE — it starts the public stream the congregation sees."
};

const STOP_COPY: StreamGateCopy = {
  confirmIdle: "Confirm and STOP STREAM",
  confirmWorking: "Stopping…",
  placeholder: "e.g. Service has ended",
  summary: "STOP the live stream the congregation sees?",
  warning: "This GOES OFF-AIR — it stops the public stream the congregation sees."
};

export const ObsStreamGate = (props: ObsStreamGateProps): ReactElement => {
  const [reason, setReason] = useState("");
  const reasonFieldId = useId();
  const working = props.status === "working";
  const trimmedReason = reason.trim();
  const canConfirm = !working && trimmedReason.length > 0;
  const copy = props.direction === "start" ? START_COPY : STOP_COPY;

  return (
    <section
      className="obs-gate obs-gate--stream"
      aria-label="Confirm stream change"
      role="alertdialog"
    >
      <p className="obs-gate__warning">{copy.warning}</p>
      <p className="obs-gate__summary">{copy.summary}</p>

      <form
        className="obs-gate__form"
        onSubmit={(event): void => {
          event.preventDefault();

          if (canConfirm) {
            props.onConfirm(trimmedReason);
          }
        }}
      >
        <label className="obs-gate__label" htmlFor={reasonFieldId}>
          Reason (recorded in the audit log)
        </label>
        <input
          id={reasonFieldId}
          className="obs-gate__reason"
          type="text"
          value={reason}
          disabled={working}
          placeholder={copy.placeholder}
          onChange={(event): void => {
            setReason(event.target.value);
          }}
        />

        {props.errorMessage !== null ? (
          <p className="charts-error" role="alert">
            Could not complete the stream change: {props.errorMessage}
          </p>
        ) : null}

        <div className="obs-gate__actions">
          <button
            type="submit"
            className="obs-gate__confirm"
            disabled={!canConfirm}
          >
            {working ? copy.confirmWorking : copy.confirmIdle}
          </button>
          <button
            type="button"
            className="obs-gate__cancel"
            disabled={working}
            onClick={(): void => {
              props.onCancel();
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
};
