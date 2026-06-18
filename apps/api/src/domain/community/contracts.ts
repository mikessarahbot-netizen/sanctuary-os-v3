import { z } from "zod";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import { type AttendanceTally } from "./attendance.js";
import { type ResolvedAudience } from "./audience.js";
import {
  AttendanceStatusSchema,
  CommunicationChannelSchema,
  CommunicationOriginSchema,
  CommunicationStatusSchema,
  ConsentStatusSchema,
  ContactChannelKindSchema,
  EngagementScopeKindSchema,
  GroupKindSchema,
  GroupRoleSchema,
  MemberStatusSchema,
  type AttendanceRecord,
  type CommunicationMessage,
  type CommunicationRecipient,
  type CommunityGroup,
  type EngagementSummary,
  type GroupMembership,
  type Household,
  type Member
} from "./schemas.js";

/**
 * Community+ service operation envelopes + query/command service interfaces.
 *
 * Every operation is an `{ actor, requestId, input }` Zod envelope (mirroring
 * Charts/Play `contracts.ts` exactly) so the GraphQL resolver can parse, the
 * service can authorize against `actor`, and the in-memory/persistence adapters
 * share one validated request shape. The input schemas reuse the slice-1 domain
 * records, enums, and the pure `AudienceDescriptor` shape — they never restate
 * field shapes the schemas already own.
 *
 * Privacy posture (strictest PII surface): no input or interface carries a raw
 * contact value — contact data is an opaque `channelRef` + consent only. The
 * outbound-comms operations carry an explicit human `confirmationIntent`; the
 * service enforces the confirmation gate + consent filter via the pure
 * `message-lifecycle` / `audience` functions before any send-intent is produced.
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const PositiveIntegerSchema = z.number().int().positive();

const CommunityServiceRequestSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

/**
 * The explicit human-confirmation intent that gates outbound comms (mirrors the
 * `removeChartAnnotation` / `removePlayCue` confirmation intent, but for sending
 * communications to people). `reason` is audited; `confirmed` is a literal.
 */
const ConfirmationIntentSchema = z
  .object({
    confirmed: z.literal(true),
    reason: NonEmptyStringSchema
  })
  .strict();

const CustomFieldValueInputSchema = z
  .object({
    fieldRef: NonEmptyStringSchema,
    value: z.string()
  })
  .strict();

const ContactChannelRefInputSchema = z
  .object({
    channelRef: NonEmptyStringSchema,
    consentStatus: ConsentStatusSchema,
    kind: ContactChannelKindSchema
  })
  .strict();

/**
 * The unbranded, client-facing audience descriptor (plain-string refs). Inputs
 * arrive as raw client data; the service brands them when it constructs the
 * `CommunicationMessage` / resolves the audience via the domain schemas — the
 * same plain-input-then-parse posture Charts/Play use for their command inputs.
 */
const AudienceDescriptorInputSchema = z.discriminatedUnion("kind", [
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

export const CommunityMembersFilterSchema = z
  .object({
    householdRef: OptionalNonEmptyStringSchema,
    status: MemberStatusSchema.optional()
  })
  .strict();

export const CommunityGroupsFilterSchema = z
  .object({
    kind: GroupKindSchema.optional()
  })
  .strict();

export const CommunicationMessagesFilterSchema = z
  .object({
    status: CommunicationStatusSchema.optional()
  })
  .strict();

export const EngagementSummariesFilterSchema = z
  .object({
    scopeKind: EngagementScopeKindSchema.optional()
  })
  .strict();

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const ListMembersQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      filter: CommunityMembersFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetMemberQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      memberId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListHouseholdsQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      filter: z.object({}).strict().optional()
    })
    .strict()
}).strict();

export const GetHouseholdQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      householdRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListCommunityGroupsQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      filter: CommunityGroupsFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetCommunityGroupQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      groupId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListGroupMembershipsQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      groupId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListAttendanceRecordsQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      occasionRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const GetAttendanceTallyQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      occasionRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListCommunicationMessagesQuerySchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        filter: CommunicationMessagesFilterSchema.optional()
      })
      .strict()
  }).strict();

export const GetCommunicationMessageQuerySchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

export const ListCommunicationRecipientsQuerySchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

export const ListEngagementSummariesQuerySchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        filter: EngagementSummariesFilterSchema.optional()
      })
      .strict()
  }).strict();

export const GetResolvedAudienceQuerySchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      messageId: NonEmptyStringSchema
    })
    .strict()
}).strict();

// ---------------------------------------------------------------------------
// Commands — people / structure
// ---------------------------------------------------------------------------

export const SaveMemberCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      contactChannelRefs: z.array(ContactChannelRefInputSchema),
      customFieldValues: z.array(CustomFieldValueInputSchema),
      displayName: NonEmptyStringSchema,
      householdRef: OptionalNonEmptyStringSchema,
      memberId: OptionalNonEmptyStringSchema,
      segmentRefs: z.array(NonEmptyStringSchema),
      status: MemberStatusSchema
    })
    .strict()
}).strict();

export const ArchiveMemberCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      confirmationIntent: ConfirmationIntentSchema,
      memberId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SaveHouseholdCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      householdRef: OptionalNonEmptyStringSchema,
      label: NonEmptyStringSchema,
      memberRefs: z.array(NonEmptyStringSchema),
      primaryContactMemberRef: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const SaveCommunityGroupCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      archived: z.boolean(),
      groupId: OptionalNonEmptyStringSchema,
      kind: GroupKindSchema,
      label: NonEmptyStringSchema,
      leaderMemberRef: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const SetGroupMembershipCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      active: z.boolean(),
      groupId: NonEmptyStringSchema,
      memberRef: NonEmptyStringSchema,
      membershipId: OptionalNonEmptyStringSchema,
      roleInGroup: GroupRoleSchema
    })
    .strict()
}).strict();

export const RemoveGroupMembershipCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        confirmationIntent: ConfirmationIntentSchema,
        membershipId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

export const RecordAttendanceCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      headcount: PositiveIntegerSchema.optional(),
      memberRef: OptionalNonEmptyStringSchema,
      occasionRef: NonEmptyStringSchema,
      status: AttendanceStatusSchema.optional()
    })
    .strict()
}).strict();

export const UpdateAttendanceCommandSchema = CommunityServiceRequestSchema.extend({
  input: z
    .object({
      attendanceId: NonEmptyStringSchema,
      headcount: PositiveIntegerSchema.optional(),
      memberRef: OptionalNonEmptyStringSchema,
      occasionRef: NonEmptyStringSchema,
      status: AttendanceStatusSchema.optional()
    })
    .strict()
}).strict();

// ---------------------------------------------------------------------------
// Commands — communications lifecycle (outbound, gated)
// ---------------------------------------------------------------------------

export const DraftCommunicationMessageCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        audience: AudienceDescriptorInputSchema,
        bodyTemplate: NonEmptyStringSchema,
        channel: CommunicationChannelSchema,
        origin: CommunicationOriginSchema,
        subject: OptionalNonEmptyStringSchema
      })
      .strict()
  }).strict();

export const UpdateCommunicationMessageCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        audience: AudienceDescriptorInputSchema.optional(),
        bodyTemplate: OptionalNonEmptyStringSchema,
        messageId: NonEmptyStringSchema,
        subject: OptionalNonEmptyStringSchema
      })
      .strict()
  }).strict();

export const MarkCommunicationReviewedCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

/**
 * The human-confirmation gate. Advancing a message toward send requires an
 * explicit `confirmationIntent` plus a `confirmedByRef`; the service records
 * `confirmedByRef` + `reason` + `confirmedAt` and audits the action. This is the
 * only path that moves a message into `confirmed`, and an `origin = "ai-drafted"`
 * message is bound by the same gate — AI may draft, never self-confirm.
 */
export const ConfirmCommunicationSendCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        confirmationIntent: ConfirmationIntentSchema,
        confirmedByRef: NonEmptyStringSchema,
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

/**
 * Hands the confirmed message + the resolved, consent-filtered audience to the
 * send-integration adapter (a faked `CommunicationSendPort` this slice). Rejects
 * unless the message is already `confirmed`; never invoked by AI.
 */
export const QueueConfirmedCommunicationCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        confirmationIntent: ConfirmationIntentSchema,
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

export const CancelCommunicationMessageCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        confirmationIntent: ConfirmationIntentSchema,
        messageId: NonEmptyStringSchema
      })
      .strict()
  }).strict();

