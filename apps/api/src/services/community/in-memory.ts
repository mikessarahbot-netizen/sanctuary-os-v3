import type { AuthenticatedActor } from "../../auth/index.js";
import type { ApiEventEnvelope, EventPublisher } from "../../events/index.js";
import {
  ArchiveMemberCommandSchema,
  AttendanceRecordSchema,
  CancelCommunicationMessageCommandSchema,
  CommunicationConfirmationSchema,
  CommunicationMessageSchema,
  CommunicationRecipientSchema,
  CommunityDomainError,
  CommunityGroupSchema,
  ConfirmCommunicationSendCommandSchema,
  DraftCommunicationMessageCommandSchema,
  DraftCommunicationWithAiCommandSchema,
  EngagementSummarySchema,
  GetAttendanceTallyQuerySchema,
  GetCommunicationMessageQuerySchema,
  GetCommunityGroupQuerySchema,
  GetHouseholdQuerySchema,
  GetMemberQuerySchema,
  GetResolvedAudienceQuerySchema,
  GroupMembershipSchema,
  HouseholdSchema,
  ListAttendanceRecordsQuerySchema,
  ListCommunicationMessagesQuerySchema,
  ListCommunicationRecipientsQuerySchema,
  ListCommunityGroupsQuerySchema,
  ListEngagementSummariesQuerySchema,
  ListGroupMembershipsQuerySchema,
  ListHouseholdsQuerySchema,
  ListMembersQuerySchema,
  MarkCommunicationReviewedCommandSchema,
  MemberSchema,
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
  applyMessageTransition,
  resolveAudience,
  rollupEngagement,
  tallyAttendance,
  type AttendanceRecord,
  type AttendanceTally,
  type CommunicationConfirmation,
  type CommunicationMessage,
  type CommunicationRecipient,
  type CommunityCommandService,
  type CommunityGroup,
  type CommunityQueryService,
  type EngagementSummary,
  type GroupMembership,
  type Household,
  type Member,
  type MessageTransition,
  type ResolvedAudience
} from "../../domain/community/index.js";
import {
  CommunityAiDraftSuggestionSchema,
  buildCommunityAiDraftPrompt,
  type CommunityAiDraftPort,
  type CommunityAiPolicyProfile
} from "./ai-draft.js";

/**
 * In-memory Community+ service adapter — the slice-5 test double.
 *
 * Implements both `CommunityQueryService` and `CommunityCommandService` over
 * per-tenant in-memory maps, mirroring the Charts/Play in-memory adapters: Zod
 * validation on every operation, an injected clock + id generators, role checks,
 * tenant isolation, and typed `CommunityDomainError`s.
 *
 * Community+ is the strictest PII surface, so the communications path enforces
 * two structural gates by delegating to the pure domain functions:
 *   - **Consent suppression** — `queueConfirmedCommunication` (and the
 *     `resolvedAudience` preview) build recipients via the pure `resolveAudience`
 *     resolver, which drops non-consented channels and flags them `suppressed`.
 *   - **Human-confirmation gate** — every lifecycle move runs through the pure
 *     `applyMessageTransition` state machine. Advancing toward send requires a
 *     human `confirmation`; an `origin = "ai-drafted"` message is bound by the
 *     same gate and can never self-advance past `draft`. AI may draft, never send.
 *
 * The actual carrier send is isolated behind an injected `CommunicationSendPort`
 * (a fake this slice; the real Twilio/email adapter is slice 11) — the service
 * only orchestrates, validates, clocks, audits, and stores the returned status.
 */
const communityQueryRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
] as const;

const communityCommandRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner"
] as const;

const communityCommsRoles = [
  "super_admin",
  "church_admin",
  "worship_leader"
] as const;

/**
 * Per-recipient send outcome returned by the integration adapter. Holds only a
 * `channelRef` (never a contact value) and a redacted, PII-free `failureReason`.
 */
export interface CommunicationSendResult {
  readonly channelRef: string;
  readonly failureReason?: string;
  readonly memberRef: string;
  readonly sendStatus: "sent" | "delivered" | "failed";
}

export interface CommunicationSendRequestRecipient {
  readonly channelRef: string;
  readonly memberRef: string;
}

export interface CommunicationSendRequest {
  readonly channel: CommunicationMessage["channel"];
  readonly messageId: string;
  readonly recipients: readonly CommunicationSendRequestRecipient[];
  readonly tenantId: string;
}

/**
 * The send-integration boundary. Community+ produces a confirmed, consent-
 * filtered send-intent and hands it to this port; an adapter (Twilio/email,
 * slice 11) realizes the carrier send and reports per-recipient status back.
 * Community+ never holds carrier credentials and never auto-sends.
 */
export interface CommunicationSendPort {
  readonly send: (
    request: CommunicationSendRequest
  ) => Promise<readonly CommunicationSendResult[]>;
}

export interface InMemoryCommunityServiceSeed {
  readonly attendanceRecords?: readonly AttendanceRecord[];
  readonly communicationMessages?: readonly CommunicationMessage[];
  readonly communicationRecipients?: readonly CommunicationRecipient[];
  readonly communityGroups?: readonly CommunityGroup[];
  readonly engagementSummaries?: readonly EngagementSummary[];
  readonly groupMemberships?: readonly GroupMembership[];
  readonly households?: readonly Household[];
  readonly members?: readonly Member[];
}

