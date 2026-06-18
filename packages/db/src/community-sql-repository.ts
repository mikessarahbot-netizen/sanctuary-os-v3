import { z } from "zod";
import {
  ArchiveMemberPersistenceOperationSchema,
  AttendanceRecordPersistenceRecordSchema,
  AudienceDescriptorPersistenceSchema,
  CommunicationConfirmationPersistenceSchema,
  CommunicationMessagePersistenceRecordSchema,
  CommunicationRecipientPersistenceRecordSchema,
  CommunityGroupPersistenceRecordSchema,
  ContactChannelRefPersistenceRecordSchema,
  CustomFieldValuePersistenceRecordSchema,
  EngagementScopePersistenceSchema,
  EngagementSummaryPersistenceRecordSchema,
  GetAttendanceRecordPersistenceOperationSchema,
  GetCommunicationMessagePersistenceOperationSchema,
  GetCommunicationRecipientPersistenceOperationSchema,
  GetCommunityGroupPersistenceOperationSchema,
  GetEngagementSummaryPersistenceOperationSchema,
  GetGroupMembershipPersistenceOperationSchema,
  GetHouseholdPersistenceOperationSchema,
  GetMemberPersistenceOperationSchema,
  GroupMembershipPersistenceRecordSchema,
  HouseholdPersistenceRecordSchema,
  ListAttendanceRecordsForTenantPersistenceOperationSchema,
  ListAttendanceRecordsPersistenceOperationSchema,
  ListCommunicationMessagesPersistenceOperationSchema,
  ListCommunicationRecipientsPersistenceOperationSchema,
  ListCommunityGroupsPersistenceOperationSchema,
  ListEngagementSummariesPersistenceOperationSchema,
  ListGroupMembershipsPersistenceOperationSchema,
  ListHouseholdsPersistenceOperationSchema,
  ListMembersPersistenceOperationSchema,
  MemberPersistenceRecordSchema,
  RecordAttendancePersistenceOperationSchema,
  RemoveGroupMembershipPersistenceOperationSchema,
  SaveCommunicationMessagePersistenceOperationSchema,
  SaveCommunityGroupPersistenceOperationSchema,
  SaveHouseholdPersistenceOperationSchema,
  SaveMemberPersistenceOperationSchema,
  SetCommunicationMessageStatusPersistenceOperationSchema,
  SetGroupMembershipPersistenceOperationSchema,
  UpdateAttendancePersistenceOperationSchema,
  UpdateCommunicationRecipientStatusPersistenceOperationSchema,
  UpsertCommunicationRecipientPersistenceOperationSchema,
  UpsertEngagementSummaryPersistenceOperationSchema,
  type AttendanceRecordPersistenceRecord,
  type CommunicationConfirmationPersistence,
  type CommunicationMessagePersistenceRecord,
  type CommunicationRecipientPersistenceRecord,
  type CommunityCommandPersistenceRepository,
  type CommunityGroupPersistenceRecord,
  type CommunityQueryPersistenceRepository,
  type EngagementScopePersistence,
  type EngagementSummaryPersistenceRecord,
  type GroupMembershipPersistenceRecord,
  type HouseholdPersistenceRecord,
  type MemberPersistenceRecord
} from "./community-repository-contracts.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlRow
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

type ListMembersPersistenceOperation = z.infer<typeof ListMembersPersistenceOperationSchema>;
type GetMemberPersistenceOperation = z.infer<typeof GetMemberPersistenceOperationSchema>;
type ListHouseholdsPersistenceOperation = z.infer<
  typeof ListHouseholdsPersistenceOperationSchema
>;
type GetHouseholdPersistenceOperation = z.infer<typeof GetHouseholdPersistenceOperationSchema>;
type ListCommunityGroupsPersistenceOperation = z.infer<
  typeof ListCommunityGroupsPersistenceOperationSchema
>;
type GetCommunityGroupPersistenceOperation = z.infer<
  typeof GetCommunityGroupPersistenceOperationSchema
>;
type ListGroupMembershipsPersistenceOperation = z.infer<
  typeof ListGroupMembershipsPersistenceOperationSchema
>;
type GetGroupMembershipPersistenceOperation = z.infer<
  typeof GetGroupMembershipPersistenceOperationSchema
>;
type ListAttendanceRecordsPersistenceOperation = z.infer<
  typeof ListAttendanceRecordsPersistenceOperationSchema
>;
type ListAttendanceRecordsForTenantPersistenceOperation = z.infer<
  typeof ListAttendanceRecordsForTenantPersistenceOperationSchema
>;
type GetAttendanceRecordPersistenceOperation = z.infer<
  typeof GetAttendanceRecordPersistenceOperationSchema
>;
type ListCommunicationMessagesPersistenceOperation = z.infer<
  typeof ListCommunicationMessagesPersistenceOperationSchema
>;
type GetCommunicationMessagePersistenceOperation = z.infer<
  typeof GetCommunicationMessagePersistenceOperationSchema
>;
type ListCommunicationRecipientsPersistenceOperation = z.infer<
  typeof ListCommunicationRecipientsPersistenceOperationSchema
>;
type GetCommunicationRecipientPersistenceOperation = z.infer<
  typeof GetCommunicationRecipientPersistenceOperationSchema
