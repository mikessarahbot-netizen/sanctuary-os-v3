import { describe, expect, it } from "vitest";
import {
  CommunityInitialSchemaMigration,
  createCommunityCommandSqlRepository,
  createCommunityQuerySqlRepository,
  createSqliteExecutor,
  type AttendanceRecordPersistenceRecord,
  type CommunicationMessagePersistenceRecord,
  type CommunicationRecipientPersistenceRecord,
  type CommunityGroupPersistenceRecord,
  type CommunitySqlExecutor,
  type EngagementSummaryPersistenceRecord,
  type GroupMembershipPersistenceRecord,
  type HouseholdPersistenceRecord,
  type MemberPersistenceRecord,
  type PlanningSqlRow
} from "./index.js";

const TENANT = "tenant_1";

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId: TENANT }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId: TENANT },
  intent: "update"
} as const;

const memberRecord: MemberPersistenceRecord = {
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
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const householdRecord: HouseholdPersistenceRecord = {
  createdAt: "2026-06-17T08:00:00.000Z",
  householdRef: "household_1",
  label: "The Ones",
  memberRefs: ["member_1"],
  primaryContactMemberRef: "member_1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const groupRecord: CommunityGroupPersistenceRecord = {
  archived: false,
  createdAt: "2026-06-17T08:00:00.000Z",
  groupId: "group_1",
  kind: "small-group",
  label: "Tuesday Group",
  leaderMemberRef: "member_1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const membershipRecord: GroupMembershipPersistenceRecord = {
  active: true,
  groupId: "group_1",
  joinedAt: "2026-06-17T08:00:00.000Z",
  memberRef: "member_1",
  membershipId: "membership_1",
  roleInGroup: "leader",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const memberAttendanceRecord: AttendanceRecordPersistenceRecord = {
  attendanceId: "attendance_1",
  memberRef: "member_1",
  occasionRef: "occasion_1",
  recordedAt: "2026-06-17T08:00:00.000Z",
  recordedByRef: "actor_1",
  status: "present",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const headcountAttendanceRecord: AttendanceRecordPersistenceRecord = {
  attendanceId: "attendance_2",
  headcount: 42,
  occasionRef: "occasion_1",
  recordedAt: "2026-06-17T08:00:00.000Z",
  recordedByRef: "actor_1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const draftMessageRecord: CommunicationMessagePersistenceRecord = {
  audience: { groupId: "group_1", kind: "group" },
  bodyTemplate: "Hi {{firstName}}, see you Sunday.",
  channel: "email",
  createdAt: "2026-06-17T08:00:00.000Z",
  createdByRef: "actor_1",
  messageId: "message_1",
  origin: "human",
  status: "draft",
  subject: "Sunday gathering",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const confirmedMessageRecord: CommunicationMessagePersistenceRecord = {
  ...draftMessageRecord,
  confirmation: {
    confirmed: true,
    confirmedAt: "2026-06-17T08:05:00.000Z",
    confirmedByRef: "actor_1",
    reason: "Reviewed and approved by pastor."
  },
  status: "confirmed",
  updatedAt: "2026-06-17T08:05:00.000Z"
};

const recipientRecord: CommunicationRecipientPersistenceRecord = {
  channelRef: "vault_channel_1",
  memberRef: "member_1",
  messageId: "message_1",
  recipientId: "recipient_1",
  sendStatus: "pending",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const engagementSummaryRecord: EngagementSummaryPersistenceRecord = {
  attendanceStreak: 3,
  commsResponseCount: 1,
  computedAt: "2026-06-17T08:00:00.000Z",
  lastPresentOccasionRef: "occasion_1",
  scope: { kind: "member", memberRef: "member_1" },
  servingCount: 2,
  summaryId: "summary_1",
  tenantId: TENANT,
  windowEnd: "2026-06-17T08:00:00.000Z",
  windowStart: "2026-05-17T08:00:00.000Z"
};

const memberRow: PlanningSqlRow = {
  contact_channel_refs_json: JSON.stringify(memberRecord.contactChannelRefs),
  created_at: "2026-06-17T08:00:00.000Z",
  custom_field_values_json: JSON.stringify(memberRecord.customFieldValues),
  display_name: "Member One",
  household_ref: "household_1",
  member_id: "member_1",
  schema_version: "community.v1",
  segment_refs_json: JSON.stringify(memberRecord.segmentRefs),
  status: "active",
  tenant_id: TENANT,
  updated_at: "2026-06-17T08:00:00.000Z"
};

const confirmedMessageRow: PlanningSqlRow = {
  audience_json: JSON.stringify(confirmedMessageRecord.audience),
  body_template: confirmedMessageRecord.bodyTemplate,
  channel: "email",
  confirmation_reason: "Reviewed and approved by pastor.",
  confirmed: 1,
  confirmed_at: "2026-06-17T08:05:00.000Z",
  confirmed_by_ref: "actor_1",
  created_at: "2026-06-17T08:00:00.000Z",
  created_by_ref: "actor_1",
  message_id: "message_1",
  origin: "human",
  status: "confirmed",
  subject: "Sunday gathering",
  tenant_id: TENANT,
  updated_at: "2026-06-17T08:05:00.000Z"
};

const engagementSummaryRow: PlanningSqlRow = {
  attendance_streak: 3,
  comms_response_count: 1,
  computed_at: "2026-06-17T08:00:00.000Z",
  last_present_occasion_ref: "occasion_1",
  member_ref: "member_1",
  scope_kind: "member",
  segment_ref: null,
  serving_count: 2,
  summary_id: "summary_1",
  tenant_id: TENANT,
  window_end: "2026-06-17T08:00:00.000Z",
  window_start: "2026-05-17T08:00:00.000Z"
};

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): { readonly executor: CommunitySqlExecutor; readonly statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const executor: CommunitySqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });

      return Promise.resolve({ rows: rowsByName[statement.name] ?? [] });
    }
  };

  return { executor, statements };
};

