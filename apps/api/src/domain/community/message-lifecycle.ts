import { z } from "zod";
import {
  CommunicationConfirmationSchema,
  CommunicationMessageSchema,
  CommunicationStatusSchema,
  type CommunicationConfirmation,
  type CommunicationMessage,
  type CommunicationStatus
} from "./schemas.js";

/**
 * Pure communication-message lifecycle state machine for Community+.
 *
 * `applyMessageTransition` decides whether moving a `CommunicationMessage` to a
 * target status is legal, enforcing two rules as a pure, discriminated-union
 * state machine (per the engineering rule preferring discriminated unions for
 * stateful workflows):
 *
 *   1. **Allowed-transition map** — `draft → reviewed → confirmed → queued →
 *      sent`, with `→ canceled` and `→ failed` as terminal branches from the
 *      live states. Illegal jumps (e.g. `draft → sent`) are rejected.
 *   2. **Confirmation-required-to-send** — advancing into `confirmed` (and thus
 *      `queued`/`sent`) requires a human `confirmation` (`confirmed = true` with
 *      actor + reason + timestamp). An `origin = "ai-drafted"` message is bound
 *      by the same gate: it can never self-advance past `draft` without a human
 *      confirming — AI may draft, never send.
 *
 * No send, no I/O, no clock, no randomness — it only decides legality and
 * returns the next record (with the confirmation merged on the confirming step)
 * or a typed `LifecycleError`. The caller (service edge) supplies the
 * confirmation and persists; this function stays pure.
 */
export const MessageTransitionSchema = z.enum([
  "review",
  "confirm",
  "queue",
  "send",
  "cancel",
  "fail"
]);

export const LifecycleErrorCodeSchema = z.enum([
  "ILLEGAL_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "CONFIRMATION_NOT_ALLOWED",
  "ALREADY_CONFIRMED"
]);

export const LifecycleErrorSchema = z
  .object({
    code: LifecycleErrorCodeSchema,
    from: CommunicationStatusSchema,
    safeMessage: z.string().min(1),
    to: CommunicationStatusSchema
  })
  .strict();

export type MessageTransition = z.infer<typeof MessageTransitionSchema>;
export type LifecycleErrorCode = z.infer<typeof LifecycleErrorCodeSchema>;
export type LifecycleError = z.infer<typeof LifecycleErrorSchema>;

export type MessageTransitionResult =
  | { readonly ok: true; readonly message: CommunicationMessage }
  | { readonly ok: false; readonly error: LifecycleError };

const TRANSITION_TARGETS: Readonly<
  Record<MessageTransition, CommunicationStatus>
> = {
  cancel: "canceled",
  confirm: "confirmed",
  fail: "failed",
  queue: "queued",
  review: "reviewed",
  send: "sent"
};

/**
 * Legal next statuses per current status. `canceled`, `sent`, and `failed` are
 * terminal (no outgoing edges). `cancel` and `fail` are reachable from every
 * live state, so they appear in each non-terminal entry.
 */
const ALLOWED_NEXT_STATUSES: Readonly<
  Record<CommunicationStatus, ReadonlySet<CommunicationStatus>>
> = {
  canceled: new Set<CommunicationStatus>(),
  confirmed: new Set<CommunicationStatus>(["queued", "canceled", "failed"]),
  draft: new Set<CommunicationStatus>(["reviewed", "canceled", "failed"]),
  failed: new Set<CommunicationStatus>(),
  queued: new Set<CommunicationStatus>(["sent", "canceled", "failed"]),
  reviewed: new Set<CommunicationStatus>(["confirmed", "canceled", "failed"]),
  sent: new Set<CommunicationStatus>()
};

const lifecycleError = (
  code: LifecycleErrorCode,
  from: CommunicationStatus,
  to: CommunicationStatus,
  safeMessage: string
): MessageTransitionResult => ({
  error: LifecycleErrorSchema.parse({ code, from, safeMessage, to }),
  ok: false
});

export const applyMessageTransition = (
  message: CommunicationMessage,
  transition: MessageTransition,
  confirmation?: CommunicationConfirmation
): MessageTransitionResult => {
  const parsedMessage = CommunicationMessageSchema.parse(message);
  const parsedTransition = MessageTransitionSchema.parse(transition);
  const parsedConfirmation =
    confirmation === undefined
      ? undefined
      : CommunicationConfirmationSchema.parse(confirmation);

  const from = parsedMessage.status;
  const to = TRANSITION_TARGETS[parsedTransition];

  if (!ALLOWED_NEXT_STATUSES[from].has(to)) {
    return lifecycleError(
      "ILLEGAL_TRANSITION",
      from,
      to,
      `Cannot transition a ${from} message to ${to}.`
    );
  }

  if (parsedTransition === "confirm") {
    if (parsedConfirmation === undefined) {
      return lifecycleError(
        "CONFIRMATION_REQUIRED",
        from,
        to,
        "Confirming a message requires a human confirmation."
      );
    }

    const confirmedMessage = CommunicationMessageSchema.parse({
      ...parsedMessage,
      confirmation: parsedConfirmation,
      status: to
    });

    return { message: confirmedMessage, ok: true };
  }

  if (parsedConfirmation !== undefined) {
    return lifecycleError(
      "CONFIRMATION_NOT_ALLOWED",
      from,
      to,
      "A confirmation may only be supplied on the confirm transition."
    );
  }

  // Non-confirm transitions into a confirmation-gated status must already carry
  // a recorded confirmation (the schema enforces this on parse, but we surface a
  // typed error rather than letting the re-parse throw).
  const requiresConfirmation = to === "queued" || to === "sent";

  if (requiresConfirmation && parsedMessage.confirmation === undefined) {
    return lifecycleError(
      "CONFIRMATION_REQUIRED",
      from,
      to,
      `A ${to} message must already carry a human confirmation.`
    );
  }

  const nextMessage = CommunicationMessageSchema.parse({
    ...parsedMessage,
    status: to
  });

  return { message: nextMessage, ok: true };
};
