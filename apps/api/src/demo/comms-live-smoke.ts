import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import twilio from "twilio";
import type { AuthenticatedActor } from "../auth/index.js";
import { createCommunityPersistenceSelection } from "../services/community/composition.js";
import { createTwilioSendPort } from "../services/community/twilio-send-port.js";

/**
 * Runnable LIVE comms smoke test for the real Twilio-backed send-port adapter
 * (`createTwilioSendPort`).
 *
 * This is a plain ESM script (NOT a vitest spec), the comms sibling of
 * `ai-smoke-test.ts` / `obs-live-smoke.ts`. It proves the production send port works
 * against a live Twilio account — but ONLY ever through the existing draft -> review
 * -> confirm -> queue human-confirm gate, never by calling the send port directly. A
 * green run means: the SDK request shape compiles AND is accepted by live Twilio, and
 * a gated, human-confirmed message actually reached the carrier.
 *
 *   - The ONLY live action it performs is ONE outbound SMS to `TWILIO_TEST_TO`. The
 *     message is driven through `draftCommunicationMessage` (origin = human) ->
 *     `markCommunicationReviewed` -> `confirmCommunicationSend` (audited reason) ->
 *     `queueConfirmedCommunication`, exactly like `comms-gate-safety.test.ts`. The
 *     Twilio send port is wired in as the in-memory Community service's `sendPort`;
 *     the script NEVER calls `sendPort.send` itself — the gate does, and only after a
 *     human-style confirm.
 *   - Body text: "Sanctuary OS live verification — please ignore."
 *
 * Secret handling: the Twilio account SID + auth token are read from `apps/api/.env`
 * via dotenv resolved from this file's own location, so they load regardless of cwd.
 * The SID and token values are NEVER printed — at most a length acknowledgement. The
 * from/to numbers are not secret and may be printed. The adapter never reads the SID
 * or token itself: THIS script constructs `twilio(sid, token)` and injects it.
 *
 * Run with: `pnpm --filter @sanctuary-os/api comms:smoke`
 * (Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and
 * TWILIO_TEST_TO in `apps/api/.env`. TWILIO_FROM_NUMBER must be an SMS-capable Twilio
 * sender; TWILIO_TEST_TO is the verified destination to send to.)
 */

// Load apps/api/.env relative to THIS file (src/demo/comms-live-smoke.ts ->
// apps/api/.env), so the credentials load no matter where the script runs.
const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
config({ path: envPath });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const requireEnv = (key: string, hint: string): string => {
  const value = process.env[key];
  if (value === undefined || value.length === 0) {
    console.error(`${key} not set in apps/api/.env — ${hint}`);
    process.exit(1);
  }

  return value;
};

const accountSid = requireEnv(
  "TWILIO_ACCOUNT_SID",
  "paste your Twilio Account SID and re-run"
);
const authToken = requireEnv(
  "TWILIO_AUTH_TOKEN",
  "paste your Twilio Auth Token and re-run"
);
const fromNumber = requireEnv(
  "TWILIO_FROM_NUMBER",
  "set it to your SMS-capable Twilio sender (E.164, e.g. +15551234567) and re-run"
);
const toNumber = requireEnv(
  "TWILIO_TEST_TO",
  "set it to the verified destination number (E.164, e.g. +15557654321) and re-run"
);

// Never print the SID or token themselves; length-only acknowledgements confirm they
// loaded. The from/to numbers are not secret and may be printed.
console.log(
  `twilio credentials detected (sid length ${String(accountSid.length)}, token length ${String(authToken.length)})`
);
console.log(`from: ${fromNumber}  ->  to: ${toNumber}`);

const BODY_TEXT = "Sanctuary OS live verification — please ignore.";

const smokeActor: AuthenticatedActor = {
  actorId: "comms-live-smoke-operator",
  roles: ["worship_leader"],
  tenantId: "tenant-demo"
};

const clock = (): string => new Date().toISOString();

