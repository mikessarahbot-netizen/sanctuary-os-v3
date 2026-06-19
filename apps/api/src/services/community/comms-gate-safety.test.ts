import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  CommunicationSendPort,
  CommunicationSendRequest,
  CommunicationSendResult
} from "./in-memory.js";

/**
 * ADVERSARIAL safety suite for GUARANTEE 1 (a comms message can't be queued/sent
 * before a human confirm; an AI-origin draft can NEVER self-send) and GUARANTEE 3
 * (tenant isolation) on the Community comms surface, exercised over a REAL
 * on-disk node:sqlite database.
 *
 * The existing `sqlite-integration.test.ts` proves the happy path plus
 * confirm-from-draft / queue-before-confirm refusals. This suite goes further:
 * out-of-order send attempts, an `ai-drafted` message shoved at the send port
 * without any human confirm, cross-tenant confirm/queue/cancel using COLLIDING
 * message ids (so a tenant filter is the only separation), re-confirm /
 * confirm-after-send, an all-denied audience (no consented recipient may reach
 * the carrier), and a raw-SQL attempt to forge a `sent`/`queued` row past the
 * DDL CHECK. Every case asserts the send port was NEVER reached for the
 * illegitimate send.
 */
const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

const leaderA: AuthenticatedActor = {
  actorId: "leader_a",
  roles: ["worship_leader"],
  tenantId: TENANT_A
};

const leaderB: AuthenticatedActor = {
  actorId: "leader_b",
  roles: ["worship_leader"],
  tenantId: TENANT_B
};

interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
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

/** A send port that records every recipient it is ever asked to send to. */
const createRecordingSendPort = (): {
  readonly sendPort: CommunicationSendPort;
  readonly sentMemberRefs: string[];
  readonly sendCallCount: () => number;
} => {
  const sentMemberRefs: string[] = [];
  let calls = 0;
  const sendPort: CommunicationSendPort = {
    send: (request: CommunicationSendRequest): Promise<readonly CommunicationSendResult[]> => {
      calls += 1;
      for (const recipient of request.recipients) {
        sentMemberRefs.push(recipient.memberRef);
      }

      return Promise.resolve(
        request.recipients.map((recipient) => ({
          channelRef: recipient.channelRef,
          memberRef: recipient.memberRef,
          sendStatus: "delivered" as const
        }))
      );
    }
  };

  return { sendPort, sentMemberRefs, sendCallCount: (): number => calls };
};

interface OnDiskDb {
  readonly database: NodeSqliteDatabaseLike & { readonly close: () => void };
  readonly cleanup: () => void;
}

const openOnDiskDatabase = (): OnDiskDb => {
  if (nodeSqlite === undefined) {
    throw new Error("node:sqlite is unavailable.");
  }

  const dir = mkdtempSync(join(tmpdir(), "sanctuary-comms-safety-"));
  const database = new nodeSqlite.DatabaseSync(join(dir, "comms-safety.db"));

  return {
    database,
    cleanup: (): void => {
      database.close();
      rmSync(dir, { force: true, recursive: true });
    }
  };
};

