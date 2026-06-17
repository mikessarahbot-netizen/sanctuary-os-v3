import { z } from "zod";

/**
 * Community+ domain records for the people/relationships module.
 *
 * Strict, tenant-scoped, branded-ID Zod schemas for the eight Community+
 * records (`Member`, `Household`, `CommunityGroup`, `GroupMembership`,
 * `AttendanceRecord`, `CommunicationMessage`, `CommunicationRecipient`,
 * `EngagementSummary`) plus every enum. Every record is `.strict()`, carries
 * `tenantId`, and stores only **references and minimal values** — never raw
 * contact values (phone/email/address), credentials, giving data, or
 * care/counseling note text. Invariants from the Community+ plan are encoded
 * via `superRefine` so an invalid record can never parse.
 *
 * Privacy posture (this is the strictest PII surface in the system):
 *   - Contact data is held only as opaque `channelRef`s resolved by a separate
 *     access-controlled contact-vault boundary; no `phone`/`email`/`address`
 *     value ever lands in a Community+ record. `.strict()` rejects such keys.
 *   - `[PII]`-marked fields (`displayName`, `Household.label`, custom-field
 *     values, contact refs) are segregated from every AI-bound projection.
 *   - `EngagementSummary` is PII-free **by construction** — its shape can only
 *     hold refs + counts + window timestamps, so it is the one record class
 *     that is AI-projectable at the member-scope level.
 *
 * These shapes are the durable contract the persistence layer (`packages/db`)
 * and the pure transforms (`audience.ts` / `engagement.ts` /
 * `message-lifecycle.ts` / `attendance.ts`) agree on.
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

export const CommunityTenantIdSchema =
  NonEmptyStringSchema.brand<"CommunityTenantId">();
export const MemberIdSchema = NonEmptyStringSchema.brand<"MemberId">();
export const HouseholdRefSchema = NonEmptyStringSchema.brand<"HouseholdRef">();
export const CommunityGroupIdSchema =
  NonEmptyStringSchema.brand<"CommunityGroupId">();
export const GroupMembershipIdSchema =
  NonEmptyStringSchema.brand<"GroupMembershipId">();
export const AttendanceIdSchema = NonEmptyStringSchema.brand<"AttendanceId">();
export const CommunicationMessageIdSchema =
  NonEmptyStringSchema.brand<"CommunicationMessageId">();
export const CommunicationRecipientIdSchema =
  NonEmptyStringSchema.brand<"CommunicationRecipientId">();
export const EngagementSummaryIdSchema =
  NonEmptyStringSchema.brand<"EngagementSummaryId">();
export const OccasionRefSchema = NonEmptyStringSchema.brand<"OccasionRef">();
export const SegmentRefSchema = NonEmptyStringSchema.brand<"SegmentRef">();
export const CustomFieldRefSchema = NonEmptyStringSchema.brand<"CustomFieldRef">();
/**
 * Opaque pointer into the access-controlled contact-vault boundary. This is a
 * *reference*, never a phone/email/address value — the value is resolved (and
 * access-checked) outside Community+, at send time, by the integration adapter.
 */
export const ContactChannelRefSchema =
  NonEmptyStringSchema.brand<"ContactChannelRef">();
export const ActorRefSchema = NonEmptyStringSchema.brand<"ActorRef">();

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

/**
 * A validated custom-field **value** keyed by an opaque field ID. The field
 * *schema* lives in `peopleProfile` (ChurchContext); Community+ never invents
 * fields. The stored `value` is treated `[PII]` in aggregate and is never sent
 * to AI.
 */
export const CustomFieldValueSchema = z
  .object({
    fieldRef: CustomFieldRefSchema,
    value: z.string()
  })
  .strict();

/**
 * An opaque, consent-annotated reference to a contact channel. Holds the vault
 * `channelRef` and the consent posture — **never** the contact value itself.
 */
export const ContactChannelRefEntrySchema = z
  .object({
    channelRef: ContactChannelRefSchema,
    consentStatus: ConsentStatusSchema,
    kind: ContactChannelKindSchema
  })
  .strict();

