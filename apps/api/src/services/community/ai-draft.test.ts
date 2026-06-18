import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  CommunityGroupSchema,
  EngagementSummarySchema,
  MemberSchema,
  isCommunityDomainError,
  type CommunicationMessage,
  type CommunityDomainErrorCode,
  type CommunityGroup,
  type EngagementSummary,
  type Member
} from "../../domain/community/index.js";
import {
  CommunityAiDraftPromptSchema,
  type CommunityAiDraftPort,
  type CommunityAiDraftPrompt,
  type CommunityAiDraftSuggestion
} from "./ai-draft.js";
import { createInMemoryCommunityServicesAdapter } from "./in-memory.js";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const planner: AuthenticatedActor = {
  actorId: "planner_1",
  roles: ["planner"],
  tenantId: "tenant_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

/**
 * A PII-bearing member seeded into tenant_1: a display name and a contact channel
 * ref. Its very presence in the store is the point — the test asserts NONE of it
 * reaches the AI port.
 */
const piiMember: Member = MemberSchema.parse({
  contactChannelRefs: [
    { channelRef: "channel_email_secret", consentStatus: "granted", kind: "email" }
  ],
  createdAt: timestamp,
  customFieldValues: [{ fieldRef: "field_dob", value: "1990-01-01" }],
  displayName: "Priscilla Privatename",
  memberId: "member_pii",
  segmentRefs: ["segment_a"],
  status: "active",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const ministryGroup: CommunityGroup = CommunityGroupSchema.parse({
  archived: false,
  createdAt: timestamp,
  groupId: "group_welcome",
  kind: "ministry",
  label: "Welcome Team",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const tenantOneSummary: EngagementSummary = EngagementSummarySchema.parse({
  attendanceStreak: 4,
  commsResponseCount: 2,
  computedAt: timestamp,
  scope: { kind: "segment", segmentRef: "segment_a" },
  servingCount: 1,
  summaryId: "summary_t1",
  tenantId: "tenant_1",
  windowEnd: timestamp,
  windowStart: "2026-05-21T14:00:00.000Z"
});

const tenantTwoSummary: EngagementSummary = EngagementSummarySchema.parse({
  attendanceStreak: 99,
  commsResponseCount: 99,
  computedAt: timestamp,
  scope: { kind: "member", memberRef: "member_other_tenant" },
  servingCount: 99,
  summaryId: "summary_t2",
  tenantId: "tenant_2",
  windowEnd: timestamp,
  windowStart: "2026-05-21T14:00:00.000Z"
});

const validSuggestion: CommunityAiDraftSuggestion = {
  bodyTemplate: "Hi {{firstName}}, we would love to see you on {{serviceDate}}.",
  needsReview: true,
  omittedDueToMissingData: [],
  rationale: "Re-engagement nudge grounded in attendance-streak signals only.",
  status: "drafted",
  usedPlaceholders: ["firstName", "serviceDate"]
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

/**
 * A fake AI port that captures the exact prompt it receives and returns a
 * caller-supplied suggestion. No network, no real model — the injected boundary.
 */
const createCapturingPort = (
  suggestion: unknown
): { readonly port: CommunityAiDraftPort; readonly received: CommunityAiDraftPrompt[] } => {
  const received: CommunityAiDraftPrompt[] = [];

  return {
    port: {
      draftCommunication: (prompt): Promise<unknown> => {
        received.push(prompt);

        return Promise.resolve(suggestion);
      }
    },
    received
  };
};

const draftWithAi = (
  adapter: ReturnType<typeof createInMemoryCommunityServicesAdapter>,
  actor: AuthenticatedActor = leader
): Promise<CommunicationMessage> =>
  adapter.commandService.draftCommunicationWithAi({
    actor,
    input: {
      audience: { kind: "group", groupId: "group_welcome" },
      campaignIntent: "Invite lapsed segment back to a Sunday gathering.",
      channel: "email",
      churchToneSummary: "Warm, concise, welcoming.",
      forbiddenTopics: ["fundraising"],
      requiredPlaceholders: ["firstName", "serviceDate"]
    },
    requestId: "request_ai_draft"
  });

describe("draftCommunicationWithAi", () => {
  it("hands the AI port a PII-free projection (no name, contact value, or PII keys)", async () => {
    const { port, received } = createCapturingPort(validSuggestion);
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_ai" },
      seed: {
        communityGroups: [ministryGroup],
        engagementSummaries: [tenantOneSummary],
        members: [piiMember]
      }
    });

    await draftWithAi(adapter);

    expect(received).toHaveLength(1);
    const prompt = received[0];
    expect(prompt).toBeDefined();
    if (prompt === undefined) {
      return;
    }

    // The projection must parse as the PII-free prompt shape...
    expect(() => CommunityAiDraftPromptSchema.parse(prompt)).not.toThrow();

    // ...and, inspected as raw JSON, must contain none of the seeded PII: no
    // display name, no contact channel ref, no custom-field value, and no PII keys.
    const serialized = JSON.stringify(prompt);
    expect(serialized).not.toContain("Priscilla Privatename");
    expect(serialized).not.toContain("channel_email_secret");
    expect(serialized).not.toContain("1990-01-01");
    expect(serialized).not.toContain("displayName");
    expect(serialized).not.toContain("contactChannelRefs");

    // It carries only the AI-safe engagement signal (segment ref + counts) and the
    // non-PII group ministry label.
    expect(prompt.engagementSignals).toEqual([
      {
        attendanceStreak: 4,
        commsResponseCount: 2,
        scopeKind: "segment",
        scopeRef: "segment_a",
        servingCount: 1
      }
    ]);
    expect(prompt.audienceLabel).toBe("Welcome Team");
    expect(prompt.aiPolicyProfile.piiSharingAllowed).toBe(false);
  });

  it("rejects malformed AI output via the Zod schema and creates no message", async () => {
    const { port } = createCapturingPort({ unexpected: "shape", needsReview: false });
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_bad" },
      seed: { communityGroups: [ministryGroup], engagementSummaries: [tenantOneSummary] }
    });

    await expectDomainErrorCode(draftWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readCommunicationMessages()).toHaveLength(0);
  });

  it("rejects an AI draft whose body smuggles a resolved contact value", async () => {
    const { port } = createCapturingPort({
      ...validSuggestion,
      bodyTemplate: "Reply to pastor@example.com to confirm your seat."
    });
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_leak" },
      seed: { communityGroups: [ministryGroup] }
    });

    await expectDomainErrorCode(draftWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readCommunicationMessages()).toHaveLength(0);
  });

  it("rejects a non-drafted AI status (insufficient_context) without creating a message", async () => {
    const { port } = createCapturingPort({
      ...validSuggestion,
      status: "insufficient_context"
    });
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_insufficient" },
      seed: { communityGroups: [ministryGroup] }
    });

    await expectDomainErrorCode(draftWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readCommunicationMessages()).toHaveLength(0);
  });

  it("produces an ai-drafted draft that the human-confirmation gate still blocks from sending", async () => {
    const { port } = createCapturingPort(validSuggestion);
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_ai" },
      seed: {
        communityGroups: [ministryGroup],
        engagementSummaries: [tenantOneSummary],
        members: [piiMember]
      }
    });

    const drafted = await draftWithAi(adapter);
    expect(drafted.origin).toBe("ai-drafted");
    expect(drafted.status).toBe("draft");
    expect(drafted.subject).toBeUndefined();
    expect(drafted.bodyTemplate).toBe(validSuggestion.bodyTemplate);

    // The AI draft can be reviewed by a human, but cannot be queued/sent until a
    // human confirms — the slice-5 gate is identical regardless of origin and is
    // NOT weakened by the AI path. AI may draft, never self-send.
    await adapter.commandService.markCommunicationReviewed({
      actor: leader,
      input: { messageId: "message_ai" },
      requestId: "request_ai_review"
    });

    await expectDomainErrorCode(
      adapter.commandService.queueConfirmedCommunication({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "auto" },
          messageId: "message_ai"
        },
        requestId: "request_ai_queue"
      }),
      "INVALID_LIFECYCLE_TRANSITION"
    );

    // Only an explicit human confirmation advances the same AI-drafted message.
    const confirmed = await adapter.commandService.confirmCommunicationSend({
      actor: leader,
      input: {
        confirmationIntent: { confirmed: true, reason: "Reviewed by a human" },
        confirmedByRef: "leader_1",
        messageId: "message_ai"
      },
      requestId: "request_ai_confirm"
    });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.origin).toBe("ai-drafted");
  });

  it("keeps the projection tenant-scoped — another tenant's engagement never leaks in", async () => {
    const { port, received } = createCapturingPort(validSuggestion);
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_scope" },
      seed: {
        communityGroups: [ministryGroup],
        engagementSummaries: [tenantOneSummary, tenantTwoSummary]
      }
    });

    await draftWithAi(adapter);

    const prompt = received[0];
    expect(prompt).toBeDefined();
    if (prompt === undefined) {
      return;
    }

    expect(prompt.tenantId).toBe("tenant_1");
    expect(prompt.engagementSignals).toHaveLength(1);
    expect(prompt.engagementSignals.map((signal) => signal.scopeRef)).toEqual([
      "segment_a"
    ]);
    expect(JSON.stringify(prompt)).not.toContain("member_other_tenant");
  });

  it("rejects a non-comms role from drafting with AI (AUTHORIZATION_FAILED)", async () => {
    const { port } = createCapturingPort(validSuggestion);
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      seed: { communityGroups: [ministryGroup] }
    });

    await expectDomainErrorCode(draftWithAi(adapter, planner), "AUTHORIZATION_FAILED");
  });

  it("fails cleanly when no AI port is injected", async () => {
    const adapter = createInMemoryCommunityServicesAdapter({
      seed: { communityGroups: [ministryGroup] }
    });

    await expectDomainErrorCode(draftWithAi(adapter), "VALIDATION_FAILED");
  });

  it("round-trips a valid fake email draft with a subject", async () => {
    const { port } = createCapturingPort({
      ...validSuggestion,
      subject: "We saved you a seat"
    });
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort: port,
      clock: () => timestamp,
      ids: { messageId: () => "message_round" },
      seed: { communityGroups: [ministryGroup], engagementSummaries: [tenantOneSummary] }
    });

    const drafted = await draftWithAi(adapter);

    expect(drafted).toMatchObject({
      channel: "email",
      messageId: "message_round",
      origin: "ai-drafted",
      status: "draft",
      subject: "We saved you a seat",
      tenantId: "tenant_1"
    });
    expect(adapter.readCommunicationMessages()).toHaveLength(1);
  });
});
