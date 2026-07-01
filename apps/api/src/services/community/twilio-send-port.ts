import type { MessageListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/message.js";
import type { MessageInstance } from "twilio/lib/rest/api/v2010/account/message.js";
import type {
  CommunicationSendPort,
  CommunicationSendRequest,
  CommunicationSendRequestRecipient,
  CommunicationSendResult
} from "./in-memory.js";

/**
 * Real, Twilio-backed implementation of the injected `CommunicationSendPort`
 * (slice 11 — the live carrier send seam). The default fake in `in-memory.ts`
 * (`defaultSendPort`) stands in for every unit test and the keyless dev path; this
 * is the production adapter wired against the official Twilio Node SDK (`twilio`,
 * v5). It is the Community+ analog of the OBS control-port adapter
 * (`obs/obs-websocket-control-port.ts`) and the Anthropic AI adapters, and follows
 * the same four rules: co-located with its port, injected + SDK-typed client (so
 * `tsc` validates the request shape), never reads/stores/logs a secret, unit-tested
 * with a fake.
 *
 * **Why co-located with the port (not in a package).** The adapter implements the
 * port contract (`CommunicationSendPort` and its secret-free, PII-free result
 * shapes), which lives in this api workspace. Normal dependency direction is
 * app -> package, never package -> app, so the adapter lives beside its port.
 *
 * **Secret + PII posture — this adapter operates an already-constructed client and
 * resolves contact values behind an injected, access-controlled boundary.** The
 * adapter NEVER reads the Twilio account SID or auth token from the environment: the
 * composition root constructs `twilio(sid, token)` from the access-controlled
 * vault/env and injects it here, exactly like the OBS adapter operates an
 * already-connected `OBSWebSocket`. The send request Community+ produces carries only
 * opaque vault `channelRef`s (never a phone number) and a `messageId` (never the body
 * text) — per the privacy contract in `domain/community/schemas.ts`, the contact
 * value is resolved + access-checked at send time, OUTSIDE Community+, and the body
 * template is merged at send time, also outside Community+. This adapter therefore
 * takes two injected resolvers (owned by the composition root, which owns the vault
 * and the message store): `resolveRecipientContact` turns a `channelRef` into the
 * destination phone number, and `resolveMessageBody` turns the `(messageId, member)`
 * pair into the rendered body text. The adapter passes those to Twilio and reports
 * back only a per-recipient coarse status + a redacted `failureReason` — it never
 * returns, logs, or carries the destination number, the auth token, or the raw
 * Twilio payload. The `channelRef`/`to` are treated as PII and are never logged.
 *
 * **Failures are normalized to the port's redacted result, never the raw Twilio
 * error.** A thrown `RestException` (or any other throw) is mapped to a
 * `sendStatus: "failed"` result whose `failureReason` is one of the fixed, redacted
 * operator strings below — never the raw Twilio message, code, credentials, or
 * payload. Per-recipient, so one recipient's failure never blocks the others. A
 * recipient on a non-sms channel, with no resolvable contact, or with no resolvable
 * body is failed-closed with the matching fixed reason rather than handed to Twilio.
 */

/**
 * The minimal `twilio` SDK surface this adapter depends on: just the
 * `messages.create({ to, from, body })` call, typed verbatim from the SDK's
 * `MessageListInstance.create`. Typing the injected client this way means `tsc`
 * validates the request shape (`to`/`from`/`body` against
 * `MessageListInstanceCreateOptions`) and the response shape (`sid`/`status` on
 * `MessageInstance`) against the official SDK even though no live call is made in
 * tests. A real `twilio(sid, token)` client satisfies it (its `messages` is a full
 * `MessageListInstance`); the test fake supplies only the `create` used here.
 */
export interface TwilioMessagesClient {
  readonly messages: {
    readonly create: (
      params: MessageListInstanceCreateOptions
    ) => Promise<MessageInstance>;
  };
}

/**
 * Resolve an opaque contact `channelRef` to a destination phone number (E.164),
 * behind the access-controlled contact-vault boundary the composition root owns.
 * Returns `undefined` when the ref has no resolvable/authorized contact value —
 * which the adapter fails closed as `unresolvable-recipient`, never handing a bad
 * `to` to Twilio. The `channelRef`/returned value are PII and are never logged.
 */
export type ResolveRecipientContact = (
  request: ResolveRecipientContactArgs
) => Promise<string | undefined>;

export interface ResolveRecipientContactArgs {
  readonly channelRef: string;
  readonly memberRef: string;
  readonly tenantId: string;
}

/**
 * Resolve the rendered body text for one recipient of a confirmed message, behind
 * the message-store boundary the composition root owns. The `{{placeholder}}`
 * template is merged here (at send time, outside Community+), never stored expanded.
 * Returns `undefined` when no body can be produced — failed closed as
 * `unresolvable-body`.
 */
export type ResolveMessageBody = (
  request: ResolveMessageBodyArgs
) => Promise<string | undefined>;

export interface ResolveMessageBodyArgs {
  readonly channel: CommunicationSendRequest["channel"];
  readonly memberRef: string;
  readonly messageId: string;
  readonly tenantId: string;
}

export interface CreateTwilioSendPortOptions {
  /** The already-constructed Twilio client (never built from env here). */
  readonly client: TwilioMessagesClient;
  /**
   * The sender phone number (E.164), supplied by the composition root from the
   * access-controlled config. Not a secret, but resolved by the caller, never read
   * from env by the adapter.
   */
  readonly fromNumber: string;
  readonly resolveMessageBody: ResolveMessageBody;
  readonly resolveRecipientContact: ResolveRecipientContact;
}

/**
 * The fixed, redacted per-recipient failure reasons. Each is generated here (never
 * derived from a raw Twilio error), so a `failed` result can carry no Twilio account
 * SID/auth token, no destination number, no raw Twilio message/code, and no raw
 * payload — only a coarse, safe operator string. The `CommunicationRecipient`
 * schema stores this as the `failureReason`.
 */
export type TwilioSendFailureCode =
  | "unsupported-channel"
  | "unresolvable-recipient"
  | "unresolvable-body"
  | "carrier-rejected"
  | "carrier-terminal"
  | "carrier-unavailable";

const SAFE_FAILURE_REASON_BY_CODE: Readonly<Record<TwilioSendFailureCode, string>> =
  {
    "carrier-rejected": "The carrier rejected the message.",
    "carrier-terminal":
      "The carrier could not deliver the message and will not retry.",
    "carrier-unavailable": "The carrier is temporarily unavailable.",
    "unresolvable-body": "No message body could be resolved for the recipient.",
    "unresolvable-recipient": "No contact could be resolved for the recipient.",
    "unsupported-channel":
      "This carrier adapter only sends sms messages."
  };

/**
 * Whether a normalized failure is retryable (transient) vs terminal. Surfaced for
 * callers/telemetry that care; the port's per-recipient result itself carries only a
 * coarse status + redacted reason, so this table documents the classification the
 * Twilio-code mapping below uses. Network/5xx => retryable; rejection/terminal
 * delivery failures => not retryable.
 */
const RETRYABLE_BY_CODE: Readonly<Record<TwilioSendFailureCode, boolean>> = {
  "carrier-rejected": false,
  "carrier-terminal": false,
  "carrier-unavailable": true,
  "unresolvable-body": false,
  "unresolvable-recipient": false,
  "unsupported-channel": false
};

export const isRetryableTwilioSendFailure = (
  code: TwilioSendFailureCode
): boolean => RETRYABLE_BY_CODE[code];

/**
 * Twilio terminal SMS error codes (the message was processed and definitively
 * cannot be delivered — A2P/registration, blocked/unsubscribed, invalid/unreachable
 * destination, queue overflow that won't clear). These map to `carrier-terminal`;
 * the caller should NOT retry. Reference: Twilio Error & Warning Dictionary.
 *   30007 carrier filtered / message blocked,
 *   30008 unknown delivery error,
 *   21610 recipient unsubscribed (STOP),
 *   21408 permission to send to region not enabled,
 *   21211 invalid 'To' number,
 *   21612 cannot route to that destination,
 *   30034 A2P 10DLC unregistered / number not approved for messaging,
 *   63016 outside allowed messaging window (template/registration).
 */
const TERMINAL_TWILIO_CODES: ReadonlySet<number> = new Set([
  21211, 21408, 21610, 21612, 30007, 30008, 30034, 63016
]);

/**
 * Twilio Account SID / auth / authorization rejections — the request was refused
 * before delivery (bad credentials, unverified sender, permission). `carrier-rejected`,
 * not retryable (retrying with the same credentials won't help).
 *   20003 authentication failure,
 *   20404 resource not found (bad account/from),
 *   21606 'From' not a valid, SMS-capable Twilio number for the account,
 *   21660 mismatched 'From'/account.
 */
const REJECTED_TWILIO_CODES: ReadonlySet<number> = new Set([
  20003, 20404, 21606, 21660
]);

/**
 * Structural guard for a thrown Twilio REST error. The `twilio` package is CommonJS
 * and does not re-export its `RestException` class as a named ESM binding (importing
 * it breaks under Node's ESM loader), so classify by SHAPE instead of `instanceof`:
 * a Twilio REST error carries a numeric Twilio `code` and/or an HTTP `status`. This
 * is also more robust than an `instanceof` tied to one SDK build.
 */
const isTwilioRestError = (
  error: unknown
): error is { readonly code?: unknown; readonly status?: unknown } =>
  typeof error === "object" &&
  error !== null &&
  ("code" in error || "status" in error);

/**
 * Map a thrown Twilio value to a redacted `TwilioSendFailureCode`. A Twilio REST
 * error is classified by its Twilio `code` first (terminal vs rejected), then by HTTP
 * `status` (5xx / 429 => transient `carrier-unavailable`; other 4xx => terminal
 * rejection). Anything else (a network throw without a Twilio shape) is the
 * retryable `carrier-unavailable`. The raw error's message/code/status/stack is
 * intentionally discarded — only the fixed code (and its safe reason) is surfaced,
 * so no credential or destination detail can leak upward.
 */
const toFailureCode = (error: unknown): TwilioSendFailureCode => {
  if (isTwilioRestError(error)) {
    const code = typeof error.code === "number" ? error.code : undefined;
    const status = typeof error.status === "number" ? error.status : undefined;

    if (code !== undefined && TERMINAL_TWILIO_CODES.has(code)) {
      return "carrier-terminal";
    }

    if (code !== undefined && REJECTED_TWILIO_CODES.has(code)) {
      return "carrier-rejected";
    }

    if (status !== undefined && (status >= 500 || status === 429)) {
      return "carrier-unavailable";
    }

    if (code !== undefined || status !== undefined) {
      return "carrier-rejected";
    }
  }

  return "carrier-unavailable";
};

const failedResult = (
  recipient: CommunicationSendRequestRecipient,
  code: TwilioSendFailureCode
): CommunicationSendResult => ({
  channelRef: recipient.channelRef,
  failureReason: SAFE_FAILURE_REASON_BY_CODE[code],
  memberRef: recipient.memberRef,
  sendStatus: "failed"
});

/**
 * Twilio message statuses that mean the carrier ACCEPTED the send (it is in flight
 * or already delivered) — mapped to the port's coarse `delivered`/`sent`. A
 * definitively-failed status (`failed`/`undelivered`/`canceled`) is mapped to the
 * port's `failed` with the redacted `carrier-terminal` reason; anything else
 * (queued/sending/accepted/...) is reported as `sent` (accepted by the carrier).
 */
const FAILED_TWILIO_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "undelivered",
  "canceled"
]);

