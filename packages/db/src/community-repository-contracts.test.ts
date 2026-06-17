import { describe, expect, it } from "vitest";
import {
  AttendanceRecordPersistenceRecordSchema,
  CommunicationMessagePersistenceRecordSchema,
  CommunicationRecipientPersistenceRecordSchema,
  CommunityPersistenceWriteOptionsSchema,
  EngagementSummaryPersistenceRecordSchema,
  HouseholdPersistenceRecordSchema,
  MemberPersistenceRecordSchema,
  SetCommunicationMessageStatusPersistenceInputSchema
} from "./index.js";

const member = {
  contactChannelRefs: [
    { channelRef: "vault_channel_1", consentStatus: "granted", kind: "sms" },
    { channelRef: "vault_channel_2", consentStatus: "unknown", kind: "email" }
  ],
  createdAt: "2026-06-17T08:00:00.000Z",
  customFieldValues: [{ fieldRef: "field_1", value: "small group A" }],
  displayName: "Member One",
  householdRef: "household_1",
  memberId: "member_1",
  schemaVersion: "community.v1",
  segmentRefs: ["segment_1"],
  status: "active",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const memberAttendance = {
  attendanceId: "attendance_1",
  memberRef: "member_1",
  occasionRef: "occasion_1",
  recordedAt: "2026-06-17T08:00:00.000Z",
  recordedByRef: "actor_1",
  status: "present",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const headcountAttendance = {
  attendanceId: "attendance_2",
  headcount: 42,
  occasionRef: "occasion_1",
  recordedAt: "2026-06-17T08:00:00.000Z",
  recordedByRef: "actor_1",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const message = {
  audience: { groupId: "group_1", kind: "group" },
  bodyTemplate: "Hi {{firstName}}, see you Sunday.",
  channel: "email",
  confirmation: {
    confirmed: true,
    confirmedAt: "2026-06-17T08:05:00.000Z",
    confirmedByRef: "actor_1",
    reason: "Reviewed and approved by pastor."
  },
  createdAt: "2026-06-17T08:00:00.000Z",
  createdByRef: "actor_1",
  messageId: "message_1",
  origin: "human",
  schemaVersion: "community.v1",
  status: "confirmed",
  subject: "Sunday gathering",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:05:00.000Z"
} as const;

const recipient = {
  channelRef: "vault_channel_1",
  memberRef: "member_1",
  messageId: "message_1",
  recipientId: "recipient_1",
  sendStatus: "pending",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const engagementSummary = {
  attendanceStreak: 3,
  commsResponseCount: 1,
  computedAt: "2026-06-17T08:00:00.000Z",
  lastPresentOccasionRef: "occasion_1",
  scope: { kind: "member", memberRef: "member_1" },
  servingCount: 2,
  summaryId: "summary_1",
  tenantId: "tenant_1",
  windowEnd: "2026-06-17T08:00:00.000Z",
  windowStart: "2026-05-17T08:00:00.000Z"
} as const;

describe("Community persistence contracts", () => {
  it("accepts a valid member record", () => {
    expect(MemberPersistenceRecordSchema.parse(member)).toEqual(member);
  });

  it("rejects an unknown member field", () => {
    expect(() => MemberPersistenceRecordSchema.parse({ ...member, extra: true })).toThrow();
  });

  it("requires the community schema version", () => {
    expect(() =>
      MemberPersistenceRecordSchema.parse({ ...member, schemaVersion: "community.v2" })
    ).toThrow();
  });

  it("rejects raw PII columns on a member record", () => {
    for (const piiKey of ["phone", "email", "address", "homeAddress"]) {
      expect(() =>
        MemberPersistenceRecordSchema.parse({ ...member, [piiKey]: "raw-pii-value" })
      ).toThrow();
    }
  });

  it("rejects duplicate contact channel refs on a member", () => {
    expect(() =>
      MemberPersistenceRecordSchema.parse({
        ...member,
        contactChannelRefs: [
          { channelRef: "vault_dup", consentStatus: "granted", kind: "sms" },
          { channelRef: "vault_dup", consentStatus: "denied", kind: "email" }
        ]
      })
    ).toThrow("unique by channelRef");
  });

  it("rejects duplicate custom field refs on a member", () => {
    expect(() =>
      MemberPersistenceRecordSchema.parse({
        ...member,
        customFieldValues: [
          { fieldRef: "field_dup", value: "a" },
          { fieldRef: "field_dup", value: "b" }
        ]
      })
    ).toThrow("unique by fieldRef");
  });

  it("rejects a primary contact outside the household member set", () => {
    expect(() =>
      HouseholdPersistenceRecordSchema.parse({
        createdAt: "2026-06-17T08:00:00.000Z",
        householdRef: "household_1",
        label: "The Ones",
        memberRefs: ["member_1"],
        primaryContactMemberRef: "member_2",
        tenantId: "tenant_1",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow("must appear in memberRefs");
  });

  it("accepts a valid member attendance row", () => {
    expect(AttendanceRecordPersistenceRecordSchema.parse(memberAttendance)).toEqual(
      memberAttendance
    );
  });

  it("accepts a valid anonymous headcount row", () => {
    expect(AttendanceRecordPersistenceRecordSchema.parse(headcountAttendance)).toEqual(
      headcountAttendance
    );
  });

  it("rejects a member attendance row carrying a headcount", () => {
    expect(() =>
      AttendanceRecordPersistenceRecordSchema.parse({ ...memberAttendance, headcount: 5 })
    ).toThrow("must not carry a headcount");
  });

  it("rejects an anonymous attendance row without a headcount", () => {
    expect(() =>
      AttendanceRecordPersistenceRecordSchema.parse({
        attendanceId: "attendance_3",
        occasionRef: "occasion_1",
        recordedAt: "2026-06-17T08:00:00.000Z",
        recordedByRef: "actor_1",
        tenantId: "tenant_1",
        updatedAt: "2026-06-17T08:00:00.000Z"
      })
    ).toThrow("requires a headcount");
  });

  it("accepts a confirmed email message", () => {
    expect(CommunicationMessagePersistenceRecordSchema.parse(message)).toEqual(message);
  });

  it("rejects a subject on a non-email message", () => {
    expect(() =>
      CommunicationMessagePersistenceRecordSchema.parse({
        ...message,
        channel: "sms",
        subject: "nope"
      })
    ).toThrow("only on email messages");
  });

  it("rejects advancing past review without a confirmation", () => {
    expect(() =>
      CommunicationMessagePersistenceRecordSchema.parse({
        audience: { groupId: "group_1", kind: "group" },
        bodyTemplate: "Hi {{firstName}}, see you Sunday.",
        channel: "email",
        createdAt: "2026-06-17T08:00:00.000Z",
        createdByRef: "actor_1",
        messageId: "message_1",
        origin: "human",
        schemaVersion: "community.v1",
        status: "confirmed",
        subject: "Sunday gathering",
        tenantId: "tenant_1",
        updatedAt: "2026-06-17T08:05:00.000Z"
      })
    ).toThrow("only with a recorded confirmation");
  });

  it("rejects a status transition to queued without a confirmation", () => {
    expect(() =>
      SetCommunicationMessageStatusPersistenceInputSchema.parse({
        messageId: "message_1",
        status: "queued",
        updatedAt: "2026-06-17T08:05:00.000Z"
      })
    ).toThrow("only with a recorded confirmation");
  });

  it("rejects a failure reason when the recipient did not fail", () => {
    expect(() =>
      CommunicationRecipientPersistenceRecordSchema.parse({
        ...recipient,
        failureReason: "redacted"
      })
    ).toThrow("only when sendStatus is failed");
  });

  it("accepts a PII-free engagement summary", () => {
    expect(EngagementSummaryPersistenceRecordSchema.parse(engagementSummary)).toEqual(
      engagementSummary
    );
  });

  it("rejects raw PII columns on an engagement summary", () => {
    for (const piiKey of ["displayName", "phone", "email", "name"]) {
      expect(() =>
        EngagementSummaryPersistenceRecordSchema.parse({
          ...engagementSummary,
          [piiKey]: "raw-pii-value"
        })
      ).toThrow();
    }
  });

  it("rejects an engagement window that ends before it starts", () => {
    expect(() =>
      EngagementSummaryPersistenceRecordSchema.parse({
        ...engagementSummary,
        windowEnd: "2026-04-17T08:00:00.000Z"
      })
    ).toThrow("greater than or equal to windowStart");
  });

  it("requires an actor on write options", () => {
    expect(() =>
      CommunityPersistenceWriteOptionsSchema.parse({
        context: { requestId: "request_1", tenantId: "tenant_1" },
        intent: "update"
      })
    ).toThrow("require an actor");
  });
});
