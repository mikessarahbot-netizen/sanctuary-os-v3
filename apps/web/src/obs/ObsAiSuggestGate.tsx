import { useId, useState, type ReactElement } from "react";

/**
 * The OBS AI-SUGGESTED human-confirm GATE.
 *
 * AI SUGGESTS, A HUMAN CONFIRMS. The backend (the real claude-opus-4-8 adapter when
 * a key is set; a canned suggestion in demo) returned a `requested`,
 * `origin: ai_suggested` `ObsActionIntent` — it proposes the next OBS action but has
 * NOT been dispatched, and cannot be without this step. This gate shows WHAT the AI
 * suggested (a one-line summary of the action + its target) and the framing that a
 * human still confirms, then routes the SAME intent through the EXACT same
 * confirm → dispatch path a manual scene switch uses. The operator must type a
 * reason and explicitly press Confirm — only then does the screen call
 * `confirmObsAction` and then `dispatchObsAction`. Cancel aborts with no dispatch.
 *
 * The step is intentionally loud (a warning banner + a danger-styled Confirm)
 * because pressing Confirm changes what a live, public-facing audience sees — even
 * though the AI proposed it, the AI never goes live; the human does.
 */
export interface ObsAiSuggestGateProps {
  /**
   * A short, human-readable summary of the AI's suggested action (e.g. "Switch
   * program scene to Sermon"), derived from the returned intent's kind + target.
   */
  readonly suggestionSummary: string;
  readonly programSceneName: string;
  readonly status: "awaiting-confirm" | "working";
  readonly errorMessage: string | null;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

export const ObsAiSuggestGate = (props: ObsAiSuggestGateProps): ReactElement => {
  const [reason, setReason] = useState("");
  const reasonFieldId = useId();
  const working = props.status === "working";
  const trimmedReason = reason.trim();
  const canConfirm = !working && trimmedReason.length > 0;

  return (
    <section
      className="obs-gate obs-gate--ai"
      aria-label="Confirm AI-suggested action"
      role="alertdialog"
    >
      <p className="obs-gate__ai-badge">AI-suggested · a human still confirms</p>
      <p className="obs-gate__warning">
        This switches the LIVE program output that the congregation sees. The AI
        suggested it — it did NOT, and cannot, go live; you confirm.
      </p>
      <p className="obs-gate__summary">
        AI suggests: <strong>{props.suggestionSummary}</strong> (currently on{" "}
        <strong>{props.programSceneName}</strong>).
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
            Could not complete the AI-suggested action: {props.errorMessage}
          </p>
        ) : null}

        <div className="obs-gate__actions">
          <button type="submit" className="obs-gate__confirm" disabled={!canConfirm}>
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