export interface InMemoryCommunityServiceIds {
  readonly attendanceId: () => string;
  readonly householdRef: () => string;
  readonly groupId: () => string;
  readonly memberId: () => string;
  readonly membershipId: () => string;
  readonly messageId: () => string;
  readonly recipientId: () => string;
}

export interface InMemoryCommunityServiceDependencies {
  readonly aiDraftPort?: CommunityAiDraftPort;
  readonly clock?: () => string;
  readonly eventPublisher?: EventPublisher;
  readonly ids?: Partial<InMemoryCommunityServiceIds>;
  readonly sendPort?: CommunicationSendPort;
  readonly seed?: InMemoryCommunityServiceSeed;
}

/**
 * Default AI policy profile when a caller omits one: the safest posture. PII is
 * never shared and human review is required for AI-drafted comms. The comms-draft
 * projection is PII-free regardless, so this only governs the policy echoed to the
 * prompt.
 */
const DEFAULT_PII_FREE_AI_POLICY: CommunityAiPolicyProfile = {
  humanReviewRequiredFor: ["ai-drafted-communication"],
  piiSharingAllowed: false
};

export interface InMemoryCommunityServicesAdapter {
  readonly commandService: CommunityCommandService;
  readonly queryService: CommunityQueryService;
  readonly readAttendanceRecords: () => readonly AttendanceRecord[];
  readonly readCommunicationMessages: () => readonly CommunicationMessage[];
  readonly readCommunicationRecipients: () => readonly CommunicationRecipient[];
  readonly readCommunityGroups: () => readonly CommunityGroup[];
  readonly readEngagementSummaries: () => readonly EngagementSummary[];
  readonly readGroupMemberships: () => readonly GroupMembership[];
  readonly readHouseholds: () => readonly Household[];
  readonly readMembers: () => readonly Member[];
}

const scopedKey = (tenantId: string, id: string): string => `${tenantId}::${id}`;

/**
 * Default fake send port: every requested recipient is reported `sent`. Replaced
 * by the real carrier adapter in slice 11; this keeps the queue path exercisable
 * with no network and no credentials.
 */
const defaultSendPort: CommunicationSendPort = {
  send: (request): Promise<readonly CommunicationSendResult[]> =>
    Promise.resolve(
      request.recipients.map((recipient) => ({
        channelRef: recipient.channelRef,
        memberRef: recipient.memberRef,
        sendStatus: "sent" as const
      }))
    )
};

