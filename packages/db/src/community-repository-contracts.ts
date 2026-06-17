import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema
} from "./repository-contracts.js";

/**
 * Community+ persistence contracts for the people/relationships module.
 *
 * Durable, tenant-scoped Zod persistence records + per-operation input schemas +
 * read/write option guards + query/command repository interfaces, mirroring
 * `charts-repository-contracts.ts` / `play-repository-contracts.ts` exactly in
 * shape. These are the storage-facing contract the slice-4 SQLite adapter
 * realizes against the `community.v1` schema (`community-migrations.ts`); they
 * mirror the slice-1 API domain (`apps/api/src/domain/community/schemas.ts`)
 * field-for-field but use plain storage strings rather than branded IDs — the
 * same relationship Charts/Play persistence records have to their API domains.
 *
 * Privacy posture (strictest PII surface in the system):
 *   - **No raw PII columns.** Contact data is held only as opaque
 *     `channelRef`s + a `consentStatus`; no `phone`/`email`/`address` value ever
 *     appears in a Community+ persistence record, and every record is
 *     `.strict()` so such keys are rejected.
 *   - Array fields (a member's contact-channel-ref list, custom-field values,
 *     segment refs, household/audience member refs) are modeled here as
 *     **validated arrays**; the slice-4 adapter serializes them to the `*_json`
 *     columns. Validating the structured shape at the contract layer keeps the
 *     invariants enforceable before any serialization.
 *   - `EngagementSummary` stays PII-free **by construction** — refs + counts +
 *     window timestamps only — so it is the one record class that is
 *     AI-projectable at the member-scope level (subject to `aiPolicyProfile`).
 *
 * Every persisted read/write requires an `actorId` (inlined `superRefine` on the
 * option schemas) so the operation is attributable for audit, exactly as
 * Charts/Play require.
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

export const CommunityPersistenceReadOptionsSchema = RepositoryReadOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Community persistence read operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const CommunityPersistenceWriteOptionsSchema = RepositoryWriteOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Community persistence write operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const CommunityStorageSchemaVersionSchema = z.literal("community.v1");
export const MemberStatusSchema = z.enum([
  "active",
  "inactive",
  "visitor",
  "archived"
]);
export const GroupKindSchema = z.enum([
  "small-group",
  "serving-team",
  "ministry",
  "class",
  "other"
]);
export const GroupRoleSchema = z.enum(["leader", "co-leader", "member", "guest"]);
export const AttendanceStatusSchema = z.enum(["present", "absent", "excused"]);
export const CommunicationChannelSchema = z.enum(["sms", "email", "push"]);
export const CommunicationStatusSchema = z.enum([
  "draft",
  "reviewed",
  "confirmed",
  "queued",
  "sent",
  "failed",
  "canceled"
]);
export const CommunicationOriginSchema = z.enum(["human", "ai-drafted"]);
export const RecipientSendStatusSchema = z.enum([
  "pending",
  "sent",
  "delivered",
  "failed",
  "suppressed"
]);
export const ContactChannelKindSchema = z.enum(["sms", "email", "push", "other"]);
export const ConsentStatusSchema = z.enum(["granted", "denied", "unknown"]);
export const EngagementScopeKindSchema = z.enum(["member", "segment"]);

const CONFIRMATION_GATED_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "queued",
  "sent"
]);

/**
 * A validated custom-field **value** keyed by an opaque field ref. The field
 * *schema* lives in `peopleProfile`; Community+ stores only values and never
 * invents fields. `value` is treated `[PII]` in aggregate and never reaches AI.
 */
export const CustomFieldValuePersistenceRecordSchema = z
  .object({
    fieldRef: NonEmptyStringSchema,
    value: z.string()
  })
  .strict();

/**
 * An opaque, consent-annotated reference to a contact channel — the vault
 * `channelRef` + consent posture, **never** the contact value itself.
 */
export const ContactChannelRefPersistenceRecordSchema = z
  .object({
    channelRef: NonEmptyStringSchema,
    consentStatus: ConsentStatusSchema,
    kind: ContactChannelKindSchema
  })
  .strict();

