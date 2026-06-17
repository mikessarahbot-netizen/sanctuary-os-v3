import { describe, expect, it } from "vitest";
import {
  AttendanceRecordSchema,
  CommunicationMessageSchema,
  CommunicationRecipientSchema,
  CommunityGroupSchema,
  EngagementSummarySchema,
  GroupMembershipSchema,
  HouseholdSchema,
  MemberSchema,
  parseAttendanceRecord,
  parseEngagementSummary,
  parseMember
} from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";
const ISO_LATER = "2026-06-17T11:00:00.000Z";

const baseMember = {
  contactChannelRefs: [
    { channelRef: "vault-sms-1", consentStatus: "granted", kind: "sms" },
    { channelRef: "vault-email-1", consentStatus: "denied", kind: "email" }
  ],
  createdAt: ISO,
  customFieldValues: [{ fieldRef: "field-baptism", value: "2019" }],
  displayName: "Jordan Rivers",
  memberId: "member-1",
  segmentRefs: ["segment-young-adults"],
  status: "active",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseHousehold = {
  createdAt: ISO,
  householdRef: "household-1",
  label: "The Rivers Family",
  memberRefs: ["member-1", "member-2"],
  primaryContactMemberRef: "member-1",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseGroup = {
  archived: false,
  createdAt: ISO,
  groupId: "group-1",
  kind: "small-group",
  label: "Tuesday Small Group",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseMembership = {
  active: true,
  groupId: "group-1",
  joinedAt: ISO,
  memberRef: "member-1",
  membershipId: "membership-1",
  roleInGroup: "member",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseMemberAttendance = {
  attendanceId: "attendance-1",
  memberRef: "member-1",
  occasionRef: "service-2026-06-15",
  recordedAt: ISO,
  recordedByRef: "actor-1",
  status: "present",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseHeadcountAttendance = {
  attendanceId: "attendance-2",
  headcount: 42,
  occasionRef: "service-2026-06-15",
  recordedAt: ISO,
  recordedByRef: "actor-1",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseMessage = {
  audience: { groupId: "group-1", kind: "group" },
  bodyTemplate: "Hi {{firstName}}, see you Sunday.",
  channel: "sms",
  createdAt: ISO,
  createdByRef: "actor-1",
  messageId: "message-1",
  origin: "human",
  status: "draft",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseRecipient = {
  channelRef: "vault-sms-1",
  memberRef: "member-1",
  messageId: "message-1",
  recipientId: "recipient-1",
  sendStatus: "pending",
  tenantId: "tenant-1",
  updatedAt: ISO
} as const;

const baseSummary = {
  attendanceStreak: 3,
  commsResponseCount: 1,
  computedAt: ISO,
  scope: { kind: "member", memberRef: "member-1" },
  servingCount: 2,
  summaryId: "summary-1",
  tenantId: "tenant-1",
  windowEnd: ISO_LATER,
  windowStart: ISO
} as const;

describe("MemberSchema", () => {
  it("accepts a valid tenant-scoped member with opaque contact refs", () => {
    expect(() => parseMember(baseMember)).not.toThrow();
  });

  it("rejects an empty displayName", () => {
    expect(MemberSchema.safeParse({ ...baseMember, displayName: "" }).success).toBe(
      false
    );
  });

  it("rejects duplicate contact channel refs", () => {
    const result = MemberSchema.safeParse({
      ...baseMember,
      contactChannelRefs: [
        { channelRef: "dupe", consentStatus: "granted", kind: "sms" },
        { channelRef: "dupe", consentStatus: "unknown", kind: "email" }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate custom field refs", () => {
    const result = MemberSchema.safeParse({
      ...baseMember,
      customFieldValues: [
        { fieldRef: "dupe", value: "a" },
        { fieldRef: "dupe", value: "b" }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects a status outside the enum", () => {
    expect(MemberSchema.safeParse({ ...baseMember, status: "member" }).success).toBe(
      false
    );
  });

  it("rejects a raw phone value as an unknown key (strict, no PII)", () => {
    expect(
      MemberSchema.safeParse({ ...baseMember, phone: "+15555550123" }).success
    ).toBe(false);
  });

  it("rejects a raw email value as an unknown key (strict, no PII)", () => {
    expect(
      MemberSchema.safeParse({ ...baseMember, email: "jordan@example.com" }).success
    ).toBe(false);
  });

  it("rejects a raw address value as an unknown key (strict, no PII)", () => {
    expect(
      MemberSchema.safeParse({ ...baseMember, address: "1 Main St" }).success
    ).toBe(false);
  });

  it("rejects a contact-channel ref that smuggles a raw value field", () => {
    const result = MemberSchema.safeParse({
      ...baseMember,
      contactChannelRefs: [
        {
          channelRef: "vault-sms-1",
          consentStatus: "granted",
          kind: "sms",
          value: "+15555550123"
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});

describe("HouseholdSchema", () => {
  it("accepts a valid household", () => {
    expect(HouseholdSchema.safeParse(baseHousehold).success).toBe(true);
  });

  it("rejects duplicate memberRefs", () => {
    expect(
      HouseholdSchema.safeParse({
        ...baseHousehold,
        memberRefs: ["member-1", "member-1"]
      }).success
    ).toBe(false);
  });

  it("rejects a primaryContactMemberRef absent from memberRefs", () => {
    expect(
      HouseholdSchema.safeParse({
        ...baseHousehold,
        primaryContactMemberRef: "member-99"
      }).success
    ).toBe(false);
  });

  it("accepts a household with no primary contact", () => {
    const withoutPrimary = {
      createdAt: ISO,
      householdRef: "household-1",
      label: "The Rivers Family",
      memberRefs: ["member-1", "member-2"],
      tenantId: "tenant-1",
      updatedAt: ISO
    };

    expect(HouseholdSchema.safeParse(withoutPrimary).success).toBe(true);
  });

  it("rejects an empty label", () => {
    expect(HouseholdSchema.safeParse({ ...baseHousehold, label: "" }).success).toBe(
      false
    );
  });
});

describe("CommunityGroupSchema", () => {
  it("accepts a valid group", () => {
    expect(CommunityGroupSchema.safeParse(baseGroup).success).toBe(true);
  });

  it("rejects a kind outside the enum", () => {
    expect(
      CommunityGroupSchema.safeParse({ ...baseGroup, kind: "committee" }).success
    ).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(CommunityGroupSchema.safeParse({ ...baseGroup, label: "" }).success).toBe(
      false
    );
  });
});

describe("GroupMembershipSchema", () => {
  it("accepts a valid membership", () => {
    expect(GroupMembershipSchema.safeParse(baseMembership).success).toBe(true);
  });

  it("rejects a roleInGroup outside the enum", () => {
    expect(
      GroupMembershipSchema.safeParse({ ...baseMembership, roleInGroup: "owner" })
        .success
    ).toBe(false);
  });
});

describe("AttendanceRecordSchema", () => {
  it("accepts a valid member attendance row", () => {
    expect(() => parseAttendanceRecord(baseMemberAttendance)).not.toThrow();
  });

  it("accepts a valid anonymous headcount row", () => {
    expect(() => parseAttendanceRecord(baseHeadcountAttendance)).not.toThrow();
  });

  it("rejects a member row without a status (xor invariant)", () => {
    const withoutStatus = {
      attendanceId: "attendance-1",
      memberRef: "member-1",
      occasionRef: "service-2026-06-15",
      recordedAt: ISO,
      recordedByRef: "actor-1",
      tenantId: "tenant-1",
      updatedAt: ISO
    };

    expect(AttendanceRecordSchema.safeParse(withoutStatus).success).toBe(false);
  });

  it("rejects a member row that also carries a headcount (xor invariant)", () => {
    expect(
      AttendanceRecordSchema.safeParse({
        ...baseMemberAttendance,
        headcount: 5
      }).success
    ).toBe(false);
  });

  it("rejects an anonymous row that also carries a per-member status", () => {
    expect(
      AttendanceRecordSchema.safeParse({
        ...baseHeadcountAttendance,
        status: "present"
      }).success
    ).toBe(false);
  });

  it("rejects an anonymous row without a headcount", () => {
    const withoutHeadcount = {
      attendanceId: "attendance-2",
      occasionRef: "service-2026-06-15",
      recordedAt: ISO,
      recordedByRef: "actor-1",
      tenantId: "tenant-1",
      updatedAt: ISO
    };

    expect(AttendanceRecordSchema.safeParse(withoutHeadcount).success).toBe(false);
  });

  it("rejects a non-positive headcount", () => {
    expect(
      AttendanceRecordSchema.safeParse({
        ...baseHeadcountAttendance,
        headcount: 0
      }).success
    ).toBe(false);
  });
});

describe("CommunicationMessageSchema", () => {
  it("accepts a valid draft message", () => {
    expect(CommunicationMessageSchema.safeParse(baseMessage).success).toBe(true);
  });

  it("accepts an email message with a subject", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        channel: "email",
        subject: "This Sunday"
      }).success
    ).toBe(true);
  });

  it("rejects a non-email message that carries a subject", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        channel: "sms",
        subject: "Nope"
      }).success
    ).toBe(false);
  });

  it("rejects a confirmed message with no confirmation recorded", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        status: "confirmed"
      }).success
    ).toBe(false);
  });

  it("accepts a confirmed message that carries a confirmation", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        confirmation: {
          confirmed: true,
          confirmedAt: ISO,
          confirmedByRef: "actor-1",
          reason: "Reviewed and approved"
        },
        status: "confirmed"
      }).success
    ).toBe(true);
  });

  it("rejects a confirmation with confirmed != true", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        confirmation: {
          confirmed: false,
          confirmedAt: ISO,
          confirmedByRef: "actor-1",
          reason: "x"
        },
        status: "confirmed"
      }).success
    ).toBe(false);
  });

  it("rejects an audience descriptor with an unknown kind", () => {
    expect(
      CommunicationMessageSchema.safeParse({
        ...baseMessage,
        audience: { kind: "everyone" }
      }).success
    ).toBe(false);
  });
});

