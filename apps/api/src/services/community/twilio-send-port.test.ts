import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RestException } from "twilio";
import type { MessageInstance } from "twilio/lib/rest/api/v2010/account/message.js";
import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { isCommunityDomainError } from "../../domain/community/index.js";
import {
  createCommunityPersistenceSelection,
  migrateCommunitySqliteSchema,
  type CommunityPersistenceSelection
} from "./composition.js";
import type {
  CommunicationSendRequest,
  CommunicationSendRequestRecipient
} from "./in-memory.js";
import {
  createTwilioSendPort,
  isRetryableTwilioSendFailure,
  type TwilioMessagesClient
} from "./twilio-send-port.js";

/**
 * Unit tests for the real Twilio-backed `CommunicationSendPort`
 * (`createTwilioSendPort`). These inject a FAKE Twilio client (its `messages.create`
 * signature taken verbatim from the SDK's `MessageListInstanceCreateOptions` /
 * `MessageInstance`, so `tsc` still validates the request the adapter builds) and
 * NEVER touch the network — the SECRET (account SID + auth token) and the live
 * `twilio(sid, token)` construction live at the composition root, never here. The
 * destination phone number and body are resolved behind injected boundaries that the
 * tests control, and the test fake never returns the auth token in a result.
 *
 * Mirrors the fake-client style of `obs/obs-websocket-control-port.test.ts`:
 *   (a) a send calls `messages.create` exactly once with the right to/from/body;
 *   (b) a Twilio throw is mapped to the redacted typed result, never leaking the
 *       token or the raw Twilio message;
 *   (c) the gate is reinforced END-TO-END through the real service: an unconfirmed /
 *       ai-drafted message can NEVER reach `messages.create`.
 * Plus a no-secrets assertion: the result carries no token / destination / raw payload.
 */

const FROM_NUMBER = "+15550001111";
const TO_NUMBER = "+15557654321";
const AUTH_TOKEN = "super-secret-auth-token-NEVER-LEAK";
const BODY_TEXT = "Sanctuary OS live verification — please ignore.";

interface CapturedCreate {
  readonly body: string | undefined;
  readonly from: string | undefined;
  readonly to: string;
}

type CreateOutcome =
  | { readonly kind: "resolve"; readonly status: MessageInstance["status"]; readonly sid: string }
  | { readonly kind: "reject"; readonly error: unknown };

/**
 * A fake `TwilioMessagesClient` whose `messages.create` is typed against the real
 * SDK option/response shapes, so the adapter's call site is type-checked exactly as
 * it is against a real `twilio()` client. It records every call and returns the
 * configured outcome. It NEVER holds or echoes the auth token.
 */
const createFakeClient = (
  outcome: CreateOutcome = { kind: "resolve", sid: "SM_fake_sid", status: "queued" }
): { readonly client: TwilioMessagesClient; readonly calls: CapturedCreate[] } => {
  const calls: CapturedCreate[] = [];

  const client: TwilioMessagesClient = {
    messages: {
      create: (params): Promise<MessageInstance> => {
        calls.push({ body: params.body, from: params.from, to: params.to });

        if (outcome.kind === "reject") {
          return Promise.reject(
            outcome.error instanceof Error
              ? outcome.error
              : new Error(String(outcome.error))
          );
        }

        // Only the two fields the adapter reads (`sid`, `status`) need to be real;
        // cast the partial through `unknown` to the SDK type for the fake.
        return Promise.resolve({
          sid: outcome.sid,
          status: outcome.status
        } as unknown as MessageInstance);
      }
    }
  };

  return { calls, client };
};

const recipient = (memberRef: string, channelRef: string): CommunicationSendRequestRecipient => ({
  channelRef,
  memberRef
});

const smsRequest = (
  recipients: readonly CommunicationSendRequestRecipient[]
): CommunicationSendRequest => ({
  channel: "sms",
  messageId: "message-1",
  recipients,
  tenantId: "tenant-1"
});