export const MemberPersistenceRecordSchema = z
  .object({
    contactChannelRefs: z.array(ContactChannelRefPersistenceRecordSchema),
    createdAt: IsoDateTimeStringSchema,
    customFieldValues: z.array(CustomFieldValuePersistenceRecordSchema),
    displayName: NonEmptyStringSchema,
    householdRef: OptionalNonEmptyStringSchema,
    memberId: NonEmptyStringSchema,
    schemaVersion: CommunityStorageSchemaVersionSchema,
    segmentRefs: z.array(NonEmptyStringSchema),
    status: MemberStatusSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((member, context) => {
    const seenChannelRefs = new Set<string>();

    member.contactChannelRefs.forEach((entry, index) => {
      if (seenChannelRefs.has(entry.channelRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "contactChannelRefs must be unique by channelRef.",
          path: ["contactChannelRefs", index, "channelRef"]
        });
      }

      seenChannelRefs.add(entry.channelRef);
    });

    const seenFieldRefs = new Set<string>();

    member.customFieldValues.forEach((entry, index) => {
      if (seenFieldRefs.has(entry.fieldRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "customFieldValues must be unique by fieldRef.",
          path: ["customFieldValues", index, "fieldRef"]
        });
      }

      seenFieldRefs.add(entry.fieldRef);
    });
  });

export const HouseholdPersistenceRecordSchema = z
  .object({
    createdAt: IsoDateTimeStringSchema,
    householdRef: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    memberRefs: z.array(NonEmptyStringSchema),
    primaryContactMemberRef: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((household, context) => {
    const seenMemberRefs = new Set<string>();

    household.memberRefs.forEach((memberRef, index) => {
      if (seenMemberRefs.has(memberRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "memberRefs must be unique.",
          path: ["memberRefs", index]
        });
      }

      seenMemberRefs.add(memberRef);
    });

    if (
      household.primaryContactMemberRef !== undefined &&
      !seenMemberRefs.has(household.primaryContactMemberRef)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "primaryContactMemberRef must appear in memberRefs.",
        path: ["primaryContactMemberRef"]
      });
    }
  });

export const CommunityGroupPersistenceRecordSchema = z
  .object({
    archived: z.boolean(),
    createdAt: IsoDateTimeStringSchema,
    groupId: NonEmptyStringSchema,
    kind: GroupKindSchema,
    label: NonEmptyStringSchema,
    leaderMemberRef: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const GroupMembershipPersistenceRecordSchema = z
  .object({
    active: z.boolean(),
    groupId: NonEmptyStringSchema,
    joinedAt: IsoDateTimeStringSchema,
    memberRef: NonEmptyStringSchema,
    membershipId: NonEmptyStringSchema,
    roleInGroup: GroupRoleSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const AttendanceRecordPersistenceRecordSchema = z
  .object({
    attendanceId: NonEmptyStringSchema,
    headcount: PositiveIntegerSchema.optional(),
    memberRef: OptionalNonEmptyStringSchema,
    occasionRef: NonEmptyStringSchema,
    recordedAt: IsoDateTimeStringSchema,
    recordedByRef: NonEmptyStringSchema,
    status: AttendanceStatusSchema.optional(),
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((record, context) => {
    const isMemberRow = record.memberRef !== undefined;

    if (isMemberRow) {
      if (record.status === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A member attendance row requires a status.",
          path: ["status"]
        });
      }

      if (record.headcount !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A member attendance row must not carry a headcount.",
          path: ["headcount"]
        });
      }

      return;
    }

    if (record.headcount === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An anonymous attendance row requires a headcount.",
        path: ["headcount"]
      });
    }

    if (record.status !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An anonymous attendance row must not carry a per-member status.",
        path: ["status"]
      });
    }
  });

export const AudienceDescriptorPersistenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      groupId: NonEmptyStringSchema,
      kind: z.literal("group")
    })
    .strict(),
  z
    .object({
      kind: z.literal("segment"),
      segmentRef: NonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("explicit"),
      memberRefs: z.array(NonEmptyStringSchema)
    })
    .strict()
]);

export const CommunicationConfirmationPersistenceSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: IsoDateTimeStringSchema,
    confirmedByRef: NonEmptyStringSchema,
    reason: NonEmptyStringSchema
  })
  .strict();

