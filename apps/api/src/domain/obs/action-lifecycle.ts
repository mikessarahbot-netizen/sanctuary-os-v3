import { z } from "zod";
import {
  ObsActionConfirmationSchema,
  ObsActionIntentSchema,
  ObsActionStatusSchema,
  type ObsActionConfirmation,
  type ObsActionIntent,
  type ObsActionStatus
} from "./schemas.js";

/**
 * Pure OBS action-intent lifecycle state machine — the structural human-confirm
 * gate for live output.
 *
 * `applyActionTransition` decides whether moving an `ObsActionIntent` to a
 * target status is legal, enforcing the OBS safety non-negotiables as a pure,
 * discriminated-union state machine (per the engineering rule preferring
 * discriminated unions for stateful workflows):
 *
 *   1. **Allowed-transition map** — `requested → confirmed → dispatched →
 *      succeeded`, with `→ canceled` and `→ failed` as terminal branches from
 *      the live states. Illegal jumps are rejected. Critically, there is **no
 *      `requested → dispatched` edge**: dispatch is reachable *only* from
 *      `confirmed`, so confirmation is mandatory before anything goes live.
 *   2. **Confirmation-required-to-confirm/dispatch** — the `confirm` transition
 *      requires a human `confirmation` (`confirmed = true` with actor + reason +
 *      timestamp), which is merged onto the intent. Advancing into `dispatched`
 *      requires the intent to already carry that confirmation.
 *   3. **AI-suggested can never self-advance** — an `origin = "ai-suggested"`
 *      intent is bound by the same gate: it may only ever be `confirm`ed by a
 *      human (or canceled). It can never reach `dispatched`/`succeeded` on its
 *      own; AI proposes, a human confirms.
 *
 * No dispatch, no I/O, no clock, no randomness — it only decides legality and
 * returns the next record (with the confirmation merged on the confirming step)
 * or a typed `ActionLifecycleError`. The service edge supplies the confirmation,
 * the clock, and the port call; this function stays pure. This mirrors
 * Community+'s `applyMessageTransition`.
 */
export const ObsActionTransitionSchema = z.enum([
  "confirm",
  "dispatch",
  "succeed",
  "cancel",
  "fail"
]);

export const ActionLifecycleErrorCodeSchema = z.enum([
  "ILLEGAL_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "CONFIRMATION_NOT_ALLOWED",
  "ALREADY_CONFIRMED"
]);

export const ActionLifecycleErrorSchema = z
  .object({
    code: ActionLifecycleErrorCodeSchema,
    from: ObsActionStatusSchema,
    safeMessage: z.string().min(1),
    to: ObsActionStatusSchema
  })
  .strict();

export type ObsActionTransition = z.infer<typeof ObsActionTransitionSchema>;
export type ActionLifecycleErrorCode = z.infer<
  typeof ActionLifecycleErrorCodeSchema
>;
export type ActionLifecycleError = z.infer<typeof ActionLifecycleErrorSchema>;

export type ObsActionTransitionResult =
  | { readonly ok: true; readonly intent: ObsActionIntent }
  | { readonly ok: false; readonly error: ActionLifecycleError };

const TRANSITION_TARGETS: Readonly<
  Record<ObsActionTransition, ObsActionStatus>
> = {
  cancel: "canceled",
  confirm: "confirmed",
  dispatch: "dispatched",
  fail: "failed",
  succeed: "succeeded"
};

/**
 * Legal next statuses per current status. `succeeded`, `canceled`, and `failed`
 * are terminal (no outgoing edges). Note the deliberate omission of `dispatched`
 * from `requested`'s edge set: dispatch is reachable **only** from `confirmed`,
 * which is the structural enforcement of the human-confirm gate. `cancel` is
 * reachable from `requested`/`confirmed`; `fail` from the live action states.
 */
const ALLOWED_NEXT_STATUSES: Readonly<
  Record<ObsActionStatus, ReadonlySet<ObsActionStatus>>
> = {
  canceled: new Set<ObsActionStatus>(),
  confirmed: new Set<ObsActionStatus>(["dispatched", "canceled", "failed"]),
  dispatched: new Set<ObsActionStatus>(["succeeded", "failed"]),
  failed: new Set<ObsActionStatus>(),
  requested: new Set<ObsActionStatus>(["confirmed", "canceled"]),
  succeeded: new Set<ObsActionStatus>()
};

const lifecycleError = (
  code: ActionLifecycleErrorCode,
  from: ObsActionStatus,
  to: ObsActionStatus,
  safeMessage: string
): ObsActionTransitionResult => ({
  error: ActionLifecycleErrorSchema.parse({ code, from, safeMessage, to }),
  ok: false
});

export const applyActionTransition = (
  intent: ObsActionIntent,
  transition: ObsActionTransition,
  confirmation?: ObsActionConfirmation
): ObsActionTransitionResult => {
  const parsedIntent = ObsActionIntentSchema.parse(intent);
  const parsedTransition = ObsActionTransitionSchema.parse(transition);
  const parsedConfirmation =
    confirmation === undefined
      ? undefined
      : ObsActionConfirmationSchema.parse(confirmation);

  const from = parsedIntent.status;
  const to = TRANSITION_TARGETS[parsedTransition];

  if (!ALLOWED_NEXT_STATUSES[from].has(to)) {
    return lifecycleError(
      "ILLEGAL_TRANSITION",
      from,
      to,
      `Cannot transition a ${from} action to ${to}.`
    );
  }

  if (parsedTransition === "confirm") {
    if (parsedConfirmation === undefined) {
      return lifecycleError(
        "CONFIRMATION_REQUIRED",
        from,
        to,
        "Confirming an OBS action requires a human confirmation."
      );
    }

    if (parsedIntent.confirmation !== undefined) {
      return lifecycleError(
        "ALREADY_CONFIRMED",
        from,
        to,
        "This OBS action already carries a confirmation."
      );
    }

    const confirmedIntent = ObsActionIntentSchema.parse({
      ...parsedIntent,
      confirmation: parsedConfirmation,
      status: to
    });

    return { intent: confirmedIntent, ok: true };
  }

  if (parsedConfirmation !== undefined) {
    return lifecycleError(
      "CONFIRMATION_NOT_ALLOWED",
      from,
      to,
      "A confirmation may only be supplied on the confirm transition."
    );
  }

  // Dispatch is the single moment OBS state changes; it is legal only from a
  // confirmed intent. The transition map already forbids a `requested →
  // dispatched` jump, but we re-assert the confirmation presence so the gate is
  // enforced even if an intent reached `dispatched`'s predecessor irregularly.
  if (parsedTransition === "dispatch" && parsedIntent.confirmation === undefined) {
    return lifecycleError(
      "CONFIRMATION_REQUIRED",
      from,
      to,
      "Dispatching an OBS action requires a recorded human confirmation."
    );
  }

  const nextIntent = ObsActionIntentSchema.parse({
    ...parsedIntent,
    status: to
  });

  return { intent: nextIntent, ok: true };
};
