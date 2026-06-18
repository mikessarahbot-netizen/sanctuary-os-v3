import { describe, expect, it } from "vitest";
import type { CommunitySqlExecutor, PlanningSqlRow } from "@sanctuary-os/db";
import {
  createCommunityCommandSqlRepository,
  createCommunityQuerySqlRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  isCommunityDomainError,
  type CommunityDomainErrorCode
} from "../../domain/community/index.js";
import {
  createPersistenceBackedCommunityServicesAdapter,
  type PersistenceBackedCommunityServiceIds
} from "./persistence.js";
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

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: TENANT
};

const planner: AuthenticatedActor = {
  actorId: "planner_1",
  roles: ["planner"],
  tenantId: TENANT
};

const TS = "2026-06-17T08:00:00.000Z";

const memberRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  contact_channel_refs_json: JSON.stringify([
    { channelRef: "channel_sms_yes", consentStatus: "granted", kind: "sms" }
  ]),
  created_at: TS,
  custom_field_values_json: "[]",
  display_name: "Granted Member",
  household_ref: null,
  member_id: "member_yes",
  schema_version: "community.v1",
  segment_refs_json: JSON.stringify(["segment_a"]),
  status: "active",
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const deniedMemberRow = memberRow({
  contact_channel_refs_json: JSON.stringify([
    { channelRef: "channel_sms_no", consentStatus: "denied", kind: "sms" }
  ]),
  display_name: "Denied Member",
  member_id: "member_no"
});

const membershipRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  active: 1,
  group_id: "group_1",
  joined_at: TS,
  member_ref: "member_yes",
  membership_id: "membership_1",
  role_in_group: "member",
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const messageRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  audience_json: JSON.stringify({ kind: "segment", segmentRef: "segment_a" }),
  body_template: "Hello {{firstName}}",
  channel: "sms",
  confirmation_reason: null,
  confirmed: 0,
  confirmed_at: null,
  confirmed_by_ref: null,
  created_at: TS,
  created_by_ref: "leader_1",
  message_id: "message_1",
  origin: "human",
  status: "draft",
  subject: null,
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const confirmedFields = {
  confirmation_reason: "Approved",
  confirmed: 1,
  confirmed_at: TS,
  confirmed_by_ref: "leader_1"
} as const;

const attendanceRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  attendance_id: "attendance_1",
  headcount: null,
  member_ref: "member_yes",
  occasion_ref: "occasion_1",
  recorded_at: TS,
  recorded_by_ref: "leader_1",
  status: "present",
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const deliveredRecipientRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  channel_ref: "channel_sms_yes",
  failure_reason: null,
  member_ref: "member_yes",
  message_id: "message_1",
  recipient_id: "recipient_1",
  send_status: "delivered",
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

/**
 * Recording executor that consumes row-sets FIFO per statement name, so a
 * multi-step flow (e.g. set_status called for `queue` then `send`) can return the
 * correct intermediate row at each call. When a name's queue is exhausted (or was
 * never seeded) it returns no rows — matching a real "no match" result.
 */
const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>>
): {
  readonly executor: CommunitySqlExecutor;
  readonly statements: RecordedStatement[];
} => {
  const statements: RecordedStatement[] = [];
  const queues = new Map<string, (readonly PlanningSqlRow[])[]>(
    Object.entries(rowsByName).map(([name, sets]) => [name, [...sets]])
  );
  const executor: CommunitySqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });
      const queue = queues.get(statement.name);
      const rows = queue?.shift() ?? [];

      return Promise.resolve({ rows });
    }
  };

  return { executor, statements };
};

const single = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>> =>
  Object.fromEntries(
    Object.entries(rowsByName).map(([name, rows]) => [name, [rows]])
  );