describe("Community SQL repository (recording executor)", () => {
  it("scopes getMember by tenant and decodes every JSON column to validated arrays", async () => {
    const { executor, statements } = createRecordingExecutor({
      "community.members.get": [memberRow]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const member = await repository.getMember({
      input: { memberId: "member_1" },
      options: readOptions
    });

    expect(member?.memberId).toBe("member_1");
    expect(member?.tenantId).toBe(TENANT);
    expect(member?.householdRef).toBe("household_1");
    expect(member?.contactChannelRefs).toEqual(memberRecord.contactChannelRefs);
    expect(member?.customFieldValues).toEqual(memberRecord.customFieldValues);
    expect(member?.segmentRefs).toEqual(["segment_1"]);
    const [statement] = statements;
    expect(statement?.sql).toContain("WHERE tenant_id = ? AND member_id = ?");
    expect(statement?.parameters).toEqual([TENANT, "member_1"]);
  });

  it("returns null when getMember matches no row", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createCommunityQuerySqlRepository({ executor });

    expect(
      await repository.getMember({ input: { memberId: "missing" }, options: readOptions })
    ).toBeNull();
  });

  it("passes household and status filters to listMembers, repeating each for the null guard", async () => {
    const { executor, statements } = createRecordingExecutor({
      "community.members.list": [memberRow]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const members = await repository.listMembers({
      input: { filter: { householdRef: "household_1", status: "active" } },
      options: readOptions
    });

    expect(members).toHaveLength(1);
    expect(statements[0]?.parameters).toEqual([
      TENANT,
      "household_1",
      "household_1",
      "active",
      "active"
    ]);
  });

  it("lists every tenant member when unfiltered", async () => {
    const { executor, statements } = createRecordingExecutor({ "community.members.list": [] });
    const repository = createCommunityQuerySqlRepository({ executor });

    await repository.listMembers({ input: {}, options: readOptions });

    expect(statements[0]?.parameters).toEqual([TENANT, null, null, null, null]);
  });

  it("lists every tenant attendance row when listAttendanceRecordsForTenant is unfiltered", async () => {
    const { executor, statements } = createRecordingExecutor({
      "community.attendance.list_for_tenant": [
        {
          attendance_id: "attendance_1",
          headcount: null,
          member_ref: "member_1",
          occasion_ref: "occasion_1",
          recorded_at: "2026-06-17T08:00:00.000Z",
          recorded_by_ref: "actor_1",
          status: "present",
          tenant_id: TENANT,
          updated_at: "2026-06-17T08:00:00.000Z"
        },
        {
          attendance_id: "attendance_2",
          headcount: 42,
          member_ref: null,
          occasion_ref: "occasion_2",
          recorded_at: "2026-06-17T08:00:00.000Z",
          recorded_by_ref: "actor_1",
          status: null,
          tenant_id: TENANT,
          updated_at: "2026-06-17T08:00:00.000Z"
        }
      ]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const records = await repository.listAttendanceRecordsForTenant({
      input: {},
      options: readOptions
    });

    expect(records).toHaveLength(2);
    expect(records[0]?.memberRef).toBe("member_1");
    expect(records[0]?.status).toBe("present");
    expect(records[1]?.headcount).toBe(42);
    expect(records[1]?.memberRef).toBeUndefined();
    const [statement] = statements;
    expect(statement?.name).toBe("community.attendance.list_for_tenant");
    expect(statement?.sql).toContain("WHERE tenant_id = ?");
    expect(statement?.sql).toContain("(? IS NULL OR occasion_ref = ?)");
    expect(statement?.sql).toContain("(? IS NULL OR member_ref = ?)");
    // tenant, then the occasion + member filters each repeated for the null guard.
    expect(statement?.parameters).toEqual([TENANT, null, null, null, null]);
  });

  it("passes the optional occasion and member filters to listAttendanceRecordsForTenant", async () => {
    const { executor, statements } = createRecordingExecutor({
      "community.attendance.list_for_tenant": []
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    await repository.listAttendanceRecordsForTenant({
      input: { memberRef: "member_1", occasionRef: "occasion_1" },
      options: readOptions
    });

    // tenant_id, occasion_ref (x2 for the null guard), member_ref (x2).
    expect(statements[0]?.parameters).toEqual([
      TENANT,
      "occasion_1",
      "occasion_1",
      "member_1",
      "member_1"
    ]);
  });

  it("maps a confirmed message row, decoding the audience JSON and rebuilding confirmation", async () => {
    const { executor } = createRecordingExecutor({
      "community.messages.get": [confirmedMessageRow]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const message = await repository.getCommunicationMessage({
      input: { messageId: "message_1" },
      options: readOptions
    });

    expect(message?.status).toBe("confirmed");
    expect(message?.audience).toEqual({ groupId: "group_1", kind: "group" });
    expect(message?.confirmation).toEqual(confirmedMessageRecord.confirmation);
    expect(message?.subject).toBe("Sunday gathering");
  });

  it("leaves confirmation undefined when the message row is unconfirmed", async () => {
    const draftRow: PlanningSqlRow = {
      ...confirmedMessageRow,
      confirmation_reason: null,
      confirmed: 0,
      confirmed_at: null,
      confirmed_by_ref: null,
      status: "draft",
      updated_at: "2026-06-17T08:00:00.000Z"
    };
    const { executor } = createRecordingExecutor({
      "community.messages.get": [draftRow]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const message = await repository.getCommunicationMessage({
      input: { messageId: "message_1" },
      options: readOptions
    });

    expect(message?.status).toBe("draft");
    expect(message?.confirmation).toBeUndefined();
  });

  it("maps an engagement summary row into its discriminated member scope", async () => {
    const { executor } = createRecordingExecutor({
      "community.engagement.get": [engagementSummaryRow]
    });
    const repository = createCommunityQuerySqlRepository({ executor });

    const summary = await repository.getEngagementSummary({
      input: { summaryId: "summary_1" },
      options: readOptions
    });

    expect(summary?.scope).toEqual({ kind: "member", memberRef: "member_1" });
    expect(summary?.attendanceStreak).toBe(3);
    expect(summary?.lastPresentOccasionRef).toBe("occasion_1");
  });

  it("upserts a member with tenant-scoped parameters and serialized JSON columns", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({
      clock: () => "2026-06-17T09:00:00.000Z",
      executor
    });

    const saved = await repository.saveMember({ input: memberRecord, options: writeOptions });

    expect(saved).toEqual(memberRecord);
    const [statement] = statements;
    expect(statement?.name).toBe("community.members.upsert");
    expect(statement?.sql).toContain("ON CONFLICT (tenant_id, member_id) DO UPDATE");
    expect(statement?.parameters[0]).toBe(TENANT);
    // segment_refs_json, custom_field_values_json, contact_channel_refs_json
    expect(statement?.parameters[5]).toBe(JSON.stringify(memberRecord.segmentRefs));
    expect(statement?.parameters[6]).toBe(JSON.stringify(memberRecord.customFieldValues));
    expect(statement?.parameters[7]).toBe(JSON.stringify(memberRecord.contactChannelRefs));
  });

  it("never serializes a raw contact value into the member upsert parameters", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveMember({ input: memberRecord, options: writeOptions });

    const serialized = JSON.stringify(statements[0]?.parameters);
    // Only opaque channel refs + consent are persisted; no phone/email/address value.
    expect(serialized).toContain("vault_channel_1");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/\d{3}-\d{3,4}/u);
  });

  it("rejects a member whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.saveMember({
        input: { ...memberRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("rejects a communication message whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.saveCommunicationMessage({
        input: { ...confirmedMessageRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("encodes the group archived flag as 0/1 when saving a community group", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveCommunityGroup({
      input: { ...groupRecord, archived: true },
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.name).toBe("community.groups.upsert");
    // tenant_id, group_id, kind, label, leader_member_ref, archived
    expect(statement?.parameters[5]).toBe(1);
  });

  it("serializes the audience and confirmation columns when saving a message", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveCommunicationMessage({
      input: confirmedMessageRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.name).toBe("community.messages.upsert");
    // audience_json at index 5, confirmed flag at index 8
    expect(statement?.parameters[5]).toBe(JSON.stringify(confirmedMessageRecord.audience));
    expect(statement?.parameters[8]).toBe(1);
    expect(statement?.parameters[9]).toBe("actor_1");
    expect(statement?.parameters[10]).toBe("Reviewed and approved by pastor.");
  });

  it("writes a draft message with confirmed=0 and null confirmation columns", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveCommunicationMessage({
      input: draftMessageRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.parameters[8]).toBe(0);
    expect(statement?.parameters[9]).toBeNull();
    expect(statement?.parameters[10]).toBeNull();
    expect(statement?.parameters[11]).toBeNull();
  });

  it("decomposes a member-scoped engagement summary into scope columns", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.upsertEngagementSummary({
      input: engagementSummaryRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.name).toBe("community.engagement.upsert");
    // tenant_id, summary_id, scope_kind, member_ref, segment_ref
    expect(statement?.parameters[2]).toBe("member");
    expect(statement?.parameters[3]).toBe("member_1");
    expect(statement?.parameters[4]).toBeNull();
  });

  it("advances a message status with the confirmation gate via RETURNING", async () => {
    const queuedRow: PlanningSqlRow = {
      ...confirmedMessageRow,
      status: "queued",
      updated_at: "2026-06-17T09:00:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "community.messages.set_status": [queuedRow]
    });
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    const message = await repository.setCommunicationMessageStatus({
      input: {
        confirmation: confirmedMessageRecord.confirmation,
        messageId: "message_1",
        status: "queued",
        updatedAt: "2026-06-17T09:00:00.000Z"
      },
      options: writeOptions
    });

    expect(message.status).toBe("queued");
    expect(message.confirmation).toEqual(confirmedMessageRecord.confirmation);
    const [statement] = statements;
    expect(statement?.sql).toContain("RETURNING");
    expect(statement?.parameters).toEqual([
      "queued",
      "2026-06-17T09:00:00.000Z",
      1,
      "actor_1",
      "Reviewed and approved by pastor.",
      "2026-06-17T08:05:00.000Z",
      TENANT,
      "message_1"
    ]);
  });

  it("updates a recipient status with the clock-bearing input and maps the RETURNING row", async () => {
    const failedRow: PlanningSqlRow = {
      channel_ref: "vault_channel_1",
      failure_reason: "carrier rejected",
      member_ref: "member_1",
      message_id: "message_1",
      recipient_id: "recipient_1",
      send_status: "failed",
      tenant_id: TENANT,
      updated_at: "2026-06-17T09:00:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "community.recipients.update_status": [failedRow]
    });
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    const recipient = await repository.updateCommunicationRecipientStatus({
      input: {
        failureReason: "carrier rejected",
        recipientId: "recipient_1",
        sendStatus: "failed",
        updatedAt: "2026-06-17T09:00:00.000Z"
      },
      options: writeOptions
    });

    expect(recipient.sendStatus).toBe("failed");
    expect(recipient.failureReason).toBe("carrier rejected");
    expect(statements[0]?.parameters).toEqual([
      "failed",
      "carrier rejected",
      "2026-06-17T09:00:00.000Z",
      TENANT,
      "recipient_1"
    ]);
  });

  it("deletes a membership scoped by tenant, membership, group, and member", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    await repository.removeGroupMembership({
      input: { groupId: "group_1", memberRef: "member_1", membershipId: "membership_1" },
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.sql).toContain("DELETE FROM group_memberships");
    expect(statement?.parameters).toEqual([TENANT, "membership_1", "group_1", "member_1"]);
  });

  it("archives a member by stamping status='archived' and updated_at via RETURNING", async () => {
    const archivedRow: PlanningSqlRow = {
      ...memberRow,
      status: "archived",
      updated_at: "2026-06-17T09:00:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "community.members.archive": [archivedRow]
    });
    const repository = createCommunityCommandSqlRepository({ clock: () => "t", executor });

    const member = await repository.archiveMember({
      input: { memberId: "member_1", updatedAt: "2026-06-17T09:00:00.000Z" },
      options: writeOptions
    });

    expect(member.status).toBe("archived");
    const [statement] = statements;
    expect(statement?.sql).toContain("SET status = 'archived'");
    expect(statement?.parameters).toEqual([
      "2026-06-17T09:00:00.000Z",
      TENANT,
      "member_1"
    ]);
  });
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

describe("Community SQL repository smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("persists and reads the Community graph via node:sqlite", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(CommunityInitialSchemaMigration.upSql);
      const executor = createSqliteExecutor({ database });
      const query = createCommunityQuerySqlRepository({ executor });
      const command = createCommunityCommandSqlRepository({
        clock: () => "2026-06-17T12:00:00.000Z",
        executor
      });

      await command.saveMember({ input: memberRecord, options: writeOptions });
      const fetchedMember = await query.getMember({
        input: { memberId: "member_1" },
        options: readOptions
      });
      expect(fetchedMember?.displayName).toBe("Member One");
      expect(fetchedMember?.contactChannelRefs).toEqual(memberRecord.contactChannelRefs);
      expect(fetchedMember?.contactChannelRefs[1]?.consentStatus).toBe("unknown");
      expect(fetchedMember?.segmentRefs).toEqual(["segment_1"]);

      await command.saveHousehold({ input: householdRecord, options: writeOptions });
      const households = await query.listHouseholds({ input: {}, options: readOptions });
      expect(households).toHaveLength(1);
      expect(households[0]?.memberRefs).toEqual(["member_1"]);
      expect(households[0]?.primaryContactMemberRef).toBe("member_1");

      await command.saveCommunityGroup({ input: groupRecord, options: writeOptions });
      const groups = await query.listCommunityGroups({
        input: { filter: { kind: "small-group" } },
        options: readOptions
      });
      expect(groups).toHaveLength(1);
      expect(groups[0]?.archived).toBe(false);

      await command.setGroupMembership({ input: membershipRecord, options: writeOptions });
      const memberships = await query.listGroupMemberships({
        input: { groupId: "group_1" },
        options: readOptions
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.active).toBe(true);
      expect(memberships[0]?.roleInGroup).toBe("leader");

      await command.recordAttendance({
        input: memberAttendanceRecord,
        options: writeOptions
      });
      await command.recordAttendance({
        input: headcountAttendanceRecord,
        options: writeOptions
      });
      const attendance = await query.listAttendanceRecords({
        input: { occasionRef: "occasion_1" },
        options: readOptions
      });
      expect(attendance).toHaveLength(2);
      const memberRow = attendance.find((row) => row.memberRef === "member_1");
      const anonRow = attendance.find((row) => row.memberRef === undefined);
      expect(memberRow?.status).toBe("present");
      expect(memberRow?.headcount).toBeUndefined();
      expect(anonRow?.headcount).toBe(42);
      expect(anonRow?.status).toBeUndefined();

      // A second occasion lets the tenant-wide read prove it spans occasions.
      await command.recordAttendance({
        input: {
          attendanceId: "attendance_3",
          memberRef: "member_1",
          occasionRef: "occasion_2",
          recordedAt: "2026-06-18T08:00:00.000Z",
          recordedByRef: "actor_1",
          status: "present",
          tenantId: TENANT,
          updatedAt: "2026-06-18T08:00:00.000Z"
        },
        options: writeOptions
      });
      // Unfiltered: every attendance row across all occasions for the tenant.
      const tenantWide = await query.listAttendanceRecordsForTenant({
        input: {},
        options: readOptions
      });
      expect(tenantWide).toHaveLength(3);
      expect(new Set(tenantWide.map((row) => row.occasionRef))).toEqual(
        new Set(["occasion_1", "occasion_2"])
      );
      // member filter narrows to just that member's rows across occasions.
      const memberScoped = await query.listAttendanceRecordsForTenant({
        input: { memberRef: "member_1" },
        options: readOptions
      });
      expect(memberScoped).toHaveLength(2);
      expect(memberScoped.every((row) => row.memberRef === "member_1")).toBe(true);
      // occasion filter on the tenant-wide read matches the occasion-only read.
      const occasionScoped = await query.listAttendanceRecordsForTenant({
        input: { occasionRef: "occasion_1" },
        options: readOptions
      });
      expect(occasionScoped).toHaveLength(2);

      // Draft → confirm (the confirmation gate) → queue.
      await command.saveCommunicationMessage({
        input: draftMessageRecord,
        options: writeOptions
      });
      const draftFetched = await query.getCommunicationMessage({
        input: { messageId: "message_1" },
        options: readOptions
      });
      expect(draftFetched?.status).toBe("draft");
      expect(draftFetched?.confirmation).toBeUndefined();
      expect(draftFetched?.audience).toEqual({ groupId: "group_1", kind: "group" });

      const confirmed = await command.setCommunicationMessageStatus({
        input: {
          confirmation: confirmedMessageRecord.confirmation,
          messageId: "message_1",
          status: "confirmed",
          updatedAt: "2026-06-17T08:05:00.000Z"
        },
        options: writeOptions
      });
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.confirmation).toEqual(confirmedMessageRecord.confirmation);

      const queued = await command.setCommunicationMessageStatus({
        input: {
          confirmation: confirmedMessageRecord.confirmation,
          messageId: "message_1",
          status: "queued",
          updatedAt: "2026-06-17T08:10:00.000Z"
        },
        options: writeOptions
      });
      expect(queued.status).toBe("queued");
      // The confirmation round-trips intact through the gated transition.
      expect(queued.confirmation?.confirmedByRef).toBe("actor_1");

      await command.upsertCommunicationRecipient({
        input: recipientRecord,
        options: writeOptions
      });
      const sentRecipient = await command.updateCommunicationRecipientStatus({
        input: {
          recipientId: "recipient_1",
          sendStatus: "sent",
          updatedAt: "2026-06-17T08:15:00.000Z"
        },
        options: writeOptions
      });
      expect(sentRecipient.sendStatus).toBe("sent");
      const recipients = await query.listCommunicationRecipients({
        input: { messageId: "message_1" },
        options: readOptions
      });
      expect(recipients).toHaveLength(1);
      expect(recipients[0]?.sendStatus).toBe("sent");

      await command.upsertEngagementSummary({
        input: engagementSummaryRecord,
        options: writeOptions
      });
      const summaries = await query.listEngagementSummaries({
        input: { filter: { scopeKind: "member" } },
        options: readOptions
      });
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.scope).toEqual({ kind: "member", memberRef: "member_1" });
      expect(summaries[0]?.attendanceStreak).toBe(3);

      const archived = await command.archiveMember({
        input: { memberId: "member_1", updatedAt: "2026-06-17T13:00:00.000Z" },
        options: writeOptions
      });
      expect(archived.status).toBe("archived");
      expect(archived.updatedAt).toBe("2026-06-17T13:00:00.000Z");

      const allMembers = await query.listMembers({ input: {}, options: readOptions });
      expect(allMembers).toHaveLength(1);
      expect(allMembers[0]?.status).toBe("archived");
    } finally {
      database.close();
    }
  });
});