export const CommunicationMessagePersistenceRecordSchema = z
  .object({
    audience: AudienceDescriptorPersistenceSchema,
    bodyTemplate: NonEmptyStringSchema,
    channel: CommunicationChannelSchema,
    confirmation: CommunicationConfirmationPersistenceSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    createdByRef: NonEmptyStringSchema,
    messageId: NonEmptyStringSchema,
    origin: CommunicationOriginSchema,
    status: CommunicationStatusSchema,
    subject: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((message, context) => {
    if (message.channel !== "email" && message.subject !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subject is allowed only on email messages.",
        path: ["subject"]
      });
    }

    if (
      CONFIRMATION_GATED_STATUSES.has(message.status) &&
      message.confirmation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Status may advance to confirmed/queued/sent only with a recorded confirmation.",
        path: ["confirmation"]
      });
    }
  });

export const CommunicationRecipientPersistenceRecordSchema = z
  .object({
    channelRef: NonEmptyStringSchema,
    failureReason: OptionalNonEmptyStringSchema,
    memberRef: NonEmptyStringSchema,
    messageId: NonEmptyStringSchema,
    recipientId: NonEmptyStringSchema,
    sendStatus: RecipientSendStatusSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((recipient, context) => {
    if (recipient.failureReason !== undefined && recipient.sendStatus !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "failureReason is present only when sendStatus is failed.",
        path: ["failureReason"]
      });
    }
  });

export const EngagementScopePersistenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("member"),
      memberRef: NonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("segment"),
      segmentRef: NonEmptyStringSchema
    })
    .strict()
]);

export const EngagementSummaryPersistenceRecordSchema = z
  .object({
    attendanceStreak: NonNegativeIntegerSchema,
    commsResponseCount: NonNegativeIntegerSchema,
    computedAt: IsoDateTimeStringSchema,
    lastPresentOccasionRef: OptionalNonEmptyStringSchema,
    scope: EngagementScopePersistenceSchema,
    servingCount: NonNegativeIntegerSchema,
    summaryId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    windowEnd: IsoDateTimeStringSchema,
    windowStart: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.windowEnd < summary.windowStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "windowEnd must be greater than or equal to windowStart.",
        path: ["windowEnd"]
      });
    }
  });

export const ListMembersPersistenceInputSchema = z
  .object({
    filter: z
      .object({
        householdRef: OptionalNonEmptyStringSchema,
        status: MemberStatusSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict();
export const GetMemberPersistenceInputSchema = z
  .object({ memberId: NonEmptyStringSchema })
  .strict();
export const ListHouseholdsPersistenceInputSchema = z
  .object({ filter: z.object({}).strict().optional() })
  .strict();
export const GetHouseholdPersistenceInputSchema = z
  .object({ householdRef: NonEmptyStringSchema })
  .strict();
export const ListCommunityGroupsPersistenceInputSchema = z
  .object({
    filter: z
      .object({ kind: GroupKindSchema.optional() })
      .strict()
      .optional()
  })
  .strict();
export const GetCommunityGroupPersistenceInputSchema = z
  .object({ groupId: NonEmptyStringSchema })
  .strict();
export const ListGroupMembershipsPersistenceInputSchema = z
  .object({ groupId: NonEmptyStringSchema })
  .strict();
export const GetGroupMembershipPersistenceInputSchema = z
  .object({ membershipId: NonEmptyStringSchema })
  .strict();
export const ListAttendanceRecordsPersistenceInputSchema = z
  .object({ occasionRef: NonEmptyStringSchema })
  .strict();
export const GetAttendanceRecordPersistenceInputSchema = z
  .object({ attendanceId: NonEmptyStringSchema })
  .strict();
export const ListCommunicationMessagesPersistenceInputSchema = z
  .object({
    filter: z
      .object({ status: CommunicationStatusSchema.optional() })
      .strict()
      .optional()
  })
  .strict();
export const GetCommunicationMessagePersistenceInputSchema = z
  .object({ messageId: NonEmptyStringSchema })
  .strict();
export const ListCommunicationRecipientsPersistenceInputSchema = z
  .object({ messageId: NonEmptyStringSchema })
  .strict();
export const GetCommunicationRecipientPersistenceInputSchema = z
  .object({ recipientId: NonEmptyStringSchema })
  .strict();
export const ListEngagementSummariesPersistenceInputSchema = z
  .object({
    filter: z
      .object({ scopeKind: EngagementScopeKindSchema.optional() })
      .strict()
      .optional()
  })
  .strict();
export const GetEngagementSummaryPersistenceInputSchema = z
  .object({ summaryId: NonEmptyStringSchema })
  .strict();

export const SaveMemberPersistenceInputSchema = MemberPersistenceRecordSchema;
export const ArchiveMemberPersistenceInputSchema = z
  .object({
    memberId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();
export const SaveHouseholdPersistenceInputSchema = HouseholdPersistenceRecordSchema;
export const SaveCommunityGroupPersistenceInputSchema =
  CommunityGroupPersistenceRecordSchema;
export const SetGroupMembershipPersistenceInputSchema =
  GroupMembershipPersistenceRecordSchema;
export const RemoveGroupMembershipPersistenceInputSchema = z
  .object({
    groupId: NonEmptyStringSchema,
    memberRef: NonEmptyStringSchema,
    membershipId: NonEmptyStringSchema
  })
  .strict();
export const RecordAttendancePersistenceInputSchema =
  AttendanceRecordPersistenceRecordSchema;
export const UpdateAttendancePersistenceInputSchema =
  AttendanceRecordPersistenceRecordSchema;
export const SaveCommunicationMessagePersistenceInputSchema =
  CommunicationMessagePersistenceRecordSchema;
export const SetCommunicationMessageStatusPersistenceInputSchema = z
  .object({
    confirmation: CommunicationConfirmationPersistenceSchema.optional(),
    messageId: NonEmptyStringSchema,
    status: CommunicationStatusSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (
      CONFIRMATION_GATED_STATUSES.has(input.status) &&
      input.confirmation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Status may advance to confirmed/queued/sent only with a recorded confirmation.",
        path: ["confirmation"]
      });
    }
  });
export const UpsertCommunicationRecipientPersistenceInputSchema =
  CommunicationRecipientPersistenceRecordSchema;
export const UpdateCommunicationRecipientStatusPersistenceInputSchema = z
  .object({
    failureReason: OptionalNonEmptyStringSchema,
    recipientId: NonEmptyStringSchema,
    sendStatus: RecipientSendStatusSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (input.failureReason !== undefined && input.sendStatus !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "failureReason is present only when sendStatus is failed.",
        path: ["failureReason"]
      });
    }
  });
export const UpsertEngagementSummaryPersistenceInputSchema =
  EngagementSummaryPersistenceRecordSchema;

const readOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: CommunityPersistenceReadOptionsSchema }).strict();
const writeOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: CommunityPersistenceWriteOptionsSchema }).strict();

