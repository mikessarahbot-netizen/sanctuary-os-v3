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
  migrateCommunitySqliteSchema
} from "./composition.js";
import type { CommunicationSendPort } from "./in-memory.js";

const TENANT = "tenant_1";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: TENANT
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
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

/**
 * Recording send port: every requested recipient is reported `delivered` and the
 * member refs handed to it are captured so the test can assert that only the
 * consented recipient ever reaches the carrier boundary.
 */
const createRecordingSendPort = (): {
  readonly sendPort: CommunicationSendPort;
  readonly sentMemberRefs: string[];
} => {
  const sentMemberRefs: string[] = [];
  const sendPort: CommunicationSendPort = {
    send: (request) => {
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

  return { sendPort, sentMemberRefs };
};

describe("Community persistence-backed service (node:sqlite integration)", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(
      true
    );
  });

  liveIt(
    "applies the Community migration and round-trips a service flow with the consent + confirmation gates",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-17T12:00:00.000Z";
        const steps = await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        expect(steps).toEqual([
          { migrationId: "202606170007_community_initial_schema", outcome: "applied" }
        ]);

        const { sendPort, sentMemberRefs } = createRecordingSendPort();
        let recipientCounter = 0;
        const selection = createCommunityPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              executor: createSqliteExecutor({ database }),
              ids: {
                attendanceId: () => "attendance_created",
                groupId: () => "group_created",
                householdRef: () => "household_created",
                memberId: () => "member_created",
                membershipId: () => "membership_created",
                messageId: () => "message_created",
                recipientId: () => {
                  recipientCounter += 1;
                  return `recipient_${String(recipientCounter)}`;
                }
              },
              sendPort
            }
          }
        );
        expect(selection.mode).toBe("sql");
        const { commandService, queryService } = selection.servicesAdapter;

        // save a consented member (granted sms) and a non-consented member (denied sms)
        const consented = await commandService.saveMember({
          actor: leader,
          input: {
            contactChannelRefs: [
              { channelRef: "channel_sms_yes", consentStatus: "granted", kind: "sms" }
            ],
            customFieldValues: [{ fieldRef: "field_dob", value: "1990-01-01" }],
            displayName: "Granted Member",
            segmentRefs: ["segment_a"],
            status: "active"
          },
          requestId: "request_save_consented"
        });
        expect(consented).toMatchObject({
          displayName: "Granted Member",
          memberId: "member_created",
          tenantId: TENANT
        });
        // custom-field values + contact refs round-trip through the JSON columns.
        expect(consented.customFieldValues).toEqual([
          { fieldRef: "field_dob", value: "1990-01-01" }
        ]);

        const denied = await commandService.saveMember({
          actor: leader,
          input: {
            contactChannelRefs: [
              { channelRef: "channel_sms_no", consentStatus: "denied", kind: "sms" }
            ],
            customFieldValues: [],
            displayName: "Denied Member",
            memberId: "member_denied",
            segmentRefs: ["segment_a"],
            status: "active"
          },
          requestId: "request_save_denied"
        });
        expect(denied.memberId).toBe("member_denied");

        // household groups the consented member
        const household = await commandService.saveHousehold({
          actor: leader,
          input: {
            label: "Smith Household",
            memberRefs: ["member_created"],
            primaryContactMemberRef: "member_created"
          },
          requestId: "request_household"
        });
        expect(household).toMatchObject({
          householdRef: "household_created",
          label: "Smith Household"
        });

        // group + membership
        const group = await commandService.saveCommunityGroup({
          actor: leader,
          input: { archived: false, kind: "small-group", label: "Tuesday Group" },
          requestId: "request_group"
        });
        expect(group).toMatchObject({ groupId: "group_created", kind: "small-group" });

        await commandService.setGroupMembership({
          actor: leader,
          input: {
            active: true,
            groupId: "group_created",
            memberRef: "member_created",
            roleInGroup: "member"
          },
          requestId: "request_membership"
        });
        const memberships = await queryService.listGroupMemberships({
          actor: leader,
          input: { groupId: "group_created" },
          requestId: "request_list_memberships"
        });
        expect(memberships).toHaveLength(1);
        expect(memberships[0]).toMatchObject({
          membershipId: "membership_created",
          memberRef: "member_created"
        });

        // attendance: a present member row + an anonymous headcount row
        await commandService.recordAttendance({
          actor: leader,
          input: { memberRef: "member_created", occasionRef: "service_1", status: "present" },
          requestId: "request_attendance_member"
        });
        const tally = await queryService.getAttendanceTally({
          actor: leader,
          input: { occasionRef: "service_1" },
          requestId: "request_tally"
        });
        expect(tally.occasions).toMatchObject([
          { occasionRef: "service_1", present: 1, totalKnown: 1 }
        ]);

        // draft → review → confirm → queue a segment message hitting both members
        const drafted = await commandService.draftCommunicationMessage({
          actor: leader,
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            bodyTemplate: "Hello {{firstName}}",
            channel: "sms",
            origin: "human"
          },
          requestId: "request_draft"
        });
        expect(drafted).toMatchObject({ messageId: "message_created", status: "draft" });

        // the confirmation gate blocks confirming straight from draft (must review first)
        const confirmFromDraft = await commandService
          .confirmCommunicationSend({
            actor: leader,
            input: {
              confirmationIntent: { confirmed: true, reason: "too soon" },
              confirmedByRef: "leader_1",
              messageId: "message_created"
            },
            requestId: "request_confirm_too_soon"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(confirmFromDraft)).toBe(true);

        await commandService.markCommunicationReviewed({
          actor: leader,
          input: { messageId: "message_created" },
          requestId: "request_review"
        });

        // the confirmation gate blocks queueing before confirmation
        const queueBeforeConfirm = await commandService
          .queueConfirmedCommunication({
            actor: leader,
            input: {
              confirmationIntent: { confirmed: true, reason: "early" },
              messageId: "message_created"
            },
            requestId: "request_queue_early"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(queueBeforeConfirm)).toBe(true);

        const confirmed = await commandService.confirmCommunicationSend({
          actor: leader,
          input: {
            confirmationIntent: { confirmed: true, reason: "Approved by pastor" },
            confirmedByRef: "leader_1",
            messageId: "message_created"
          },
          requestId: "request_confirm"
        });
        expect(confirmed.status).toBe("confirmed");
        expect(confirmed.confirmation).toMatchObject({
          confirmed: true,
          confirmedByRef: "leader_1",
          reason: "Approved by pastor"
        });

        const sent = await commandService.queueConfirmedCommunication({
          actor: leader,
          input: {
            confirmationIntent: { confirmed: true, reason: "Send it" },
            messageId: "message_created"
          },
          requestId: "request_queue"
        });
        expect(sent.status).toBe("sent");
        // Consent gate: only the consented member reached the carrier port.
        expect(sentMemberRefs).toEqual(["member_created"]);

        const recipients = await queryService.listCommunicationRecipients({
          actor: leader,
          input: { messageId: "message_created" },
          requestId: "request_recipients"
        });
        const sendStatusByMember = Object.fromEntries(
          recipients.map((recipient) => [recipient.memberRef, recipient.sendStatus])
        );
        expect(sendStatusByMember["member_created"]).toBe("delivered");
        expect(sendStatusByMember["member_denied"]).toBe("suppressed");
        // No raw contact value is ever persisted — only opaque channel refs.
        expect(
          recipients.every((recipient) => recipient.channelRef.startsWith("channel_"))
        ).toBe(true);

        // list messages reflects the round-trip + the recorded confirmation
        const messages = await queryService.listCommunicationMessages({
          actor: leader,
          input: {},
          requestId: "request_list_messages"
        });
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
          messageId: "message_created",
          status: "sent"
        });

        // tenant isolation: a foreign tenant sees nothing
        await expect(
          queryService.getMember({
            actor: otherTenantLeader,
            input: { memberId: "member_created" },
            requestId: "request_cross_tenant"
          })
        ).resolves.toBeNull();
        await expect(
          queryService.listMembers({
            actor: otherTenantLeader,
            input: {},
            requestId: "request_cross_tenant_list"
          })
        ).resolves.toEqual([]);
      } finally {
        database.close();
      }
    }
  );

  liveIt(
    "rejects queueing when no recipient has granted consent for the channel",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-17T12:00:00.000Z";
        await migrateCommunitySqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        let recipientCounter = 0;
        const selection = createCommunityPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              executor: createSqliteExecutor({ database }),
              ids: {
                messageId: () => "message_blocked",
                recipientId: () => {
                  recipientCounter += 1;
                  return `recipient_${String(recipientCounter)}`;
                }
              }
            }
          }
        );
        const { commandService } = selection.servicesAdapter;

        await commandService.saveMember({
          actor: leader,
          input: {
            contactChannelRefs: [
              { channelRef: "channel_sms_no", consentStatus: "denied", kind: "sms" }
            ],
            customFieldValues: [],
            displayName: "Denied Member",
            memberId: "member_denied",
            segmentRefs: ["segment_b"],
            status: "active"
          },
          requestId: "request_save_denied"
        });

        await commandService.draftCommunicationMessage({
          actor: leader,
          input: {
            audience: { kind: "segment", segmentRef: "segment_b" },
            bodyTemplate: "Hi",
            channel: "sms",
            origin: "human"
          },
          requestId: "request_draft"
        });
        await commandService.markCommunicationReviewed({
          actor: leader,
          input: { messageId: "message_blocked" },
          requestId: "request_review"
        });
        await commandService.confirmCommunicationSend({
          actor: leader,
          input: {
            confirmationIntent: { confirmed: true, reason: "Approved" },
            confirmedByRef: "leader_1",
            messageId: "message_blocked"
          },
          requestId: "request_confirm"
        });

        const blocked = await commandService
          .queueConfirmedCommunication({
            actor: leader,
            input: {
              confirmationIntent: { confirmed: true, reason: "Queue it" },
              messageId: "message_blocked"
            },
            requestId: "request_queue_blocked"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isCommunityDomainError(blocked)).toBe(true);
        if (isCommunityDomainError(blocked)) {
          expect(blocked.code).toBe("CONSENT_REQUIRED");
        }
      } finally {
        database.close();
      }
    }
  );

  liveIt("skips already-applied Community migrations on a second run", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const clock = (): string => "2026-06-17T12:00:00.000Z";
      const migrationDatabase = wrapMigrationDatabase(database);
      await migrateCommunitySqliteSchema({ clock, database: migrationDatabase });

      await expect(
        migrateCommunitySqliteSchema({ clock, database: migrationDatabase })
      ).resolves.toEqual([
        { migrationId: "202606170007_community_initial_schema", outcome: "skipped" }
      ]);
    } finally {
      database.close();
    }
  });
});
