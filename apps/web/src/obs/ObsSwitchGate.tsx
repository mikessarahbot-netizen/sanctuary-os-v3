import { useId, useState, type ReactElement } from "react";

/**
 * The OBS human-confirm GATE.
 *
 * This is the deliberate stop between an operator asking to switch the program
 * scene and that switch reaching OBS. It is rendered only once a `requestObsAction`
 * has proposed a `requested` intent; nothing has been dispatched yet. The operator
 * must type a reason and explicitly press Confirm — only then does the screen call
 * `confirmObsAction` and then `dispatchObsAction`. Cancel aborts with no dispatch.
 *
 * The step is intentionally loud (a warning banner + a danger-styled Confirm)
 * because pressing Confirm changes what a live, public-facing audience sees.
 */
export interface ObsSwitchGateProps {
  readonly targetSceneName: string;
  readonly programSceneName: string;
  readonly status: "awaiting-confirm" | "working";
  readonly errorMessage: string | null;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

export const ObsSwitchGate = (props: ObsSwitchGateProps): ReactElement => {
  const [reason, setReason] = useState("");
  const reasonFieldId = useId();
  const working = props.status === "working";
  const trimmedReason = reason.trim();
  const canConfirm = !working && trimmedReason.length > 0;

  return (
    <section className="obs-gate" aria-label="Confirm scene switch" role="alertdialog">
      <p className="obs-gate__warning">
        This switches the LIVE program output that the congregation sees.
      </p>
      <p className="obs-gate__summary">
        Switch program scene from <strong>{props.programSceneName}</strong> to{" "}
        <strong>{props.targetSceneName}</strong>?
      </p>

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
          placeholder="e.g. Pastor is walking up to preach"
          onChange={(event): void => {
            setReason(event.target.value);
          }}
        />

        {props.errorMessage !== null ? (
          <p className="charts-error" role="alert">
            Could not complete the switch: {props.errorMessage}
          </p>
        ) : null}

        <div className="obs-gate__actions">
          <button
            type="submit"
            className="obs-gate__confirm"
            disabled={!canConfirm}
          >
            {working ? "Switching…" : "Confirm and go live"}
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