export const ListMembersPersistenceOperationSchema = readOperation(
  ListMembersPersistenceInputSchema
);
export const GetMemberPersistenceOperationSchema = readOperation(
  GetMemberPersistenceInputSchema
);
export const ListHouseholdsPersistenceOperationSchema = readOperation(
  ListHouseholdsPersistenceInputSchema
);
export const GetHouseholdPersistenceOperationSchema = readOperation(
  GetHouseholdPersistenceInputSchema
);
export const ListCommunityGroupsPersistenceOperationSchema = readOperation(
  ListCommunityGroupsPersistenceInputSchema
);
export const GetCommunityGroupPersistenceOperationSchema = readOperation(
  GetCommunityGroupPersistenceInputSchema
);
export const ListGroupMembershipsPersistenceOperationSchema = readOperation(
  ListGroupMembershipsPersistenceInputSchema
);
export const GetGroupMembershipPersistenceOperationSchema = readOperation(
  GetGroupMembershipPersistenceInputSchema
);
export const ListAttendanceRecordsPersistenceOperationSchema = readOperation(
  ListAttendanceRecordsPersistenceInputSchema
);
export const GetAttendanceRecordPersistenceOperationSchema = readOperation(
  GetAttendanceRecordPersistenceInputSchema
);
export const ListCommunicationMessagesPersistenceOperationSchema = readOperation(
  ListCommunicationMessagesPersistenceInputSchema
);
export const GetCommunicationMessagePersistenceOperationSchema = readOperation(
  GetCommunicationMessagePersistenceInputSchema
);
export const ListCommunicationRecipientsPersistenceOperationSchema = readOperation(
  ListCommunicationRecipientsPersistenceInputSchema
);
export const GetCommunicationRecipientPersistenceOperationSchema = readOperation(
  GetCommunicationRecipientPersistenceInputSchema
);
export const ListEngagementSummariesPersistenceOperationSchema = readOperation(
  ListEngagementSummariesPersistenceInputSchema
);
export const GetEngagementSummaryPersistenceOperationSchema = readOperation(
  GetEngagementSummaryPersistenceInputSchema
);
export const SaveMemberPersistenceOperationSchema = writeOperation(
  SaveMemberPersistenceInputSchema
);
export const ArchiveMemberPersistenceOperationSchema = writeOperation(
  ArchiveMemberPersistenceInputSchema
);
export const SaveHouseholdPersistenceOperationSchema = writeOperation(
  SaveHouseholdPersistenceInputSchema
);
export const SaveCommunityGroupPersistenceOperationSchema = writeOperation(
  SaveCommunityGroupPersistenceInputSchema
);
export const SetGroupMembershipPersistenceOperationSchema = writeOperation(
  SetGroupMembershipPersistenceInputSchema
);
export const RemoveGroupMembershipPersistenceOperationSchema = writeOperation(
  RemoveGroupMembershipPersistenceInputSchema
);
export const RecordAttendancePersistenceOperationSchema = writeOperation(
  RecordAttendancePersistenceInputSchema
);
export const UpdateAttendancePersistenceOperationSchema = writeOperation(
  UpdateAttendancePersistenceInputSchema
);
export const SaveCommunicationMessagePersistenceOperationSchema = writeOperation(
  SaveCommunicationMessagePersistenceInputSchema
);
export const SetCommunicationMessageStatusPersistenceOperationSchema = writeOperation(
  SetCommunicationMessageStatusPersistenceInputSchema
);
export const UpsertCommunicationRecipientPersistenceOperationSchema = writeOperation(
  UpsertCommunicationRecipientPersistenceInputSchema
);
export const UpdateCommunicationRecipientStatusPersistenceOperationSchema =
  writeOperation(UpdateCommunicationRecipientStatusPersistenceInputSchema);