/**
 * AI-assist: request a reviewable AI-drafted communication (slice 10). The
 * service builds the smallest PII-free projection (AI-safe engagement signals +
 * a non-PII audience label + the `aiPolicyProfile`), calls the injected
 * `CommunityAiDraftPort`, Zod-validates the suggestion, and creates a `draft`
 * `CommunicationMessage` with `origin = "ai-drafted"`. That draft is bound by the
 * same human-confirmation gate as any other draft — it can never self-advance
 * past `draft`. The input carries no PII: only the channel, the audience
 * descriptor (refs), non-PII campaign/tone hints, placeholder tokens, forbidden
 * topics, and an optional policy override (which still defaults to PII-free).
 */
export const DraftCommunicationWithAiCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        aiPolicyProfile: z
          .object({
            humanReviewRequiredFor: z.array(NonEmptyStringSchema),
            piiSharingAllowed: z.boolean()
          })
          .strict()
          .optional(),
        audience: AudienceDescriptorInputSchema,
        campaignIntent: NonEmptyStringSchema,
        channel: CommunicationChannelSchema,
        churchToneSummary: NonEmptyStringSchema,
        forbiddenTopics: z.array(NonEmptyStringSchema).default([]),
        requiredPlaceholders: z.array(NonEmptyStringSchema).default([])
      })
      .strict()
  }).strict();

// ---------------------------------------------------------------------------
// Commands — engagement
// ---------------------------------------------------------------------------

export const RecomputeEngagementSummariesCommandSchema =
  CommunityServiceRequestSchema.extend({
    input: z
      .object({
        windowEnd: IsoDateTimeStringSchema,
        windowStart: IsoDateTimeStringSchema
      })
      .strict()
      .superRefine((input, context) => {
        if (input.windowEnd < input.windowStart) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "windowEnd must be greater than or equal to windowStart.",
            path: ["windowEnd"]
          });
        }
      })
  }).strict();

export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>;
export type GetMemberQuery = z.infer<typeof GetMemberQuerySchema>;
export type ListHouseholdsQuery = z.infer<typeof ListHouseholdsQuerySchema>;
export type GetHouseholdQuery = z.infer<typeof GetHouseholdQuerySchema>;
export type ListCommunityGroupsQuery = z.infer<typeof ListCommunityGroupsQuerySchema>;
export type GetCommunityGroupQuery = z.infer<typeof GetCommunityGroupQuerySchema>;
export type ListGroupMembershipsQuery = z.infer<
  typeof ListGroupMembershipsQuerySchema
>;
export type ListAttendanceRecordsQuery = z.infer<
  typeof ListAttendanceRecordsQuerySchema
>;
export type GetAttendanceTallyQuery = z.infer<typeof GetAttendanceTallyQuerySchema>;
export type ListCommunicationMessagesQuery = z.infer<
  typeof ListCommunicationMessagesQuerySchema
>;
export type GetCommunicationMessageQuery = z.infer<
  typeof GetCommunicationMessageQuerySchema
>;
export type ListCommunicationRecipientsQuery = z.infer<
  typeof ListCommunicationRecipientsQuerySchema
>;
export type ListEngagementSummariesQuery = z.infer<
  typeof ListEngagementSummariesQuerySchema
>;
export type GetResolvedAudienceQuery = z.infer<typeof GetResolvedAudienceQuerySchema>;

export type SaveMemberCommand = z.infer<typeof SaveMemberCommandSchema>;
export type ArchiveMemberCommand = z.infer<typeof ArchiveMemberCommandSchema>;
export type SaveHouseholdCommand = z.infer<typeof SaveHouseholdCommandSchema>;
export type SaveCommunityGroupCommand = z.infer<
  typeof SaveCommunityGroupCommandSchema
>;
export type SetGroupMembershipCommand = z.infer<
  typeof SetGroupMembershipCommandSchema
>;
export type RemoveGroupMembershipCommand = z.infer<
  typeof RemoveGroupMembershipCommandSchema
>;
export type RecordAttendanceCommand = z.infer<typeof RecordAttendanceCommandSchema>;
export type UpdateAttendanceCommand = z.infer<typeof UpdateAttendanceCommandSchema>;
export type DraftCommunicationMessageCommand = z.infer<
  typeof DraftCommunicationMessageCommandSchema
>;
export type UpdateCommunicationMessageCommand = z.infer<
  typeof UpdateCommunicationMessageCommandSchema
>;
export type MarkCommunicationReviewedCommand = z.infer<
  typeof MarkCommunicationReviewedCommandSchema
>;
export type ConfirmCommunicationSendCommand = z.infer<
  typeof ConfirmCommunicationSendCommandSchema