/**
 * Build the real Twilio-backed `CommunicationSendPort`. `send` resolves each
 * recipient's destination + body behind the injected boundaries, calls
 * `client.messages.create({ to, from, body })`, and maps the Twilio response (or
 * throw) to the port's per-recipient secret-free, PII-free result. The `from` number
 * and the Twilio client come from the composition root; this adapter never reads a
 * credential and never logs the `to`/body.
 *
 * To wire it live (see `docs/running.md` -> "Live comms"):
 *   const client = twilio(sid, token);
 *   createTwilioSendPort({ client, fromNumber, resolveRecipientContact, resolveMessageBody })
 * passed as the Community persistence selection's `sendPort` in place of the fake,
 * behind the existing draft -> review -> confirm -> queue human-confirm gate.
 */
export const createTwilioSendPort = (
  options: CreateTwilioSendPortOptions
): CommunicationSendPort => {
  const { client, fromNumber, resolveMessageBody, resolveRecipientContact } =
    options;

  const sendToRecipient = async (
    request: CommunicationSendRequest,
    recipient: CommunicationSendRequestRecipient
  ): Promise<CommunicationSendResult> => {
    // This adapter speaks SMS only; any other channel is failed closed (never
    // handed to Twilio's message API).
    if (request.channel !== "sms") {
      return failedResult(recipient, "unsupported-channel");
    }

    const to = await resolveRecipientContact({
      channelRef: recipient.channelRef,
      memberRef: recipient.memberRef,
      tenantId: request.tenantId
    });
    if (to === undefined || to.length === 0) {
      return failedResult(recipient, "unresolvable-recipient");
    }

    const body = await resolveMessageBody({
      channel: request.channel,
      memberRef: recipient.memberRef,
      messageId: request.messageId,
      tenantId: request.tenantId
    });
    if (body === undefined || body.length === 0) {
      return failedResult(recipient, "unresolvable-body");
    }

    let message: MessageInstance;
    try {
      message = await client.messages.create({ body, from: fromNumber, to });
    } catch (error: unknown) {
      return failedResult(recipient, toFailureCode(error));
    }

    if (FAILED_TWILIO_STATUSES.has(message.status)) {
      return failedResult(recipient, "carrier-terminal");
    }

    // Accepted by the carrier. `delivered` is the only Twilio status that is a
    // terminal success; everything else accepted (queued/sending/sent/accepted/...)
    // is reported as the port's coarse `sent`. We carry NO sid, NO destination, NO
    // raw payload upward — only the coarse status the port's result allows.
    return {
      channelRef: recipient.channelRef,
      memberRef: recipient.memberRef,
      sendStatus: message.status === "delivered" ? "delivered" : "sent"
    };
  };

  return {
    send: (
      request: CommunicationSendRequest
    ): Promise<readonly CommunicationSendResult[]> =>
      Promise.all(
        request.recipients.map((recipient) =>
          sendToRecipient(request, recipient)
        )
      )
  };
};
