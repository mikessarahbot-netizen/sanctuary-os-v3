import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import {
  ArchiveMemberCommandSchema,
  CancelCommunicationMessageCommandSchema,
  ConfirmCommunicationSendCommandSchema,
  DraftCommunicationMessageCommandSchema,
  GetAttendanceTallyQuerySchema,
  GetCommunicationMessageQuerySchema,
  GetCommunityGroupQuerySchema,
  GetHouseholdQuerySchema,
  GetMemberQuerySchema,
  GetResolvedAudienceQuerySchema,
  ListAttendanceRecordsQuerySchema,
  ListCommunicationMessagesQuerySchema,
  ListCommunicationRecipientsQuerySchema,
  ListCommunityGroupsQuerySchema,
  ListEngagementSummariesQuerySchema,
  ListGroupMembershipsQuerySchema,
  ListHouseholdsQuerySchema,
  ListMembersQuerySchema,
  MarkCommunicationReviewedCommandSchema,
  QueueConfirmedCommunicationCommandSchema,
  RecomputeEngagementSummariesCommandSchema,
  RecordAttendanceCommandSchema,
  RemoveGroupMembershipCommandSchema,
  SaveCommunityGroupCommandSchema,
  SaveHouseholdCommandSchema,
  SaveMemberCommandSchema,
  SetGroupMembershipCommandSchema,
  UpdateAttendanceCommandSchema,
  UpdateCommunicationMessageCommandSchema,
  type AttendanceRecord,
  type AttendanceTally,
  type CommunicationMessage,
  type CommunicationRecipient,
  type CommunityCommandService,
  type CommunityGroup,
  type CommunityQueryService,
  type EngagementSummary,
  type GroupMembership,
  type Household,
  type Member,
  type ResolvedAudience
} from "../domain/community/index.js";

const NonEmptyStringSchema = z.string().min(1);

/**
 * Community+ GraphQL surface (SDL + thin resolvers), merged into the executable
 * schema with `CommunityDomainError.code → extensions.code` mapping (mirrors
 * `charts.ts` / `play.ts`).
 *
 * Privacy posture (strictest PII surface): the `Member` type exposes
 * `contactChannelRefs` (opaque ref + consent) but **no** raw contact value field
 * — there is no `phone`/`email`/`address` scalar on any Community+ type. The
 * outbound-comms mutations carry an explicit `confirmationIntent` (the
 * human-confirmation gate), and `queueConfirmedCommunication` only ever queues an
 * already-confirmed message.
 *
 * Enum values: GraphQL enum value names cannot contain hyphens, so hyphenated
 * Zod enum values (`small-group`, `serving-team`, `co-leader`, `ai-drafted`) are
 * declared with underscores here and mapped back to the hyphenated domain values
 * by the enum value maps registered in `presenter-schema.ts`. Hyphen-free enums
 * pass through unchanged.
 */
