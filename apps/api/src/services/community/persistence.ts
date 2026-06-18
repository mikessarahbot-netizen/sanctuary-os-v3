import type {
  AttendanceRecordPersistenceRecord,
  CommunicationMessagePersistenceRecord,
  CommunicationRecipientPersistenceRecord,
  CommunityCommandPersistenceRepository,
  CommunityGroupPersistenceRecord,
  CommunityPersistenceReadOptions,
  CommunityPersistenceWriteOptions,
  CommunityQueryPersistenceRepository,
  EngagementSummaryPersistenceRecord,
  GroupMembershipPersistenceRecord,
  HouseholdPersistenceRecord,
  MemberPersistenceRecord,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
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
import type {
  CommunicationSendPort,
  CommunicationSendResult
} from "./in-memory.js";
import {
  CommunityAiDraftSuggestionSchema,
  buildCommunityAiDraftPrompt,
  type CommunityAiDraftPort,
  type CommunityAiPolicyProfile
} from "./ai-draft.js";

const COMMUNITY_STORAGE_SCHEMA_VERSION = "community.v1";

/**
 * Default AI policy profile when a caller omits one: the safest posture, matching
 * the in-memory adapter. PII is never shared; the comms-draft projection is
 * PII-free regardless.
 */
const DEFAULT_PII_FREE_AI_POLICY: CommunityAiPolicyProfile = {
  humanReviewRequiredFor: ["ai-drafted-communication"],
  piiSharingAllowed: false
};

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

export interface PersistenceBackedCommunityServiceIds {
  readonly attendanceId: () => string;
  readonly groupId: () => string;
  readonly householdRef: () => string;
  readonly memberId: () => string;
  readonly membershipId: () => string;
  readonly messageId: () => string;
  readonly recipientId: () => string;
}

export interface PersistenceBackedCommunityServiceDependencies {
  readonly aiDraftPort?: CommunityAiDraftPort;
  readonly clock?: () => string;
  readonly commandRepository: CommunityCommandPersistenceRepository;
  readonly ids?: Partial<PersistenceBackedCommunityServiceIds>;
  readonly queryRepository: CommunityQueryPersistenceRepository;
  readonly sendPort?: CommunicationSendPort;
}

export interface PersistenceBackedCommunityServicesAdapter {
  readonly commandService: CommunityCommandService;
  readonly queryService: CommunityQueryService;
}

/**
 * Persistence-backed Community+ service adapter — the slice-7 production path.
 *
 * Implements both `CommunityQueryService` and `CommunityCommandService` over the
 * Community SQL repositories (slice-4), mirroring the Charts/Play persistence
 * adapters: Zod validation on every operation, an injected clock + id generators,
 * role checks, tenant isolation, and typed `CommunityDomainError`s. Persistence
 * records (plain storage strings) are mapped back to the branded domain records
 * by re-parsing through the domain schemas on read; the persistence-only
 * `schemaVersion` field is dropped from the domain record.
 *
 * Community+ is the strictest PII surface, so the communications path enforces
 * the same two structural gates as the in-memory service by delegating to the
 * pure domain functions — over the persistence path:
 *   - **Consent suppression** — `queueConfirmedCommunication` (and the
 *     `resolvedAudience` preview) build recipients via the pure `resolveAudience`
 *     resolver, which drops non-consented channels and flags them `suppressed`;
 *     the suppressed rows are persisted, the consented set is handed to the port.
 *   - **Human-confirmation gate** — every lifecycle move runs through the pure
 *     `applyMessageTransition` state machine before the new status is persisted.
 *     Advancing toward send requires a human `confirmation`; an
 *     `origin = "ai-drafted"` message is bound by the same gate and can never
 *     self-advance past `draft`. AI may draft, never send.
 *
 * The carrier send is isolated behind an injected `CommunicationSendPort` (a fake
 * this slice; the real Twilio/email adapter is slice 11) — identical to the
 * in-memory service. The service only orchestrates, validates, clocks, audits,
 * and persists the returned status.
 */
export const createPersistenceBackedCommunityServicesAdapter = (
  dependencies: PersistenceBackedCommunityServiceDependencies
): PersistenceBackedCommunityServicesAdapter => {
  const clock = dependencies.clock ?? ((): string => new Date().toISOString());
  const ids = createCommunityIds(dependencies.ids);
  const sendPort = dependencies.sendPort ?? defaultSendPort;
  const aiDraftPort = dependencies.aiDraftPort;
  const { commandRepository, queryRepository } = dependencies;

  const requireTenantMessage = async (
    messageId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<CommunicationMessagePersistenceRecord> => {
    const message = await queryRepository.getCommunicationMessage({
      input: { messageId },
      options: toReadOptions(actor, requestId)
    });

    if (message === null) {
      throw new CommunityDomainError(
        "MESSAGE_NOT_FOUND",
        "This communication message is no longer available on the server."
      );
    }

    return assertTenantScopedPersistenceMessage(message, actor.tenantId);
  };

  /**
   * Resolve the consent-filtered audience for a message over the persistence
   * path, delegating to the pure `resolveAudience` resolver. The resolver only
   * consults memberships for a `group` descriptor, so we load the tenant's
   * members (always) plus that group's memberships (only when the descriptor is a
   * group) — bounded queries that match what the resolver actually reads.
   */
  const resolveAudienceForMessage = async (
    message: CommunicationMessagePersistenceRecord,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ResolvedAudience> => {
    const memberRecords = await queryRepository.listMembers({
      input: {},
      options: toReadOptions(actor, requestId)
    });
    const members = memberRecords.map((record) =>
      toDomainMember(assertTenantScopedPersistenceMember(record, actor.tenantId))
    );

    const memberships =
      message.audience.kind === "group"
        ? (
            await queryRepository.listGroupMemberships({
              input: { groupId: message.audience.groupId },
              options: toReadOptions(actor, requestId)
            })
          ).map((record) =>
            toDomainMembership(
              assertTenantScopedPersistenceMembership(record, actor.tenantId)
            )
          )
        : [];

    // The persistence audience is the unbranded `{ kind, ... }` shape that
    // `resolveAudience` accepts as its `z.input` and re-parses internally.
    return resolveAudience(message.audience, message.channel, members, memberships);
  };

  /**
   * The opaque vault `channelRef` of a member's first contact channel matching
   * the message kind (regardless of consent), used to record a `suppressed`
   * recipient row for a consent-blocked member. Returns `undefined` when the
   * member has no channel of the kind (so no recipient row is recorded). Never
   * returns a contact value — `channelRef` is an opaque reference.
   */
  const channelRefForKind = async (
    memberRef: string,
    channel: CommunicationMessage["channel"],
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<string | undefined> => {
    const member = await queryRepository.getMember({
      input: { memberId: memberRef },
      options: toReadOptions(actor, requestId)
    });

    if (member === null || member.tenantId !== actor.tenantId) {
      return undefined;
    }

    return member.contactChannelRefs.find((entry) => entry.kind === channel)
      ?.channelRef;
  };

  /**
   * Apply a lifecycle transition through the pure state machine, then persist the
   * resulting status (and confirmation, on the confirming step) via the repo.
   * Keeps the human-confirmation gate enforced on the persistence path: the pure
   * function rejects an illegal jump or a missing confirmation with a typed
   * `CommunityDomainError` before any write is issued.
   */
  const advanceMessage = async (
    message: CommunicationMessagePersistenceRecord,
    transition: MessageTransition,
    actor: AuthenticatedActor,
    requestId: string,
    confirmation?: CommunicationConfirmation
  ): Promise<CommunicationMessagePersistenceRecord> => {
    const result = applyMessageTransition(
      toDomainMessage(message),
      transition,
      confirmation
    );

    if (!result.ok) {
      const code =
        result.error.code === "CONFIRMATION_REQUIRED"
          ? "CONFIRMATION_REQUIRED"
          : "INVALID_LIFECYCLE_TRANSITION";

      throw new CommunityDomainError(code, result.error.safeMessage);
    }

    const nextConfirmation = result.message.confirmation;
    const stored = await commandRepository.setCommunicationMessageStatus({
      input: {
        messageId: result.message.messageId,
        status: result.message.status,
        updatedAt: clock(),
        ...(nextConfirmation !== undefined
          ? {
              confirmation: {
                confirmed: true,
                confirmedAt: nextConfirmation.confirmedAt,
                confirmedByRef: nextConfirmation.confirmedByRef,
                reason: nextConfirmation.reason
              }
            }
          : {})
      },
      options: toWriteOptions(actor, requestId, "update")
    });

    return assertTenantScopedPersistenceMessage(stored, actor.tenantId);
  };

  const queryService: CommunityQueryService = {
    listMembers: async (rawQuery): Promise<readonly Member[]> => {
      const query = ListMembersQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listMembers({
        input:
          filter === undefined
            ? {}
            : {
                filter: {
                  ...(filter.householdRef !== undefined
                    ? { householdRef: filter.householdRef }
                    : {}),
                  ...(filter.status !== undefined ? { status: filter.status } : {})
                }
              },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainMember(
          assertTenantScopedPersistenceMember(record, query.actor.tenantId)
        )
      );
    },

    getMember: async (rawQuery): Promise<Member | null> => {
      const query = GetMemberQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const record = await queryRepository.getMember({
        input: { memberId: query.input.memberId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainMember(record);
    },

    listHouseholds: async (rawQuery): Promise<readonly Household[]> => {
      const query = ListHouseholdsQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const records = await queryRepository.listHouseholds({
        input: {},
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainHousehold(
          assertTenantScopedPersistenceHousehold(record, query.actor.tenantId)
        )
      );
    },

    getHousehold: async (rawQuery): Promise<Household | null> => {
      const query = GetHouseholdQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const record = await queryRepository.getHousehold({
        input: { householdRef: query.input.householdRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainHousehold(record);
    },

    listCommunityGroups: async (rawQuery): Promise<readonly CommunityGroup[]> => {
      const query = ListCommunityGroupsQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listCommunityGroups({
        input:
          filter?.kind === undefined ? {} : { filter: { kind: filter.kind } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainGroup(
          assertTenantScopedPersistenceGroup(record, query.actor.tenantId)
        )
      );
    },

    getCommunityGroup: async (rawQuery): Promise<CommunityGroup | null> => {
      const query = GetCommunityGroupQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const record = await queryRepository.getCommunityGroup({
        input: { groupId: query.input.groupId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainGroup(record);
    },

    listGroupMemberships: async (rawQuery): Promise<readonly GroupMembership[]> => {
      const query = ListGroupMembershipsQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const records = await queryRepository.listGroupMemberships({
        input: { groupId: query.input.groupId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainMembership(
          assertTenantScopedPersistenceMembership(record, query.actor.tenantId)
        )
      );
    },

    listAttendanceRecords: async (rawQuery): Promise<readonly AttendanceRecord[]> => {
      const query = ListAttendanceRecordsQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const records = await queryRepository.listAttendanceRecords({
        input: { occasionRef: query.input.occasionRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainAttendance(
          assertTenantScopedPersistenceAttendance(record, query.actor.tenantId)
        )
      );
    },

    getAttendanceTally: async (rawQuery): Promise<AttendanceTally> => {
      const query = GetAttendanceTallyQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const records = await queryRepository.listAttendanceRecords({
        input: { occasionRef: query.input.occasionRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return tallyAttendance(
        records.map((record) =>
          toDomainAttendance(
            assertTenantScopedPersistenceAttendance(record, query.actor.tenantId)
          )
        )
      );
    },

    listCommunicationMessages: async (
      rawQuery
    ): Promise<readonly CommunicationMessage[]> => {
      const query = ListCommunicationMessagesQuerySchema.parse(rawQuery);
      assertCommunityCommsRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listCommunicationMessages({
        input:
          filter?.status === undefined ? {} : { filter: { status: filter.status } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainMessage(
          assertTenantScopedPersistenceMessage(record, query.actor.tenantId)
        )
      );
    },

    getCommunicationMessage: async (
      rawQuery
    ): Promise<CommunicationMessage | null> => {
      const query = GetCommunicationMessageQuerySchema.parse(rawQuery);
      assertCommunityCommsRole(query.actor);
      const record = await queryRepository.getCommunicationMessage({
        input: { messageId: query.input.messageId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainMessage(record);
    },

    listCommunicationRecipients: async (
      rawQuery
    ): Promise<readonly CommunicationRecipient[]> => {
      const query = ListCommunicationRecipientsQuerySchema.parse(rawQuery);
      assertCommunityCommsRole(query.actor);
      const records = await queryRepository.listCommunicationRecipients({
        input: { messageId: query.input.messageId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainRecipient(
          assertTenantScopedPersistenceRecipient(record, query.actor.tenantId)
        )
      );
    },

    listEngagementSummaries: async (
      rawQuery
    ): Promise<readonly EngagementSummary[]> => {
      const query = ListEngagementSummariesQuerySchema.parse(rawQuery);
      assertCommunityQueryRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listEngagementSummaries({
        input:
          filter?.scopeKind === undefined
            ? {}
            : { filter: { scopeKind: filter.scopeKind } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainSummary(
          assertTenantScopedPersistenceSummary(record, query.actor.tenantId)
        )
      );
    },

    getResolvedAudience: async (rawQuery): Promise<ResolvedAudience | null> => {
      const query = GetResolvedAudienceQuerySchema.parse(rawQuery);
      assertCommunityCommsRole(query.actor);
      const message = await queryRepository.getCommunicationMessage({
        input: { messageId: query.input.messageId },
        options: toReadOptions(query.actor, query.requestId)
      });

      if (message === null || message.tenantId !== query.actor.tenantId) {
        return null;
      }

      return resolveAudienceForMessage(message, query.actor, query.requestId);
    }
  };

  const commandService: CommunityCommandService = {
    saveMember: async (rawCommand): Promise<Member> => {
      const command = SaveMemberCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const now = clock();
      const memberId = command.input.memberId ?? ids.memberId();
      const existing = await queryRepository.getMember({
        input: { memberId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this member."
        );
      }

      const record = await commandRepository.saveMember({
        input: {
          contactChannelRefs: command.input.contactChannelRefs,
          createdAt: existing?.createdAt ?? now,
          customFieldValues: command.input.customFieldValues,
          displayName: command.input.displayName,
          memberId,
          schemaVersion: COMMUNITY_STORAGE_SCHEMA_VERSION,
          segmentRefs: command.input.segmentRefs,
          status: command.input.status,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.householdRef !== undefined
            ? { householdRef: command.input.householdRef }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainMember(
        assertTenantScopedPersistenceMember(record, command.actor.tenantId)
      );
    },

    archiveMember: async (rawCommand): Promise<Member> => {
      const command = ArchiveMemberCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const existing = await queryRepository.getMember({
        input: { memberId: command.input.memberId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing === null || existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "MEMBER_NOT_FOUND",
          "This member is no longer available on the server."
        );
      }

      const record = await commandRepository.archiveMember({
        input: {
          memberId: command.input.memberId,
          updatedAt: clock()
        },
        options: toWriteOptions(
          command.actor,
          command.requestId,
          "destructive-confirmed"
        )
      });

      return toDomainMember(
        assertTenantScopedPersistenceMember(record, command.actor.tenantId)
      );
    },

    saveHousehold: async (rawCommand): Promise<Household> => {
      const command = SaveHouseholdCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const now = clock();
      const householdRef = command.input.householdRef ?? ids.householdRef();
      const existing = await queryRepository.getHousehold({
        input: { householdRef },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this household."
        );
      }

      const record = await commandRepository.saveHousehold({
        input: {
          createdAt: existing?.createdAt ?? now,
          householdRef,
          label: command.input.label,
          memberRefs: command.input.memberRefs,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.primaryContactMemberRef !== undefined
            ? { primaryContactMemberRef: command.input.primaryContactMemberRef }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainHousehold(
        assertTenantScopedPersistenceHousehold(record, command.actor.tenantId)
      );
    },

    saveCommunityGroup: async (rawCommand): Promise<CommunityGroup> => {
      const command = SaveCommunityGroupCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const now = clock();
      const groupId = command.input.groupId ?? ids.groupId();
      const existing = await queryRepository.getCommunityGroup({
        input: { groupId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this group."
        );
      }

      const record = await commandRepository.saveCommunityGroup({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainGroup(
        assertTenantScopedPersistenceGroup(record, command.actor.tenantId)
      );
    },

    setGroupMembership: async (rawCommand): Promise<GroupMembership> => {
      const command = SetGroupMembershipCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const now = clock();
      const membershipId = command.input.membershipId ?? ids.membershipId();
      const existing = await queryRepository.getGroupMembership({
        input: { membershipId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this membership."
        );
      }

      const record = await commandRepository.setGroupMembership({
        input: {
          active: command.input.active,
          groupId: command.input.groupId,
          joinedAt: existing?.joinedAt ?? now,
          memberRef: command.input.memberRef,
          membershipId,
          roleInGroup: command.input.roleInGroup,
          tenantId: command.actor.tenantId,
          updatedAt: now
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainMembership(
        assertTenantScopedPersistenceMembership(record, command.actor.tenantId)
      );
    },

    removeGroupMembership: async (rawCommand): Promise<void> => {
      const command = RemoveGroupMembershipCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const existing = await queryRepository.getGroupMembership({
        input: { membershipId: command.input.membershipId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing === null || existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "MEMBERSHIP_NOT_FOUND",
          "This membership is no longer available on the server."
        );
      }

      await commandRepository.removeGroupMembership({
        input: {
          groupId: existing.groupId,
          memberRef: existing.memberRef,
          membershipId: command.input.membershipId
        },
        options: toWriteOptions(
          command.actor,
          command.requestId,
          "destructive-confirmed"
        )
      });
    },

    recordAttendance: async (rawCommand): Promise<AttendanceRecord> => {
      const command = RecordAttendanceCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const now = clock();
      const attendanceId = ids.attendanceId();

      const record = await commandRepository.recordAttendance({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainAttendance(
        assertTenantScopedPersistenceAttendance(record, command.actor.tenantId)
      );
    },

    updateAttendance: async (rawCommand): Promise<AttendanceRecord> => {
      const command = UpdateAttendanceCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const existing = await queryRepository.getAttendanceRecord({
        input: { attendanceId: command.input.attendanceId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing === null || existing.tenantId !== command.actor.tenantId) {
        throw new CommunityDomainError(
          "ATTENDANCE_NOT_FOUND",
          "This attendance record is no longer available on the server."
        );
      }

      const record = await commandRepository.updateAttendance({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainAttendance(
        assertTenantScopedPersistenceAttendance(record, command.actor.tenantId)
      );
    },

    draftCommunicationMessage: async (rawCommand): Promise<CommunicationMessage> => {
      const command = DraftCommunicationMessageCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const now = clock();
      const messageId = ids.messageId();

      const record = await commandRepository.saveCommunicationMessage({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainMessage(
        assertTenantScopedPersistenceMessage(record, command.actor.tenantId)
      );
    },

    updateCommunicationMessage: async (
      rawCommand
    ): Promise<CommunicationMessage> => {
      const command = UpdateCommunicationMessageCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const existing = await requireTenantMessage(
        command.input.messageId,
        command.actor,
        command.requestId
      );

      if (existing.status !== "draft" && existing.status !== "reviewed") {
        throw new CommunityDomainError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Only draft or reviewed messages can be edited."
        );
      }

      const nextSubject = command.input.subject ?? existing.subject;
      const record = await commandRepository.saveCommunicationMessage({
        input: {
          audience: command.input.audience ?? existing.audience,
          bodyTemplate: command.input.bodyTemplate ?? existing.bodyTemplate,
          channel: existing.channel,
          createdAt: existing.createdAt,
          createdByRef: existing.createdByRef,
          messageId: existing.messageId,
          origin: existing.origin,
          status: existing.status,
          tenantId: existing.tenantId,
          updatedAt: clock(),
          ...(existing.confirmation !== undefined
            ? { confirmation: existing.confirmation }
            : {}),
          ...(nextSubject !== undefined ? { subject: nextSubject } : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainMessage(
        assertTenantScopedPersistenceMessage(record, command.actor.tenantId)
      );
    },

    markCommunicationReviewed: async (
      rawCommand
    ): Promise<CommunicationMessage> => {
      const command = MarkCommunicationReviewedCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const existing = await requireTenantMessage(
        command.input.messageId,
        command.actor,
        command.requestId
      );
      const stored = await advanceMessage(
        existing,
        "review",
        command.actor,
        command.requestId
      );

      return toDomainMessage(stored);
    },

    confirmCommunicationSend: async (
      rawCommand
    ): Promise<CommunicationMessage> => {
      const command = ConfirmCommunicationSendCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const existing = await requireTenantMessage(
        command.input.messageId,
        command.actor,
        command.requestId
      );
      const confirmation = CommunicationConfirmationSchema.parse({
        confirmed: true,
        confirmedAt: clock(),
        confirmedByRef: command.input.confirmedByRef,
        reason: command.input.confirmationIntent.reason
      });
      const stored = await advanceMessage(
        existing,
        "confirm",
        command.actor,
        command.requestId,
        confirmation
      );

      return toDomainMessage(stored);
    },

    queueConfirmedCommunication: async (
      rawCommand
    ): Promise<CommunicationMessage> => {
      const command = QueueConfirmedCommunicationCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const existing = await requireTenantMessage(
        command.input.messageId,
        command.actor,
        command.requestId
      );

      if (existing.status !== "confirmed") {
        throw new CommunityDomainError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Only a confirmed message can be queued for send."
        );
      }

      const audience = await resolveAudienceForMessage(
        existing,
        command.actor,
        command.requestId
      );

      if (audience.included.length === 0) {
        throw new CommunityDomainError(
          "CONSENT_REQUIRED",
          "No recipient has granted consent for this channel."
        );
      }

      // Persist suppressed recipients (consent-blocked, with a known channel of
      // the kind) as `suppressed` rows — flagged, never silently dropped — before
      // any send is produced. Members with no channel of the kind have no
      // `channelRef` to record and produce no recipient row.
      for (const suppressedRecipient of audience.suppressed) {
        const channelRef = await channelRefForKind(
          suppressedRecipient.memberRef,
          existing.channel,
          command.actor,
          command.requestId
        );

        if (channelRef === undefined) {
          continue;
        }

        await commandRepository.upsertCommunicationRecipient({
          input: {
            channelRef,
            memberRef: suppressedRecipient.memberRef,
            messageId: existing.messageId,
            recipientId: ids.recipientId(),
            sendStatus: "suppressed",
            tenantId: existing.tenantId,
            updatedAt: clock()
          },
          options: toWriteOptions(command.actor, command.requestId, "create")
        });
      }

      const queued = await advanceMessage(
        existing,
        "queue",
        command.actor,
        command.requestId
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
        await commandRepository.upsertCommunicationRecipient({
          input: {
            channelRef: includedRecipient.channelRef,
            memberRef: includedRecipient.memberRef,
            messageId: queued.messageId,
            recipientId: ids.recipientId(),
            sendStatus,
            tenantId: queued.tenantId,
            updatedAt: clock(),
            ...(sendStatus === "failed" && result?.failureReason !== undefined
              ? { failureReason: result.failureReason }
              : {})
          },
          options: toWriteOptions(command.actor, command.requestId, "create")
        });
      }

      const sent = await advanceMessage(
        queued,
        "send",
        command.actor,
        command.requestId
      );

      return toDomainMessage(sent);
    },

    cancelCommunicationMessage: async (
      rawCommand
    ): Promise<CommunicationMessage> => {
      const command = CancelCommunicationMessageCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);
      const existing = await requireTenantMessage(
        command.input.messageId,
        command.actor,
        command.requestId
      );
      const stored = await advanceMessage(
        existing,
        "cancel",
        command.actor,
        command.requestId
      );

      return toDomainMessage(stored);
    },

    draftCommunicationWithAi: async (rawCommand): Promise<CommunicationMessage> => {
      const command = DraftCommunicationWithAiCommandSchema.parse(rawCommand);
      assertCommunityCommsRole(command.actor);

      if (aiDraftPort === undefined) {
        throw new CommunityDomainError(
          "VALIDATION_FAILED",
          "The Community AI draft provider is not configured."
        );
      }

      // Gather the AI-safe engagement summaries (PII-free by construction) and, for
      // a group audience, the group's non-PII label — the only signals the
      // projection draws from beyond the command's own non-PII hints.
      const summaryRecords = await queryRepository.listEngagementSummaries({
        input: {},
        options: toReadOptions(command.actor, command.requestId)
      });
      const engagementSummaries = summaryRecords.map((record) =>
        toDomainSummary(
          assertTenantScopedPersistenceSummary(record, command.actor.tenantId)
        )
      );

      const audience = command.input.audience;
      let group: CommunityGroup | undefined;
      if (audience.kind === "group") {
        const groupRecord = await queryRepository.getCommunityGroup({
          input: { groupId: audience.groupId },
          options: toReadOptions(command.actor, command.requestId)
        });
        group =
          groupRecord === null || groupRecord.tenantId !== command.actor.tenantId
            ? undefined
            : toDomainGroup(groupRecord);
      }

      const prompt = buildCommunityAiDraftPrompt({
        aiPolicyProfile: command.input.aiPolicyProfile ?? DEFAULT_PII_FREE_AI_POLICY,
        audience: command.input.audience,
        campaignIntent: command.input.campaignIntent,
        channel: command.input.channel,
        churchToneSummary: command.input.churchToneSummary,
        engagementSummaries,
        forbiddenTopics: command.input.forbiddenTopics,
        group,
        requestId: command.requestId,
        requiredPlaceholders: command.input.requiredPlaceholders,
        tenantId: command.actor.tenantId
      });

      // The port returns untrusted output; re-validate before any persistence. A
      // schema failure is surfaced as a typed VALIDATION_FAILED error (never a raw
      // ZodError), and no message is persisted.
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

      // Persist a draft with origin="ai-drafted". The lifecycle gate binds this
      // draft exactly like a human draft — it cannot self-advance past `draft`.
      const record = await commandRepository.saveCommunicationMessage({
        input: {
          audience: command.input.audience,
          bodyTemplate: suggestion.bodyTemplate,
          channel: command.input.channel,
          createdAt: now,
          createdByRef: command.actor.actorId,
          messageId,
          origin: "ai-drafted",
          status: "draft",
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.channel === "email" && suggestion.subject !== undefined
            ? { subject: suggestion.subject }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainMessage(
        assertTenantScopedPersistenceMessage(record, command.actor.tenantId)
      );
    },

    recomputeEngagementSummaries: async (
      rawCommand
    ): Promise<readonly EngagementSummary[]> => {
      const command = RecomputeEngagementSummariesCommandSchema.parse(rawCommand);
      assertCommunityCommandRole(command.actor);
      const tenantId = command.actor.tenantId;

      // Gather the rollup's inputs from the enumerable persistence reads, reaching
      // full parity with the in-memory service. Attendance is enumerated across the
      // whole tenant via the additive `listAttendanceRecordsForTenant` read (slice
      // 8); serving memberships and comms-response recipients each have an
      // enumerable parent (groups, messages), so they too are gathered in full. The
      // pure `rollupEngagement` then derives one PII-free summary per member that
      // appears in any of these signals within the window.
      const attendanceRecords = await queryRepository.listAttendanceRecordsForTenant({
        input: {},
        options: toReadOptions(command.actor, command.requestId)
      });
      const membershipRecords = await gatherTenantMemberships(
        queryRepository,
        command.actor,
        command.requestId
      );
      const recipientRecords = await gatherTenantRecipients(
        queryRepository,
        command.actor,
        command.requestId
      );

      const computed = rollupEngagement(
        tenantId as Member["tenantId"],
        attendanceRecords.map((record) =>
          toDomainAttendance(
            assertTenantScopedPersistenceAttendance(record, tenantId)
          )
        ),
        membershipRecords.map((record) =>
          toDomainMembership(assertTenantScopedPersistenceMembership(record, tenantId))
        ),
        recipientRecords.map((record) =>
          toDomainRecipient(assertTenantScopedPersistenceRecipient(record, tenantId))
        ),
        {
          windowEnd: command.input.windowEnd,
          windowStart: command.input.windowStart
        },
        clock()
      );

      // Idempotent recompute: persist the freshly computed PII-free rows. The
      // upsert key is `(tenantId, summaryId)` and `summaryId` is deterministic per
      // member scope, so re-running overwrites the prior row in place.
      const persisted: EngagementSummary[] = [];
      for (const summary of computed) {
        const record = await commandRepository.upsertEngagementSummary({
          input: {
            attendanceStreak: summary.attendanceStreak,
            commsResponseCount: summary.commsResponseCount,
            computedAt: summary.computedAt,
            scope: summary.scope,
            servingCount: summary.servingCount,
            summaryId: summary.summaryId,
            tenantId: summary.tenantId,
            windowEnd: summary.windowEnd,
            windowStart: summary.windowStart,
            ...(summary.lastPresentOccasionRef !== undefined
              ? { lastPresentOccasionRef: summary.lastPresentOccasionRef }
              : {})
          },
          options: toWriteOptions(command.actor, command.requestId, "update")
        });
        persisted.push(
          toDomainSummary(assertTenantScopedPersistenceSummary(record, tenantId))
        );
      }

      return persisted;
    }
  };

  return { commandService, queryService };
};

/**
 * Default fake send port: every requested recipient is reported `sent`. Replaced
 * by the real carrier adapter in slice 11; this keeps the queue path exercisable
 * with no network and no credentials. Mirrors the in-memory service default.
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

/**
 * Gather every active/inactive membership across the tenant's groups by walking
 * `listCommunityGroups → listGroupMemberships`. Both reads are enumerable, so the
 * serving-frequency count is exact for the persistence path.
 */
const gatherTenantMemberships = async (
  queryRepository: CommunityQueryPersistenceRepository,
  actor: AuthenticatedActor,
  requestId: string
): Promise<readonly GroupMembershipPersistenceRecord[]> => {
  const groups = await queryRepository.listCommunityGroups({
    input: {},
    options: toReadOptions(actor, requestId)
  });

  const records: GroupMembershipPersistenceRecord[] = [];
  for (const group of groups) {
    const memberships = await queryRepository.listGroupMemberships({
      input: { groupId: group.groupId },
      options: toReadOptions(actor, requestId)
    });
    records.push(...memberships);
  }

  return records;
};

/**
 * Gather every recipient row across the tenant's messages by walking
 * `listCommunicationMessages → listCommunicationRecipients`. Both reads are
 * enumerable, so the comms-response count is exact for the persistence path.
 */
const gatherTenantRecipients = async (
  queryRepository: CommunityQueryPersistenceRepository,
  actor: AuthenticatedActor,
  requestId: string
): Promise<readonly CommunicationRecipientPersistenceRecord[]> => {
  const messages = await queryRepository.listCommunicationMessages({
    input: {},
    options: toReadOptions(actor, requestId)
  });

  const records: CommunicationRecipientPersistenceRecord[] = [];
  for (const message of messages) {
    const recipients = await queryRepository.listCommunicationRecipients({
      input: { messageId: message.messageId },
      options: toReadOptions(actor, requestId)
    });
    records.push(...recipients);
  }

  return records;
};

const toDomainMember = (record: MemberPersistenceRecord): Member =>
  MemberSchema.parse({
    contactChannelRefs: record.contactChannelRefs,
    createdAt: record.createdAt,
    customFieldValues: record.customFieldValues,
    displayName: record.displayName,
    memberId: record.memberId,
    segmentRefs: record.segmentRefs,
    status: record.status,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.householdRef !== undefined
      ? { householdRef: record.householdRef }
      : {})
  });

const toDomainHousehold = (record: HouseholdPersistenceRecord): Household =>
  HouseholdSchema.parse({
    createdAt: record.createdAt,
    householdRef: record.householdRef,
    label: record.label,
    memberRefs: record.memberRefs,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.primaryContactMemberRef !== undefined
      ? { primaryContactMemberRef: record.primaryContactMemberRef }
      : {})
  });

const toDomainGroup = (record: CommunityGroupPersistenceRecord): CommunityGroup =>
  CommunityGroupSchema.parse({
    archived: record.archived,
    createdAt: record.createdAt,
    groupId: record.groupId,
    kind: record.kind,
    label: record.label,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.leaderMemberRef !== undefined
      ? { leaderMemberRef: record.leaderMemberRef }
      : {})
  });

const toDomainMembership = (
  record: GroupMembershipPersistenceRecord
): GroupMembership =>
  GroupMembershipSchema.parse({
    active: record.active,
    groupId: record.groupId,
    joinedAt: record.joinedAt,
    memberRef: record.memberRef,
    membershipId: record.membershipId,
    roleInGroup: record.roleInGroup,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt
  });

const toDomainAttendance = (
  record: AttendanceRecordPersistenceRecord
): AttendanceRecord =>
  AttendanceRecordSchema.parse({
    attendanceId: record.attendanceId,
    occasionRef: record.occasionRef,
    recordedAt: record.recordedAt,
    recordedByRef: record.recordedByRef,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.memberRef !== undefined ? { memberRef: record.memberRef } : {}),
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.headcount !== undefined ? { headcount: record.headcount } : {})
  });

const toDomainMessage = (
  record: CommunicationMessagePersistenceRecord
): CommunicationMessage =>
  CommunicationMessageSchema.parse({
    audience: record.audience,
    bodyTemplate: record.bodyTemplate,
    channel: record.channel,
    createdAt: record.createdAt,
    createdByRef: record.createdByRef,
    messageId: record.messageId,
    origin: record.origin,
    status: record.status,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.confirmation !== undefined
      ? { confirmation: record.confirmation }
      : {}),
    ...(record.subject !== undefined ? { subject: record.subject } : {})
  });

const toDomainRecipient = (
  record: CommunicationRecipientPersistenceRecord
): CommunicationRecipient =>
  CommunicationRecipientSchema.parse({
    channelRef: record.channelRef,
    memberRef: record.memberRef,
    messageId: record.messageId,
    recipientId: record.recipientId,
    sendStatus: record.sendStatus,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.failureReason !== undefined
      ? { failureReason: record.failureReason }
      : {})
  });

const toDomainSummary = (
  record: EngagementSummaryPersistenceRecord
): EngagementSummary =>
  EngagementSummarySchema.parse({
    attendanceStreak: record.attendanceStreak,
    commsResponseCount: record.commsResponseCount,
    computedAt: record.computedAt,
    scope: record.scope,
    servingCount: record.servingCount,
    summaryId: record.summaryId,
    tenantId: record.tenantId,
    windowEnd: record.windowEnd,
    windowStart: record.windowStart,
    ...(record.lastPresentOccasionRef !== undefined
      ? { lastPresentOccasionRef: record.lastPresentOccasionRef }
      : {})
  });

const toReadOptions = (
  actor: AuthenticatedActor,
  requestId: string
): CommunityPersistenceReadOptions => ({
  context: {
    actorId: actor.actorId,
    requestId,
    tenantId: actor.tenantId
  }
});

const toWriteOptions = (
  actor: AuthenticatedActor,
  requestId: string,
  intent: RepositoryMutationIntent
): CommunityPersistenceWriteOptions => ({
  ...toReadOptions(actor, requestId),
  intent
});

const createCommunityIds = (
  overrides: Partial<PersistenceBackedCommunityServiceIds> | undefined
): PersistenceBackedCommunityServiceIds => {
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

const assertTenantScopedPersistenceMember = (
  record: MemberPersistenceRecord,
  expectedTenantId: string
): MemberPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this member."
    );
  }

  return record;
};

const assertTenantScopedPersistenceHousehold = (
  record: HouseholdPersistenceRecord,
  expectedTenantId: string
): HouseholdPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this household."
    );
  }

  return record;
};

const assertTenantScopedPersistenceGroup = (
  record: CommunityGroupPersistenceRecord,
  expectedTenantId: string
): CommunityGroupPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this group."
    );
  }

  return record;
};

const assertTenantScopedPersistenceMembership = (
  record: GroupMembershipPersistenceRecord,
  expectedTenantId: string
): GroupMembershipPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this membership."
    );
  }

  return record;
};

const assertTenantScopedPersistenceAttendance = (
  record: AttendanceRecordPersistenceRecord,
  expectedTenantId: string
): AttendanceRecordPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this attendance record."
    );
  }

  return record;
};

const assertTenantScopedPersistenceMessage = (
  record: CommunicationMessagePersistenceRecord,
  expectedTenantId: string
): CommunicationMessagePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this communication message."
    );
  }

  return record;
};

const assertTenantScopedPersistenceRecipient = (
  record: CommunicationRecipientPersistenceRecord,
  expectedTenantId: string
): CommunicationRecipientPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this communication recipient."
    );
  }

  return record;
};

const assertTenantScopedPersistenceSummary = (
  record: EngagementSummaryPersistenceRecord,
  expectedTenantId: string
): EngagementSummaryPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new CommunityDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this engagement summary."
    );
  }

  return record;
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));