export const createInMemoryCommunityServicesAdapter = (
  dependencies: InMemoryCommunityServiceDependencies = {}
): InMemoryCommunityServicesAdapter => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const eventPublisher = dependencies.eventPublisher;
  const ids = createCommunityIds(dependencies.ids);
  const sendPort = dependencies.sendPort ?? defaultSendPort;
  const aiDraftPort = dependencies.aiDraftPort;

  const members = new Map<string, Member>();
  const households = new Map<string, Household>();
  const groups = new Map<string, CommunityGroup>();
  const memberships = new Map<string, GroupMembership>();
  const attendance = new Map<string, AttendanceRecord>();
  const messages = new Map<string, CommunicationMessage>();
  const recipients = new Map<string, CommunicationRecipient>();
  const summaries = new Map<string, EngagementSummary>();

  dependencies.seed?.members?.forEach((member) => {
    const parsed = MemberSchema.parse(member);
    members.set(scopedKey(parsed.tenantId, parsed.memberId), parsed);
  });
  dependencies.seed?.households?.forEach((household) => {
    const parsed = HouseholdSchema.parse(household);
    households.set(scopedKey(parsed.tenantId, parsed.householdRef), parsed);
  });
  dependencies.seed?.communityGroups?.forEach((group) => {
    const parsed = CommunityGroupSchema.parse(group);
    groups.set(scopedKey(parsed.tenantId, parsed.groupId), parsed);
  });
  dependencies.seed?.groupMemberships?.forEach((membership) => {
    const parsed = GroupMembershipSchema.parse(membership);
    memberships.set(scopedKey(parsed.tenantId, parsed.membershipId), parsed);
  });
  dependencies.seed?.attendanceRecords?.forEach((record) => {
    const parsed = AttendanceRecordSchema.parse(record);
    attendance.set(scopedKey(parsed.tenantId, parsed.attendanceId), parsed);
  });
  dependencies.seed?.communicationMessages?.forEach((message) => {
    const parsed = CommunicationMessageSchema.parse(message);
    messages.set(scopedKey(parsed.tenantId, parsed.messageId), parsed);
  });
  dependencies.seed?.communicationRecipients?.forEach((recipient) => {
    const parsed = CommunicationRecipientSchema.parse(recipient);
    recipients.set(scopedKey(parsed.tenantId, parsed.recipientId), parsed);
  });
  dependencies.seed?.engagementSummaries?.forEach((summary) => {
    const parsed = EngagementSummarySchema.parse(summary);
    summaries.set(scopedKey(parsed.tenantId, parsed.summaryId), parsed);
  });

  const tenantMembers = (tenantId: string): Member[] =>
    [...members.values()].filter((member) => member.tenantId === tenantId);

  const tenantMemberships = (tenantId: string): GroupMembership[] =>
    [...memberships.values()].filter(
      (membership) => membership.tenantId === tenantId
    );

  const requireMessage = (
    messageId: string,
    actor: AuthenticatedActor
  ): CommunicationMessage => {
    const message = messages.get(scopedKey(actor.tenantId, messageId));

    if (message === undefined) {
      throw new CommunityDomainError(
        "MESSAGE_NOT_FOUND",
        "This communication message is no longer available on the server."
      );
    }

    return message;
  };

  const advanceMessage = async (
    actor: AuthenticatedActor,
    requestId: string,
    message: CommunicationMessage,
    transition: MessageTransition,
    confirmation?: CommunicationConfirmation
  ): Promise<CommunicationMessage> => {
    const result = applyMessageTransition(message, transition, confirmation);

    if (!result.ok) {
      const code =
        result.error.code === "CONFIRMATION_REQUIRED"
          ? "CONFIRMATION_REQUIRED"
          : "INVALID_LIFECYCLE_TRANSITION";

      throw new CommunityDomainError(code, result.error.safeMessage);
    }

    const stored = CommunicationMessageSchema.parse({
      ...result.message,
      updatedAt: clock()
    });
    messages.set(scopedKey(stored.tenantId, stored.messageId), stored);

    await publishCommunityEvents(eventPublisher, [
      createCommunityCommunicationStatusChangedEvent({
        actor,
        message: stored,
        occurredAt: stored.updatedAt,
        requestId
      })
    ]);

    return stored;
  };

  const resolveAudienceForMessage = (
    message: CommunicationMessage
  ): ResolvedAudience =>
    resolveAudience(
      message.audience,
      message.channel,
      tenantMembers(message.tenantId),
      tenantMemberships(message.tenantId)
    );

  /**
   * The opaque vault `channelRef` of a member's first contact channel matching
   * the message kind (regardless of consent), used to record a `suppressed`
   * recipient row for a consent-blocked member. Returns `undefined` when the
   * member has no channel of the kind (so no recipient row is recorded). Never
   * returns a contact value — `channelRef` is an opaque reference.
   */
  const channelRefForKind = (
    tenantId: string,
    memberRef: string,
    channel: CommunicationMessage["channel"]
  ): string | undefined => {
    const member = members.get(scopedKey(tenantId, memberRef));

    return member?.contactChannelRefs.find((entry) => entry.kind === channel)
      ?.channelRef;
  };

  const queryService: CommunityQueryService = {
    listMembers: (rawQuery): Promise<readonly Member[]> =>
      runCommunityOperation((): readonly Member[] => {
        const query = ListMembersQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const filter = query.input.filter;

        return tenantMembers(query.actor.tenantId).filter(
          (member) =>
            (filter?.status === undefined || member.status === filter.status) &&
            (filter?.householdRef === undefined ||
              member.householdRef === filter.householdRef)
        );
      }),

    getMember: (rawQuery): Promise<Member | null> =>
      runCommunityOperation((): Member | null => {
        const query = GetMemberQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const member = members.get(
          scopedKey(query.actor.tenantId, query.input.memberId)
        );

        return member ?? null;
      }),

    listHouseholds: (rawQuery): Promise<readonly Household[]> =>
      runCommunityOperation((): readonly Household[] => {
        const query = ListHouseholdsQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);

        return [...households.values()].filter(
          (household) => household.tenantId === query.actor.tenantId
        );
      }),

    getHousehold: (rawQuery): Promise<Household | null> =>
      runCommunityOperation((): Household | null => {
        const query = GetHouseholdQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const household = households.get(
          scopedKey(query.actor.tenantId, query.input.householdRef)
        );

        return household ?? null;
      }),

    listCommunityGroups: (rawQuery): Promise<readonly CommunityGroup[]> =>
      runCommunityOperation((): readonly CommunityGroup[] => {
        const query = ListCommunityGroupsQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const filter = query.input.filter;

        return [...groups.values()].filter(
          (group) =>
            group.tenantId === query.actor.tenantId &&
            (filter?.kind === undefined || group.kind === filter.kind)
        );
      }),

    getCommunityGroup: (rawQuery): Promise<CommunityGroup | null> =>
      runCommunityOperation((): CommunityGroup | null => {
        const query = GetCommunityGroupQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const group = groups.get(
          scopedKey(query.actor.tenantId, query.input.groupId)
        );

        return group ?? null;
      }),

    listGroupMemberships: (rawQuery): Promise<readonly GroupMembership[]> =>
      runCommunityOperation((): readonly GroupMembership[] => {
        const query = ListGroupMembershipsQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);

        return tenantMemberships(query.actor.tenantId).filter(
          (membership) => membership.groupId === query.input.groupId
        );
      }),

    listAttendanceRecords: (rawQuery): Promise<readonly AttendanceRecord[]> =>
      runCommunityOperation((): readonly AttendanceRecord[] => {
        const query = ListAttendanceRecordsQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);

        return [...attendance.values()].filter(
          (record) =>
            record.tenantId === query.actor.tenantId &&
            record.occasionRef === query.input.occasionRef
        );
      }),

    getAttendanceTally: (rawQuery): Promise<AttendanceTally> =>
      runCommunityOperation((): AttendanceTally => {
        const query = GetAttendanceTallyQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const occasionRecords = [...attendance.values()].filter(
          (record) =>
            record.tenantId === query.actor.tenantId &&
            record.occasionRef === query.input.occasionRef
        );

        return tallyAttendance(occasionRecords);
      }),

    listCommunicationMessages: (rawQuery): Promise<readonly CommunicationMessage[]> =>
      runCommunityOperation((): readonly CommunicationMessage[] => {
        const query = ListCommunicationMessagesQuerySchema.parse(rawQuery);
        assertCommunityCommsRole(query.actor);
        const filter = query.input.filter;

        return [...messages.values()].filter(
          (message) =>
            message.tenantId === query.actor.tenantId &&
            (filter?.status === undefined || message.status === filter.status)
        );
      }),

    getCommunicationMessage: (rawQuery): Promise<CommunicationMessage | null> =>
      runCommunityOperation((): CommunicationMessage | null => {
        const query = GetCommunicationMessageQuerySchema.parse(rawQuery);
        assertCommunityCommsRole(query.actor);
        const message = messages.get(
          scopedKey(query.actor.tenantId, query.input.messageId)
        );

        return message ?? null;
      }),

    listCommunicationRecipients: (
      rawQuery
    ): Promise<readonly CommunicationRecipient[]> =>
      runCommunityOperation((): readonly CommunicationRecipient[] => {
        const query = ListCommunicationRecipientsQuerySchema.parse(rawQuery);
        assertCommunityCommsRole(query.actor);

        return [...recipients.values()].filter(
          (recipient) =>
            recipient.tenantId === query.actor.tenantId &&
            recipient.messageId === query.input.messageId
        );
      }),

    listEngagementSummaries: (rawQuery): Promise<readonly EngagementSummary[]> =>
      runCommunityOperation((): readonly EngagementSummary[] => {
        const query = ListEngagementSummariesQuerySchema.parse(rawQuery);
        assertCommunityQueryRole(query.actor);
        const filter = query.input.filter;

        return [...summaries.values()].filter(
          (summary) =>
            summary.tenantId === query.actor.tenantId &&
            (filter?.scopeKind === undefined ||
              summary.scope.kind === filter.scopeKind)
        );
      }),

    getResolvedAudience: (rawQuery): Promise<ResolvedAudience | null> =>
      runCommunityOperation((): ResolvedAudience | null => {
        const query = GetResolvedAudienceQuerySchema.parse(rawQuery);
        assertCommunityCommsRole(query.actor);
        const message = messages.get(
          scopedKey(query.actor.tenantId, query.input.messageId)
        );

        if (message === undefined) {
          return null;
        }

        return resolveAudienceForMessage(message);
      })
  };

  const commandService: CommunityCommandService = {
    saveMember: (rawCommand): Promise<Member> =>
      runCommunityOperation(async (): Promise<Member> => {
        const command = SaveMemberCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const now = clock();
        const memberId = command.input.memberId ?? ids.memberId();
        const existing = members.get(scopedKey(command.actor.tenantId, memberId));

        const member = MemberSchema.parse({
          contactChannelRefs: command.input.contactChannelRefs,
          createdAt: existing?.createdAt ?? now,
          customFieldValues: command.input.customFieldValues,
          displayName: command.input.displayName,
          memberId,
          segmentRefs: command.input.segmentRefs,
          status: command.input.status,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.householdRef !== undefined
            ? { householdRef: command.input.householdRef }
            : {})
        });
        members.set(scopedKey(member.tenantId, member.memberId), member);

        await publishCommunityEvents(eventPublisher, [
          createCommunityMemberUpdatedEvent({
            actor: command.actor,
            changeKind: existing === undefined ? "created" : "updated",
            member,
            occurredAt: member.updatedAt,
            requestId: command.requestId
          })
        ]);

        return member;
      }),

    archiveMember: (rawCommand): Promise<Member> =>
      runCommunityOperation(async (): Promise<Member> => {
        const command = ArchiveMemberCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const existing = members.get(
          scopedKey(command.actor.tenantId, command.input.memberId)
        );

        if (existing === undefined) {
          throw new CommunityDomainError(
            "MEMBER_NOT_FOUND",
            "This member is no longer available on the server."
          );
        }

        const member = MemberSchema.parse({
          ...existing,
          status: "archived",
          updatedAt: clock()
        });
        members.set(scopedKey(member.tenantId, member.memberId), member);

        await publishCommunityEvents(eventPublisher, [
          createCommunityMemberUpdatedEvent({
            actor: command.actor,
            changeKind: "archived",
            member,
            occurredAt: member.updatedAt,
            requestId: command.requestId
          })
        ]);

        return member;
      }),

    saveHousehold: (rawCommand): Promise<Household> =>
      runCommunityOperation((): Household => {
        const command = SaveHouseholdCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const now = clock();
        const householdRef = command.input.householdRef ?? ids.householdRef();
        const existing = households.get(
          scopedKey(command.actor.tenantId, householdRef)
        );

        const household = HouseholdSchema.parse({
          createdAt: existing?.createdAt ?? now,
          householdRef,
          label: command.input.label,
          memberRefs: command.input.memberRefs,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.primaryContactMemberRef !== undefined
            ? { primaryContactMemberRef: command.input.primaryContactMemberRef }
            : {})
        });
        households.set(scopedKey(household.tenantId, household.householdRef), household);

        return household;
      }),

    saveCommunityGroup: (rawCommand): Promise<CommunityGroup> =>
      runCommunityOperation((): CommunityGroup => {
        const command = SaveCommunityGroupCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const now = clock();
        const groupId = command.input.groupId ?? ids.groupId();
        const existing = groups.get(scopedKey(command.actor.tenantId, groupId));

        const group = CommunityGroupSchema.parse({
          archived: command.input.archived,
          createdAt: existing?.createdAt ?? now,
          groupId,
          kind: command.input.kind,
          label: command.input.label,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.leaderMemberRef !== undefined
            ? { leaderMemberRef: command.input.leaderMemberRef }
            : {})
        });
        groups.set(scopedKey(group.tenantId, group.groupId), group);

        return group;
      }),

    setGroupMembership: (rawCommand): Promise<GroupMembership> =>
      runCommunityOperation((): GroupMembership => {
        const command = SetGroupMembershipCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const now = clock();
        const membershipId = command.input.membershipId ?? ids.membershipId();
        const existing = memberships.get(
          scopedKey(command.actor.tenantId, membershipId)
        );

        const membership = GroupMembershipSchema.parse({
          active: command.input.active,
          groupId: command.input.groupId,
          joinedAt: existing?.joinedAt ?? now,
          memberRef: command.input.memberRef,
          membershipId,
          roleInGroup: command.input.roleInGroup,
          tenantId: command.actor.tenantId,
          updatedAt: now
        });
        memberships.set(
          scopedKey(membership.tenantId, membership.membershipId),
          membership
        );

        return membership;
      }),

    removeGroupMembership: (rawCommand): Promise<void> =>
      runCommunityOperation((): void => {
        const command = RemoveGroupMembershipCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const key = scopedKey(command.actor.tenantId, command.input.membershipId);

        if (!memberships.has(key)) {
          throw new CommunityDomainError(
            "MEMBERSHIP_NOT_FOUND",
            "This membership is no longer available on the server."
          );
        }

        memberships.delete(key);
      }),

    recordAttendance: (rawCommand): Promise<AttendanceRecord> =>
      runCommunityOperation(async (): Promise<AttendanceRecord> => {
        const command = RecordAttendanceCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const now = clock();
        const attendanceId = ids.attendanceId();

        const record = AttendanceRecordSchema.parse({
          attendanceId,
          occasionRef: command.input.occasionRef,
          recordedAt: now,
          recordedByRef: command.actor.actorId,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.memberRef !== undefined
            ? { memberRef: command.input.memberRef }
            : {}),
          ...(command.input.status !== undefined
            ? { status: command.input.status }
            : {}),
          ...(command.input.headcount !== undefined
            ? { headcount: command.input.headcount }
            : {})
        });
        attendance.set(scopedKey(record.tenantId, record.attendanceId), record);

        await publishCommunityEvents(eventPublisher, [
          createCommunityAttendanceRecordedEvent({
            actor: command.actor,
            changeKind: "created",
            occurredAt: record.updatedAt,
            record,
            requestId: command.requestId
          })
        ]);

        return record;
      }),

    updateAttendance: (rawCommand): Promise<AttendanceRecord> =>
      runCommunityOperation(async (): Promise<AttendanceRecord> => {
        const command = UpdateAttendanceCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const existing = attendance.get(
          scopedKey(command.actor.tenantId, command.input.attendanceId)
        );

        if (existing === undefined) {
          throw new CommunityDomainError(
            "ATTENDANCE_NOT_FOUND",
            "This attendance record is no longer available on the server."
          );
        }

        const record = AttendanceRecordSchema.parse({
          attendanceId: existing.attendanceId,
          occasionRef: command.input.occasionRef,
          recordedAt: existing.recordedAt,
          recordedByRef: command.actor.actorId,
          tenantId: existing.tenantId,
          updatedAt: clock(),
          ...(command.input.memberRef !== undefined
            ? { memberRef: command.input.memberRef }
            : {}),
          ...(command.input.status !== undefined
            ? { status: command.input.status }
            : {}),
          ...(command.input.headcount !== undefined
            ? { headcount: command.input.headcount }
            : {})
        });
        attendance.set(scopedKey(record.tenantId, record.attendanceId), record);

        await publishCommunityEvents(eventPublisher, [
          createCommunityAttendanceRecordedEvent({
            actor: command.actor,
            changeKind: "updated",
            occurredAt: record.updatedAt,
            record,
            requestId: command.requestId
          })
        ]);

        return record;
      }),

    draftCommunicationMessage: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = DraftCommunicationMessageCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const now = clock();
        const messageId = ids.messageId();

        const message = CommunicationMessageSchema.parse({
          audience: command.input.audience,
          bodyTemplate: command.input.bodyTemplate,
          channel: command.input.channel,
          createdAt: now,
          createdByRef: command.actor.actorId,
          messageId,
          origin: command.input.origin,
          status: "draft",
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.subject !== undefined
            ? { subject: command.input.subject }
            : {})
        });
        messages.set(scopedKey(message.tenantId, message.messageId), message);

        await publishCommunityEvents(eventPublisher, [
          createCommunityCommunicationStatusChangedEvent({
            actor: command.actor,
            message,
            occurredAt: message.updatedAt,
            requestId: command.requestId
          })
        ]);

        return message;
      }),

    updateCommunicationMessage: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation((): CommunicationMessage => {
        const command = UpdateCommunicationMessageCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const existing = requireMessage(command.input.messageId, command.actor);

        if (existing.status !== "draft" && existing.status !== "reviewed") {
          throw new CommunityDomainError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Only draft or reviewed messages can be edited."
          );
        }

        const nextSubject =
          command.input.subject ?? existing.subject;
        const message = CommunicationMessageSchema.parse({
          ...existing,
          audience: command.input.audience ?? existing.audience,
          bodyTemplate: command.input.bodyTemplate ?? existing.bodyTemplate,
          updatedAt: clock(),
          ...(nextSubject !== undefined ? { subject: nextSubject } : {})
        });
        messages.set(scopedKey(message.tenantId, message.messageId), message);

        return message;
      }),

    markCommunicationReviewed: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = MarkCommunicationReviewedCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const existing = requireMessage(command.input.messageId, command.actor);

        return advanceMessage(command.actor, command.requestId, existing, "review");
      }),

    confirmCommunicationSend: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = ConfirmCommunicationSendCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const existing = requireMessage(command.input.messageId, command.actor);
        const confirmation = CommunicationConfirmationSchema.parse({
          confirmed: true,
          confirmedAt: clock(),
          confirmedByRef: command.input.confirmedByRef,
          reason: command.input.confirmationIntent.reason
        });

        return advanceMessage(
          command.actor,
          command.requestId,
          existing,
          "confirm",
          confirmation
        );
      }),

    queueConfirmedCommunication: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = QueueConfirmedCommunicationCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const existing = requireMessage(command.input.messageId, command.actor);

        if (existing.status !== "confirmed") {
          throw new CommunityDomainError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Only a confirmed message can be queued for send."
          );
        }

        const audience = resolveAudienceForMessage(existing);

        if (audience.included.length === 0) {
          throw new CommunityDomainError(
            "CONSENT_REQUIRED",
            "No recipient has granted consent for this channel."
          );
        }

        const now = clock();

        // Persist suppressed recipients (consent-blocked, with a known channel of
        // the kind) as `suppressed` rows — flagged, never silently dropped — before
        // any send is produced. Members with no channel of the kind have no
        // `channelRef` to record and produce no recipient row.
        for (const suppressedRecipient of audience.suppressed) {
          const channelRef = channelRefForKind(
            existing.tenantId,
            suppressedRecipient.memberRef,
            existing.channel
          );

          if (channelRef === undefined) {
            continue;
          }

          const recipientId = ids.recipientId();
          const recipientRecord = CommunicationRecipientSchema.parse({
            channelRef,
            memberRef: suppressedRecipient.memberRef,
            messageId: existing.messageId,
            recipientId,
            sendStatus: "suppressed",
            tenantId: existing.tenantId,
            updatedAt: now
          });
          recipients.set(
            scopedKey(recipientRecord.tenantId, recipientRecord.recipientId),
            recipientRecord
          );
        }

        const queued = await advanceMessage(
          command.actor,
          command.requestId,
          existing,
          "queue"
        );

        const sendResults = await sendPort.send({
          channel: queued.channel,
          messageId: queued.messageId,
          recipients: audience.included.map((recipient) => ({
            channelRef: recipient.channelRef,
            memberRef: recipient.memberRef
          })),
          tenantId: queued.tenantId
        });
        const resultByMember = new Map<string, CommunicationSendResult>();
        for (const result of sendResults) {
          resultByMember.set(result.memberRef, result);
        }

        for (const includedRecipient of audience.included) {
          const result = resultByMember.get(includedRecipient.memberRef);
          const sendStatus = result?.sendStatus ?? "sent";
          const recipientId = ids.recipientId();
          const recipientRecord = CommunicationRecipientSchema.parse({
            channelRef: includedRecipient.channelRef,
            memberRef: includedRecipient.memberRef,
            messageId: queued.messageId,
            recipientId,
            sendStatus,
            tenantId: queued.tenantId,
            updatedAt: clock(),
            ...(sendStatus === "failed" && result?.failureReason !== undefined
              ? { failureReason: result.failureReason }
              : {})
          });
          recipients.set(
            scopedKey(recipientRecord.tenantId, recipientRecord.recipientId),
            recipientRecord
          );
        }

        return advanceMessage(command.actor, command.requestId, queued, "send");
      }),

    cancelCommunicationMessage: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = CancelCommunicationMessageCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);
        const existing = requireMessage(command.input.messageId, command.actor);

        return advanceMessage(command.actor, command.requestId, existing, "cancel");
      }),

    draftCommunicationWithAi: (rawCommand): Promise<CommunicationMessage> =>
      runCommunityOperation(async (): Promise<CommunicationMessage> => {
        const command = DraftCommunicationWithAiCommandSchema.parse(rawCommand);
        assertCommunityCommsRole(command.actor);

        if (aiDraftPort === undefined) {
          throw new CommunityDomainError(
            "VALIDATION_FAILED",
            "The Community AI draft provider is not configured."
          );
        }

        const tenantId = command.actor.tenantId;
        const tenantSummaries = [...summaries.values()].filter(
          (summary) => summary.tenantId === tenantId
        );
        const group =
          command.input.audience.kind === "group"
            ? groups.get(scopedKey(tenantId, command.input.audience.groupId))
            : undefined;

        // Build the smallest PII-free projection (refs + counts + labels + policy),
        // structurally guarded against PII inside the builder.
        const prompt = buildCommunityAiDraftPrompt({
          aiPolicyProfile: command.input.aiPolicyProfile ?? DEFAULT_PII_FREE_AI_POLICY,
          audience: command.input.audience,
          campaignIntent: command.input.campaignIntent,
          channel: command.input.channel,
          churchToneSummary: command.input.churchToneSummary,
          engagementSummaries: tenantSummaries,
          forbiddenTopics: command.input.forbiddenTopics,
          group,
          requestId: command.requestId,
          requiredPlaceholders: command.input.requiredPlaceholders,
          tenantId
        });

        // The port returns untrusted output; re-validate before any persistence.
        // A schema failure is surfaced as a typed VALIDATION_FAILED error (never a
        // raw ZodError), and no message is created.
        const parsed = CommunityAiDraftSuggestionSchema.safeParse(
          await aiDraftPort.draftCommunication(prompt)
        );

        if (!parsed.success) {
          throw new CommunityDomainError(
            "VALIDATION_FAILED",
            "The AI draft output failed validation."
          );
        }

        const suggestion = parsed.data;

        if (suggestion.status !== "drafted") {
          throw new CommunityDomainError(
            "VALIDATION_FAILED",
            "The AI could not produce a usable communication draft."
          );
        }

        const now = clock();
        const messageId = ids.messageId();

        // Create a draft with origin="ai-drafted". The CommunicationMessage schema
        // rejects a subject on a non-email channel; the lifecycle gate then binds
        // this draft exactly like a human draft — it cannot self-advance past
        // `draft` without an explicit human confirmation.
        const message = CommunicationMessageSchema.parse({
          audience: command.input.audience,
          bodyTemplate: suggestion.bodyTemplate,
          channel: command.input.channel,
          createdAt: now,
          createdByRef: command.actor.actorId,
          messageId,
          origin: "ai-drafted",
          status: "draft",
          tenantId,
          updatedAt: now,
          ...(command.input.channel === "email" && suggestion.subject !== undefined
            ? { subject: suggestion.subject }
            : {})
        });
        messages.set(scopedKey(message.tenantId, message.messageId), message);

        await publishCommunityEvents(eventPublisher, [
          createCommunityCommunicationStatusChangedEvent({
            actor: command.actor,
            message,
            occurredAt: message.updatedAt,
            requestId: command.requestId
          })
        ]);

        return message;
      }),

    recomputeEngagementSummaries: (rawCommand): Promise<readonly EngagementSummary[]> =>
      runCommunityOperation((): readonly EngagementSummary[] => {
        const command = RecomputeEngagementSummariesCommandSchema.parse(rawCommand);
        assertCommunityCommandRole(command.actor);
        const tenantId = command.actor.tenantId;
        const tenantAttendance = [...attendance.values()].filter(
          (record) => record.tenantId === tenantId
        );
        const tenantRecipients = [...recipients.values()].filter(
          (recipient) => recipient.tenantId === tenantId
        );
        const computed = rollupEngagement(
          tenantId as Member["tenantId"],
          tenantAttendance,
          tenantMemberships(tenantId),
          tenantRecipients,
          {
            windowEnd: command.input.windowEnd,
            windowStart: command.input.windowStart
          },
          clock()
        );

        // Idempotent recompute: drop this tenant's prior summaries, then store the
        // freshly computed PII-free rows.
        for (const [key, summary] of summaries.entries()) {
          if (summary.tenantId === tenantId) {
            summaries.delete(key);
          }
        }
        for (const summary of computed) {
          summaries.set(scopedKey(summary.tenantId, summary.summaryId), summary);
        }

        return computed;
      })
  };

  return {
    commandService,
    queryService,
    readAttendanceRecords: (): readonly AttendanceRecord[] => [
      ...attendance.values()
    ],
    readCommunicationMessages: (): readonly CommunicationMessage[] => [
      ...messages.values()
    ],
    readCommunicationRecipients: (): readonly CommunicationRecipient[] => [
      ...recipients.values()
    ],
    readCommunityGroups: (): readonly CommunityGroup[] => [...groups.values()],
    readEngagementSummaries: (): readonly EngagementSummary[] => [
      ...summaries.values()
    ],
    readGroupMemberships: (): readonly GroupMembership[] => [...memberships.values()],
    readHouseholds: (): readonly Household[] => [...households.values()],
    readMembers: (): readonly Member[] => [...members.values()]
  };
};