export const UpsertEngagementSummaryPersistenceOperationSchema = writeOperation(
  UpsertEngagementSummaryPersistenceInputSchema
);

export type CommunityPersistenceReadOptions = z.infer<
  typeof CommunityPersistenceReadOptionsSchema
>;
export type CommunityPersistenceWriteOptions = z.infer<
  typeof CommunityPersistenceWriteOptionsSchema
>;
export type MemberStatus = z.infer<typeof MemberStatusSchema>;
export type GroupKind = z.infer<typeof GroupKindSchema>;
export type GroupRole = z.infer<typeof GroupRoleSchema>;
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;
export type CommunicationChannel = z.infer<typeof CommunicationChannelSchema>;
export type CommunicationStatus = z.infer<typeof CommunicationStatusSchema>;
export type CommunicationOrigin = z.infer<typeof CommunicationOriginSchema>;
export type RecipientSendStatus = z.infer<typeof RecipientSendStatusSchema>;
export type ContactChannelKind = z.infer<typeof ContactChannelKindSchema>;
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export type EngagementScopeKind = z.infer<typeof EngagementScopeKindSchema>;
export type CustomFieldValuePersistenceRecord = z.infer<
  typeof CustomFieldValuePersistenceRecordSchema
>;
export type ContactChannelRefPersistenceRecord = z.infer<
  typeof ContactChannelRefPersistenceRecordSchema
>;
export type MemberPersistenceRecord = z.infer<typeof MemberPersistenceRecordSchema>;
export type HouseholdPersistenceRecord = z.infer<
  typeof HouseholdPersistenceRecordSchema
>;
export type CommunityGroupPersistenceRecord = z.infer<
  typeof CommunityGroupPersistenceRecordSchema
>;
export type GroupMembershipPersistenceRecord = z.infer<
  typeof GroupMembershipPersistenceRecordSchema
>;
export type AttendanceRecordPersistenceRecord = z.infer<
  typeof AttendanceRecordPersistenceRecordSchema
>;
export type AudienceDescriptorPersistence = z.infer<
  typeof AudienceDescriptorPersistenceSchema
>;
export type CommunicationConfirmationPersistence = z.infer<
  typeof CommunicationConfirmationPersistenceSchema
>;
export type CommunicationMessagePersistenceRecord = z.infer<
  typeof CommunicationMessagePersistenceRecordSchema
>;
export type CommunicationRecipientPersistenceRecord = z.infer<
  typeof CommunicationRecipientPersistenceRecordSchema
>;
export type EngagementScopePersistence = z.infer<
  typeof EngagementScopePersistenceSchema
>;
export type EngagementSummaryPersistenceRecord = z.infer<
  typeof EngagementSummaryPersistenceRecordSchema
