import { useId, useState, type ReactElement } from "react";

/**
 * The Community+ outbound-communications human-confirm GATE — the second safety
 * gate in the web surface (alongside OBS's `ObsSwitchGate`).
 *
 * This is the deliberate stop between an operator composing a message + previewing
 * its consent-filtered audience and that message being queued for send. It is
 * rendered only once a draft has been composed and the audience resolved; NOTHING
 * has been queued yet. The operator must type a reason and explicitly press Confirm
 * — only then does the screen run `confirmCommunicationSend` (with the reason) and
 * then `queueConfirmedCommunication`. Cancel aborts with no queue, no send.
 *
 * The step is intentionally loud (a warning banner + a danger-styled Confirm) and
 * states plainly that it will SEND to N people, because pressing Confirm reaches
 * real people. It also restates the suppressed count so the operator sees who is
 * being left out by consent before they commit.
 *
 * PRIVACY: the gate shows COUNTS only (N recipients, M suppressed) and the channel
 * — never a recipient name or contact value.
 */
export interface CommunityCommsGateProps {
  readonly channel: string;
  readonly includedCount: number;
  readonly suppressedCount: number;
  readonly status: "awaiting-confirm" | "working";
  readonly errorMessage: string | null;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

const recipientNoun = (count: number): string =>
  count === 1 ? "person" : "people";

export const CommunityCommsGate = (
  props: CommunityCommsGateProps
): ReactElement => {
  const [reason, setReason] = useState("");
  const reasonFieldId = useId();
  const working = props.status === "working";
  const trimmedReason = reason.trim();
  const canConfirm = !working && trimmedReason.length > 0;

  return (
    <section
      className="comms-gate"
      aria-label="Confirm send"
      role="alertdialog"
    >
      <p className="comms-gate__warning">
        This SENDS the message to {String(props.includedCount)}{" "}
        {recipientNoun(props.includedCount)} over {props.channel}.
      </p>
      <p className="comms-gate__summary">
        {props.suppressedCount > 0 ? (
          <>
            {String(props.suppressedCount)} more{" "}
            {props.suppressedCount === 1 ? "recipient is" : "recipients are"}{" "}
            <strong>suppressed</strong> (consent not granted) and will NOT be
            contacted.
          </>
        ) : (
          <>Every resolved recipient has granted consent for this channel.</>
        )}
      </p>

      <form
        className="comms-gate__form"
        onSubmit={(event): void => {
          event.preventDefault();

          if (canConfirm) {
            props.onConfirm(trimmedReason);
          }
        }}
      >
        <label className="comms-gate__label" htmlFor={reasonFieldId}>
          Reason (recorded in the audit log)
        </label>
        <input
          id={reasonFieldId}
          className="comms-gate__reason"
          type="text"
          value={reason}
          disabled={working}
          placeholder="e.g. Confirmed Sunday setup time with the team lead"
          onChange={(event): void => {
            setReason(event.target.value);
          }}
        />

        {props.errorMessage !== null ? (
          <p className="charts-error" role="alert">
            Could not queue the message: {props.errorMessage}
          </p>
        ) : null}

        <div className="comms-gate__actions">
          <button
            type="submit"
            className="comms-gate__confirm"
            disabled={!canConfirm}
          >
            {working
              ? "Queuing…"
              : `Confirm and send to ${String(props.includedCount)} ${recipientNoun(
                  props.includedCount
                )}`}
          </button>
          <button
            type="button"
            className="comms-gate__cancel"
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