const createCommunityIds = (
  overrides: Partial<InMemoryCommunityServiceIds> | undefined
): InMemoryCommunityServiceIds => {
  const counter = (prefix: string): (() => string) => {
    let next = 1;

    return (): string => {
      const value = `${prefix}_${String(next)}`;
      next += 1;
      return value;
    };
  };

  return {
    attendanceId: overrides?.attendanceId ?? counter("attendance"),
    groupId: overrides?.groupId ?? counter("group"),
    householdRef: overrides?.householdRef ?? counter("household"),
    memberId: overrides?.memberId ?? counter("member"),
    membershipId: overrides?.membershipId ?? counter("membership"),
    messageId: overrides?.messageId ?? counter("message"),
    recipientId: overrides?.recipientId ?? counter("recipient")
  };
};

const assertCommunityQueryRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, communityQueryRoles)) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to read Community resources."
    );
  }
};

const assertCommunityCommandRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, communityCommandRoles)) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to change this Community resource."
    );
  }
};

const assertCommunityCommsRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, communityCommsRoles)) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to manage Community communications."
    );
  }
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));

/**
 * Awaited fan-out of Community+ events after a durable commit. No-ops when no
 * publisher is injected (the persistence/composition path and most tests),
 * exactly like the Play in-memory adapter — emission is an in-memory-service-
 * only concern. Events are published in array order.
 */