>;
export type ListMembersPersistenceInput = z.infer<
  typeof ListMembersPersistenceInputSchema
>;
export type GetMemberPersistenceInput = z.infer<
  typeof GetMemberPersistenceInputSchema
>;
export type ListHouseholdsPersistenceInput = z.infer<
  typeof ListHouseholdsPersistenceInputSchema
>;
export type GetHouseholdPersistenceInput = z.infer<
  typeof GetHouseholdPersistenceInputSchema
>;
export type ListCommunityGroupsPersistenceInput = z.infer<
  typeof ListCommunityGroupsPersistenceInputSchema
>;
export type GetCommunityGroupPersistenceInput = z.infer<
  typeof GetCommunityGroupPersistenceInputSchema
>;
export type ListGroupMembershipsPersistenceInput = z.infer<
  typeof ListGroupMembershipsPersistenceInputSchema
>;
export type GetGroupMembershipPersistenceInput = z.infer<
  typeof GetGroupMembershipPersistenceInputSchema
>;
export type ListAttendanceRecordsPersistenceInput = z.infer<
  typeof ListAttendanceRecordsPersistenceInputSchema
>;
export type GetAttendanceRecordPersistenceInput = z.infer<
  typeof GetAttendanceRecordPersistenceInputSchema
>;
export type ListCommunicationMessagesPersistenceInput = z.infer<
  typeof ListCommunicationMessagesPersistenceInputSchema
>;
export type GetCommunicationMessagePersistenceInput = z.infer<
  typeof GetCommunicationMessagePersistenceInputSchema
>;
export type ListCommunicationRecipientsPersistenceInput = z.infer<
  typeof ListCommunicationRecipientsPersistenceInputSchema
>;
export type GetCommunicationRecipientPersistenceInput = z.infer<
  typeof GetCommunicationRecipientPersistenceInputSchema
>;
export type ListEngagementSummariesPersistenceInput = z.infer<
  typeof ListEngagementSummariesPersistenceInputSchema
>;
export type GetEngagementSummaryPersistenceInput = z.infer<
  typeof GetEngagementSummaryPersistenceInputSchema
>;
export type ArchiveMemberPersistenceInput = z.infer<
  typeof ArchiveMemberPersistenceInputSchema
>;
export type RemoveGroupMembershipPersistenceInput = z.infer<
  typeof RemoveGroupMembershipPersistenceInputSchema
>;
export type SetCommunicationMessageStatusPersistenceInput = z.infer<
  typeof SetCommunicationMessageStatusPersistenceInputSchema
>;
export type UpdateCommunicationRecipientStatusPersistenceInput = z.infer<
  typeof UpdateCommunicationRecipientStatusPersistenceInputSchema
>;

export interface CommunityReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: CommunityPersistenceReadOptions;
}

export interface CommunityPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: CommunityPersistenceWriteOptions;
}