const createAdapter = (
  rowsByName: Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>>,
  options: {
    readonly clock?: () => string;
    readonly ids?: Partial<PersistenceBackedCommunityServiceIds>;
    readonly sendPort?: CommunicationSendPort;
  } = {}
): {
  readonly adapter: ReturnType<typeof createPersistenceBackedCommunityServicesAdapter>;
  readonly statements: RecordedStatement[];
} => {
  const { executor, statements } = createRecordingExecutor(rowsByName);
  const clock = options.clock ?? ((): string => "2026-06-17T09:00:00.000Z");
  const adapter = createPersistenceBackedCommunityServicesAdapter({
    clock,
    commandRepository: createCommunityCommandSqlRepository({ clock, executor }),
    queryRepository: createCommunityQuerySqlRepository({ executor }),
    ...(options.ids !== undefined ? { ids: options.ids } : {}),
    ...(options.sendPort !== undefined ? { sendPort: options.sendPort } : {})
  });

  return { adapter, statements };
};

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

describe("createPersistenceBackedCommunityServicesAdapter (recording executor)", () => {
  it("maps a persistence member row to a domain record on getMember", async () => {
    const { adapter, statements } = createAdapter(
      single({ "community.members.get": [memberRow()] })
    );

    const member = await adapter.queryService.getMember({
      actor: leader,
      input: { memberId: "member_yes" },
      requestId: "request_get"
    });

    expect(member).toMatchObject({
      displayName: "Granted Member",
      memberId: "member_yes",
      status: "active",
      tenantId: TENANT
    });
    expect(member?.contactChannelRefs).toEqual([
      { channelRef: "channel_sms_yes", consentStatus: "granted", kind: "sms" }
    ]);
    // The persistence-only schemaVersion field is dropped from the domain record.
    expect(member === null || "schemaVersion" in member).toBe(false);
    expect(statements[0]?.name).toBe("community.members.get");
    expect(statements[0]?.parameters).toEqual([TENANT, "member_yes"]);
  });

  it("returns null for a cross-tenant getMember without leaking the row", async () => {
    const { adapter } = createAdapter(
      single({ "community.members.get": [memberRow()] })
    );

    await expect(
      adapter.queryService.getMember({
        actor: otherTenantLeader,
        input: { memberId: "member_yes" },
        requestId: "request_cross_tenant"
      })
    ).resolves.toBeNull();
  });

  it("derives the persistence schemaVersion and tenant when saving a member", async () => {
    const { adapter, statements } = createAdapter(single({}), {
      ids: { memberId: () => "member_created" }
    });

    const member = await adapter.commandService.saveMember({
      actor: leader,
      input: {
        contactChannelRefs: [],
        customFieldValues: [],
        displayName: "New Member",
        segmentRefs: [],
        status: "active"
      },
      requestId: "request_save"
    });

    expect(member).toMatchObject({
      displayName: "New Member",
      memberId: "member_created",
      status: "active",
      tenantId: TENANT
    });
    const upsert = statements.find(
      (statement) => statement.name === "community.members.upsert"
    );
    expect(upsert?.parameters).toEqual([
      TENANT,
      "member_created",
      null,
      "New Member",
      "active",
      "[]",
      "[]",
      "[]",
      "community.v1",
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T09:00:00.000Z"
    ]);
  });

  it("throws MEMBER_NOT_FOUND when archiving an unknown member", async () => {
    const { adapter } = createAdapter(single({ "community.members.get": [] }));

    await expectDomainErrorCode(
      adapter.commandService.archiveMember({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Left the church" },
          memberId: "member_missing"
        },
        requestId: "request_archive_missing"
      }),
      "MEMBER_NOT_FOUND"
    );
  });

  it("rejects viewer mutations in the service layer", async () => {
    const { adapter } = createAdapter(single({}));

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

  it("rejects a non-comms role from managing communications", async () => {
    const { adapter } = createAdapter(single({}));

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

  it("looks up the membership and throws MEMBERSHIP_NOT_FOUND when absent", async () => {
    const { adapter, statements } = createAdapter(
      single({ "community.memberships.get": [] })
    );

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
    expect(
      statements.some((statement) => statement.name === "community.memberships.remove")
    ).toBe(false);
  });

  it("resolves the membership refs when removing a confirmed membership", async () => {
    const { adapter, statements } = createAdapter(
      single({ "community.memberships.get": [membershipRow()] })
    );

    await expect(
      adapter.commandService.removeGroupMembership({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "No longer serving" },
          membershipId: "membership_1"
        },
        requestId: "request_remove"
      })
    ).resolves.toBeUndefined();

    const remove = statements.find(
      (statement) => statement.name === "community.memberships.remove"
    );
    // tenant_id, membership_id, group_id, member_ref — group/member resolved from the row.
    expect(remove?.parameters).toEqual([TENANT, "membership_1", "group_1", "member_yes"]);
  });

  it("throws ATTENDANCE_NOT_FOUND when updating an unknown attendance record", async () => {
    const { adapter } = createAdapter(single({ "community.attendance.get": [] }));

    await expectDomainErrorCode(
      adapter.commandService.updateAttendance({
        actor: leader,
        input: {
          attendanceId: "attendance_missing",
          memberRef: "member_yes",
          occasionRef: "service_1",
          status: "present"
        },
        requestId: "request_update_missing"
      }),
      "ATTENDANCE_NOT_FOUND"
    );
  });

  it("previews the consent-filtered audience over the persistence path", async () => {
    const { adapter } = createAdapter(
      single({
        "community.messages.get": [messageRow()],
        "community.members.list": [memberRow(), deniedMemberRow]
      })
    );

    const audience = await adapter.queryService.getResolvedAudience({
      actor: leader,
      input: { messageId: "message_1" },
      requestId: "request_preview"
    });

    expect(audience?.included).toEqual([
      { channelRef: "channel_sms_yes", memberRef: "member_yes" }
    ]);
    expect(audience?.suppressed).toEqual([
      { consentStatus: "denied", memberRef: "member_no", reason: "consent-not-granted" }
    ]);
  });

  it("blocks queueing an unconfirmed (reviewed) message through the confirmation gate", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.messages.get": [messageRow({ status: "reviewed" })],
        "community.members.list": [memberRow()]
      })
    );

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Send it" },
          messageId: "message_1"
        },
        requestId: "request_queue_unconfirmed"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );
    // The gate rejects before any send-intent (status change / recipient row) is produced.
    expect(
      statements.some(
        (statement) =>
          statement.name === "community.messages.set_status" ||
          statement.name === "community.recipients.upsert"
      )
    ).toBe(false);
  });

  it("forbids an AI-drafted message from self-advancing toward send without a human confirmation", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.messages.get": [
          messageRow({ origin: "ai-drafted", status: "reviewed" })
        ],
        "community.members.list": [memberRow()]
      })
    );

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "auto" },
          messageId: "message_1"
        },
        requestId: "request_ai_queue"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );
    expect(
      statements.some((statement) => statement.name === "community.messages.set_status")
    ).toBe(false);
  });

  it("advances an AI-drafted message only with an explicit human confirmation", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.messages.get": [
          messageRow({ origin: "ai-drafted", status: "reviewed" })
        ],
        "community.messages.set_status": [
          messageRow({
            ...confirmedFields,
            confirmation_reason: "Reviewed by a human",
            confirmed_at: "2026-06-17T09:00:00.000Z",
            origin: "ai-drafted",
            status: "confirmed"
          })
        ]
      })
    );

    const confirmed = await adapter.commandService.confirmCommunicationSend({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Reviewed by a human" },
        confirmedByRef: "leader_1",
        messageId: "message_1"
      },
      requestId: "request_ai_confirm"
    });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmation).toMatchObject({
      confirmed: true,
      confirmedByRef: "leader_1",
      reason: "Reviewed by a human"
    });
    // The status-change write carries the confirmation flag + actor + reason.
    const setStatus = statements.find(
      (statement) => statement.name === "community.messages.set_status"
    );
    expect(setStatus?.parameters).toEqual([
      "confirmed",
      "2026-06-17T09:00:00.000Z",
      1,
      "leader_1",
      "Reviewed by a human",
      "2026-06-17T09:00:00.000Z",
      TENANT,
      "message_1"
    ]);
  });

  it("rejects queueing a confirmed message when no recipient has granted consent", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.messages.get": [messageRow({ ...confirmedFields, status: "confirmed" })],
        "community.members.list": [deniedMemberRow]
      })
    );

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Queue it" },
          messageId: "message_1"
        },
        requestId: "request_queue_blocked"
      }),
      "CONSENT_REQUIRED"
    );
    expect(
      statements.some((statement) => statement.name === "community.messages.set_status")
    ).toBe(false);
  });

  it("queues a confirmed message: consented recipient sent, non-consented suppressed", async () => {
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
    const { adapter, statements } = createAdapter(
      {
        "community.messages.get": [
          [messageRow({ ...confirmedFields, status: "confirmed" })]
        ],
        "community.members.list": [[memberRow(), deniedMemberRow]],
        // suppressed-recipient channel lookup for the denied member
        "community.members.get": [[deniedMemberRow]],
        // set_status is called twice: queue, then send — consumed FIFO.
        "community.messages.set_status": [
          [messageRow({ ...confirmedFields, status: "queued" })],
          [messageRow({ ...confirmedFields, status: "sent" })]
        ]
      },
      {
        ids: {
          recipientId: (() => {
            let next = 0;
            return () => {
              next += 1;
              return `recipient_${String(next)}`;
            };
          })()
        },
        sendPort
      }
    );

    const sent = await adapter.commandService.queueConfirmedCommunication({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Queue it" },
        messageId: "message_1"
      },
      requestId: "request_queue"
    });

    expect(sent.status).toBe("sent");
    // Only the consented member is handed to the carrier port.
    expect(sendCalls).toEqual(["member_yes"]);

    const recipientUpserts = statements.filter(
      (statement) => statement.name === "community.recipients.upsert"
    );
    // One suppressed row (denied member) + one delivered row (consented member).
    expect(recipientUpserts).toHaveLength(2);
    const sendStatusByMember = new Map(
      recipientUpserts.map((statement) => [
        statement.parameters[3] as string,
        statement.parameters[5] as string
      ])
    );
    expect(sendStatusByMember.get("member_yes")).toBe("delivered");
    expect(sendStatusByMember.get("member_no")).toBe("suppressed");
    // No raw contact value is ever bound — only opaque channel refs.
    for (const statement of recipientUpserts) {
      expect(String(statement.parameters[4]).startsWith("channel_")).toBe(true);
    }
  });

  const recomputeWindow = {
    windowEnd: "2026-06-30T00:00:00.000Z",
    windowStart: "2026-06-01T00:00:00.000Z"
  } as const;

  it("recomputes a member summary from full attendance + serving + comms signals", async () => {
    const { adapter, statements } = createAdapter(
      single({
        // Full tenant attendance via the additive list_for_tenant read: two present
        // rows for the same member across two occasions → a streak of 2.
        "community.attendance.list_for_tenant": [
          attendanceRow({ attendance_id: "attendance_1", occasion_ref: "occasion_1" }),
          attendanceRow({
            attendance_id: "attendance_2",
            occasion_ref: "occasion_2",
            recorded_at: "2026-06-18T08:00:00.000Z",
            updated_at: "2026-06-18T08:00:00.000Z"
          })
        ],
        // Serving: one active membership for the member → servingCount 1.
        "community.groups.list": [
          {
            archived: 0,
            created_at: TS,
            group_id: "group_1",
            kind: "small-group",
            label: "Tuesday Group",
            leader_member_ref: null,
            tenant_id: TENANT,
            updated_at: TS
          }
        ],
        "community.memberships.list": [membershipRow()],
        // Comms response: one delivered recipient in-window → commsResponseCount 1.
        "community.messages.list": [messageRow({ ...confirmedFields, status: "sent" })],
        "community.recipients.list": [deliveredRecipientRow()]
      })
    );

    const summaries = await adapter.commandService.recomputeEngagementSummaries({
      actor: leader,
      input: recomputeWindow,
      requestId: "request_recompute"
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      attendanceStreak: 2,
      commsResponseCount: 1,
      lastPresentOccasionRef: "occasion_2",
      scope: { kind: "member", memberRef: "member_yes" },
      servingCount: 1,
      summaryId: "engagement:member:member_yes",
      tenantId: TENANT,
      windowEnd: recomputeWindow.windowEnd,
      windowStart: recomputeWindow.windowStart
    });

    // The recompute enumerates ALL tenant attendance via the additive read — not
    // the legacy per-occasion walk over prior summaries.
    expect(
      statements.some(
        (statement) => statement.name === "community.attendance.list_for_tenant"
      )
    ).toBe(true);
    const upsert = statements.find(
      (statement) => statement.name === "community.engagement.upsert"
    );
    // tenant_id, summary_id, scope_kind, member_ref, segment_ref, attendance_streak,
    // serving_count, comms_response_count.
    expect(upsert?.parameters[2]).toBe("member");
    expect(upsert?.parameters[3]).toBe("member_yes");
    expect(upsert?.parameters[5]).toBe(2);
    expect(upsert?.parameters[6]).toBe(1);
    expect(upsert?.parameters[7]).toBe(1);
  });

  it("produces PII-free engagement summaries (refs + counts only, no name or contact data)", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.attendance.list_for_tenant": [attendanceRow()],
        "community.groups.list": [],
        "community.messages.list": []
      })
    );

    const summaries = await adapter.commandService.recomputeEngagementSummaries({
      actor: leader,
      input: recomputeWindow,
      requestId: "request_recompute_pii"
    });

    // The summary projection carries only refs + counts + window timestamps. None of
    // the member's PII (display name, custom-field values, contact channel refs)
    // can appear in the EngagementSummary by construction.
    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain("Granted Member");
    expect(serialized).not.toContain("channel_");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("field_");

    // Nor is any PII bound into the engagement upsert parameters.
    const upsert = statements.find(
      (statement) => statement.name === "community.engagement.upsert"
    );
    const upsertParams = JSON.stringify(upsert?.parameters ?? []);
    expect(upsertParams).not.toContain("Granted Member");
    expect(upsertParams).not.toContain("channel_");
  });

  it("scopes every recompute read to the actor tenant", async () => {
    const { adapter, statements } = createAdapter(
      single({
        "community.attendance.list_for_tenant": [attendanceRow()],
        "community.groups.list": [],
        "community.messages.list": []
      })
    );

    await adapter.commandService.recomputeEngagementSummaries({
      actor: leader,
      input: recomputeWindow,
      requestId: "request_recompute_tenant"
    });

    // Every read/write statement leads with the actor's tenant_id as its first
    // parameter — cross-tenant data can never enter the rollup.
    const reads = statements.filter((statement) =>
      [
        "community.attendance.list_for_tenant",
        "community.groups.list",
        "community.messages.list",
        "community.engagement.upsert"
      ].includes(statement.name)
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const statement of reads) {
      expect(statement.parameters[0]).toBe(TENANT);
    }
  });

  it("rejects a non-command role from recomputing engagement summaries", async () => {
    const { adapter, statements } = createAdapter(single({}));

    await expectDomainErrorCode(
      adapter.commandService.recomputeEngagementSummaries({
        actor: viewer,
        input: recomputeWindow,
        requestId: "request_recompute_denied"
      }),
      "AUTHORIZATION_FAILED"
    );
    // The role gate rejects before any persistence read is issued.
    expect(statements).toHaveLength(0);
  });
});