export const communityGraphqlTypeDefs = /* GraphQL */ `
  enum MemberStatus {
    active
    inactive
    visitor
    archived
  }

  enum GroupKind {
    small_group
    serving_team
    ministry
    class
    other
  }

  enum GroupRole {
    leader
    co_leader
    member
    guest
  }

  enum AttendanceStatus {
    present
    absent
    excused
  }

  enum CommunicationChannel {
    sms
    email
    push
  }

  enum CommunicationStatus {
    draft
    reviewed
    confirmed
    queued
    sent
    failed
    canceled
  }

  enum CommunicationOrigin {
    human
    ai_drafted
  }

  enum RecipientSendStatus {
    pending
    sent
    delivered
    failed
    suppressed
  }

  enum ContactChannelKind {
    sms
    email
    push
    other
  }

  enum ConsentStatus {
    granted
    denied
    unknown
  }

  enum EngagementScopeKind {
    member
    segment
  }

  type CustomFieldValue {
    fieldRef: ID!
    value: String!
  }

  type ContactChannelRefEntry {
    channelRef: ID!
    consentStatus: ConsentStatus!
    kind: ContactChannelKind!
  }

  type Member {
    contactChannelRefs: [ContactChannelRefEntry!]!
    createdAt: DateTime!
    customFieldValues: [CustomFieldValue!]!
    displayName: String!
    householdRef: ID
    memberId: ID!
    segmentRefs: [ID!]!
    status: MemberStatus!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type Household {
    createdAt: DateTime!
    householdRef: ID!
    label: String!
    memberRefs: [ID!]!
    primaryContactMemberRef: ID
    tenantId: ID!
    updatedAt: DateTime!
  }

  type CommunityGroup {
    archived: Boolean!
    createdAt: DateTime!
    groupId: ID!
    kind: GroupKind!
    label: String!
    leaderMemberRef: ID
    tenantId: ID!
    updatedAt: DateTime!
  }

  type GroupMembership {
    active: Boolean!
    groupId: ID!
    joinedAt: DateTime!
    memberRef: ID!
    membershipId: ID!
    roleInGroup: GroupRole!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type AttendanceRecord {
    attendanceId: ID!
    headcount: Int
    memberRef: ID
    occasionRef: ID!
    recordedAt: DateTime!
    recordedByRef: ID!
    status: AttendanceStatus
    tenantId: ID!
    updatedAt: DateTime!
  }

  type CommunicationConfirmation {
    confirmedAt: DateTime!
    confirmedByRef: ID!
    reason: String!
  }

  type GroupAudienceDescriptor {
    groupId: ID!
  }

  type SegmentAudienceDescriptor {
    segmentRef: ID!
  }

  type ExplicitAudienceDescriptor {
    memberRefs: [ID!]!
  }

  union AudienceDescriptor =
      GroupAudienceDescriptor
    | SegmentAudienceDescriptor
    | ExplicitAudienceDescriptor

  type CommunicationMessage {
    audience: AudienceDescriptor!
    bodyTemplate: String!
    channel: CommunicationChannel!
    confirmation: CommunicationConfirmation
    createdAt: DateTime!
    createdByRef: ID!
    messageId: ID!
    origin: CommunicationOrigin!
    status: CommunicationStatus!
    subject: String
    tenantId: ID!
    updatedAt: DateTime!
  }

  type CommunicationRecipient {
    channelRef: ID!
    failureReason: String
    memberRef: ID!
    messageId: ID!
    recipientId: ID!
    sendStatus: RecipientSendStatus!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type EngagementMemberScope {
    memberRef: ID!
  }

  type EngagementSegmentScope {
    segmentRef: ID!
  }

  union EngagementScope = EngagementMemberScope | EngagementSegmentScope

  type EngagementSummary {
    attendanceStreak: Int!
    commsResponseCount: Int!
    computedAt: DateTime!
    lastPresentOccasionRef: ID
    scope: EngagementScope!
    servingCount: Int!
    summaryId: ID!
    tenantId: ID!
    windowEnd: DateTime!
    windowStart: DateTime!
  }

  type ResolvedRecipient {
    channelRef: ID!
    memberRef: ID!
  }

  type SuppressedRecipient {
    consentStatus: ConsentStatus
    memberRef: ID!
    reason: String!
  }

  type ResolvedAudience {
    channel: CommunicationChannel!
    included: [ResolvedRecipient!]!
    suppressed: [SuppressedRecipient!]!
  }

  type OccasionTally {
    absent: Int!
    anonymousHeadcount: Int!
    excused: Int!
    occasionRef: ID!
    present: Int!
    totalKnown: Int!
    totalReached: Int!
  }

  type AttendanceTally {
    occasions: [OccasionTally!]!
  }

  input CommunityMembersFilterInput {
    householdRef: ID
    status: MemberStatus
  }

  input CommunityGroupsFilterInput {
    kind: GroupKind
  }

  input CommunicationMessagesFilterInput {
    status: CommunicationStatus
  }

  input EngagementSummariesFilterInput {
    scopeKind: EngagementScopeKind
  }

  input CommunityConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input CustomFieldValueInput {
    fieldRef: ID!
    value: String!
  }

  input ContactChannelRefInput {
    channelRef: ID!
    consentStatus: ConsentStatus!
    kind: ContactChannelKind!
  }

  input AudienceDescriptorInput {
    explicitMemberRefs: [ID!]
    groupId: ID
    kind: String!
    segmentRef: ID
  }

  input SaveMemberInput {
    contactChannelRefs: [ContactChannelRefInput!]!
    customFieldValues: [CustomFieldValueInput!]!
    displayName: String!
    householdRef: ID
    memberId: ID
    segmentRefs: [ID!]!
    status: MemberStatus!
  }

  input ArchiveMemberInput {
    confirmationIntent: CommunityConfirmationIntentInput!
    memberId: ID!
  }

  input SaveHouseholdInput {
    householdRef: ID
    label: String!
    memberRefs: [ID!]!
    primaryContactMemberRef: ID
  }

  input SaveCommunityGroupInput {
    archived: Boolean!
    groupId: ID
    kind: GroupKind!
    label: String!
    leaderMemberRef: ID
  }

  input SetGroupMembershipInput {
    active: Boolean!
    groupId: ID!
    memberRef: ID!
    membershipId: ID
    roleInGroup: GroupRole!
  }

  input RemoveGroupMembershipInput {
    confirmationIntent: CommunityConfirmationIntentInput!
    membershipId: ID!
  }

  input RecordAttendanceInput {
    headcount: Int
    memberRef: ID
    occasionRef: ID!
    status: AttendanceStatus
  }

  input UpdateAttendanceInput {
    attendanceId: ID!
    headcount: Int
    memberRef: ID
    occasionRef: ID!
    status: AttendanceStatus
  }

  input DraftCommunicationMessageInput {
    audience: AudienceDescriptorInput!
    bodyTemplate: String!
    channel: CommunicationChannel!
    origin: CommunicationOrigin!
    subject: String
  }

  input UpdateCommunicationMessageInput {
    audience: AudienceDescriptorInput
    bodyTemplate: String
    messageId: ID!
    subject: String
  }

  input MarkCommunicationReviewedInput {
    messageId: ID!
  }

  input ConfirmCommunicationSendInput {
    confirmationIntent: CommunityConfirmationIntentInput!
    confirmedByRef: ID!
    messageId: ID!
  }

  input QueueConfirmedCommunicationInput {
    confirmationIntent: CommunityConfirmationIntentInput!
    messageId: ID!
  }

  input CancelCommunicationMessageInput {
    confirmationIntent: CommunityConfirmationIntentInput!
    messageId: ID!
  }

  input RecomputeEngagementSummariesInput {
    windowEnd: DateTime!
    windowStart: DateTime!
  }

  extend type Query {
    members(filter: CommunityMembersFilterInput): [Member!]!
    member(id: ID!): Member
    households: [Household!]!
    household(id: ID!): Household
    communityGroups(filter: CommunityGroupsFilterInput): [CommunityGroup!]!
    communityGroup(id: ID!): CommunityGroup
    groupMemberships(groupId: ID!): [GroupMembership!]!
    attendanceRecords(occasionRef: ID!): [AttendanceRecord!]!
    attendanceTally(occasionRef: ID!): AttendanceTally!
    communicationMessages(
      filter: CommunicationMessagesFilterInput
    ): [CommunicationMessage!]!
    communicationMessage(id: ID!): CommunicationMessage
    communicationRecipients(messageId: ID!): [CommunicationRecipient!]!
    engagementSummaries(
      filter: EngagementSummariesFilterInput
    ): [EngagementSummary!]!
    resolvedAudience(messageId: ID!): ResolvedAudience
  }

  extend type Mutation {
    saveMember(input: SaveMemberInput!): Member!
    archiveMember(input: ArchiveMemberInput!): Member!
    saveHousehold(input: SaveHouseholdInput!): Household!
    saveCommunityGroup(input: SaveCommunityGroupInput!): CommunityGroup!
    setGroupMembership(input: SetGroupMembershipInput!): GroupMembership!
    removeGroupMembership(input: RemoveGroupMembershipInput!): Boolean!
    recordAttendance(input: RecordAttendanceInput!): AttendanceRecord!
    updateAttendance(input: UpdateAttendanceInput!): AttendanceRecord!
    draftCommunicationMessage(
      input: DraftCommunicationMessageInput!
    ): CommunicationMessage!
    updateCommunicationMessage(
      input: UpdateCommunicationMessageInput!
    ): CommunicationMessage!
    markCommunicationReviewed(
      input: MarkCommunicationReviewedInput!
    ): CommunicationMessage!
    confirmCommunicationSend(
      input: ConfirmCommunicationSendInput!
    ): CommunicationMessage!
    queueConfirmedCommunication(
      input: QueueConfirmedCommunicationInput!
    ): CommunicationMessage!
    cancelCommunicationMessage(
      input: CancelCommunicationMessageInput!
    ): CommunicationMessage!
    recomputeEngagementSummaries(
      input: RecomputeEngagementSummariesInput!
    ): [EngagementSummary!]!
  }
`;