>;
type ListEngagementSummariesPersistenceOperation = z.infer<
  typeof ListEngagementSummariesPersistenceOperationSchema
>;
type GetEngagementSummaryPersistenceOperation = z.infer<
  typeof GetEngagementSummaryPersistenceOperationSchema
>;
type SaveMemberPersistenceOperation = z.infer<typeof SaveMemberPersistenceOperationSchema>;
type ArchiveMemberPersistenceOperation = z.infer<
  typeof ArchiveMemberPersistenceOperationSchema
>;
type SaveHouseholdPersistenceOperation = z.infer<
  typeof SaveHouseholdPersistenceOperationSchema
>;
type SaveCommunityGroupPersistenceOperation = z.infer<
  typeof SaveCommunityGroupPersistenceOperationSchema
>;
type SetGroupMembershipPersistenceOperation = z.infer<
  typeof SetGroupMembershipPersistenceOperationSchema
>;
type RemoveGroupMembershipPersistenceOperation = z.infer<
  typeof RemoveGroupMembershipPersistenceOperationSchema
>;
type RecordAttendancePersistenceOperation = z.infer<
  typeof RecordAttendancePersistenceOperationSchema
>;
type UpdateAttendancePersistenceOperation = z.infer<
  typeof UpdateAttendancePersistenceOperationSchema
>;
type SaveCommunicationMessagePersistenceOperation = z.infer<
  typeof SaveCommunicationMessagePersistenceOperationSchema
>;
type SetCommunicationMessageStatusPersistenceOperation = z.infer<
  typeof SetCommunicationMessageStatusPersistenceOperationSchema
>;
type UpsertCommunicationRecipientPersistenceOperation = z.infer<
  typeof UpsertCommunicationRecipientPersistenceOperationSchema
>;
type UpdateCommunicationRecipientStatusPersistenceOperation = z.infer<
  typeof UpdateCommunicationRecipientStatusPersistenceOperationSchema
>;
type UpsertEngagementSummaryPersistenceOperation = z.infer<
  typeof UpsertEngagementSummaryPersistenceOperationSchema
>;

export type CommunitySqlExecutor = Pick<PlanningSqlExecutor, "query">;

export interface CommunityQuerySqlRepositoryDependencies {
  readonly executor: CommunitySqlExecutor;
}

export interface CommunityCommandSqlRepositoryDependencies {
  readonly clock: () => string;
  readonly executor: CommunitySqlExecutor;
}

const optionalTransaction = (
  transaction: TransactionHandle | undefined
): { readonly transaction?: TransactionHandle } =>
  transaction === undefined ? {} : { transaction };

const optionalText = (value: string | undefined): string | null => value ?? null;

const optionalInteger = (value: number | undefined): number | null => value ?? null;

const ContactChannelRefArraySchema = z.array(ContactChannelRefPersistenceRecordSchema);
const CustomFieldValueArraySchema = z.array(CustomFieldValuePersistenceRecordSchema);
const StringRefArraySchema = z.array(z.string().min(1));

const decodeConfirmation = (
  row: Readonly<{
    confirmed: number;
    confirmed_at?: string | null | undefined;
    confirmed_by_ref?: string | null | undefined;
    confirmation_reason?: string | null | undefined;
  }>
): CommunicationConfirmationPersistence | undefined => {
  if (row.confirmed === 0) {
    return undefined;
  }

  return CommunicationConfirmationPersistenceSchema.parse({
    confirmed: true,
    confirmedAt: row.confirmed_at,
    confirmedByRef: row.confirmed_by_ref,
    reason: row.confirmation_reason
  });
};