>;
export type QueueConfirmedCommunicationCommand = z.infer<
  typeof QueueConfirmedCommunicationCommandSchema
>;
export type CancelCommunicationMessageCommand = z.infer<
  typeof CancelCommunicationMessageCommandSchema
>;
export type DraftCommunicationWithAiCommand = z.infer<
  typeof DraftCommunicationWithAiCommandSchema
>;
export type RecomputeEngagementSummariesCommand = z.infer<
  typeof RecomputeEngagementSummariesCommandSchema
>;

export interface CommunityQueryService {
  readonly listMembers: (query: ListMembersQuery) => Promise<readonly Member[]>;
  readonly getMember: (query: GetMemberQuery) => Promise<Member | null>;
  readonly listHouseholds: (
    query: ListHouseholdsQuery
  ) => Promise<readonly Household[]>;
  readonly getHousehold: (query: GetHouseholdQuery) => Promise<Household | null>;
  readonly listCommunityGroups: (
    query: ListCommunityGroupsQuery
  ) => Promise<readonly CommunityGroup[]>;
  readonly getCommunityGroup: (
    query: GetCommunityGroupQuery
  ) => Promise<CommunityGroup | null>;
  readonly listGroupMemberships: (
    query: ListGroupMembershipsQuery
  ) => Promise<readonly GroupMembership[]>;
  readonly listAttendanceRecords: (
    query: ListAttendanceRecordsQuery
  ) => Promise<readonly AttendanceRecord[]>;
  readonly getAttendanceTally: (
    query: GetAttendanceTallyQuery
  ) => Promise<AttendanceTally>;
  readonly listCommunicationMessages: (
    query: ListCommunicationMessagesQuery
  ) => Promise<readonly CommunicationMessage[]>;
  readonly getCommunicationMessage: (
    query: GetCommunicationMessageQuery
  ) => Promise<CommunicationMessage | null>;
  readonly listCommunicationRecipients: (
    query: ListCommunicationRecipientsQuery
  ) => Promise<readonly CommunicationRecipient[]>;
  readonly listEngagementSummaries: (
    query: ListEngagementSummariesQuery
  ) => Promise<readonly EngagementSummary[]>;
  readonly getResolvedAudience: (
    query: GetResolvedAudienceQuery
  ) => Promise<ResolvedAudience | null>;
}

export interface CommunityCommandService {
  readonly saveMember: (command: SaveMemberCommand) => Promise<Member>;
  readonly archiveMember: (command: ArchiveMemberCommand) => Promise<Member>;
  readonly saveHousehold: (command: SaveHouseholdCommand) => Promise<Household>;
  readonly saveCommunityGroup: (
    command: SaveCommunityGroupCommand
  ) => Promise<CommunityGroup>;
  readonly setGroupMembership: (
    command: SetGroupMembershipCommand
  ) => Promise<GroupMembership>;
  readonly removeGroupMembership: (
    command: RemoveGroupMembershipCommand
  ) => Promise<void>;
  readonly recordAttendance: (
    command: RecordAttendanceCommand
  ) => Promise<AttendanceRecord>;
  readonly updateAttendance: (
    command: UpdateAttendanceCommand
  ) => Promise<AttendanceRecord>;
  readonly draftCommunicationMessage: (
    command: DraftCommunicationMessageCommand
  ) => Promise<CommunicationMessage>;
  readonly updateCommunicationMessage: (
    command: UpdateCommunicationMessageCommand
  ) => Promise<CommunicationMessage>;
  readonly markCommunicationReviewed: (
    command: MarkCommunicationReviewedCommand
  ) => Promise<CommunicationMessage>;
  readonly confirmCommunicationSend: (
    command: ConfirmCommunicationSendCommand
  ) => Promise<CommunicationMessage>;
  readonly queueConfirmedCommunication: (
    command: QueueConfirmedCommunicationCommand
  ) => Promise<CommunicationMessage>;
  readonly cancelCommunicationMessage: (
    command: CancelCommunicationMessageCommand
  ) => Promise<CommunicationMessage>;
  readonly draftCommunicationWithAi: (
    command: DraftCommunicationWithAiCommand
  ) => Promise<CommunicationMessage>;
  readonly recomputeEngagementSummaries: (
    command: RecomputeEngagementSummariesCommand
  ) => Promise<readonly EngagementSummary[]>;
}
