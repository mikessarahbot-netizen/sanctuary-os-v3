import { useCallback, useId, useMemo, useState, type ReactElement } from "react";
import { CommunityCommsGate } from "./CommunityCommsGate.js";
import type {
  AiDraftedMessage,
  CommunicationChannel,
  CommunicationMessageRef,
  DraftWithAiInput,
  GroupMemberRow,
  QueuedCommunicationResult,
  ResolvedAudience,
  SuppressedRecipient
} from "./types.js";

/**
 * The Community+ COMPOSE + send affordance — the entry point to the second safety
 * gate (alongside OBS). Rendered inside the group detail for the selected group, it
 * lets an operator:
 *
 *   1. COMPOSE a short message (a channel pick + a body, plus a subject on email) —
 *      either by typing it, or by asking the backend to AI-DRAFT it (the real
 *      `claude-opus-4-8` adapter when a key is configured; a canned draft in demo).
 *   2. PREVIEW the AUDIENCE — the server resolves who is INCLUDED (granted consent
 *      for the channel) vs SUPPRESSED (consent not granted / no channel of the
 *      kind), making consent suppression visible BEFORE anything is sent.
 *   3. SEND — which opens a loud HUMAN-CONFIRM gate (`CommunityCommsGate`); only the
 *      operator's explicit Confirm (with a reason) runs confirm-send + queue.
 *
 * THE GATE (the whole point): the queue path (`onConfirmAndQueue`) is invoked ONLY
 * from the gate's Confirm handler, and the live/demo data source confirms before it
 * queues, so a queue can never fire without a human confirmation. Cancel aborts with
 * no queue. On success the panel shows "Queued to N recipients" + the suppressed
 * count.
 *
 * AI DRAFTS, A HUMAN CONFIRMS: an AI-drafted message is created server-side with
 * `origin: "ai-drafted"` and enters this SAME gate — it is previewed and then routed
 * through the identical human-confirm-send step (it is never auto-sent, and it keeps
 * its `ai-drafted` origin through confirm → queue). The panel labels an AI draft as
 * such and keeps the "a human still confirms before anyone is contacted" framing
 * visible, so AI assistance never weakens the consent + confirmation gate.
 *
 * PRIVACY: included / suppressed recipients are rendered by their PII-safe display
 * name (joined from the group's member rows by `memberRef`) — never a contact
 * value. A `channelRef` token, a phone, an email, and an address are all absent
 * from this component's output by construction (it selects none of them).
 */
export interface CommunityComposePanelProps {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly memberRows: readonly GroupMemberRow[];
  readonly onComposeDraft: (input: {
    readonly groupId: string;
    readonly channel: CommunicationChannel;
    readonly bodyTemplate: string;
    readonly subject?: string;
  }) => Promise<CommunicationMessageRef>;
  /**
   * Ask the backend to AI-draft a message for this group + channel. Optional: when
   * omitted, the AI-draft affordance is not rendered (manual compose only). The
   * returned `ai-drafted` draft already exists on the server; the panel previews its
   * audience and routes it through the same human-confirm gate.
   */
  readonly onDraftWithAi?: (input: DraftWithAiInput) => Promise<AiDraftedMessage>;
  readonly onResolveAudience: (
    messageId: string
  ) => Promise<ResolvedAudience | null>;
  readonly onConfirmAndQueue: (input: {
    readonly messageId: string;
    readonly reason: string;
  }) => Promise<QueuedCommunicationResult>;
}

const CHANNELS: readonly CommunicationChannel[] = ["sms", "email", "push"];

/**
 * A machine reason → a short, human-readable suppression cause. Stays exhaustive
 * over the server's `AudienceSuppressionReason` values, with a passthrough so an
 * unrecognised future reason still renders (the raw machine token, never a crash).
 */
const suppressionReasonLabel = (reason: string): string => {
  switch (reason) {
    case "consent-not-granted":
      return "consent not granted";
    case "no-channel-of-kind":
      return "no channel for this type";
    case "member-not-found":
      return "member not found";
    default:
      return reason;
  }
};

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

/**
 * The drafted text shown for review when the previewed draft was produced by AI.
 * Carried through the preview/confirm phases so the "AI-drafted — a human still
 * confirms" framing + the draft body stay visible right up to the gate. PII-free:
 * `bodyTemplate` is placeholder-token text, never a resolved contact value.
 */