const buildPort = (
  client: TwilioMessagesClient,
  overrides: {
    readonly resolveTo?: (channelRef: string) => Promise<string | undefined>;
    readonly resolveBody?: () => Promise<string | undefined>;
  } = {}
): ReturnType<typeof createTwilioSendPort> => {
  const resolveTo = overrides.resolveTo;

  return createTwilioSendPort({
    client,
    fromNumber: FROM_NUMBER,
    resolveMessageBody:
      overrides.resolveBody ?? ((): Promise<string | undefined> => Promise.resolve(BODY_TEXT)),
    resolveRecipientContact:
      resolveTo === undefined
        ? (): Promise<string | undefined> => Promise.resolve(TO_NUMBER)
        : (args): Promise<string | undefined> => resolveTo(args.channelRef)
  });
};

/**
 * Build a real `RestException` the way the Twilio SDK does — its constructor takes
 * an axios-style response (`{ statusCode, body: { code, message, ... } }`), not the
 * flattened fields (the published `.d.ts` mistypes this as `any`). The resulting
 * instance carries `.status` / `.code` / `.message`, exactly what the adapter reads.
 */
const restException = (statusCode: number, code: number, message: string): RestException =>
  new RestException({ body: { code, message }, statusCode });

describe("createTwilioSendPort", () => {
  it("(a) sends one confirmed recipient with the right to/from/body, calling messages.create exactly once", async () => {
    const { client, calls } = createFakeClient({
      kind: "resolve",
      sid: "SM_accepted",
      status: "queued"
    });
    const port = buildPort(client);

    const results = await port.send(smsRequest([recipient("member-1", "vault://sms/1")]));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ body: BODY_TEXT, from: FROM_NUMBER, to: TO_NUMBER });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      channelRef: "vault://sms/1",
      memberRef: "member-1",
      sendStatus: "sent"
    });
  });

  it("maps a Twilio 'delivered' status to the delivered coarse status", async () => {
    const { client } = createFakeClient({ kind: "resolve", sid: "SM_d", status: "delivered" });
    const port = buildPort(client);

    const [result] = await port.send(smsRequest([recipient("member-1", "vault://sms/1")]));

    expect(result?.sendStatus).toBe("delivered");
  });

  it("maps a Twilio 'failed'/'undelivered' status to a redacted failed result", async () => {
    const { client } = createFakeClient({ kind: "resolve", sid: "SM_f", status: "failed" });
    const port = buildPort(client);

    const [result] = await port.send(smsRequest([recipient("member-1", "vault://sms/1")]));

    expect(result?.sendStatus).toBe("failed");
    expect(result?.failureReason).toBe(
      "The carrier could not deliver the message and will not retry."
    );
  });

  it("(b) maps a Twilio throw to a redacted typed result and never leaks the raw error or token", async () => {
    const rawTwilioMessage =
      "Account AC_SECRET with token super-secret-auth-token-NEVER-LEAK is not authorized";
    const { client } = createFakeClient({
      kind: "reject",
      error: restException(401, 20003, rawTwilioMessage)
    });
    const port = buildPort(client);

    const [result] = await port.send(smsRequest([recipient("member-1", "vault://sms/1")]));

    expect(result?.sendStatus).toBe("failed");
    // The redacted, fixed-table reason — NOT the raw Twilio message.
    expect(result?.failureReason).toBe("The carrier rejected the message.");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(AUTH_TOKEN);
    expect(serialized).not.toContain(rawTwilioMessage);
    expect(serialized).not.toContain("AC_SECRET");
  });

  it("classifies A2P / unregistered (30034) as terminal (not retryable) and a 5xx as retryable", async () => {
    const a2p = createFakeClient({
      kind: "reject",
      error: restException(400, 30034, "A2P 10DLC unregistered")
    });
    const portA2p = buildPort(a2p.client);
    const [a2pResult] = await portA2p.send(smsRequest([recipient("m", "c")]));
    expect(a2pResult?.failureReason).toBe(
      "The carrier could not deliver the message and will not retry."
    );
    expect(isRetryableTwilioSendFailure("carrier-terminal")).toBe(false);

    const transient = createFakeClient({
      kind: "reject",
      error: restException(503, 20429, "Service unavailable")
    });
    const portTransient = buildPort(transient.client);
    const [transientResult] = await portTransient.send(smsRequest([recipient("m", "c")]));
    expect(transientResult?.failureReason).toBe("The carrier is temporarily unavailable.");
    expect(isRetryableTwilioSendFailure("carrier-unavailable")).toBe(true);
  });

  it("fails closed (never calls Twilio) for a non-sms channel, an unresolvable contact, or an unresolvable body", async () => {
    // non-sms channel
    const emailClient = createFakeClient();
    const emailPort = buildPort(emailClient.client);
    const [emailResult] = await emailPort.send({
      channel: "email",
      messageId: "m",
      recipients: [recipient("member-1", "vault://email/1")],
      tenantId: "tenant-1"
    });
    expect(emailClient.calls).toHaveLength(0);
    expect(emailResult).toMatchObject({
      sendStatus: "failed",
      failureReason: "This carrier adapter only sends sms messages."
    });

    // unresolvable contact
    const noContact = createFakeClient();
    const noContactPort = buildPort(noContact.client, {
      resolveTo: (): Promise<string | undefined> => Promise.resolve(undefined)
    });
    const [noContactResult] = await noContactPort.send(
      smsRequest([recipient("member-1", "vault://sms/1")])
    );
    expect(noContact.calls).toHaveLength(0);
    expect(noContactResult?.failureReason).toBe(
      "No contact could be resolved for the recipient."
    );

    // unresolvable body
    const noBody = createFakeClient();
    const noBodyPort = buildPort(noBody.client, {
      resolveBody: (): Promise<string | undefined> => Promise.resolve(undefined)
    });
    const [noBodyResult] = await noBodyPort.send(
      smsRequest([recipient("member-1", "vault://sms/1")])
    );
    expect(noBody.calls).toHaveLength(0);
    expect(noBodyResult?.failureReason).toBe(
      "No message body could be resolved for the recipient."
    );
  });
});