const publishCommunityEvents = (
  eventPublisher: EventPublisher | undefined,
  events: readonly ApiEventEnvelope[]
): Promise<void> => {
  if (eventPublisher === undefined) {
    return Promise.resolve();
  }

  return events.reduce(
    (previousPublish, event) =>
      previousPublish.then(() => eventPublisher.publishAfterCommit(event)),
    Promise.resolve()
  );
};

/**
 * Build the PII-free `community.memberUpdated` envelope. The payload carries
 * only the opaque `memberId`/`householdRef`, the coarse `changeKind`, and the
 * member `status` enum — never `displayName`, contact refs, or custom-field
 * values. The aggregate is the member.
 */
const createCommunityMemberUpdatedEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly changeKind: "created" | "updated" | "archived";
  readonly member: Member;
  readonly occurredAt: string;
  readonly requestId: string;
}): ApiEventEnvelope => ({
  aggregateId: input.member.memberId,
  actorId: input.actor.actorId,
  eventType: "community.memberUpdated",
  occurredAt: input.occurredAt,
  payload: {
    changeKind: input.changeKind,
    memberId: input.member.memberId,
    status: input.member.status,
    tenantId: input.member.tenantId,
    updatedAt: input.member.updatedAt,
    ...(input.member.householdRef !== undefined
      ? { householdRef: input.member.householdRef }
      : {})
  },
  requestId: input.requestId,
  schemaVersion: "community-member-updated.v1",
  tenantId: input.member.tenantId
});