export const MemberSchema = z
  .object({
    contactChannelRefs: z.array(ContactChannelRefEntrySchema),
    createdAt: IsoDateTimeStringSchema,
    customFieldValues: z.array(CustomFieldValueSchema),
    displayName: NonEmptyStringSchema,
    householdRef: HouseholdRefSchema.optional(),
    memberId: MemberIdSchema,
    segmentRefs: z.array(SegmentRefSchema),
    status: MemberStatusSchema,
    tenantId: CommunityTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((member, context) => {
    const seenChannelRefs = new Set<string>();

    for (const [index, entry] of member.contactChannelRefs.entries()) {
      if (seenChannelRefs.has(entry.channelRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "contactChannelRefs must be unique by channelRef.",
          path: ["contactChannelRefs", index, "channelRef"]
        });
      }

      seenChannelRefs.add(entry.channelRef);
    }

    const seenFieldRefs = new Set<string>();

    for (const [index, entry] of member.customFieldValues.entries()) {
      if (seenFieldRefs.has(entry.fieldRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "customFieldValues must be unique by fieldRef.",
          path: ["customFieldValues", index, "fieldRef"]
        });
      }

      seenFieldRefs.add(entry.fieldRef);
    }
  });

export const HouseholdSchema = z
  .object({
    createdAt: IsoDateTimeStringSchema,
    householdRef: HouseholdRefSchema,
    label: NonEmptyStringSchema,
    memberRefs: z.array(MemberIdSchema),
    primaryContactMemberRef: MemberIdSchema.optional(),
    tenantId: CommunityTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((household, context) => {
    const seenMemberRefs = new Set<string>();

    for (const [index, memberRef] of household.memberRefs.entries()) {
      if (seenMemberRefs.has(memberRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "memberRefs must be unique.",
          path: ["memberRefs", index]
        });
      }

      seenMemberRefs.add(memberRef);
    }

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

export const CommunityGroupSchema = z
  .object({
    archived: z.boolean(),
    createdAt: IsoDateTimeStringSchema,
    groupId: CommunityGroupIdSchema,
    kind: GroupKindSchema,
    label: NonEmptyStringSchema,
    leaderMemberRef: MemberIdSchema.optional(),
    tenantId: CommunityTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const GroupMembershipSchema = z
  .object({
    active: z.boolean(),
    groupId: CommunityGroupIdSchema,
    joinedAt: IsoDateTimeStringSchema,
    memberRef: MemberIdSchema,
    membershipId: GroupMembershipIdSchema,
    roleInGroup: GroupRoleSchema,
    tenantId: CommunityTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const AttendanceRecordSchema = z
  .object({
    attendanceId: AttendanceIdSchema,
    headcount: PositiveIntegerSchema.optional(),
    memberRef: MemberIdSchema.optional(),
    occasionRef: OccasionRefSchema,
    recordedAt: IsoDateTimeStringSchema,
    recordedByRef: ActorRefSchema,
    status: AttendanceStatusSchema.optional(),
    tenantId: CommunityTenantIdSchema,
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

    // Anonymous headcount row: no memberRef, no per-member status.
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

export const AudienceDescriptorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      groupId: CommunityGroupIdSchema,
      kind: z.literal("group")
    })
    .strict(),
  z
    .object({
      kind: z.literal("segment"),
      segmentRef: SegmentRefSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("explicit"),
      memberRefs: z.array(MemberIdSchema)
    })
    .strict()
]);

export const CommunicationConfirmationSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: IsoDateTimeStringSchema,
    confirmedByRef: ActorRefSchema,
    reason: NonEmptyStringSchema
  })
  .strict();

/**
 * Statuses that may only be entered once a human confirmation is recorded. The
 * `bodyTemplate` carries `{{placeholder}}` tokens — never expanded recipient
 * PII; recipients are merged at send time by the integration adapter, not
 * stored expanded here.
 */
const CONFIRMATION_GATED_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "queued",
  "sent"
]);

export const CommunicationMessageSchema = z
  .object({
    audience: AudienceDescriptorSchema,
    bodyTemplate: NonEmptyStringSchema,
    channel: CommunicationChannelSchema,
    confirmation: CommunicationConfirmationSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    createdByRef: ActorRefSchema,
    messageId: CommunicationMessageIdSchema,
    origin: CommunicationOriginSchema,
    status: CommunicationStatusSchema,
    subject: OptionalNonEmptyStringSchema,
    tenantId: CommunityTenantIdSchema,
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

export const CommunicationRecipientSchema = z
  .object({
    channelRef: ContactChannelRefSchema,
    failureReason: OptionalNonEmptyStringSchema,
    memberRef: MemberIdSchema,
    messageId: CommunicationMessageIdSchema,
    recipientId: CommunicationRecipientIdSchema,
    sendStatus: RecipientSendStatusSchema,
    tenantId: CommunityTenantIdSchema,
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

export const EngagementScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("member"),
      memberRef: MemberIdSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("segment"),
      segmentRef: SegmentRefSchema
    })
    .strict()
]);

/**
 * Derived, **non-PII** rollup per member or segment. PII-free by construction:
 * the shape admits only refs + counts + window timestamps, so no name, contact
 * value, or free-text can ever be carried. This is the one Community+ record
 * class that is AI-projectable at the member-scope level (subject to
 * `aiPolicyProfile`).
 */
export const EngagementSummarySchema = z
  .object({
    attendanceStreak: NonNegativeIntegerSchema,
    commsResponseCount: NonNegativeIntegerSchema,
    computedAt: IsoDateTimeStringSchema,
    lastPresentOccasionRef: OccasionRefSchema.optional(),
    scope: EngagementScopeSchema,
    servingCount: NonNegativeIntegerSchema,
    summaryId: EngagementSummaryIdSchema,
    tenantId: CommunityTenantIdSchema,
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

export type CommunityTenantId = z.infer<typeof CommunityTenantIdSchema>;
export type MemberId = z.infer<typeof MemberIdSchema>;
export type HouseholdRef = z.infer<typeof HouseholdRefSchema>;
export type CommunityGroupId = z.infer<typeof CommunityGroupIdSchema>;
export type GroupMembershipId = z.infer<typeof GroupMembershipIdSchema>;
export type AttendanceId = z.infer<typeof AttendanceIdSchema>;
export type CommunicationMessageId = z.infer<typeof CommunicationMessageIdSchema>;
export type CommunicationRecipientId = z.infer<
  typeof CommunicationRecipientIdSchema
>;
export type EngagementSummaryId = z.infer<typeof EngagementSummaryIdSchema>;
export type OccasionRef = z.infer<typeof OccasionRefSchema>;
export type SegmentRef = z.infer<typeof SegmentRefSchema>;
export type CustomFieldRef = z.infer<typeof CustomFieldRefSchema>;
export type ContactChannelRef = z.infer<typeof ContactChannelRefSchema>;
export type ActorRef = z.infer<typeof ActorRefSchema>;

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

export type CustomFieldValue = z.infer<typeof CustomFieldValueSchema>;
export type ContactChannelRefEntry = z.infer<typeof ContactChannelRefEntrySchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Household = z.infer<typeof HouseholdSchema>;
export type CommunityGroup = z.infer<typeof CommunityGroupSchema>;
export type GroupMembership = z.infer<typeof GroupMembershipSchema>;
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;
export type AudienceDescriptor = z.infer<typeof AudienceDescriptorSchema>;
export type CommunicationConfirmation = z.infer<
  typeof CommunicationConfirmationSchema
>;
export type CommunicationMessage = z.infer<typeof CommunicationMessageSchema>;
export type CommunicationRecipient = z.infer<typeof CommunicationRecipientSchema>;
export type EngagementScope = z.infer<typeof EngagementScopeSchema>;
export type EngagementSummary = z.infer<typeof EngagementSummarySchema>;

export const parseMember = (rawInput: unknown): Member =>
  MemberSchema.parse(rawInput);

export const parseHousehold = (rawInput: unknown): Household =>
  HouseholdSchema.parse(rawInput);

export const parseCommunityGroup = (rawInput: unknown): CommunityGroup =>
  CommunityGroupSchema.parse(rawInput);

export const parseGroupMembership = (rawInput: unknown): GroupMembership =>
  GroupMembershipSchema.parse(rawInput);

export const parseAttendanceRecord = (rawInput: unknown): AttendanceRecord =>
  AttendanceRecordSchema.parse(rawInput);

export const parseCommunicationMessage = (
  rawInput: unknown
): CommunicationMessage => CommunicationMessageSchema.parse(rawInput);

export const parseCommunicationRecipient = (
  rawInput: unknown
): CommunicationRecipient => CommunicationRecipientSchema.parse(rawInput);

export const parseEngagementSummary = (rawInput: unknown): EngagementSummary =>
  EngagementSummarySchema.parse(rawInput);