const MemberSqlRowSchema = z
  .object({
    contact_channel_refs_json: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    custom_field_values_json: z.string().min(1),
    display_name: z.string().min(1),
    household_ref: z.string().min(1).nullable().optional(),
    member_id: z.string().min(1),
    schema_version: z.string().min(1),
    segment_refs_json: z.string().min(1),
    status: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): MemberPersistenceRecord =>
    MemberPersistenceRecordSchema.parse({
      contactChannelRefs: ContactChannelRefArraySchema.parse(
        JSON.parse(row.contact_channel_refs_json)
      ),
      createdAt: row.created_at,
      customFieldValues: CustomFieldValueArraySchema.parse(
        JSON.parse(row.custom_field_values_json)
      ),
      displayName: row.display_name,
      ...(row.household_ref !== undefined && row.household_ref !== null
        ? { householdRef: row.household_ref }
        : {}),
      memberId: row.member_id,
      schemaVersion: row.schema_version,
      segmentRefs: StringRefArraySchema.parse(JSON.parse(row.segment_refs_json)),
      status: row.status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const HouseholdSqlRowSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    household_ref: z.string().min(1),
    label: z.string().min(1),
    member_refs_json: z.string().min(1),
    primary_contact_member_ref: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): HouseholdPersistenceRecord =>
    HouseholdPersistenceRecordSchema.parse({
      createdAt: row.created_at,
      householdRef: row.household_ref,
      label: row.label,
      memberRefs: StringRefArraySchema.parse(JSON.parse(row.member_refs_json)),
      ...(row.primary_contact_member_ref !== undefined &&
      row.primary_contact_member_ref !== null
        ? { primaryContactMemberRef: row.primary_contact_member_ref }
        : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const CommunityGroupSqlRowSchema = z
  .object({
    archived: z.number().int(),
    created_at: z.string().datetime({ offset: true }),
    group_id: z.string().min(1),
    kind: z.string().min(1),
    label: z.string().min(1),
    leader_member_ref: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): CommunityGroupPersistenceRecord =>
    CommunityGroupPersistenceRecordSchema.parse({
      archived: row.archived !== 0,
      createdAt: row.created_at,
      groupId: row.group_id,
      kind: row.kind,
      label: row.label,
      ...(row.leader_member_ref !== undefined && row.leader_member_ref !== null
        ? { leaderMemberRef: row.leader_member_ref }
        : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const GroupMembershipSqlRowSchema = z
  .object({
    active: z.number().int(),
    group_id: z.string().min(1),
    joined_at: z.string().datetime({ offset: true }),
    member_ref: z.string().min(1),
    membership_id: z.string().min(1),
    role_in_group: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): GroupMembershipPersistenceRecord =>
    GroupMembershipPersistenceRecordSchema.parse({
      active: row.active !== 0,
      groupId: row.group_id,
      joinedAt: row.joined_at,
      memberRef: row.member_ref,
      membershipId: row.membership_id,
      roleInGroup: row.role_in_group,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const AttendanceRecordSqlRowSchema = z
  .object({
    attendance_id: z.string().min(1),
    headcount: z.number().int().nullable().optional(),
    member_ref: z.string().min(1).nullable().optional(),
    occasion_ref: z.string().min(1),
    recorded_at: z.string().datetime({ offset: true }),
    recorded_by_ref: z.string().min(1),
    status: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): AttendanceRecordPersistenceRecord =>
    AttendanceRecordPersistenceRecordSchema.parse({
      attendanceId: row.attendance_id,
      ...(row.headcount !== undefined && row.headcount !== null
        ? { headcount: row.headcount }
        : {}),
      ...(row.member_ref !== undefined && row.member_ref !== null
        ? { memberRef: row.member_ref }
        : {}),
      occasionRef: row.occasion_ref,
      recordedAt: row.recorded_at,
      recordedByRef: row.recorded_by_ref,
      ...(row.status !== undefined && row.status !== null ? { status: row.status } : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const CommunicationMessageSqlRowSchema = z
  .object({
    audience_json: z.string().min(1),
    body_template: z.string().min(1),
    channel: z.string().min(1),
    confirmation_reason: z.string().min(1).nullable().optional(),
    confirmed: z.number().int(),
    confirmed_at: z.string().datetime({ offset: true }).nullable().optional(),
    confirmed_by_ref: z.string().min(1).nullable().optional(),
    created_at: z.string().datetime({ offset: true }),
    created_by_ref: z.string().min(1),
    message_id: z.string().min(1),
    origin: z.string().min(1),
    status: z.string().min(1),
    subject: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): CommunicationMessagePersistenceRecord => {
    const confirmation = decodeConfirmation({
      confirmed: row.confirmed,
      confirmed_at: row.confirmed_at,
      confirmed_by_ref: row.confirmed_by_ref,
      confirmation_reason: row.confirmation_reason
    });

    return CommunicationMessagePersistenceRecordSchema.parse({
      audience: AudienceDescriptorPersistenceSchema.parse(JSON.parse(row.audience_json)),
      bodyTemplate: row.body_template,
      channel: row.channel,
      ...(confirmation !== undefined ? { confirmation } : {}),
      createdAt: row.created_at,
      createdByRef: row.created_by_ref,
      messageId: row.message_id,
      origin: row.origin,
      status: row.status,
      ...(row.subject !== undefined && row.subject !== null ? { subject: row.subject } : {}),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    });
  });

const CommunicationRecipientSqlRowSchema = z
  .object({
    channel_ref: z.string().min(1),
    failure_reason: z.string().min(1).nullable().optional(),
    member_ref: z.string().min(1),
    message_id: z.string().min(1),
    recipient_id: z.string().min(1),
    send_status: z.string().min(1),
    tenant_id: z.string().min(1),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): CommunicationRecipientPersistenceRecord =>
    CommunicationRecipientPersistenceRecordSchema.parse({
      channelRef: row.channel_ref,
      ...(row.failure_reason !== undefined && row.failure_reason !== null
        ? { failureReason: row.failure_reason }
        : {}),
      memberRef: row.member_ref,
      messageId: row.message_id,
      recipientId: row.recipient_id,
      sendStatus: row.send_status,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at
    })
  );

const EngagementSummarySqlRowSchema = z
  .object({
    attendance_streak: z.number().int(),
    comms_response_count: z.number().int(),
    computed_at: z.string().datetime({ offset: true }),
    last_present_occasion_ref: z.string().min(1).nullable().optional(),
    member_ref: z.string().min(1).nullable().optional(),
    scope_kind: z.string().min(1),
    segment_ref: z.string().min(1).nullable().optional(),
    serving_count: z.number().int(),
    summary_id: z.string().min(1),
    tenant_id: z.string().min(1),
    window_end: z.string().datetime({ offset: true }),
    window_start: z.string().datetime({ offset: true })
  })
  .strict()
  .transform((row): EngagementSummaryPersistenceRecord => {
    const scope: EngagementScopePersistence = EngagementScopePersistenceSchema.parse(
      row.scope_kind === "member"
        ? { kind: "member", memberRef: row.member_ref }
        : { kind: "segment", segmentRef: row.segment_ref }
    );

    return EngagementSummaryPersistenceRecordSchema.parse({
      attendanceStreak: row.attendance_streak,
      commsResponseCount: row.comms_response_count,
      computedAt: row.computed_at,
      ...(row.last_present_occasion_ref !== undefined &&
      row.last_present_occasion_ref !== null
        ? { lastPresentOccasionRef: row.last_present_occasion_ref }
        : {}),
      scope,
      servingCount: row.serving_count,
      summaryId: row.summary_id,
      tenantId: row.tenant_id,
      windowEnd: row.window_end,
      windowStart: row.window_start
    });
  });

const parseOptionalRow = <Result>(
  rowSchema: { readonly parse: (row: PlanningSqlRow) => Result },
  rows: readonly PlanningSqlRow[]
): Result | null => {
  const row = rows[0];

  return row === undefined ? null : rowSchema.parse(row);
};

const firstRow = (rows: readonly PlanningSqlRow[], message: string): PlanningSqlRow => {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(message);
  }

  return row;
};

const MEMBER_COLUMNS = `
  tenant_id, member_id, household_ref, display_name, status, segment_refs_json,
  custom_field_values_json, contact_channel_refs_json, schema_version, created_at, updated_at
`.trim();

const HOUSEHOLD_COLUMNS = `
  tenant_id, household_ref, label, member_refs_json, primary_contact_member_ref,
  created_at, updated_at
`.trim();

const COMMUNITY_GROUP_COLUMNS = `
  tenant_id, group_id, kind, label, leader_member_ref, archived, created_at, updated_at
`.trim();

const GROUP_MEMBERSHIP_COLUMNS = `
  tenant_id, membership_id, group_id, member_ref, role_in_group, active, joined_at, updated_at
`.trim();

const ATTENDANCE_COLUMNS = `
  tenant_id, attendance_id, occasion_ref, member_ref, status, headcount, recorded_by_ref,
  recorded_at, updated_at
`.trim();

const COMMUNICATION_MESSAGE_COLUMNS = `
  tenant_id, message_id, channel, subject, body_template, audience_json, status, origin,
  confirmed, confirmed_by_ref, confirmation_reason, confirmed_at, created_by_ref, created_at,
  updated_at
`.trim();

const COMMUNICATION_RECIPIENT_COLUMNS = `
  tenant_id, recipient_id, message_id, member_ref, channel_ref, send_status, failure_reason,
  updated_at
`.trim();

const ENGAGEMENT_SUMMARY_COLUMNS = `
  tenant_id, summary_id, scope_kind, member_ref, segment_ref, attendance_streak, serving_count,
  comms_response_count, last_present_occasion_ref, window_start, window_end, computed_at
`.trim();

export const createCommunityQuerySqlRepository = (
  dependencies: CommunityQuerySqlRepositoryDependencies
): CommunityQueryPersistenceRepository => ({
  getAttendanceRecord: async (rawOperation: GetAttendanceRecordPersistenceOperation) => {
    const operation = GetAttendanceRecordPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.attendance.get",
      parameters: [operation.options.context.tenantId, operation.input.attendanceId],
      sql: `SELECT ${ATTENDANCE_COLUMNS} FROM attendance_records WHERE tenant_id = ? AND attendance_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(AttendanceRecordSqlRowSchema, result.rows);
  },

  getCommunicationMessage: async (
    rawOperation: GetCommunicationMessagePersistenceOperation
  ) => {
    const operation =
      GetCommunicationMessagePersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.messages.get",
      parameters: [operation.options.context.tenantId, operation.input.messageId],
      sql: `SELECT ${COMMUNICATION_MESSAGE_COLUMNS} FROM communication_messages WHERE tenant_id = ? AND message_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(CommunicationMessageSqlRowSchema, result.rows);
  },

  getCommunicationRecipient: async (
    rawOperation: GetCommunicationRecipientPersistenceOperation
  ) => {
    const operation =
      GetCommunicationRecipientPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.recipients.get",
      parameters: [operation.options.context.tenantId, operation.input.recipientId],
      sql: `SELECT ${COMMUNICATION_RECIPIENT_COLUMNS} FROM communication_recipients WHERE tenant_id = ? AND recipient_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(CommunicationRecipientSqlRowSchema, result.rows);
  },

  getCommunityGroup: async (rawOperation: GetCommunityGroupPersistenceOperation) => {
    const operation = GetCommunityGroupPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.groups.get",
      parameters: [operation.options.context.tenantId, operation.input.groupId],
      sql: `SELECT ${COMMUNITY_GROUP_COLUMNS} FROM community_groups WHERE tenant_id = ? AND group_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(CommunityGroupSqlRowSchema, result.rows);
  },

  getEngagementSummary: async (rawOperation: GetEngagementSummaryPersistenceOperation) => {
    const operation = GetEngagementSummaryPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.engagement.get",
      parameters: [operation.options.context.tenantId, operation.input.summaryId],
      sql: `SELECT ${ENGAGEMENT_SUMMARY_COLUMNS} FROM engagement_summaries WHERE tenant_id = ? AND summary_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(EngagementSummarySqlRowSchema, result.rows);
  },

  getGroupMembership: async (rawOperation: GetGroupMembershipPersistenceOperation) => {
    const operation = GetGroupMembershipPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.memberships.get",
      parameters: [operation.options.context.tenantId, operation.input.membershipId],
      sql: `SELECT ${GROUP_MEMBERSHIP_COLUMNS} FROM group_memberships WHERE tenant_id = ? AND membership_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(GroupMembershipSqlRowSchema, result.rows);
  },

  getHousehold: async (rawOperation: GetHouseholdPersistenceOperation) => {
    const operation = GetHouseholdPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.households.get",
      parameters: [operation.options.context.tenantId, operation.input.householdRef],
      sql: `SELECT ${HOUSEHOLD_COLUMNS} FROM households WHERE tenant_id = ? AND household_ref = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(HouseholdSqlRowSchema, result.rows);
  },

  getMember: async (rawOperation: GetMemberPersistenceOperation) => {
    const operation = GetMemberPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.members.get",
      parameters: [operation.options.context.tenantId, operation.input.memberId],
      sql: `SELECT ${MEMBER_COLUMNS} FROM members WHERE tenant_id = ? AND member_id = ? LIMIT 1`,
      ...optionalTransaction(operation.options.transaction)
    });

    return parseOptionalRow(MemberSqlRowSchema, result.rows);
  },

  listAttendanceRecords: async (
    rawOperation: ListAttendanceRecordsPersistenceOperation
  ) => {
    const operation = ListAttendanceRecordsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.attendance.list",
      parameters: [operation.options.context.tenantId, operation.input.occasionRef],
      sql: `
SELECT ${ATTENDANCE_COLUMNS}
FROM attendance_records
WHERE tenant_id = ? AND occasion_ref = ?
ORDER BY attendance_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(AttendanceRecordSqlRowSchema).parse(result.rows);
  },

  listAttendanceRecordsForTenant: async (
    rawOperation: ListAttendanceRecordsForTenantPersistenceOperation
  ) => {
    const operation =
      ListAttendanceRecordsForTenantPersistenceOperationSchema.parse(rawOperation);
    const memberRef = operation.input.memberRef ?? null;
    const occasionRef = operation.input.occasionRef ?? null;
    const result = await dependencies.executor.query({
      name: "community.attendance.list_for_tenant",
      parameters: [
        operation.options.context.tenantId,
        occasionRef,
        occasionRef,
        memberRef,
        memberRef
      ],
      sql: `
SELECT ${ATTENDANCE_COLUMNS}
FROM attendance_records
WHERE tenant_id = ?
  AND (? IS NULL OR occasion_ref = ?)
  AND (? IS NULL OR member_ref = ?)
ORDER BY occasion_ref, attendance_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(AttendanceRecordSqlRowSchema).parse(result.rows);
  },

  listCommunicationMessages: async (
    rawOperation: ListCommunicationMessagesPersistenceOperation
  ) => {
    const operation =
      ListCommunicationMessagesPersistenceOperationSchema.parse(rawOperation);
    const status = operation.input.filter?.status ?? null;
    const result = await dependencies.executor.query({
      name: "community.messages.list",
      parameters: [operation.options.context.tenantId, status, status],
      sql: `
SELECT ${COMMUNICATION_MESSAGE_COLUMNS}
FROM communication_messages
WHERE tenant_id = ? AND (? IS NULL OR status = ?)
ORDER BY created_at, message_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(CommunicationMessageSqlRowSchema).parse(result.rows);
  },

  listCommunicationRecipients: async (
    rawOperation: ListCommunicationRecipientsPersistenceOperation
  ) => {
    const operation =
      ListCommunicationRecipientsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.recipients.list",
      parameters: [operation.options.context.tenantId, operation.input.messageId],
      sql: `
SELECT ${COMMUNICATION_RECIPIENT_COLUMNS}
FROM communication_recipients
WHERE tenant_id = ? AND message_id = ?
ORDER BY recipient_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(CommunicationRecipientSqlRowSchema).parse(result.rows);
  },

  listCommunityGroups: async (rawOperation: ListCommunityGroupsPersistenceOperation) => {
    const operation = ListCommunityGroupsPersistenceOperationSchema.parse(rawOperation);
    const kind = operation.input.filter?.kind ?? null;
    const result = await dependencies.executor.query({
      name: "community.groups.list",
      parameters: [operation.options.context.tenantId, kind, kind],
      sql: `
SELECT ${COMMUNITY_GROUP_COLUMNS}
FROM community_groups
WHERE tenant_id = ? AND (? IS NULL OR kind = ?)
ORDER BY label, group_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(CommunityGroupSqlRowSchema).parse(result.rows);
  },

  listEngagementSummaries: async (
    rawOperation: ListEngagementSummariesPersistenceOperation
  ) => {
    const operation =
      ListEngagementSummariesPersistenceOperationSchema.parse(rawOperation);
    const scopeKind = operation.input.filter?.scopeKind ?? null;
    const result = await dependencies.executor.query({
      name: "community.engagement.list",
      parameters: [operation.options.context.tenantId, scopeKind, scopeKind],
      sql: `
SELECT ${ENGAGEMENT_SUMMARY_COLUMNS}
FROM engagement_summaries
WHERE tenant_id = ? AND (? IS NULL OR scope_kind = ?)
ORDER BY summary_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(EngagementSummarySqlRowSchema).parse(result.rows);
  },

  listGroupMemberships: async (rawOperation: ListGroupMembershipsPersistenceOperation) => {
    const operation = ListGroupMembershipsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.memberships.list",
      parameters: [operation.options.context.tenantId, operation.input.groupId],
      sql: `
SELECT ${GROUP_MEMBERSHIP_COLUMNS}
FROM group_memberships
WHERE tenant_id = ? AND group_id = ?
ORDER BY membership_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(GroupMembershipSqlRowSchema).parse(result.rows);
  },

  listHouseholds: async (rawOperation: ListHouseholdsPersistenceOperation) => {
    const operation = ListHouseholdsPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.households.list",
      parameters: [operation.options.context.tenantId],
      sql: `
SELECT ${HOUSEHOLD_COLUMNS}
FROM households
WHERE tenant_id = ?
ORDER BY label, household_ref
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(HouseholdSqlRowSchema).parse(result.rows);
  },

  listMembers: async (rawOperation: ListMembersPersistenceOperation) => {
    const operation = ListMembersPersistenceOperationSchema.parse(rawOperation);
    const householdRef = operation.input.filter?.householdRef ?? null;
    const status = operation.input.filter?.status ?? null;
    const result = await dependencies.executor.query({
      name: "community.members.list",
      parameters: [
        operation.options.context.tenantId,
        householdRef,
        householdRef,
        status,
        status
      ],
      sql: `
SELECT ${MEMBER_COLUMNS}
FROM members
WHERE tenant_id = ?
  AND (? IS NULL OR household_ref = ?)
  AND (? IS NULL OR status = ?)
ORDER BY display_name, member_id
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return z.array(MemberSqlRowSchema).parse(result.rows);
  }
});

export const createCommunityCommandSqlRepository = (
  dependencies: CommunityCommandSqlRepositoryDependencies
): CommunityCommandPersistenceRepository => ({
  archiveMember: async (rawOperation: ArchiveMemberPersistenceOperation) => {
    const operation = ArchiveMemberPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.members.archive",
      parameters: [
        operation.input.updatedAt,
        operation.options.context.tenantId,
        operation.input.memberId
      ],
      sql: `
UPDATE members
SET status = 'archived',
    updated_at = ?
WHERE tenant_id = ? AND member_id = ?
RETURNING ${MEMBER_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return MemberSqlRowSchema.parse(
      firstRow(result.rows, "Member archive did not match a tenant-scoped member.")
    );
  },

  recordAttendance: async (rawOperation: RecordAttendancePersistenceOperation) => {
    const operation = RecordAttendancePersistenceOperationSchema.parse(rawOperation);
    const attendance = operation.input;

    if (attendance.tenantId !== operation.options.context.tenantId) {
      throw new Error("Attendance record tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.attendance.upsert",
      parameters: [
        attendance.tenantId,
        attendance.attendanceId,
        attendance.occasionRef,
        optionalText(attendance.memberRef),
        optionalText(attendance.status),
        optionalInteger(attendance.headcount),
        attendance.recordedByRef,
        attendance.recordedAt,
        attendance.updatedAt
      ],
      sql: `
INSERT INTO attendance_records (tenant_id, attendance_id, occasion_ref, member_ref, status, headcount, recorded_by_ref, recorded_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, attendance_id) DO UPDATE SET
  occasion_ref = excluded.occasion_ref,
  member_ref = excluded.member_ref,
  status = excluded.status,
  headcount = excluded.headcount,
  recorded_by_ref = excluded.recorded_by_ref,
  recorded_at = excluded.recorded_at,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return AttendanceRecordPersistenceRecordSchema.parse(attendance);
  },

  removeGroupMembership: async (
    rawOperation: RemoveGroupMembershipPersistenceOperation
  ) => {
    const operation = RemoveGroupMembershipPersistenceOperationSchema.parse(rawOperation);
    await dependencies.executor.query({
      name: "community.memberships.remove",
      parameters: [
        operation.options.context.tenantId,
        operation.input.membershipId,
        operation.input.groupId,
        operation.input.memberRef
      ],
      sql: `DELETE FROM group_memberships WHERE tenant_id = ? AND membership_id = ? AND group_id = ? AND member_ref = ?`,
      ...optionalTransaction(operation.options.transaction)
    });
  },

  saveCommunicationMessage: async (
    rawOperation: SaveCommunicationMessagePersistenceOperation
  ) => {
    const operation =
      SaveCommunicationMessagePersistenceOperationSchema.parse(rawOperation);
    const message = operation.input;

    if (message.tenantId !== operation.options.context.tenantId) {
      throw new Error("Communication message tenant must match operation tenant.");
    }

    const confirmation = message.confirmation;

    await dependencies.executor.query({
      name: "community.messages.upsert",
      parameters: [
        message.tenantId,
        message.messageId,
        message.channel,
        optionalText(message.subject),
        message.bodyTemplate,
        JSON.stringify(message.audience),
        message.status,
        message.origin,
        confirmation === undefined ? 0 : 1,
        optionalText(confirmation?.confirmedByRef),
        optionalText(confirmation?.reason),
        optionalText(confirmation?.confirmedAt),
        message.createdByRef,
        message.createdAt,
        message.updatedAt
      ],
      sql: `
INSERT INTO communication_messages (tenant_id, message_id, channel, subject, body_template, audience_json, status, origin, confirmed, confirmed_by_ref, confirmation_reason, confirmed_at, created_by_ref, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, message_id) DO UPDATE SET
  channel = excluded.channel,
  subject = excluded.subject,
  body_template = excluded.body_template,
  audience_json = excluded.audience_json,
  status = excluded.status,
  origin = excluded.origin,
  confirmed = excluded.confirmed,
  confirmed_by_ref = excluded.confirmed_by_ref,
  confirmation_reason = excluded.confirmation_reason,
  confirmed_at = excluded.confirmed_at,
  created_by_ref = excluded.created_by_ref,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CommunicationMessagePersistenceRecordSchema.parse(message);
  },

  saveCommunityGroup: async (rawOperation: SaveCommunityGroupPersistenceOperation) => {
    const operation = SaveCommunityGroupPersistenceOperationSchema.parse(rawOperation);
    const group = operation.input;

    if (group.tenantId !== operation.options.context.tenantId) {
      throw new Error("Community group tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.groups.upsert",
      parameters: [
        group.tenantId,
        group.groupId,
        group.kind,
        group.label,
        optionalText(group.leaderMemberRef),
        group.archived ? 1 : 0,
        group.createdAt,
        group.updatedAt
      ],
      sql: `
INSERT INTO community_groups (tenant_id, group_id, kind, label, leader_member_ref, archived, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, group_id) DO UPDATE SET
  kind = excluded.kind,
  label = excluded.label,
  leader_member_ref = excluded.leader_member_ref,
  archived = excluded.archived,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CommunityGroupPersistenceRecordSchema.parse(group);
  },

  saveHousehold: async (rawOperation: SaveHouseholdPersistenceOperation) => {
    const operation = SaveHouseholdPersistenceOperationSchema.parse(rawOperation);
    const household = operation.input;

    if (household.tenantId !== operation.options.context.tenantId) {
      throw new Error("Household tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.households.upsert",
      parameters: [
        household.tenantId,
        household.householdRef,
        household.label,
        JSON.stringify(household.memberRefs),
        optionalText(household.primaryContactMemberRef),
        household.createdAt,
        household.updatedAt
      ],
      sql: `
INSERT INTO households (tenant_id, household_ref, label, member_refs_json, primary_contact_member_ref, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, household_ref) DO UPDATE SET
  label = excluded.label,
  member_refs_json = excluded.member_refs_json,
  primary_contact_member_ref = excluded.primary_contact_member_ref,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return HouseholdPersistenceRecordSchema.parse(household);
  },

  saveMember: async (rawOperation: SaveMemberPersistenceOperation) => {
    const operation = SaveMemberPersistenceOperationSchema.parse(rawOperation);
    const member = operation.input;

    if (member.tenantId !== operation.options.context.tenantId) {
      throw new Error("Member tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.members.upsert",
      parameters: [
        member.tenantId,
        member.memberId,
        optionalText(member.householdRef),
        member.displayName,
        member.status,
        JSON.stringify(member.segmentRefs),
        JSON.stringify(member.customFieldValues),
        JSON.stringify(member.contactChannelRefs),
        member.schemaVersion,
        member.createdAt,
        member.updatedAt
      ],
      sql: `
INSERT INTO members (tenant_id, member_id, household_ref, display_name, status, segment_refs_json, custom_field_values_json, contact_channel_refs_json, schema_version, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, member_id) DO UPDATE SET
  household_ref = excluded.household_ref,
  display_name = excluded.display_name,
  status = excluded.status,
  segment_refs_json = excluded.segment_refs_json,
  custom_field_values_json = excluded.custom_field_values_json,
  contact_channel_refs_json = excluded.contact_channel_refs_json,
  schema_version = excluded.schema_version,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return MemberPersistenceRecordSchema.parse(member);
  },

  setCommunicationMessageStatus: async (
    rawOperation: SetCommunicationMessageStatusPersistenceOperation
  ) => {
    const operation =
      SetCommunicationMessageStatusPersistenceOperationSchema.parse(rawOperation);
    const confirmation = operation.input.confirmation;
    const result = await dependencies.executor.query({
      name: "community.messages.set_status",
      parameters: [
        operation.input.status,
        operation.input.updatedAt,
        confirmation === undefined ? 0 : 1,
        optionalText(confirmation?.confirmedByRef),
        optionalText(confirmation?.reason),
        optionalText(confirmation?.confirmedAt),
        operation.options.context.tenantId,
        operation.input.messageId
      ],
      sql: `
UPDATE communication_messages
SET status = ?,
    updated_at = ?,
    confirmed = CASE WHEN ? = 1 THEN 1 ELSE confirmed END,
    confirmed_by_ref = COALESCE(?, confirmed_by_ref),
    confirmation_reason = COALESCE(?, confirmation_reason),
    confirmed_at = COALESCE(?, confirmed_at)
WHERE tenant_id = ? AND message_id = ?
RETURNING ${COMMUNICATION_MESSAGE_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CommunicationMessageSqlRowSchema.parse(
      firstRow(
        result.rows,
        "Communication message status update did not match a tenant-scoped message."
      )
    );
  },

  setGroupMembership: async (rawOperation: SetGroupMembershipPersistenceOperation) => {
    const operation = SetGroupMembershipPersistenceOperationSchema.parse(rawOperation);
    const membership = operation.input;

    if (membership.tenantId !== operation.options.context.tenantId) {
      throw new Error("Group membership tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.memberships.upsert",
      parameters: [
        membership.tenantId,
        membership.membershipId,
        membership.groupId,
        membership.memberRef,
        membership.roleInGroup,
        membership.active ? 1 : 0,
        membership.joinedAt,
        membership.updatedAt
      ],
      sql: `
INSERT INTO group_memberships (tenant_id, membership_id, group_id, member_ref, role_in_group, active, joined_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, membership_id) DO UPDATE SET
  group_id = excluded.group_id,
  member_ref = excluded.member_ref,
  role_in_group = excluded.role_in_group,
  active = excluded.active,
  joined_at = excluded.joined_at,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return GroupMembershipPersistenceRecordSchema.parse(membership);
  },

  updateAttendance: async (rawOperation: UpdateAttendancePersistenceOperation) => {
    return createCommunityCommandSqlRepository(dependencies).recordAttendance(rawOperation);
  },

  updateCommunicationRecipientStatus: async (
    rawOperation: UpdateCommunicationRecipientStatusPersistenceOperation
  ) => {
    const operation =
      UpdateCommunicationRecipientStatusPersistenceOperationSchema.parse(rawOperation);
    const result = await dependencies.executor.query({
      name: "community.recipients.update_status",
      parameters: [
        operation.input.sendStatus,
        optionalText(operation.input.failureReason),
        operation.input.updatedAt,
        operation.options.context.tenantId,
        operation.input.recipientId
      ],
      sql: `
UPDATE communication_recipients
SET send_status = ?,
    failure_reason = ?,
    updated_at = ?
WHERE tenant_id = ? AND recipient_id = ?
RETURNING ${COMMUNICATION_RECIPIENT_COLUMNS}
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CommunicationRecipientSqlRowSchema.parse(
      firstRow(
        result.rows,
        "Communication recipient status update did not match a tenant-scoped recipient."
      )
    );
  },

  upsertCommunicationRecipient: async (
    rawOperation: UpsertCommunicationRecipientPersistenceOperation
  ) => {
    const operation =
      UpsertCommunicationRecipientPersistenceOperationSchema.parse(rawOperation);
    const recipient = operation.input;

    if (recipient.tenantId !== operation.options.context.tenantId) {
      throw new Error("Communication recipient tenant must match operation tenant.");
    }

    await dependencies.executor.query({
      name: "community.recipients.upsert",
      parameters: [
        recipient.tenantId,
        recipient.recipientId,
        recipient.messageId,
        recipient.memberRef,
        recipient.channelRef,
        recipient.sendStatus,
        optionalText(recipient.failureReason),
        recipient.updatedAt
      ],
      sql: `
INSERT INTO communication_recipients (tenant_id, recipient_id, message_id, member_ref, channel_ref, send_status, failure_reason, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, recipient_id) DO UPDATE SET
  message_id = excluded.message_id,
  member_ref = excluded.member_ref,
  channel_ref = excluded.channel_ref,
  send_status = excluded.send_status,
  failure_reason = excluded.failure_reason,
  updated_at = excluded.updated_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return CommunicationRecipientPersistenceRecordSchema.parse(recipient);
  },

  upsertEngagementSummary: async (
    rawOperation: UpsertEngagementSummaryPersistenceOperation
  ) => {
    const operation = UpsertEngagementSummaryPersistenceOperationSchema.parse(rawOperation);
    const summary = operation.input;

    if (summary.tenantId !== operation.options.context.tenantId) {
      throw new Error("Engagement summary tenant must match operation tenant.");
    }

    const memberRef = summary.scope.kind === "member" ? summary.scope.memberRef : null;
    const segmentRef = summary.scope.kind === "segment" ? summary.scope.segmentRef : null;

    await dependencies.executor.query({
      name: "community.engagement.upsert",
      parameters: [
        summary.tenantId,
        summary.summaryId,
        summary.scope.kind,
        memberRef,
        segmentRef,
        summary.attendanceStreak,
        summary.servingCount,
        summary.commsResponseCount,
        optionalText(summary.lastPresentOccasionRef),
        summary.windowStart,
        summary.windowEnd,
        summary.computedAt
      ],
      sql: `
INSERT INTO engagement_summaries (tenant_id, summary_id, scope_kind, member_ref, segment_ref, attendance_streak, serving_count, comms_response_count, last_present_occasion_ref, window_start, window_end, computed_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, summary_id) DO UPDATE SET
  scope_kind = excluded.scope_kind,
  member_ref = excluded.member_ref,
  segment_ref = excluded.segment_ref,
  attendance_streak = excluded.attendance_streak,
  serving_count = excluded.serving_count,
  comms_response_count = excluded.comms_response_count,
  last_present_occasion_ref = excluded.last_present_occasion_ref,
  window_start = excluded.window_start,
  window_end = excluded.window_end,
  computed_at = excluded.computed_at
`.trim(),
      ...optionalTransaction(operation.options.transaction)
    });

    return EngagementSummaryPersistenceRecordSchema.parse(summary);
  }
});