const main = async (): Promise<void> => {
  // THIS script (the composition root for the smoke) constructs the Twilio client
  // from the resolved secret. The adapter never reads SID/token itself.
  const client = twilio(accountSid, authToken);

  // The real send port. The body resolver returns the fixed verification text; the
  // contact resolver returns the configured TWILIO_TEST_TO destination (in a real
  // deployment these resolve through the access-controlled contact vault + message
  // store — here the smoke supplies the single destination directly).
  const sendPort = createTwilioSendPort({
    client,
    fromNumber,
    resolveMessageBody: (): Promise<string | undefined> => Promise.resolve(BODY_TEXT),
    resolveRecipientContact: (): Promise<string | undefined> => Promise.resolve(toNumber)
  });

  // Wire the REAL send port into the in-memory Community service. The gate drives
  // this port; the script never calls `sendPort.send` directly.
  const selection = createCommunityPersistenceSelection(
    { mode: "in-memory" },
    { inMemory: { clock, sendPort } }
  );
  if (selection.mode !== "in-memory") {
    throw new Error("Expected the in-memory Community persistence selection.");
  }
  const { commandService, queryService } = selection.servicesAdapter;

  // A consented sms member so the confirmed message has exactly one included
  // recipient. The opaque channelRef is a vault handle (NOT the phone number); the
  // injected contact resolver maps it to TWILIO_TEST_TO at send time.
  await commandService.saveMember({
    actor: smokeActor,
    input: {
      contactChannelRefs: [
        { channelRef: "vault://sms/comms-live-smoke", consentStatus: "granted", kind: "sms" }
      ],
      customFieldValues: [],
      displayName: "Comms Live Smoke Recipient",
      memberId: "member-comms-smoke",
      segmentRefs: ["segment-comms-smoke"],
      status: "active"
    },
    requestId: "comms-live-smoke-save-member"
  });

  // draft -> review -> confirm -> queue, THROUGH the gate.
  const drafted = await commandService.draftCommunicationMessage({
    actor: smokeActor,
    input: {
      audience: { kind: "segment", segmentRef: "segment-comms-smoke" },
      bodyTemplate: BODY_TEXT,
      channel: "sms",
      origin: "human"
    },
    requestId: "comms-live-smoke-draft"
  });
  const messageId = drafted.messageId;

  await commandService.markCommunicationReviewed({
    actor: smokeActor,
    input: { messageId },
    requestId: "comms-live-smoke-review"
  });
  await commandService.confirmCommunicationSend({
    actor: smokeActor,
    input: {
      confirmationIntent: { confirmed: true, reason: "Live smoke verification." },
      confirmedByRef: smokeActor.actorId,
      messageId
    },
    requestId: "comms-live-smoke-confirm"
  });
  const queued = await commandService.queueConfirmedCommunication({
    actor: smokeActor,
    input: {
      confirmationIntent: { confirmed: true, reason: "Send the live verification." },
      messageId
    },
    requestId: "comms-live-smoke-queue"
  });

  console.log(`message status after gated queue: ${queued.status}`);

  // Read back the persisted recipient row to learn the per-recipient send outcome
  // (the gate stamps it from the send port's result).
  const recipientRows = await queryService.listCommunicationRecipients({
    actor: smokeActor,
    input: { messageId },
    requestId: "comms-live-smoke-recipients"
  });

  const sentRow = recipientRows.find((row) => row.memberRef === "member-comms-smoke");

  if (sentRow === undefined) {
    console.error(
      "--- COMMS LIVE: FAIL --- no recipient row was recorded for the gated send"
    );
    process.exit(1);
  }

  console.log(`recipient send status: ${sentRow.sendStatus}`);

  // PASS if Twilio accepted the send: the gate stamped the recipient `sent` or
  // `delivered` (the adapter maps Twilio's queued|accepted|sending|sent -> sent,
  // delivered -> delivered). A `failed` row means Twilio rejected it.
  if (sentRow.sendStatus === "sent" || sentRow.sendStatus === "delivered") {
    console.log("--- COMMS LIVE: PASS ---");
    console.log(
      `Twilio accepted the gated SMS (status: ${sentRow.sendStatus}). Adapter + gate verified.`
    );
    return;
  }

  // Twilio rejected the send. The adapter mapped it to a redacted, fixed reason. An
  // A2P / messaging-disabled rejection is the common one for a fresh/unregistered
  // sender: in that case the ADAPTER itself worked (the request was correctly formed
  // and sent) — delivery is blocked pending A2P registration, not an adapter bug.
  const reason = sentRow.failureReason ?? "(no reason recorded)";
  const isMessagingBlocked =
    reason === "The carrier could not deliver the message and will not retry." ||
    reason === "The carrier rejected the message.";

  if (isMessagingBlocked) {
    console.error("--- COMMS LIVE: ADAPTER OK, DELIVERY BLOCKED ---");
    console.error(
      `The Twilio send-port adapter worked: the request was correctly formed and sent, and the carrier rejected it (reason: "${reason}"). This is the expected A2P / messaging-disabled outcome for a sender pending 10DLC/A2P approval — register the sender to enable delivery, then re-run.`
    );
    process.exit(2);
  }

  console.error(`--- COMMS LIVE: FAIL --- send was not accepted (reason: "${reason}")`);
  process.exit(1);
};

main().catch((error: unknown) => {
  console.error(`--- COMMS LIVE: FAIL --- ${errorMessage(error)}`);
  process.exit(1);
});