export const CommunityGraphqlContextSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

const GraphqlInputArgsSchema = z
  .object({
    input: z.unknown()
  })
  .strict();

const AudienceDescriptorInputSchema = z
  .object({
    explicitMemberRefs: z.array(NonEmptyStringSchema).optional(),
    groupId: NonEmptyStringSchema.optional(),
    kind: z.enum(["group", "segment", "explicit"]),
    segmentRef: NonEmptyStringSchema.optional()
  })
  .strict();

export type CommunityGraphqlContext = z.infer<typeof CommunityGraphqlContextSchema>;

export interface CommunityGraphqlResolverDependencies {
  readonly communityCommandService: CommunityCommandService;
  readonly communityQueryService: CommunityQueryService;
}

export interface CommunityQueryResolvers {
  readonly members: GraphqlResolver<readonly Member[]>;
  readonly member: GraphqlResolver<Member | null>;
  readonly households: GraphqlResolver<readonly Household[]>;
  readonly household: GraphqlResolver<Household | null>;
  readonly communityGroups: GraphqlResolver<readonly CommunityGroup[]>;
  readonly communityGroup: GraphqlResolver<CommunityGroup | null>;
  readonly groupMemberships: GraphqlResolver<readonly GroupMembership[]>;
  readonly attendanceRecords: GraphqlResolver<readonly AttendanceRecord[]>;
  readonly attendanceTally: GraphqlResolver<AttendanceTally>;
  readonly communicationMessages: GraphqlResolver<readonly CommunicationMessage[]>;
  readonly communicationMessage: GraphqlResolver<CommunicationMessage | null>;
  readonly communicationRecipients: GraphqlResolver<
    readonly CommunicationRecipient[]
  >;
  readonly engagementSummaries: GraphqlResolver<readonly EngagementSummary[]>;
  readonly resolvedAudience: GraphqlResolver<ResolvedAudience | null>;
}