// ---------------------------------------------------------------------------
// (c) Gate reinforcement: drive the REAL Community service and prove the Twilio
// client is only ever reached AFTER a human confirm, and NEVER for an ai-drafted /
// unconfirmed message. Mirrors comms-gate-safety.test.ts (real on-disk node:sqlite).
// ---------------------------------------------------------------------------

interface NodeSqliteStatementLike {
  readonly all: (...parameters: readonly SqliteBindValue[]) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

const wrapMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const clock = (): string => "2026-06-17T12:00:00.000Z";

const leaderA: AuthenticatedActor = {
  actorId: "leader_a",
  roles: ["worship_leader"],
  tenantId: "tenant_a"
};

const createSequentialIds = (): ((prefix: string) => () => string) => {
  const counters = new Map<string, number>();

  return (prefix: string) => (): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${String(next)}`;
  };
};

type SqlSelection = Extract<CommunityPersistenceSelection, { mode: "sql" }>;

const asSql = (selection: CommunityPersistenceSelection): SqlSelection => {
  if (selection.mode !== "sql") {
    throw new Error("Expected the sql persistence selection.");
  }

  return selection;
};

describe("createTwilioSendPort reinforces the comms human-confirm gate (real on-disk node:sqlite)", () => {
  liveIt(
    "an ai-drafted, unconfirmed message never reaches Twilio; only a human confirm lets it through, and then exactly once",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const dir = mkdtempSync(join(tmpdir(), "sanctuary-twilio-gate-"));
      const database = new nodeSqlite.DatabaseSync(join(dir, "gate.db"));

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        const { client, calls } = createFakeClient({
          kind: "resolve",
          sid: "SM_gated",
          status: "queued"
        });
        const twilioSendPort = createTwilioSendPort({
          client,
          fromNumber: FROM_NUMBER,
          resolveMessageBody: (): Promise<string | undefined> => Promise.resolve(BODY_TEXT),
          resolveRecipientContact: (): Promise<string | undefined> => Promise.resolve(TO_NUMBER)
        });

        const aiDraftPort = {
          draftCommunication: (): Promise<unknown> =>
            Promise.resolve({
              bodyTemplate: "Hi {{firstName}}, join us Sunday.",
              needsReview: true,
              rationale: "Re-engage low-attendance members.",
              status: "drafted"
            })
        };

        const seq = createSequentialIds();
        const selection = asSql(
          createCommunityPersistenceSelection(
            { environment: "production" },
            {
              sql: {
                aiDraftPort,
                clock,
                executor: createSqliteExecutor({ database }),
                ids: {
                  attendanceId: seq("attendance"),
                  groupId: seq("group"),
                  householdRef: seq("household"),
                  memberId: seq("member"),
                  membershipId: seq("membership"),
                  messageId: () => "message_shared",
                  recipientId: seq("recipient")
                },
                sendPort: twilioSendPort
              }
            }
          )
        );
        const { commandService } = selection.servicesAdapter;

        await commandService.saveMember({
          actor: leaderA,
          input: {
            contactChannelRefs: [
              { channelRef: "channel_sms_yes", consentStatus: "granted", kind: "sms" }
            ],
            customFieldValues: [],
            displayName: "Granted Member",
            memberId: "member_shared",
            segmentRefs: ["segment_a"],
            status: "active"
          },
          requestId: "request_member"
        });

        // AI produces a draft (origin = ai-drafted, status = draft).
        const aiMessage = await commandService.draftCommunicationWithAi({
          actor: leaderA,
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            campaignIntent: "Re-engage members who have not attended recently.",
            channel: "sms",
            churchToneSummary: "Warm, brief, hopeful.",
            forbiddenTopics: ["giving"],
            requiredPlaceholders: ["firstName"]
          },
          requestId: "request_ai_draft"
        });
        expect(aiMessage).toMatchObject({ origin: "ai-drafted", status: "draft" });

        // Shove the ai draft straight at queue (no human confirm) -> refused; Twilio
        // is NEVER called.
        const aiQueue = await commandService
          .queueConfirmedCommunication({
            actor: leaderA,
            input: {
              confirmationIntent: { confirmed: true, reason: "Send it." },
              messageId: "message_shared"
            },
            requestId: "request_ai_queue"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(aiQueue)).toBe(true);
        expect(calls).toHaveLength(0);

        // Legitimate path: a HUMAN reviews + confirms, THEN it sends.
        await commandService.markCommunicationReviewed({
          actor: leaderA,
          input: { messageId: "message_shared" },
          requestId: "request_review"
        });
        await commandService.confirmCommunicationSend({
          actor: leaderA,
          input: {
            confirmationIntent: { confirmed: true, reason: "Approved by pastor." },
            confirmedByRef: "leader_a",
            messageId: "message_shared"
          },
          requestId: "request_confirm"
        });
        const sent = await commandService.queueConfirmedCommunication({
          actor: leaderA,
          input: {
            confirmationIntent: { confirmed: true, reason: "Send it." },
            messageId: "message_shared"
          },
          requestId: "request_send"
        });
        expect(sent).toMatchObject({ messageId: "message_shared", status: "sent" });

        // Twilio was reached exactly once, only after the human confirm, with the
        // resolved destination + body — and never the auth token.
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ body: BODY_TEXT, from: FROM_NUMBER, to: TO_NUMBER });
        expect(JSON.stringify(calls)).not.toContain(AUTH_TOKEN);
      } finally {
        database.close();
        rmSync(dir, { force: true, recursive: true });
      }
    }
  );
});