/**
 * Build the PII-free `community.attendanceRecorded` envelope. The payload
 * carries the opaque `attendanceId`/`occasionRef`/`memberRef`, the coarse
 * `changeKind`/`recordKind`, the attendance `status` enum, and the anonymous
 * `headcount` count — refs + enums + a count only. The aggregate is the record.
 */
const createCommunityAttendanceRecordedEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly changeKind: "created" | "updated";
  readonly occurredAt: string;
  readonly record: AttendanceRecord;
  readonly requestId: string;
}): ApiEventEnvelope => ({
  aggregateId: input.record.attendanceId,
  actorId: input.actor.actorId,
  eventType: "community.attendanceRecorded",
  occurredAt: input.occurredAt,
  payload: {
    attendanceId: input.record.attendanceId,
    changeKind: input.changeKind,
    occasionRef: input.record.occasionRef,
    recordKind: input.record.memberRef !== undefined ? "member" : "headcount",
    tenantId: input.record.tenantId,
    updatedAt: input.record.updatedAt,
    ...(input.record.memberRef !== undefined
      ? { memberRef: input.record.memberRef }
      : {}),
    ...(input.record.status !== undefined ? { status: input.record.status } : {}),
    ...(input.record.headcount !== undefined
      ? { headcount: input.record.headcount }
      : {})
  },
  requestId: input.requestId,
  schemaVersion: "community-attendance-recorded.v1",
  tenantId: input.record.tenantId
});

/**
 * Build the PII-free `community.communicationStatusChanged` envelope. The
 * payload carries **status + ids only** — the opaque `messageId`, the `channel`
 * and `origin` enums, and the lifecycle `status` — never `bodyTemplate`,
 * `subject`, the audience descriptor, or any recipient contact value. The
 * aggregate is the message.
 */
const createCommunityCommunicationStatusChangedEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly message: CommunicationMessage;
  readonly occurredAt: string;
  readonly requestId: string;
}): ApiEventEnvelope => ({
  aggregateId: input.message.messageId,
  actorId: input.actor.actorId,
  eventType: "community.communicationStatusChanged",
  occurredAt: input.occurredAt,
  payload: {
    channel: input.message.channel,
    messageId: input.message.messageId,
    origin: input.message.origin,
    status: input.message.status,
    tenantId: input.message.tenantId,
    updatedAt: input.message.updatedAt
  },
  requestId: input.requestId,
  schemaVersion: "community-communication-status-changed.v1",
  tenantId: input.message.tenantId
});

const runCommunityOperation = <TResult>(
  operation: () => TResult | Promise<TResult>
): Promise<TResult> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Community operation failed.")
    );
  }
};