interface AiDraftContext {
  readonly bodyTemplate: string;
  readonly subject: string | null;
}

/**
 * The compose → preview → confirm flow state. `composing`: the form is being filled
 * (no draft yet). `ai-drafting`: an AI draft is being requested. `previewing`: a
 * draft is being composed + its audience resolved. `previewed`: the audience is
 * shown and Send is available. `awaiting-confirm` / `working`: the confirm gate is
 * open / the confirm+queue is in flight. `queued`: the success result. Each
 * non-initial phase carries the composed `messageId` so the confirm path acts on the
 * SAME draft the preview described — including an AI draft, whose server-side
 * `ai-drafted` message is the one routed through the gate (its `aiDraft` context is
 * carried so the framing + body render). AI never gets its own send path.
 */
type ComposeFlow =
  | { readonly phase: "composing"; readonly error: string | null }
  | { readonly phase: "ai-drafting" }
  | { readonly phase: "previewing" }
  | {
      readonly phase: "previewed";
      readonly messageId: string;
      readonly audience: ResolvedAudience;
      readonly aiDraft?: AiDraftContext;
    }
  | {
      readonly phase: "awaiting-confirm";
      readonly messageId: string;
      readonly audience: ResolvedAudience;
      readonly error: string | null;
      readonly aiDraft?: AiDraftContext;
    }
  | {
      readonly phase: "working";
      readonly messageId: string;
      readonly audience: ResolvedAudience;
      readonly aiDraft?: AiDraftContext;
    }
  | { readonly phase: "queued"; readonly result: QueuedCommunicationResult };