export interface CommunityMutationResolvers {
  readonly saveMember: GraphqlResolver<Member>;
  readonly archiveMember: GraphqlResolver<Member>;
  readonly saveHousehold: GraphqlResolver<Household>;
  readonly saveCommunityGroup: GraphqlResolver<CommunityGroup>;
  readonly setGroupMembership: GraphqlResolver<GroupMembership>;
  readonly removeGroupMembership: GraphqlResolver<boolean>;
  readonly recordAttendance: GraphqlResolver<AttendanceRecord>;
  readonly updateAttendance: GraphqlResolver<AttendanceRecord>;
  readonly draftCommunicationMessage: GraphqlResolver<CommunicationMessage>;
  readonly updateCommunicationMessage: GraphqlResolver<CommunicationMessage>;
  readonly markCommunicationReviewed: GraphqlResolver<CommunicationMessage>;
  readonly confirmCommunicationSend: GraphqlResolver<CommunicationMessage>;
  readonly queueConfirmedCommunication: GraphqlResolver<CommunicationMessage>;
  readonly cancelCommunicationMessage: GraphqlResolver<CommunicationMessage>;
  readonly recomputeEngagementSummaries: GraphqlResolver<readonly EngagementSummary[]>;
}

export interface CommunityTypeResolvers {
  readonly AudienceDescriptor: {
    readonly __resolveType: (value: unknown) => string | null;
  };
  readonly EngagementScope: {
    readonly __resolveType: (value: unknown) => string | null;
  };
}

export interface CommunityGraphqlResolvers {
  readonly AudienceDescriptor: CommunityTypeResolvers["AudienceDescriptor"];
  readonly EngagementScope: CommunityTypeResolvers["EngagementScope"];
  readonly Mutation: CommunityMutationResolvers;
  readonly Query: CommunityQueryResolvers;
}

type GraphqlResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: CommunityGraphqlContext
) => Promise<TResult>;

