import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  MemberSchema,
  isCommunityDomainError,
  type CommunicationMessage,
  type CommunityDomainErrorCode,
  type Member
} from "../../domain/community/index.js";
import {
  createInMemoryCommunityServicesAdapter,
  type CommunicationSendPort
} from "./in-memory.js";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const planner: AuthenticatedActor = {
  actorId: "planner_1",
  roles: ["planner"],
  tenantId: "tenant_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const consentedMember: Member = MemberSchema.parse({
  contactChannelRefs: [
    { channelRef: "channel_sms_yes", consentStatus: "granted", kind: "sms" }
  ],
  createdAt: timestamp,
  customFieldValues: [],
  displayName: "Granted Member",
  memberId: "member_yes",
  segmentRefs: ["segment_a"],
  status: "active",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const deniedMember: Member = MemberSchema.parse({
  contactChannelRefs: [
    { channelRef: "channel_sms_no", consentStatus: "denied", kind: "sms" }
  ],
  createdAt: timestamp,
  customFieldValues: [],
  displayName: "Denied Member",
  memberId: "member_no",
  segmentRefs: ["segment_a"],
  status: "active",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: CommunityDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isCommunityDomainError(error)).toBe(true);
  if (isCommunityDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

const draftSmsMessage = async (
  adapter: ReturnType<typeof createInMemoryCommunityServicesAdapter>,
  origin: "human" | "ai-drafted" = "human"
): Promise<CommunicationMessage> =>
  adapter.commandService.draftCommunicationMessage({
    actor: leader,
    input: {
      audience: { kind: "segment", segmentRef: "segment_a" },
      bodyTemplate: "Hello {{firstName}}",
      channel: "sms",
      origin
    },
    requestId: "request_draft"
  });

describe("createInMemoryCommunityServicesAdapter", () => {
  it("creates members with deterministic IDs and tenant scope", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { memberId: () => "member_created" }
    });

    await expect(
      adapter.commandService.saveMember({
        actor: leader,
        input: {
          contactChannelRefs: [],
          customFieldValues: [],
          displayName: "New Member",
          segmentRefs: [],
          status: "active"
        },
        requestId: "request_create"
      })
    ).resolves.toMatchObject({
      displayName: "New Member",
      memberId: "member_created",
      status: "active",
      tenantId: "tenant_1"
    });

    expect(adapter.readMembers()).toHaveLength(1);
  });

  it("keeps reads tenant-scoped and returns null for cross-tenant member lookups", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      seed: { members: [consentedMember] }
    });

    await expect(
      adapter.queryService.getMember({
        actor: otherTenantLeader,
        input: { memberId: "member_yes" },
        requestId: "request_cross_get"
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryService.listMembers({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_cross_list"
      })
    ).resolves.toEqual([]);
  });

  it("filters members by status and household", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      seed: {
        members: [
          consentedMember,
          MemberSchema.parse({
            ...deniedMember,
            householdRef: "household_1",
            status: "visitor"
          })
        ]
      }
    });

    await expect(
      adapter.queryService.listMembers({
        actor: leader,
        input: { filter: { status: "visitor" } },
        requestId: "request_filter_status"
      })
    ).resolves.toMatchObject([{ memberId: "member_no", status: "visitor" }]);

    await expect(
      adapter.queryService.listMembers({
        actor: leader,
        input: { filter: { householdRef: "household_1" } },
        requestId: "request_filter_household"
      })
    ).resolves.toHaveLength(1);
  });

  it("archives a member with explicit confirmation and audit intent", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => "2026-06-21T15:00:00.000Z",
      seed: { members: [consentedMember] }
    });

    await expect(
      adapter.commandService.archiveMember({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Left the church" },
          memberId: "member_yes"
        },
        requestId: "request_archive"
      })
    ).resolves.toMatchObject({
      memberId: "member_yes",
      status: "archived",
      updatedAt: "2026-06-21T15:00:00.000Z"
    });
  });

  it("throws MEMBER_NOT_FOUND when archiving an unknown member", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.archiveMember({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Cleanup" },
          memberId: "member_missing"
        },
        requestId: "request_archive_missing"
      }),
      "MEMBER_NOT_FOUND"
    );
  });

  it("rejects viewer mutations with AUTHORIZATION_FAILED", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.saveMember({
        actor: viewer,
        input: {
          contactChannelRefs: [],
          customFieldValues: [],
          displayName: "Should Fail",
          segmentRefs: [],
          status: "active"
        },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("rejects a non-comms role from managing communications with AUTHORIZATION_FAILED", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.draftCommunicationMessage({
        actor: planner,
        input: {
          audience: { kind: "segment", segmentRef: "segment_a" },
          bodyTemplate: "Hi",
          channel: "sms",
          origin: "human"
        },
        requestId: "request_planner_draft"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("round-trips a group membership and removes it with confirmation", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { membershipId: () => "membership_created" }
    });

    await adapter.commandService.setGroupMembership({
      actor: leader,
      input: {
        active: true,
        groupId: "group_1",
        memberRef: "member_yes",
        roleInGroup: "member"
      },
      requestId: "request_set_membership"
    });

    await expect(
      adapter.queryService.listGroupMemberships({
        actor: leader,
        input: { groupId: "group_1" },
        requestId: "request_list_memberships"
      })
    ).resolves.toHaveLength(1);

    await expect(
      adapter.commandService.removeGroupMembership({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "No longer serving" },
          membershipId: "membership_created"
        },
        requestId: "request_remove_membership"
      })
    ).resolves.toBeUndefined();

    await expect(
      adapter.queryService.listGroupMemberships({
        actor: leader,
        input: { groupId: "group_1" },
        requestId: "request_list_after_remove"
      })
    ).resolves.toEqual([]);
  });

  it("throws MEMBERSHIP_NOT_FOUND when removing an unknown membership", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.removeGroupMembership({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Cleanup" },
          membershipId: "membership_missing"
        },
        requestId: "request_remove_missing"
      }),
      "MEMBERSHIP_NOT_FOUND"
    );
  });

  it("records attendance and tallies present member rows plus anonymous headcount", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp
    });

    await adapter.commandService.recordAttendance({
      actor: leader,
      input: { memberRef: "member_yes", occasionRef: "service_1", status: "present" },
      requestId: "request_present"
    });
    await adapter.commandService.recordAttendance({
      actor: leader,
      input: { headcount: 12, occasionRef: "service_1" },
      requestId: "request_headcount"
    });

    await expect(
      adapter.queryService.getAttendanceTally({
        actor: leader,
        input: { occasionRef: "service_1" },
        requestId: "request_tally"
      })
    ).resolves.toEqual({
      occasions: [
        {
          absent: 0,
          anonymousHeadcount: 12,
          excused: 0,
          occasionRef: "service_1",
          present: 1,
          totalKnown: 1,
          totalReached: 13
        }
      ]
    });
  });

  it("rejects an attendance row that is neither a member row nor a headcount row", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expect(
      adapter.commandService.recordAttendance({
        actor: leader,
        input: { occasionRef: "service_1" },
        requestId: "request_bad_attendance"
      })
    ).rejects.toThrow("An anonymous attendance row requires a headcount.");
  });

  it("excludes non-consented recipients from the resolved audience preview", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { messageId: () => "message_preview" },
      seed: { members: [consentedMember, deniedMember] }
    });
    await draftSmsMessage(adapter);

    const audience = await adapter.queryService.getResolvedAudience({
      actor: leader,
      input: { messageId: "message_preview" },
      requestId: "request_preview"
    });

    expect(audience).not.toBeNull();
    expect(audience?.included).toEqual([
      { channelRef: "channel_sms_yes", memberRef: "member_yes" }
    ]);
    expect(audience?.suppressed).toEqual([
      { consentStatus: "denied", memberRef: "member_no", reason: "consent-not-granted" }
    ]);
  });

  it("blocks an unconfirmed message from being queued for send", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { messageId: () => "message_unconfirmed" },
      seed: { members: [consentedMember] }
    });
    await draftSmsMessage(adapter);
    await adapter.commandService.markCommunicationReviewed({
      actor: leader,
      input: { messageId: "message_unconfirmed" },
      requestId: "request_review"
    });

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Send it" },
          messageId: "message_unconfirmed"
        },
        requestId: "request_queue_unconfirmed"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );
  });

  it("blocks confirming a message straight from draft (must be reviewed first)", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { messageId: () => "message_draft" },
      seed: { members: [consentedMember] }
    });
    await draftSmsMessage(adapter);

    await expectDomainErrorCode(
      adapter.commandService.confirmCommunicationSend({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Send it" },
          confirmedByRef: "leader_1",
          messageId: "message_draft"
        },
        requestId: "request_confirm_from_draft"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );
  });

  it("forbids an AI-drafted message from self-advancing toward send without a human confirmation", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { messageId: () => "message_ai" },
      seed: { members: [consentedMember] }
    });
    const drafted = await draftSmsMessage(adapter, "ai-drafted");
    expect(drafted.origin).toBe("ai-drafted");

    // The AI draft can be reviewed by a human, but cannot be queued until a human
    // confirms it — the gate is identical regardless of origin.
    await adapter.commandService.markCommunicationReviewed({
      actor: leader,
      input: { messageId: "message_ai" },
      requestId: "request_ai_review"
    });

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "auto" },
          messageId: "message_ai"
        },
        requestId: "request_ai_queue"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );

    // After an explicit human confirmation, the same AI-drafted message proceeds.
    const confirmed = await adapter.commandService.confirmCommunicationSend({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Reviewed by a human" },
        confirmedByRef: "leader_1",
        messageId: "message_ai"
      },
      requestId: "request_ai_confirm"
    });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmation).toMatchObject({
      confirmed: true,
      confirmedByRef: "leader_1",
      reason: "Reviewed by a human"
    });
  });

  it("sends a human-confirmed message and suppresses non-consented recipients", async () => {
    const sendCalls: string[] = [];
    const sendPort: CommunicationSendPort = {
      send: (request) => {
        for (const recipient of request.recipients) {
          sendCalls.push(recipient.memberRef);
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
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: {
        messageId: () => "message_send",
        recipientId: (() => {
          let next = 0;
          return () => {
            next += 1;
            return `recipient_${String(next)}`;
          };
        })()
      },
      seed: { members: [consentedMember, deniedMember] },
      sendPort
    });

    await draftSmsMessage(adapter);
    await adapter.commandService.markCommunicationReviewed({
      actor: leader,
      input: { messageId: "message_send" },
      requestId: "request_review"
    });
    await adapter.commandService.confirmCommunicationSend({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Approved" },
        confirmedByRef: "leader_1",
        messageId: "message_send"
      },
      requestId: "request_confirm"
    });

    const sent = await adapter.commandService.queueConfirmedCommunication({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Queue it" },
        messageId: "message_send"
      },
      requestId: "request_queue"
    });

    expect(sent.status).toBe("sent");
    // Only the consented member was handed to the carrier port.
    expect(sendCalls).toEqual(["member_yes"]);

    const recipients = await adapter.queryService.listCommunicationRecipients({
      actor: leader,
      input: { messageId: "message_send" },
      requestId: "request_recipients"
    });
    const byMember = Object.fromEntries(
      recipients.map((recipient) => [recipient.memberRef, recipient.sendStatus])
    );

    expect(byMember["member_yes"]).toBe("delivered");
    expect(byMember["member_no"]).toBe("suppressed");
    // No raw contact value is ever stored — only opaque channel refs.
    expect(recipients.every((recipient) => recipient.channelRef.startsWith("channel_"))).toBe(
      true
    );
  });

  it("rejects queueing when no recipient has granted consent for the channel", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { messageId: () => "message_no_consent" },
      seed: { members: [deniedMember] }
    });
    await draftSmsMessage(adapter);
    await adapter.commandService.markCommunicationReviewed({
      actor: leader,
      input: { messageId: "message_no_consent" },
      requestId: "request_review"
    });
    await adapter.commandService.confirmCommunicationSend({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Approved" },
        confirmedByRef: "leader_1",
        messageId: "message_no_consent"
      },
      requestId: "request_confirm"
    });

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Queue it" },
          messageId: "message_no_consent"
        },
        requestId: "request_queue_blocked"
      }),
      "CONSENT_REQUIRED"
    );
  });

  it("throws MESSAGE_NOT_FOUND when reviewing an unknown message", async () => {
    const adapter = createInMemoryCommunityServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.markCommunicationReviewed({
        actor: leader,
        input: { messageId: "message_missing" },
        requestId: "request_review_missing"
      }),
      "MESSAGE_NOT_FOUND"
    );
  });

  it("recomputes engagement summaries idempotently as PII-free rows", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      clock: () => timestamp,
      ids: { attendanceId: () => "attendance_x" },
      seed: { members: [consentedMember] }
    });
    await adapter.commandService.recordAttendance({
      actor: leader,
      input: { memberRef: "member_yes", occasionRef: "service_1", status: "present" },
      requestId: "request_present"
    });

    const window = {
      windowEnd: "2026-06-30T00:00:00.000Z",
      windowStart: "2026-06-01T00:00:00.000Z"
    };
    const first = await adapter.commandService.recomputeEngagementSummaries({
      actor: leader,
      input: window,
      requestId: "request_rollup_1"
    });
    const second = await adapter.commandService.recomputeEngagementSummaries({
      actor: leader,
      input: window,
      requestId: "request_rollup_2"
    });

    expect(first).toEqual(second);
    expect(adapter.readEngagementSummaries()).toHaveLength(first.length);
    expect(first[0]).toMatchObject({
      attendanceStreak: 1,
      scope: { kind: "member", memberRef: "member_yes" }
    });
    // The summary projection carries only refs + counts — no name or contact data.
    expect(JSON.stringify(first)).not.toContain("Granted Member");
    expect(JSON.stringify(first)).not.toContain("channel_");
  });
});