export const CommunityComposePanel = (
  props: CommunityComposePanelProps
): ReactElement => {
  const {
    groupId,
    memberRows,
    onComposeDraft,
    onDraftWithAi,
    onResolveAudience,
    onConfirmAndQueue
  } = props;
  const channelFieldId = useId();
  const bodyFieldId = useId();
  const subjectFieldId = useId();
  const campaignIntentFieldId = useId();
  const toneFieldId = useId();

  const [channel, setChannel] = useState<CommunicationChannel>("sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [campaignIntent, setCampaignIntent] = useState("");
  const [tone, setTone] = useState("Warm, brief, and hopeful.");
  const [flow, setFlow] = useState<ComposeFlow>({
    error: null,
    phase: "composing"
  });

  // PII-safe memberRef → display name lookup, joined from the group's member rows.
  // A ref with no resolvable member falls back to the ref itself (an opaque id,
  // never a contact value).
  const displayNameByRef = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of memberRows) {
      if (row.member !== null) {
        map.set(row.membership.memberRef, row.member.displayName);
      }
    }

    return map;
  }, [memberRows]);

  const nameForRef = useCallback(
    (memberRef: string): string => displayNameByRef.get(memberRef) ?? memberRef,
    [displayNameByRef]
  );

  const trimmedBody = body.trim();
  const trimmedSubject = subject.trim();
  const canPreview =
    trimmedBody.length > 0 &&
    (channel !== "email" || trimmedSubject.length > 0) &&
    flow.phase !== "previewing";

  const handlePreview = useCallback((): void => {
    if (trimmedBody.length === 0) {
      return;
    }

    if (channel === "email" && trimmedSubject.length === 0) {
      return;
    }

    setFlow({ phase: "previewing" });

    // Compose the draft (reaches no recipient), then resolve its consent-filtered
    // audience so the operator sees who is included vs suppressed before sending.
    onComposeDraft({
      bodyTemplate: trimmedBody,
      channel,
      groupId,
      ...(channel === "email" ? { subject: trimmedSubject } : {})
    })
      .then((message) =>
        onResolveAudience(message.messageId).then((audience) => ({
          audience,
          message
        }))
      )
      .then(({ audience, message }) => {
        setFlow({
          audience: audience ?? { channel, included: [], suppressed: [] },
          messageId: message.messageId,
          phase: "previewed"
        });
      })
      .catch((error: unknown) => {
        setFlow({ error: errorMessageOf(error), phase: "composing" });
      });
  }, [channel, groupId, onComposeDraft, onResolveAudience, trimmedBody, trimmedSubject]);

  const handleOpenGate = useCallback((): void => {
    setFlow((current) =>
      current.phase === "previewed"
        ? {
            audience: current.audience,
            error: null,
            messageId: current.messageId,
            phase: "awaiting-confirm",
            // Carry the AI-draft context into the gate so the "AI-drafted, a human
            // confirms" framing persists right up to the explicit Confirm.
            ...(current.aiDraft !== undefined ? { aiDraft: current.aiDraft } : {})
          }
        : current
    );
  }, []);

  const handleCancel = useCallback((): void => {
    // Abort the gate with NO queue; fall back to the previewed audience so the
    // operator can edit + re-preview or send again.
    setFlow((current) =>
      current.phase === "awaiting-confirm" || current.phase === "working"
        ? {
            audience: current.audience,
            messageId: current.messageId,
            phase: "previewed",
            ...(current.aiDraft !== undefined ? { aiDraft: current.aiDraft } : {})
          }
        : current
    );
  }, []);

  const handleConfirm = useCallback(
    (reason: string): void => {
      if (flow.phase !== "awaiting-confirm") {
        return;
      }

      const { messageId, audience } = flow;
      const aiDraft = flow.aiDraft;
      setFlow({
        audience,
        messageId,
        phase: "working",
        ...(aiDraft !== undefined ? { aiDraft } : {})
      });

      // The ONLY queue path: the data source confirms the human gate THEN queues.
      // It is never called anywhere else, so a queue can never fire without this
      // explicit Confirm — and an ai-drafted message is queued through this very
      // same path (it has no send path of its own).
      onConfirmAndQueue({ messageId, reason })
        .then((result) => {
          setFlow({ phase: "queued", result });
        })
        .catch((error: unknown) => {
          setFlow({
            audience,
            error: errorMessageOf(error),
            messageId,
            phase: "awaiting-confirm",
            ...(aiDraft !== undefined ? { aiDraft } : {})
          });
        });
    },
    [flow, onConfirmAndQueue]
  );

  const trimmedCampaignIntent = campaignIntent.trim();
  const trimmedTone = tone.trim();
  const canDraftWithAi =
    onDraftWithAi !== undefined &&
    flow.phase === "composing" &&
    trimmedCampaignIntent.length > 0 &&
    trimmedTone.length > 0;

  const handleDraftWithAi = useCallback((): void => {
    if (
      onDraftWithAi === undefined ||
      trimmedCampaignIntent.length === 0 ||
      trimmedTone.length === 0
    ) {
      return;
    }

    setFlow({ phase: "ai-drafting" });

    // Ask the backend to AI-draft (the real claude-opus-4-8 adapter when a key is
    // set; a canned draft in demo). The returned `ai-drafted` draft ALREADY exists
    // on the server; we resolve ITS audience and enter `previewed` for THAT
    // messageId, so the operator reviews the AI text and then drives the same
    // human-confirm-send gate. The AI message is never auto-advanced.
    onDraftWithAi({
      campaignIntent: trimmedCampaignIntent,
      channel,
      churchToneSummary: trimmedTone,
      groupId
    })
      .then((draft) =>
        onResolveAudience(draft.messageId).then((audience) => ({ audience, draft }))
      )
      .then(({ audience, draft }) => {
        setFlow({
          aiDraft: { bodyTemplate: draft.bodyTemplate, subject: draft.subject },
          audience: audience ?? { channel, included: [], suppressed: [] },
          messageId: draft.messageId,
          phase: "previewed"
        });
      })
      .catch((error: unknown) => {
        setFlow({ error: errorMessageOf(error), phase: "composing" });
      });
  }, [
    channel,
    groupId,
    onDraftWithAi,
    onResolveAudience,
    trimmedCampaignIntent,
    trimmedTone
  ]);

  const startNewMessage = useCallback((): void => {
    setBody("");
    setSubject("");
    setCampaignIntent("");
    setFlow({ error: null, phase: "composing" });
  }, []);

  // The success view replaces the form so the queued result is unmissable.
  if (flow.phase === "queued") {
    const { result } = flow;

    return (
      <div className="comms-panel" aria-label="Compose message">
        <h3 className="play-panel__title">Message queued</h3>
        <div className="comms-result" role="status">
          <p className="comms-result__headline">
            Queued to {String(result.includedCount)}{" "}
            {result.includedCount === 1 ? "recipient" : "recipients"}.
          </p>
          {result.suppressedCount > 0 ? (
            <p className="comms-result__suppressed">
              {String(result.suppressedCount)}{" "}
              {result.suppressedCount === 1 ? "recipient" : "recipients"} suppressed
              (consent not granted) — not contacted.
            </p>
          ) : null}
          <p className="comms-result__note">
            The send is handled by the messaging integration; no contact value is
            shown here.
          </p>
        </div>
        <button
          type="button"
          className="comms-panel__secondary"
          onClick={startNewMessage}
        >
          Compose another message
        </button>
      </div>
    );
  }

  const composing = flow.phase === "composing";
  const previewing = flow.phase === "previewing";
  const aiDrafting = flow.phase === "ai-drafting";
  const audience =
    flow.phase === "previewed" ||
    flow.phase === "awaiting-confirm" ||
    flow.phase === "working"
      ? flow.audience
      : null;
  const gateOpen = flow.phase === "awaiting-confirm" || flow.phase === "working";
  // The AI-draft context (set only when the previewed/gated draft came from AI), so
  // the "AI-drafted — a human still confirms" framing + the drafted body render
  // through the preview and the gate.
  const aiDraft =
    flow.phase === "previewed" ||
    flow.phase === "awaiting-confirm" ||
    flow.phase === "working"
      ? flow.aiDraft ?? null
      : null;

  return (
    <div className="comms-panel" aria-label="Compose message">
      <h3 className="play-panel__title">Compose message</h3>
      <p className="comms-panel__intro">
        Send a message to <strong>{props.groupLabel}</strong>. You will see who is
        included vs suppressed by consent, then explicitly confirm before anything is
        sent.
      </p>

      <form
        className="comms-compose"
        onSubmit={(event): void => {
          event.preventDefault();

          if (canPreview) {
            handlePreview();
          }
        }}
      >
        <div className="comms-compose__field">
          <label className="comms-compose__label" htmlFor={channelFieldId}>
            Channel
          </label>
          <select
            id={channelFieldId}
            className="comms-compose__select"
            value={channel}
            disabled={!composing}
            onChange={(event): void => {
              const next = event.target.value;

              if (next === "sms" || next === "email" || next === "push") {
                setChannel(next);
              }
            }}
          >
            {CHANNELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {channel === "email" ? (
          <div className="comms-compose__field">
            <label className="comms-compose__label" htmlFor={subjectFieldId}>
              Subject
            </label>
            <input
              id={subjectFieldId}
              className="comms-compose__input"
              type="text"
              value={subject}
              disabled={!composing}
              placeholder="e.g. This Sunday's serving schedule"
              onChange={(event): void => {
                setSubject(event.target.value);
              }}
            />
          </div>
        ) : null}

        <div className="comms-compose__field">
          <label className="comms-compose__label" htmlFor={bodyFieldId}>
            Message
          </label>
          <textarea
            id={bodyFieldId}
            className="comms-compose__textarea"
            value={body}
            disabled={!composing}
            placeholder="Keep it short — e.g. Setup is at 9am this Sunday."
            onChange={(event): void => {
              setBody(event.target.value);
            }}
          />
        </div>

        {flow.phase === "composing" && flow.error !== null ? (
          <p className="charts-error" role="alert">
            Could not prepare the message: {flow.error}
          </p>
        ) : null}

        {composing ? (
          <button
            type="submit"
            className="comms-panel__primary"
            disabled={!canPreview}
          >
            Preview audience
          </button>
        ) : null}
        {previewing ? (
          <p className="comms-panel__intro" role="status" aria-busy="true">
            Resolving audience…
          </p>
        ) : null}
      </form>

      {onDraftWithAi !== undefined && (composing || aiDrafting) ? (
        <section className="comms-ai" aria-label="AI draft">
          <h4 className="comms-ai__heading">Draft with AI</h4>
          <p className="comms-ai__note">
            AI writes a first draft for the channel above — then{" "}
            <strong>you still review the audience and confirm</strong> before anyone
            is contacted. The AI never sends; a human always confirms.
          </p>

          <div className="comms-compose__field">
            <label className="comms-compose__label" htmlFor={campaignIntentFieldId}>
              What is this message for?
            </label>
            <input
              id={campaignIntentFieldId}
              className="comms-compose__input"
              type="text"
              value={campaignIntent}
              disabled={!composing}
              placeholder="e.g. Invite the team to Sunday's 8am setup huddle"
              onChange={(event): void => {
                setCampaignIntent(event.target.value);
              }}
            />
          </div>

          <div className="comms-compose__field">
            <label className="comms-compose__label" htmlFor={toneFieldId}>
              Tone
            </label>
            <input
              id={toneFieldId}
              className="comms-compose__input"
              type="text"
              value={tone}
              disabled={!composing}
              placeholder="e.g. Warm, brief, and hopeful"
              onChange={(event): void => {
                setTone(event.target.value);
              }}
            />
          </div>

          {composing ? (
            <button
              type="button"
              className="comms-panel__secondary comms-ai__button"
              disabled={!canDraftWithAi}
              onClick={handleDraftWithAi}
            >
              AI draft
            </button>
          ) : null}
          {aiDrafting ? (
            <p className="comms-panel__intro" role="status" aria-busy="true">
              Asking the AI to draft a message…
            </p>
          ) : null}
        </section>
      ) : null}

      {aiDraft !== null ? (
        <section className="comms-ai-draft" aria-label="AI-drafted message">
          <p className="comms-ai-draft__badge">
            AI-drafted · a human still confirms before sending
          </p>
          {aiDraft.subject !== null ? (
            <p className="comms-ai-draft__subject">
              <span className="comms-ai-draft__field-label">Subject</span>{" "}
              {aiDraft.subject}
            </p>
          ) : null}
          <p className="comms-ai-draft__body">{aiDraft.bodyTemplate}</p>
          <p className="comms-ai-draft__note">
            Review the audience below, then explicitly confirm. The AI did not — and
            cannot — send this; it is a draft awaiting your confirmation.
          </p>
        </section>
      ) : null}

      {audience !== null ? (
        <div className="comms-audience" role="group" aria-label="Resolved audience">
          <div className="comms-audience__group comms-audience__group--included">
            <h4 className="comms-audience__heading">
              Included · {String(audience.included.length)}
            </h4>
            {audience.included.length === 0 ? (
              <p className="charts-empty">No recipients have granted consent.</p>
            ) : (
              <ul className="comms-audience__list">
                {audience.included.map((recipient) => (
                  <li className="comms-audience__row" key={recipient.memberRef}>
                    <span className="comms-audience__name">
                      {nameForRef(recipient.memberRef)}
                    </span>
                    <span className="comms-audience__tag comms-audience__tag--ok">
                      will send
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="comms-audience__group comms-audience__group--suppressed">
            <h4 className="comms-audience__heading">
              Suppressed · {String(audience.suppressed.length)}
            </h4>
            {audience.suppressed.length === 0 ? (
              <p className="charts-empty">No one is suppressed.</p>
            ) : (
              <ul className="comms-audience__list">
                {audience.suppressed.map((recipient: SuppressedRecipient) => (
                  <li className="comms-audience__row" key={recipient.memberRef}>
                    <span className="comms-audience__name">
                      {nameForRef(recipient.memberRef)}
                    </span>
                    <span className="comms-audience__tag comms-audience__tag--blocked">
                      {suppressionReasonLabel(recipient.reason)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {flow.phase === "previewed" ? (
            <div className="comms-audience__actions">
              <button
                type="button"
                className="comms-panel__primary comms-panel__primary--send"
                disabled={audience.included.length === 0}
                onClick={handleOpenGate}
              >
                Send to {String(audience.included.length)}{" "}
                {audience.included.length === 1 ? "recipient" : "recipients"}…
              </button>
              <button
                type="button"
                className="comms-panel__secondary"
                onClick={startNewMessage}
              >
                Discard + start over
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {gateOpen && audience !== null ? (
        <CommunityCommsGate
          channel={audience.channel}
          includedCount={audience.included.length}
          suppressedCount={audience.suppressed.length}
          status={flow.phase === "working" ? "working" : "awaiting-confirm"}
          errorMessage={flow.phase === "awaiting-confirm" ? flow.error : null}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}
    </div>
  );
};
