import { z } from "zod";
import {
  AudienceDescriptorSchema,
  CommunicationChannelSchema,
  ContactChannelRefSchema,
  GroupMembershipSchema,
  MemberIdSchema,
  MemberSchema,
  type AudienceDescriptor,
  type CommunicationChannel,
  type GroupMembership,
  type Member
} from "./schemas.js";

/**
 * Pure, consent-aware audience resolution for Community+ outbound comms.
 *
 * `resolveAudience` expands an `AudienceDescriptor` (group / segment / explicit
 * member list) against the tenant's members and group memberships into a
 * deduplicated recipient set for a given message channel. A recipient is
 * **included** only when the member has a contact channel of the message's
 * channel kind whose `consentStatus = "granted"`. Every other candidate is
 * **suppressed and flagged with a reason** — never silently dropped — mirroring
 * the flagged-unresolved posture in Play (`resolveCueTimeline`) and the
 * invalid-chord passthrough in Charts (`transposeChord`).
 *
 * The result carries **references only**: `{ memberRef, channelRef }` for
 * included recipients and `{ memberRef, reason }` for suppressed ones — never a
 * contact value, never a display name. The contact value behind a `channelRef`
 * is resolved (and access-checked) outside Community+, at send time, by the
 * integration adapter.
 *
 * Pure and deterministic: no I/O, no clock, no randomness. Inputs are
 * already-tenant-scoped records (the function is tenant-agnostic); it only
 * decides who is eligible.
 */
const MemberRefStringSchema = z.string().min(1);

export const AudienceSuppressionReasonSchema = z.enum([
  "no-channel-of-kind",
  "consent-not-granted",
  "member-not-found"
]);

export const ResolvedRecipientSchema = z
  .object({
    channelRef: ContactChannelRefSchema,
    memberRef: MemberIdSchema
  })
  .strict();

export const SuppressedRecipientSchema = z
  .object({
    consentStatus: z.enum(["granted", "denied", "unknown"]).optional(),
    memberRef: MemberRefStringSchema,
    reason: AudienceSuppressionReasonSchema
  })
  .strict();

export const ResolvedAudienceSchema = z
  .object({
    channel: CommunicationChannelSchema,
    included: z.array(ResolvedRecipientSchema),
    suppressed: z.array(SuppressedRecipientSchema)
  })
  .strict();

export type AudienceSuppressionReason = z.infer<
  typeof AudienceSuppressionReasonSchema
>;
export type ResolvedRecipient = z.infer<typeof ResolvedRecipientSchema>;
export type SuppressedRecipient = z.infer<typeof SuppressedRecipientSchema>;
export type ResolvedAudience = z.infer<typeof ResolvedAudienceSchema>;

/**
 * Expand the descriptor into an ordered, deduplicated list of candidate member
 * refs. Order is deterministic: explicit lists keep author order; group/segment
 * expansions follow the input record order. The candidate set is *refs only*;
 * consent is evaluated separately against each resolved member.
 */
const collectCandidateMemberRefs = (
  descriptor: AudienceDescriptor,
  members: readonly Member[],
  memberships: readonly GroupMembership[]
): readonly string[] => {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (memberRef: string): void => {
    if (!seen.has(memberRef)) {
      seen.add(memberRef);
      ordered.push(memberRef);
    }
  };

  switch (descriptor.kind) {
    case "explicit": {
      for (const memberRef of descriptor.memberRefs) {
        push(memberRef);
      }

      break;
    }

    case "group": {
      for (const membership of memberships) {
        if (membership.groupId === descriptor.groupId && membership.active) {
          push(membership.memberRef);
        }
      }

      break;
    }

    case "segment": {
      for (const member of members) {
        if (member.segmentRefs.includes(descriptor.segmentRef)) {
          push(member.memberId);
        }
      }

      break;
    }
  }

  return ordered;
};

export const resolveAudience = (
  descriptor: z.input<typeof AudienceDescriptorSchema>,
  channel: CommunicationChannel,
  members: readonly Member[],
  memberships: readonly GroupMembership[]
): ResolvedAudience => {
  const parsedDescriptor = AudienceDescriptorSchema.parse(descriptor);
  const parsedChannel = CommunicationChannelSchema.parse(channel);
  const parsedMembers = members.map((member) => MemberSchema.parse(member));
  const parsedMemberships = memberships.map((membership) =>
    GroupMembershipSchema.parse(membership)
  );

  const membersById = new Map<string, Member>();

  for (const member of parsedMembers) {
    if (!membersById.has(member.memberId)) {
      membersById.set(member.memberId, member);
    }
  }

  const candidateRefs = collectCandidateMemberRefs(
    parsedDescriptor,
    parsedMembers,
    parsedMemberships
  );

  const included: ResolvedRecipient[] = [];
  const suppressed: SuppressedRecipient[] = [];

  for (const memberRef of candidateRefs) {
    const member = membersById.get(memberRef);

    if (member === undefined) {
      suppressed.push({ memberRef, reason: "member-not-found" });
      continue;
    }

    const channelsOfKind = member.contactChannelRefs.filter(
      (entry) => entry.kind === parsedChannel
    );

    if (channelsOfKind.length === 0) {
      suppressed.push({ memberRef, reason: "no-channel-of-kind" });
      continue;
    }

    const grantedChannel = channelsOfKind.find(
      (entry) => entry.consentStatus === "granted"
    );

    if (grantedChannel === undefined) {
      // At least one channel of the kind exists, but none is consented. Flag
      // with the least-permissive observed consent posture for auditability.
      const deniedChannel = channelsOfKind.find(
        (entry) => entry.consentStatus === "denied"
      );
      const observedConsent = deniedChannel?.consentStatus ?? "unknown";

      suppressed.push({
        consentStatus: observedConsent,
        memberRef,
        reason: "consent-not-granted"
      });
      continue;
    }

    included.push({
      channelRef: grantedChannel.channelRef,
      memberRef: member.memberId
    });
  }

  return ResolvedAudienceSchema.parse({
    channel: parsedChannel,
    included,
    suppressed
  });
};
