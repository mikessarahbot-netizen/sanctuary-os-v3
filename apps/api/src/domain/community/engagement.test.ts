import { describe, expect, it } from "vitest";
import { rollupEngagement, type EngagementWindow } from "./engagement.js";
import {
  parseAttendanceRecord,
  parseCommunicationRecipient,
  parseGroupMembership,
  type AttendanceRecord,
  type CommunicationRecipient,
  type CommunityTenantId,
  type GroupMembership
} from "./schemas.js";

const TENANT = "tenant-1" as CommunityTenantId;
const WINDOW: EngagementWindow = {
  windowEnd: "2026-06-30T00:00:00.000Z",
  windowStart: "2026-06-01T00:00:00.000Z"
};
const COMPUTED_AT = "2026-06-30T12:00:00.000Z";

const attendance = (
  memberRef: string,
  occasionRef: string,
  status: "present" | "absent" | "excused",
  recordedAt: string
): AttendanceRecord =>
  parseAttendanceRecord({
    attendanceId: `att-${memberRef}-${occasionRef}`,
    memberRef,
    occasionRef,
    recordedAt,
    recordedByRef: "actor-1",
    status,
    tenantId: "tenant-1",
    updatedAt: recordedAt
  });

const headcount = (occasionRef: string, count: number): AttendanceRecord =>
  parseAttendanceRecord({
    attendanceId: `head-${occasionRef}`,
    headcount: count,
    occasionRef,
    recordedAt: "2026-06-10T10:00:00.000Z",
    recordedByRef: "actor-1",
    tenantId: "tenant-1",
    updatedAt: "2026-06-10T10:00:00.000Z"
  });

const membership = (memberRef: string, groupId: string, active: boolean): GroupMembership =>
  parseGroupMembership({
    active,
    groupId,
    joinedAt: "2026-05-01T00:00:00.000Z",
    memberRef,
    membershipId: `mem-${memberRef}-${groupId}`,
    roleInGroup: "member",
    tenantId: "tenant-1",
    updatedAt: "2026-05-01T00:00:00.000Z"
  });

const delivered = (memberRef: string, updatedAt: string): CommunicationRecipient =>
  parseCommunicationRecipient({
    channelRef: `vault-${memberRef}`,
    memberRef,
    messageId: "message-1",
    recipientId: `rcpt-${memberRef}-${updatedAt}`,
    sendStatus: "delivered",
    tenantId: "tenant-1",
    updatedAt
  });

describe("rollupEngagement", () => {
  it("computes a present streak counting back to the first non-present", () => {
    const rows = [
      attendance("member-a", "svc-1", "present", "2026-06-05T10:00:00.000Z"),
      attendance("member-a", "svc-2", "absent", "2026-06-12T10:00:00.000Z"),
      attendance("member-a", "svc-3", "present", "2026-06-19T10:00:00.000Z"),
      attendance("member-a", "svc-4", "present", "2026-06-26T10:00:00.000Z")
    ];

    const [summary] = rollupEngagement(TENANT, rows, [], [], WINDOW, COMPUTED_AT);

    expect(summary?.attendanceStreak).toBe(2);
    expect(summary?.lastPresentOccasionRef).toBe("svc-4");
  });

  it("omits lastPresentOccasionRef when the member was never present in window", () => {
    const rows = [
      attendance("member-a", "svc-1", "absent", "2026-06-05T10:00:00.000Z")
    ];

    const [summary] = rollupEngagement(TENANT, rows, [], [], WINDOW, COMPUTED_AT);

    expect(summary?.attendanceStreak).toBe(0);
    expect(summary?.lastPresentOccasionRef).toBeUndefined();
  });

  it("ignores attendance rows outside the window", () => {
    const rows = [
      attendance("member-a", "svc-old", "present", "2026-05-01T10:00:00.000Z"),
      attendance("member-a", "svc-in", "present", "2026-06-15T10:00:00.000Z")
    ];

    const [summary] = rollupEngagement(TENANT, rows, [], [], WINDOW, COMPUTED_AT);

    expect(summary?.attendanceStreak).toBe(1);
    expect(summary?.lastPresentOccasionRef).toBe("svc-in");
  });

  it("ignores anonymous headcount rows for member rollups", () => {
    const summaries = rollupEngagement(
      TENANT,
      [headcount("svc-1", 50)],
      [],
      [],
      WINDOW,
      COMPUTED_AT
    );

    expect(summaries).toEqual([]);
  });

  it("counts active memberships as servingCount", () => {
    const summaries = rollupEngagement(
      TENANT,
      [],
      [
        membership("member-a", "group-1", true),
        membership("member-a", "group-2", true),
        membership("member-a", "group-3", false)
      ],
      [],
      WINDOW,
      COMPUTED_AT
    );

    expect(summaries[0]?.servingCount).toBe(2);
  });

  it("counts delivered recipients in window as commsResponseCount", () => {
    const summaries = rollupEngagement(
      TENANT,
      [],
      [],
      [
        delivered("member-a", "2026-06-10T10:00:00.000Z"),
        delivered("member-a", "2026-06-20T10:00:00.000Z"),
        delivered("member-a", "2026-07-10T10:00:00.000Z")
      ],
      WINDOW,
      COMPUTED_AT
    );

    expect(summaries[0]?.commsResponseCount).toBe(2);
  });

  it("emits summaries ordered by memberRef", () => {
    const summaries = rollupEngagement(
      TENANT,
      [
        attendance("member-c", "svc-1", "present", "2026-06-05T10:00:00.000Z"),
        attendance("member-a", "svc-1", "present", "2026-06-05T10:00:00.000Z"),
        attendance("member-b", "svc-1", "present", "2026-06-05T10:00:00.000Z")
      ],
      [],
      [],
      WINDOW,
      COMPUTED_AT
    );

    expect(
      summaries.map((summary) =>
        summary.scope.kind === "member" ? summary.scope.memberRef : undefined
      )
    ).toEqual(["member-a", "member-b", "member-c"]);
  });

  it("is deterministic regardless of input order", () => {
    const ordered = [
      attendance("member-a", "svc-1", "present", "2026-06-05T10:00:00.000Z"),
      attendance("member-a", "svc-2", "present", "2026-06-12T10:00:00.000Z")
    ];
    const shuffled = [...ordered].reverse();

    expect(
      rollupEngagement(TENANT, ordered, [], [], WINDOW, COMPUTED_AT)
    ).toEqual(rollupEngagement(TENANT, shuffled, [], [], WINDOW, COMPUTED_AT));
  });

  // PII-free-by-construction: whatever the inputs, the rollup output can only
  // be refs + counts + timestamps. Assert no PII-shaped key appears.
  it("produces output that carries no name/contact/free-text key", () => {
    const summaries = rollupEngagement(
      TENANT,
      [attendance("member-a", "svc-1", "present", "2026-06-05T10:00:00.000Z")],
      [membership("member-a", "group-1", true)],
      [delivered("member-a", "2026-06-10T10:00:00.000Z")],
      WINDOW,
      COMPUTED_AT
    );

    const forbiddenKeys = new Set([
      "displayName",
      "name",
      "phone",
      "email",
      "address",
      "notes"
    ]);

    for (const summary of summaries) {
      for (const key of Object.keys(summary)) {
        expect(forbiddenKeys.has(key)).toBe(false);
      }
    }
  });
});