describe("CommunicationRecipientSchema", () => {
  it("accepts a valid recipient referencing an opaque channel only", () => {
    expect(CommunicationRecipientSchema.safeParse(baseRecipient).success).toBe(true);
  });

  it("rejects a failureReason when sendStatus is not failed", () => {
    expect(
      CommunicationRecipientSchema.safeParse({
        ...baseRecipient,
        failureReason: "carrier rejected"
      }).success
    ).toBe(false);
  });

  it("accepts a failureReason when sendStatus is failed", () => {
    expect(
      CommunicationRecipientSchema.safeParse({
        ...baseRecipient,
        failureReason: "carrier rejected",
        sendStatus: "failed"
      }).success
    ).toBe(true);
  });

  it("rejects a raw contact value field (strict, no PII)", () => {
    expect(
      CommunicationRecipientSchema.safeParse({
        ...baseRecipient,
        phone: "+15555550123"
      }).success
    ).toBe(false);
  });
});

describe("EngagementSummarySchema (AI-projectable, PII-free by construction)", () => {
  it("accepts a valid member-scope summary", () => {
    expect(() => parseEngagementSummary(baseSummary)).not.toThrow();
  });

  it("accepts a valid segment-scope summary", () => {
    expect(
      EngagementSummarySchema.safeParse({
        ...baseSummary,
        scope: { kind: "segment", segmentRef: "segment-young-adults" }
      }).success
    ).toBe(true);
  });

  it("rejects a negative count", () => {
    expect(
      EngagementSummarySchema.safeParse({ ...baseSummary, attendanceStreak: -1 })
        .success
    ).toBe(false);
    expect(
      EngagementSummarySchema.safeParse({ ...baseSummary, servingCount: -1 }).success
    ).toBe(false);
    expect(
      EngagementSummarySchema.safeParse({ ...baseSummary, commsResponseCount: -1 })
        .success
    ).toBe(false);
  });

  it("rejects a window whose end precedes its start", () => {
    expect(
      EngagementSummarySchema.safeParse({
        ...baseSummary,
        windowEnd: ISO,
        windowStart: ISO_LATER
      }).success
    ).toBe(false);
  });

  // The structural PII guarantee: the summary projection that may reach AI must
  // not be able to carry a name, contact value, address, or any free-text. With
  // `.strict()`, every such key is rejected at parse time.
  it.each([
    "displayName",
    "name",
    "phone",
    "email",
    "address",
    "homeAddress",
    "notes",
    "prayerNotes",
    "givingTotal"
  ])("rejects the PII/free-text key %s (strict)", (piiKey) => {
    expect(
      EngagementSummarySchema.safeParse({ ...baseSummary, [piiKey]: "leak" }).success
    ).toBe(false);
  });

  it("admits only refs/counts/timestamps in its parsed shape", () => {
    const parsed = parseEngagementSummary(baseSummary);
    const allowedKeys = new Set([
      "attendanceStreak",
      "commsResponseCount",
      "computedAt",
      "lastPresentOccasionRef",
      "scope",
      "servingCount",
      "summaryId",
      "tenantId",
      "windowEnd",
      "windowStart"
    ]);

    for (const key of Object.keys(parsed)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});