const createSequentialIds = (): ((prefix: string) => () => string) => {
  const counters = new Map<string, number>();

  return (prefix: string) => (): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${String(next)}`;
  };
};

const buildServices = (
  database: NodeSqliteDatabaseLike,
  sendPort: CommunicationSendPort,
  messageId: () => string
): CommunityPersistenceSelection => {
  const seq = createSequentialIds();

  return createCommunityPersistenceSelection(
    { environment: "production" },
    {
      sql: {
        clock,
        executor: createSqliteExecutor({ database }),
        ids: {
          attendanceId: seq("attendance"),
          groupId: seq("group"),
          householdRef: seq("household"),
          memberId: seq("member"),
          membershipId: seq("membership"),
          messageId,
          recipientId: seq("recipient")
        },
        sendPort
      }
    }
  );
};

type SqlSelection = Extract<CommunityPersistenceSelection, { mode: "sql" }>;

const asSql = (selection: CommunityPersistenceSelection): SqlSelection => {
  if (selection.mode !== "sql") {
    throw new Error("Expected the sql persistence selection.");
  }

  return selection;
};

/**
 * Save a consented sms member and create a `draft` segment message for the actor.
 * Member + message ids are fixed so colliding-id cross-tenant scenarios are exact.
 */
const seedDraftMessage = async (
  selection: SqlSelection,
  actor: AuthenticatedActor
): Promise<void> => {
  const { commandService } = selection.servicesAdapter;
  await commandService.saveMember({
    actor,
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
  await commandService.draftCommunicationMessage({
    actor,
    input: {
      audience: { kind: "segment", segmentRef: "segment_a" },
      bodyTemplate: "Hello {{firstName}}",
      channel: "sms",
      origin: "human"
    },
    requestId: "request_draft"
  });
};

const reviewAndConfirm = async (
  selection: SqlSelection,
  actor: AuthenticatedActor
): Promise<void> => {
  const { commandService } = selection.servicesAdapter;
  await commandService.markCommunicationReviewed({
    actor,
    input: { messageId: "message_shared" },
    requestId: "request_review"
  });
  await commandService.confirmCommunicationSend({
    actor,
    input: {
      confirmationIntent: { confirmed: true, reason: "Approved by pastor." },
      confirmedByRef: "leader_a",
      messageId: "message_shared"
    },
    requestId: "request_confirm"
  });
};

const queue = (
  selection: SqlSelection,
  actor: AuthenticatedActor,
  requestId: string
): Promise<unknown> =>
  selection.servicesAdapter.commandService.queueConfirmedCommunication({
    actor,
    input: {
      confirmationIntent: { confirmed: true, reason: "Send it." },
      messageId: "message_shared"
    },
    requestId
  });

describe("Community comms-gate adversarial safety (real on-disk node:sqlite)", () => {
  liveIt(
    "refuses to queue/send a message that was never confirmed (out-of-order) — send port never reached",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });
        const { sendPort, sendCallCount } = createRecordingSendPort();
        const selection = asSql(buildServices(database, sendPort, () => "message_shared"));

        await seedDraftMessage(selection, leaderA);

        // Queue straight from draft (no review, no confirm) → refused.
        const queueFromDraft = await queue(selection, leaderA, "request_queue_draft").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isCommunityDomainError(queueFromDraft)).toBe(true);
        expect(sendCallCount()).toBe(0);

        // Review (allowed, no send) then queue from `reviewed` (still unconfirmed) → refused.
        await selection.servicesAdapter.commandService.markCommunicationReviewed({
          actor: leaderA,
          input: { messageId: "message_shared" },
          requestId: "request_review"
        });
        const queueFromReviewed = await queue(
          selection,
          leaderA,
          "request_queue_reviewed"
        ).then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isCommunityDomainError(queueFromReviewed)).toBe(true);
        expect(sendCallCount()).toBe(0);

        // The message must still be `reviewed` — no send happened.
        const messages = await selection.servicesAdapter.queryService.listCommunicationMessages(
          { actor: leaderA, input: {}, requestId: "request_messages" }
        );
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ messageId: "message_shared", status: "reviewed" });
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "an AI-DRAFTED message can never self-send: shoved straight at queue it is refused, and only a human confirm unlocks the carrier",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });
        const { sendPort, sendCallCount, sentMemberRefs } = createRecordingSendPort();
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
                sendPort
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

        // The AI produces a draft (origin = ai-drafted, status = draft).
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

        // Attempt to queue the AI draft directly (it never went through a human
        // confirm) → refused; the carrier is never contacted.
        const aiQueue = await queue(selection, leaderA, "request_ai_queue").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isCommunityDomainError(aiQueue)).toBe(true);
        expect(sendCallCount()).toBe(0);

        // The legitimate path: a HUMAN reviews + confirms the AI draft, THEN it sends.
        await reviewAndConfirm(selection, leaderA);
        const sent = await queue(selection, leaderA, "request_ai_send");
        expect(sent).toMatchObject({ messageId: "message_shared", status: "sent" });
        // The carrier only ever saw the consented member, and only after the human confirm.
        expect(sendCallCount()).toBe(1);
        expect(sentMemberRefs).toEqual(["member_shared"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "a foreign tenant cannot confirm, queue, or cancel another tenant's message — even with COLLIDING ids — and the carrier is never reached",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });
        const { sendPort, sendCallCount } = createRecordingSendPort();
        const selection = asSql(buildServices(database, sendPort, () => "message_shared"));
        const { commandService, queryService } = selection.servicesAdapter;

        // Both tenants seed a member + draft with the SAME ids.
        await seedDraftMessage(selection, leaderA);
        await seedDraftMessage(selection, leaderB);

        // Tenant A drives ITS message to `confirmed`.
        await reviewAndConfirm(selection, leaderA);

        // Tenant B attempts to QUEUE the shared message id. B's own message is
        // still `draft`, so this must refuse and never reach the carrier — and it
        // must not queue A's confirmed message either.
        const bQueue = await queue(selection, leaderB, "request_b_queue").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isCommunityDomainError(bQueue)).toBe(true);
        expect(sendCallCount()).toBe(0);

        // Tenant B cancels the shared id — only B's own draft is affected.
        await commandService.cancelCommunicationMessage({
          actor: leaderB,
          input: {
            confirmationIntent: { confirmed: true, reason: "B cancels its own draft." },
            messageId: "message_shared"
          },
          requestId: "request_b_cancel"
        });

        // A's message is still `confirmed` (B's cancel did not cross the tenant boundary).
        const aMessages = await queryService.listCommunicationMessages({
          actor: leaderA,
          input: {},
          requestId: "request_a_messages"
        });
        expect(aMessages).toHaveLength(1);
        expect(aMessages[0]).toMatchObject({ messageId: "message_shared", status: "confirmed" });

        // B's message is the canceled one.
        const bMessages = await queryService.listCommunicationMessages({
          actor: leaderB,
          input: {},
          requestId: "request_b_messages"
        });
        expect(bMessages).toHaveLength(1);
        expect(bMessages[0]).toMatchObject({ messageId: "message_shared", status: "canceled" });

        // A completes its OWN send — the carrier fires exactly once, for A only.
        const sent = await queue(selection, leaderA, "request_a_send");
        expect(sent).toMatchObject({ status: "sent" });
        expect(sendCallCount()).toBe(1);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "rejects re-confirming an already-confirmed message and confirming after send",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });
        const { sendPort } = createRecordingSendPort();
        const selection = asSql(buildServices(database, sendPort, () => "message_shared"));
        const { commandService } = selection.servicesAdapter;

        await seedDraftMessage(selection, leaderA);
        await reviewAndConfirm(selection, leaderA);

        // Re-confirm an already-confirmed message → rejected (illegal transition).
        const reConfirm = await commandService
          .confirmCommunicationSend({
            actor: leaderA,
            input: {
              confirmationIntent: { confirmed: true, reason: "Confirm again." },
              confirmedByRef: "leader_a",
              messageId: "message_shared"
            },
            requestId: "request_reconfirm"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(reConfirm)).toBe(true);

        // Legitimate send.
        const sent = await queue(selection, leaderA, "request_send");
        expect(sent).toMatchObject({ status: "sent" });

        // Confirm AFTER send (terminal) → rejected.
        const lateConfirm = await commandService
          .confirmCommunicationSend({
            actor: leaderA,
            input: {
              confirmationIntent: { confirmed: true, reason: "Too late." },
              confirmedByRef: "leader_a",
              messageId: "message_shared"
            },
            requestId: "request_late_confirm"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(lateConfirm)).toBe(true);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "a confirmed message whose entire audience denied consent is refused at queue — the carrier is never reached",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });
        const { sendPort, sendCallCount } = createRecordingSendPort();
        const selection = asSql(buildServices(database, sendPort, () => "message_shared"));
        const { commandService } = selection.servicesAdapter;

        // The only audience member has DENIED sms consent.
        await commandService.saveMember({
          actor: leaderA,
          input: {
            contactChannelRefs: [
              { channelRef: "channel_sms_no", consentStatus: "denied", kind: "sms" }
            ],
            customFieldValues: [],
            displayName: "Denied Member",
            memberId: "member_shared",
            segmentRefs: ["segment_a"],
            status: "active"
          },
          requestId: "request_member"
        });
        await commandService.draftCommunicationMessage({
          actor: leaderA,
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            bodyTemplate: "Hello {{firstName}}",
            channel: "sms",
            origin: "human"
          },
          requestId: "request_draft"
        });
        await reviewAndConfirm(selection, leaderA);

        // Queue a confirmed message with no consented recipient → CONSENT_REQUIRED,
        // carrier never reached.
        const queued = await queue(selection, leaderA, "request_queue_denied").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isCommunityDomainError(queued)).toBe(true);
        if (isCommunityDomainError(queued)) {
          expect(queued.code).toBe("CONSENT_REQUIRED");
        }
        expect(sendCallCount()).toBe(0);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "the DDL CHECK is the last line of defense: a raw INSERT forging status='sent'/'queued' with confirmed=0 is rejected by the database",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        const forgeSentWithoutConfirmation = (): void => {
          database
            .prepare(
              `INSERT INTO communication_messages (
                 tenant_id, message_id, channel, body_template, audience_json,
                 status, origin, confirmed, created_by_ref, created_at, updated_at
               ) VALUES (?, ?, 'sms', 'Hi', '{"kind":"segment","segmentRef":"segment_a"}', 'sent', 'human', 0, ?, ?, ?)`
            )
            .run(TENANT_A, "forged_sent", "leader_a", clock(), clock());
        };
        expect(forgeSentWithoutConfirmation).toThrow();

        const forgeQueuedWithoutConfirmation = (): void => {
          database
            .prepare(
              `INSERT INTO communication_messages (
                 tenant_id, message_id, channel, body_template, audience_json,
                 status, origin, confirmed, created_by_ref, created_at, updated_at
               ) VALUES (?, ?, 'sms', 'Hi', '{"kind":"segment","segmentRef":"segment_a"}', 'queued', 'ai-drafted', 0, ?, ?, ?)`
            )
            .run(TENANT_A, "forged_queued", "ai", clock(), clock());
        };
        expect(forgeQueuedWithoutConfirmation).toThrow();

        const rows = database
          .prepare("SELECT message_id FROM communication_messages")
          .all();
        expect(rows).toEqual([]);
      } finally {
        cleanup();
      }
    }
  );
});