export interface CommunityQueryPersistenceRepository {
  readonly listMembers: (
    operation: CommunityReadPersistenceOperation<ListMembersPersistenceInput>
  ) => Promise<readonly MemberPersistenceRecord[]>;
  readonly getMember: (
    operation: CommunityReadPersistenceOperation<GetMemberPersistenceInput>
  ) => Promise<MemberPersistenceRecord | null>;
  readonly listHouseholds: (
    operation: CommunityReadPersistenceOperation<ListHouseholdsPersistenceInput>
  ) => Promise<readonly HouseholdPersistenceRecord[]>;
  readonly getHousehold: (
    operation: CommunityReadPersistenceOperation<GetHouseholdPersistenceInput>
  ) => Promise<HouseholdPersistenceRecord | null>;
  readonly listCommunityGroups: (
    operation: CommunityReadPersistenceOperation<ListCommunityGroupsPersistenceInput>
  ) => Promise<readonly CommunityGroupPersistenceRecord[]>;
  readonly getCommunityGroup: (
    operation: CommunityReadPersistenceOperation<GetCommunityGroupPersistenceInput>
  ) => Promise<CommunityGroupPersistenceRecord | null>;
  readonly listGroupMemberships: (
    operation: CommunityReadPersistenceOperation<ListGroupMembershipsPersistenceInput>
  ) => Promise<readonly GroupMembershipPersistenceRecord[]>;
  readonly getGroupMembership: (
    operation: CommunityReadPersistenceOperation<GetGroupMembershipPersistenceInput>
  ) => Promise<GroupMembershipPersistenceRecord | null>;
  readonly listAttendanceRecords: (
    operation: CommunityReadPersistenceOperation<ListAttendanceRecordsPersistenceInput>
  ) => Promise<readonly AttendanceRecordPersistenceRecord[]>;
  readonly getAttendanceRecord: (
    operation: CommunityReadPersistenceOperation<GetAttendanceRecordPersistenceInput>
  ) => Promise<AttendanceRecordPersistenceRecord | null>;
  readonly listCommunicationMessages: (
    operation: CommunityReadPersistenceOperation<ListCommunicationMessagesPersistenceInput>
  ) => Promise<readonly CommunicationMessagePersistenceRecord[]>;
  readonly getCommunicationMessage: (
    operation: CommunityReadPersistenceOperation<GetCommunicationMessagePersistenceInput>
  ) => Promise<CommunicationMessagePersistenceRecord | null>;
  readonly listCommunicationRecipients: (
    operation: CommunityReadPersistenceOperation<ListCommunicationRecipientsPersistenceInput>
  ) => Promise<readonly CommunicationRecipientPersistenceRecord[]>;
  readonly getCommunicationRecipient: (
    operation: CommunityReadPersistenceOperation<GetCommunicationRecipientPersistenceInput>
  ) => Promise<CommunicationRecipientPersistenceRecord | null>;
  readonly listEngagementSummaries: (
    operation: CommunityReadPersistenceOperation<ListEngagementSummariesPersistenceInput>
  ) => Promise<readonly EngagementSummaryPersistenceRecord[]>;
  readonly getEngagementSummary: (
    operation: CommunityReadPersistenceOperation<GetEngagementSummaryPersistenceInput>
  ) => Promise<EngagementSummaryPersistenceRecord | null>;
}

export interface CommunityCommandPersistenceRepository {
  readonly saveMember: (
    operation: CommunityPersistenceOperation<MemberPersistenceRecord>
  ) => Promise<MemberPersistenceRecord>;
  readonly archiveMember: (
    operation: CommunityPersistenceOperation<ArchiveMemberPersistenceInput>
  ) => Promise<MemberPersistenceRecord>;
  readonly saveHousehold: (
    operation: CommunityPersistenceOperation<HouseholdPersistenceRecord>
  ) => Promise<HouseholdPersistenceRecord>;
  readonly saveCommunityGroup: (
    operation: CommunityPersistenceOperation<CommunityGroupPersistenceRecord>
  ) => Promise<CommunityGroupPersistenceRecord>;
  readonly setGroupMembership: (
    operation: CommunityPersistenceOperation<GroupMembershipPersistenceRecord>
  ) => Promise<GroupMembershipPersistenceRecord>;
  readonly removeGroupMembership: (
    operation: CommunityPersistenceOperation<RemoveGroupMembershipPersistenceInput>
  ) => Promise<void>;
  readonly recordAttendance: (
    operation: CommunityPersistenceOperation<AttendanceRecordPersistenceRecord>
  ) => Promise<AttendanceRecordPersistenceRecord>;
  readonly updateAttendance: (
    operation: CommunityPersistenceOperation<AttendanceRecordPersistenceRecord>
  ) => Promise<AttendanceRecordPersistenceRecord>;
  readonly saveCommunicationMessage: (
    operation: CommunityPersistenceOperation<CommunicationMessagePersistenceRecord>
  ) => Promise<CommunicationMessagePersistenceRecord>;
  readonly setCommunicationMessageStatus: (
    operation: CommunityPersistenceOperation<SetCommunicationMessageStatusPersistenceInput>
  ) => Promise<CommunicationMessagePersistenceRecord>;
  readonly upsertCommunicationRecipient: (
    operation: CommunityPersistenceOperation<CommunicationRecipientPersistenceRecord>
  ) => Promise<CommunicationRecipientPersistenceRecord>;
  readonly updateCommunicationRecipientStatus: (
    operation: CommunityPersistenceOperation<UpdateCommunicationRecipientStatusPersistenceInput>
  ) => Promise<CommunicationRecipientPersistenceRecord>;
  readonly upsertEngagementSummary: (
    operation: CommunityPersistenceOperation<EngagementSummaryPersistenceRecord>
  ) => Promise<EngagementSummaryPersistenceRecord>;
}