const audienceInputToDescriptor = (
  rawAudience: unknown
): { kind: "group"; groupId: string }
  | { kind: "segment"; segmentRef: string }
  | { kind: "explicit"; memberRefs: readonly string[] } => {
  const audience = AudienceDescriptorInputSchema.parse(rawAudience);

  switch (audience.kind) {
    case "group": {
      if (audience.groupId === undefined) {
        throw new Error("A group audience requires a groupId.");
      }

      return { groupId: audience.groupId, kind: "group" };
    }

    case "segment": {
      if (audience.segmentRef === undefined) {
        throw new Error("A segment audience requires a segmentRef.");
      }

      return { kind: "segment", segmentRef: audience.segmentRef };
    }

    case "explicit": {
      return { kind: "explicit", memberRefs: audience.explicitMemberRefs ?? [] };
    }
  }
};

export const createCommunityGraphqlResolvers = (
  dependencies: CommunityGraphqlResolverDependencies
): CommunityGraphqlResolvers => ({
  AudienceDescriptor: {
    __resolveType: (value): string | null => {
      if (typeof value !== "object" || value === null) {
        return null;
      }

      if ("groupId" in value) {
        return "GroupAudienceDescriptor";
      }

      if ("segmentRef" in value) {
        return "SegmentAudienceDescriptor";
      }

      if ("memberRefs" in value) {
        return "ExplicitAudienceDescriptor";
      }

      return null;
    }
  },

  EngagementScope: {
    __resolveType: (value): string | null => {
      if (typeof value !== "object" || value === null) {
        return null;
      }

      if ("memberRef" in value) {
        return "EngagementMemberScope";
      }

      if ("segmentRef" in value) {
        return "EngagementSegmentScope";
      }

      return null;
    }
  },

  Mutation: {
    saveMember: async (_parent, args, context): Promise<Member> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.saveMember(
        SaveMemberCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    archiveMember: async (_parent, args, context): Promise<Member> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.archiveMember(
        ArchiveMemberCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    saveHousehold: async (_parent, args, context): Promise<Household> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.saveHousehold(
        SaveHouseholdCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    saveCommunityGroup: async (_parent, args, context): Promise<CommunityGroup> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.saveCommunityGroup(
        SaveCommunityGroupCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    setGroupMembership: async (_parent, args, context): Promise<GroupMembership> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.setGroupMembership(
        SetGroupMembershipCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    removeGroupMembership: async (_parent, args, context): Promise<boolean> => {
      const graphqlContext = parseContext(context);

      await dependencies.communityCommandService.removeGroupMembership(
        RemoveGroupMembershipCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );

      return true;
    },

    recordAttendance: async (_parent, args, context): Promise<AttendanceRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.recordAttendance(
        RecordAttendanceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateAttendance: async (_parent, args, context): Promise<AttendanceRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.updateAttendance(
        UpdateAttendanceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    draftCommunicationMessage: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);
      const input = parseInputObject(args);

      return dependencies.communityCommandService.draftCommunicationMessage(
        DraftCommunicationMessageCommandSchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...input,
            audience: audienceInputToDescriptor(input["audience"])
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    updateCommunicationMessage: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);
      const input = parseInputObject(args);

      return dependencies.communityCommandService.updateCommunicationMessage(
        UpdateCommunicationMessageCommandSchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...input,
            ...(input["audience"] !== undefined
              ? { audience: audienceInputToDescriptor(input["audience"]) }
              : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    markCommunicationReviewed: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.markCommunicationReviewed(
        MarkCommunicationReviewedCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    confirmCommunicationSend: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.confirmCommunicationSend(
        ConfirmCommunicationSendCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    queueConfirmedCommunication: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.queueConfirmedCommunication(
        QueueConfirmedCommunicationCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    cancelCommunicationMessage: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.cancelCommunicationMessage(
        CancelCommunicationMessageCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    recomputeEngagementSummaries: async (
      _parent,
      args,
      context
    ): Promise<readonly EngagementSummary[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityCommandService.recomputeEngagementSummaries(
        RecomputeEngagementSummariesCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Query: {
    members: async (_parent, args, context): Promise<readonly Member[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.communityQueryService.listMembers(
        ListMembersQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    member: async (_parent, args, context): Promise<Member | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseIdArgs(args);

      return dependencies.communityQueryService.getMember(
        GetMemberQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { memberId: queryArgs.id },
          requestId: graphqlContext.requestId
        })
      );
    },

    households: async (_parent, args, context): Promise<readonly Household[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.communityQueryService.listHouseholds(
        ListHouseholdsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {},
          requestId: graphqlContext.requestId
        })
      );
    },

    household: async (_parent, args, context): Promise<Household | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseIdArgs(args);

      return dependencies.communityQueryService.getHousehold(
        GetHouseholdQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { householdRef: queryArgs.id },
          requestId: graphqlContext.requestId
        })
      );
    },

    communityGroups: async (
      _parent,
      args,
      context
    ): Promise<readonly CommunityGroup[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.communityQueryService.listCommunityGroups(
        ListCommunityGroupsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    communityGroup: async (
      _parent,
      args,
      context
    ): Promise<CommunityGroup | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseIdArgs(args);

      return dependencies.communityQueryService.getCommunityGroup(
        GetCommunityGroupQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { groupId: queryArgs.id },
          requestId: graphqlContext.requestId
        })
      );
    },

    groupMemberships: async (
      _parent,
      args,
      context
    ): Promise<readonly GroupMembership[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({ groupId: NonEmptyStringSchema })
        .strict()
        .parse(args);

      return dependencies.communityQueryService.listGroupMemberships(
        ListGroupMembershipsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { groupId: queryArgs.groupId },
          requestId: graphqlContext.requestId
        })
      );
    },

    attendanceRecords: async (
      _parent,
      args,
      context
    ): Promise<readonly AttendanceRecord[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseOccasionArgs(args);

      return dependencies.communityQueryService.listAttendanceRecords(
        ListAttendanceRecordsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { occasionRef: queryArgs.occasionRef },
          requestId: graphqlContext.requestId
        })
      );
    },

    attendanceTally: async (
      _parent,
      args,
      context
    ): Promise<AttendanceTally> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseOccasionArgs(args);

      return dependencies.communityQueryService.getAttendanceTally(
        GetAttendanceTallyQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { occasionRef: queryArgs.occasionRef },
          requestId: graphqlContext.requestId
        })
      );
    },

    communicationMessages: async (
      _parent,
      args,
      context
    ): Promise<readonly CommunicationMessage[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.communityQueryService.listCommunicationMessages(
        ListCommunicationMessagesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    communicationMessage: async (
      _parent,
      args,
      context
    ): Promise<CommunicationMessage | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseIdArgs(args);

      return dependencies.communityQueryService.getCommunicationMessage(
        GetCommunicationMessageQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { messageId: queryArgs.id },
          requestId: graphqlContext.requestId
        })
      );
    },

    communicationRecipients: async (
      _parent,
      args,
      context
    ): Promise<readonly CommunicationRecipient[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({ messageId: NonEmptyStringSchema })
        .strict()
        .parse(args);

      return dependencies.communityQueryService.listCommunicationRecipients(
        ListCommunicationRecipientsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { messageId: queryArgs.messageId },
          requestId: graphqlContext.requestId
        })
      );
    },

    engagementSummaries: async (
      _parent,
      args,
      context
    ): Promise<readonly EngagementSummary[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.communityQueryService.listEngagementSummaries(
        ListEngagementSummariesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    resolvedAudience: async (
      _parent,
      args,
      context
    ): Promise<ResolvedAudience | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({ messageId: NonEmptyStringSchema })
        .strict()
        .parse(args);

      return dependencies.communityQueryService.getResolvedAudience(
        GetResolvedAudienceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { messageId: queryArgs.messageId },
          requestId: graphqlContext.requestId
        })
      );
    }
  }
});

const parseContext = (context: CommunityGraphqlContext): CommunityGraphqlContext =>
  CommunityGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;

const parseInputObject = (args: unknown): Record<string, unknown> =>
  z.record(z.unknown()).parse(GraphqlInputArgsSchema.parse(args).input);

const parseFilterArgs = (
  args: unknown
): { filter?: unknown } =>
  z.object({ filter: z.unknown().optional() }).strict().parse(args);

const parseIdArgs = (args: unknown): { id: string } =>
  z.object({ id: NonEmptyStringSchema }).strict().parse(args);

const parseOccasionArgs = (args: unknown): { occasionRef: string } =>
  z.object({ occasionRef: NonEmptyStringSchema }).strict().parse(args);
