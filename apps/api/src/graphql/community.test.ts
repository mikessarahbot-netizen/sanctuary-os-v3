import { describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import {
  CommunicationMessageSchema,
  CommunityDomainError,
  CommunityGroupSchema,
  MemberSchema,
  ResolvedAudienceSchema,
  type CommunicationMessage,
  type CommunityCommandService,
  type CommunityGroup,
  type CommunityQueryService,
  type Member
} from "../domain/community/index.js";
import {
  communityGraphqlTypeDefs,
  createCommunityGraphqlResolvers,
  type CommunityGraphqlContext
} from "./community.js";
import { createInMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";
import { createPresenterGraphqlRequestHandler } from "./transport.js";

const graphqlContext: CommunityGraphqlContext = {
  actor: {
    actorId: "leader_1",
    roles: ["worship_leader"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const member: Member = MemberSchema.parse({
  contactChannelRefs: [
    { channelRef: "channel_sms", consentStatus: "granted", kind: "sms" }
  ],
  createdAt: timestamp,
  customFieldValues: [],
  displayName: "Grace Member",
  memberId: "member_1",
  segmentRefs: ["segment_a"],
  status: "active",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const group: CommunityGroup = CommunityGroupSchema.parse({
  archived: false,
  createdAt: timestamp,
  groupId: "group_1",
  kind: "small-group",
  label: "Tuesday Group",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const message: CommunicationMessage = CommunicationMessageSchema.parse({
  audience: { kind: "segment", segmentRef: "segment_a" },
  bodyTemplate: "Hello {{firstName}}",
  channel: "sms",
  createdAt: timestamp,
  createdByRef: "leader_1",
  messageId: "message_1",
  origin: "human",
  status: "draft",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

// The draft an AI-assist produces: same `CommunicationMessage` shape, but
// `origin: "ai-drafted"` and still `status: "draft"` — bound by the same human-
// confirm gate as any other draft.
const aiDraftedMessage: CommunicationMessage = CommunicationMessageSchema.parse({
  audience: { kind: "segment", segmentRef: "segment_a" },
  bodyTemplate: "Hi {{firstName}}, we'd love to see you Sunday.",
  channel: "sms",
  createdAt: timestamp,
  createdByRef: "leader_1",
  messageId: "message_ai_1",
  origin: "ai-drafted",
  status: "draft",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const createCommunityQueryService = (
  overrides: Partial<CommunityQueryService> = {}
): CommunityQueryService => ({
  getAttendanceTally: vi.fn<CommunityQueryService["getAttendanceTally"]>(() =>
    Promise.resolve({ occasions: [] })
  ),
  getCommunicationMessage: vi.fn<CommunityQueryService["getCommunicationMessage"]>(
    () => Promise.resolve(message)
  ),
  getCommunityGroup: vi.fn<CommunityQueryService["getCommunityGroup"]>(() =>
    Promise.resolve(group)
  ),
  getHousehold: vi.fn<CommunityQueryService["getHousehold"]>(() =>
    Promise.resolve(null)
  ),
  getMember: vi.fn<CommunityQueryService["getMember"]>(() => Promise.resolve(member)),
  getResolvedAudience: vi.fn<CommunityQueryService["getResolvedAudience"]>(() =>
    Promise.resolve(
      ResolvedAudienceSchema.parse({
        channel: "sms",
        included: [{ channelRef: "channel_sms", memberRef: "member_1" }],
        suppressed: []
      })
    )
  ),
  listAttendanceRecords: vi.fn<CommunityQueryService["listAttendanceRecords"]>(() =>
    Promise.resolve([])
  ),
  listCommunicationMessages: vi.fn<
    CommunityQueryService["listCommunicationMessages"]
  >(() => Promise.resolve([message])),
  listCommunicationRecipients: vi.fn<
    CommunityQueryService["listCommunicationRecipients"]
  >(() => Promise.resolve([])),
  listCommunityGroups: vi.fn<CommunityQueryService["listCommunityGroups"]>(() =>
    Promise.resolve([group])
  ),
  listEngagementSummaries: vi.fn<CommunityQueryService["listEngagementSummaries"]>(
    () => Promise.resolve([])
  ),
  listGroupMemberships: vi.fn<CommunityQueryService["listGroupMemberships"]>(() =>
    Promise.resolve([])
  ),
  listHouseholds: vi.fn<CommunityQueryService["listHouseholds"]>(() =>
    Promise.resolve([])
  ),
  listMembers: vi.fn<CommunityQueryService["listMembers"]>(() =>
    Promise.resolve([member])
  ),
  ...overrides
});

const createCommunityCommandService = (
  overrides: Partial<CommunityCommandService> = {}
): CommunityCommandService => ({
  archiveMember: vi.fn<CommunityCommandService["archiveMember"]>(() =>
    Promise.resolve(member)
  ),
  cancelCommunicationMessage: vi.fn<
    CommunityCommandService["cancelCommunicationMessage"]
  >(() => Promise.resolve(message)),
  confirmCommunicationSend: vi.fn<
    CommunityCommandService["confirmCommunicationSend"]
  >(() => Promise.resolve(message)),
  draftCommunicationMessage: vi.fn<
    CommunityCommandService["draftCommunicationMessage"]
  >(() => Promise.resolve(message)),
  draftCommunicationWithAi: vi.fn<
    CommunityCommandService["draftCommunicationWithAi"]
  >(() => Promise.resolve(message)),
  markCommunicationReviewed: vi.fn<
    CommunityCommandService["markCommunicationReviewed"]
  >(() => Promise.resolve(message)),
  queueConfirmedCommunication: vi.fn<
    CommunityCommandService["queueConfirmedCommunication"]
  >(() => Promise.resolve(message)),
  recomputeEngagementSummaries: vi.fn<
    CommunityCommandService["recomputeEngagementSummaries"]
  >(() => Promise.resolve([])),
  recordAttendance: vi.fn<CommunityCommandService["recordAttendance"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  removeGroupMembership: vi.fn<CommunityCommandService["removeGroupMembership"]>(
    () => Promise.resolve()
  ),
  saveCommunityGroup: vi.fn<CommunityCommandService["saveCommunityGroup"]>(() =>
    Promise.resolve(group)
  ),
  saveHousehold: vi.fn<CommunityCommandService["saveHousehold"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  saveMember: vi.fn<CommunityCommandService["saveMember"]>(() =>
    Promise.resolve(member)
  ),
  setGroupMembership: vi.fn<CommunityCommandService["setGroupMembership"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  updateAttendance: vi.fn<CommunityCommandService["updateAttendance"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  updateCommunicationMessage: vi.fn<
    CommunityCommandService["updateCommunicationMessage"]
  >(() => Promise.resolve(message)),
  ...overrides
});

describe("communityGraphqlTypeDefs", () => {
  it("declares the planned Community query contract", () => {
    expect(communityGraphqlTypeDefs).toContain(
      "members(filter: CommunityMembersFilterInput): [Member!]!"
    );
    expect(communityGraphqlTypeDefs).toContain("member(id: ID!): Member");
    expect(communityGraphqlTypeDefs).toContain(
      "communityGroups(filter: CommunityGroupsFilterInput): [CommunityGroup!]!"
    );
    expect(communityGraphqlTypeDefs).toContain("attendanceTally(occasionRef: ID!): AttendanceTally!");
    expect(communityGraphqlTypeDefs).toContain("resolvedAudience(messageId: ID!): ResolvedAudience");
  });

  it("declares the gated outbound-comms mutation contract", () => {
    expect(communityGraphqlTypeDefs).toContain(
      "confirmCommunicationSend(\n      input: ConfirmCommunicationSendInput!\n    ): CommunicationMessage!"
    );
    expect(communityGraphqlTypeDefs).toContain(
      "queueConfirmedCommunication(\n      input: QueueConfirmedCommunicationInput!\n    ): CommunicationMessage!"
    );
    expect(communityGraphqlTypeDefs).toContain(
      "confirmationIntent: CommunityConfirmationIntentInput!"
    );
  });

  it("declares the AI-assist draft mutation returning a CommunicationMessage", () => {
    expect(communityGraphqlTypeDefs).toContain(
      "draftCommunicationWithAi(\n      input: DraftCommunicationWithAiInput!\n    ): CommunicationMessage!"
    );
    // The input mirrors the service input: audience descriptor + campaign/tone
    // hints + placeholder tokens + forbidden topics (PII-free), no recipient field.
    expect(communityGraphqlTypeDefs).toContain("input DraftCommunicationWithAiInput {");
    expect(communityGraphqlTypeDefs).toContain("campaignIntent: String!");
    expect(communityGraphqlTypeDefs).toContain("churchToneSummary: String!");
  });

  it("never exposes a raw contact-value field on any Community type", () => {
    expect(communityGraphqlTypeDefs).not.toContain("phone");
    expect(communityGraphqlTypeDefs).not.toContain("email:");
    expect(communityGraphqlTypeDefs).not.toContain("address");
  });
});

describe("createCommunityGraphqlResolvers", () => {
  it("delegates members with actor and request scope", async () => {
    const listMembers = vi.fn<CommunityQueryService["listMembers"]>(() =>
      Promise.resolve([member])
    );
    const resolvers = createCommunityGraphqlResolvers({
      communityCommandService: createCommunityCommandService(),
      communityQueryService: createCommunityQueryService({ listMembers })
    });

    await expect(
      resolvers.Query.members(undefined, {}, graphqlContext)
    ).resolves.toEqual([member]);

    expect(listMembers).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {},
      requestId: "request_1"
    });
  });

  it("delegates saveCommunityGroup to the command service", async () => {
    const saveCommunityGroup = vi.fn<
      CommunityCommandService["saveCommunityGroup"]
    >(() => Promise.resolve(group));
    const resolvers = createCommunityGraphqlResolvers({
      communityCommandService: createCommunityCommandService({ saveCommunityGroup }),
      communityQueryService: createCommunityQueryService()
    });

    await expect(
      resolvers.Mutation.saveCommunityGroup(
        undefined,
        {
          input: {
            archived: false,
            kind: "small-group",
            label: "Tuesday Group"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(group);

    expect(saveCommunityGroup).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: { archived: false, kind: "small-group", label: "Tuesday Group" },
      requestId: "request_1"
    });
  });

  it("delegates draftCommunicationWithAi with a branded audience and array defaults", async () => {
    const draftCommunicationWithAi = vi.fn<
      CommunityCommandService["draftCommunicationWithAi"]
    >(() => Promise.resolve(aiDraftedMessage));
    const resolvers = createCommunityGraphqlResolvers({
      communityCommandService: createCommunityCommandService({
        draftCommunicationWithAi
      }),
      communityQueryService: createCommunityQueryService()
    });

    // `forbiddenTopics` / `requiredPlaceholders` / `aiPolicyProfile` are omitted by
    // the caller; the command schema fills the two list defaults to [].
    await expect(
      resolvers.Mutation.draftCommunicationWithAi(
        undefined,
        {
          input: {
            audience: { groupId: "group_1", kind: "group" },
            campaignIntent: "Invite the team to Sunday setup.",
            channel: "sms",
            churchToneSummary: "Warm, brief, hopeful."
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(aiDraftedMessage);

    expect(draftCommunicationWithAi).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        audience: { groupId: "group_1", kind: "group" },
        campaignIntent: "Invite the team to Sunday setup.",
        channel: "sms",
        churchToneSummary: "Warm, brief, hopeful.",
        forbiddenTopics: [],
        requiredPlaceholders: []
      },
      requestId: "request_1"
    });
  });

  it("requires an explicit confirmation intent to confirm a send", async () => {
    const confirmCommunicationSend = vi.fn<
      CommunityCommandService["confirmCommunicationSend"]
    >(() => Promise.resolve(message));
    const resolvers = createCommunityGraphqlResolvers({
      communityCommandService: createCommunityCommandService({
        confirmCommunicationSend
      }),
      communityQueryService: createCommunityQueryService()
    });

    await expect(
      resolvers.Mutation.confirmCommunicationSend(
        undefined,
        { input: { confirmedByRef: "leader_1", messageId: "message_1" } },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(confirmCommunicationSend).not.toHaveBeenCalled();
  });

  it("propagates service errors without replacing them with vendor details", async () => {
    const listMembers = vi.fn<CommunityQueryService["listMembers"]>(() =>
      Promise.reject(new Error("Community store unavailable."))
    );
    const resolvers = createCommunityGraphqlResolvers({
      communityCommandService: createCommunityCommandService(),
      communityQueryService: createCommunityQueryService({ listMembers })
    });

    await expect(
      resolvers.Query.members(undefined, {}, graphqlContext)
    ).rejects.toThrow("Community store unavailable.");
  });
});

const actor: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const authBoundary: AuthBoundary = {
  resolveActor: (authHeader) =>
    authHeader === "Bearer good-token"
      ? Promise.resolve(actor)
      : Promise.reject(new Error("invalid token"))
};

const presenterStub = {
  presenterCommandService: {
    addSlide: () => Promise.reject(new Error("not used")),
    applyPresenterTheme: () => Promise.reject(new Error("not used")),
    createPresentationFromService: () => Promise.reject(new Error("not used")),
    removeSlide: () => Promise.reject(new Error("not used")),
    reorderSlides: () => Promise.reject(new Error("not used")),
    setOutputTarget: () => Promise.reject(new Error("not used")),
    updatePresentation: () => Promise.reject(new Error("not used")),
    updateSlide: () => Promise.reject(new Error("not used"))
  },
  presenterQueryService: {
    outputTargets: () => Promise.reject(new Error("not used")),
    presentation: () => Promise.reject(new Error("not used")),
    presentationForService: () => Promise.reject(new Error("not used")),
    presentations: () => Promise.reject(new Error("not used")),
    presenterThemes: () => Promise.reject(new Error("not used"))
  }
} as const;

describe("Community GraphQL transport", () => {
  it("builds the executable schema with Community deps and executes a query", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: createCommunityCommandService(),
          communityQueryService: createCommunityQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query: "{ communityGroups { groupId kind label } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    // The hyphenated domain value `small-group` serializes as the underscore SDL
    // enum name `small_group`.
    expect(response.body).toEqual({
      data: {
        communityGroups: [
          { groupId: "group_1", kind: "small_group", label: "Tuesday Group" }
        ]
      }
    });
  });

  it("executes a gated draft mutation through the full transport", async () => {
    const draftCommunicationMessage = vi.fn<
      CommunityCommandService["draftCommunicationMessage"]
    >(() => Promise.resolve(message));
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: createCommunityCommandService({
            draftCommunicationMessage
          }),
          communityQueryService: createCommunityQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation draft($input: DraftCommunicationMessageInput!) { draftCommunicationMessage(input: $input) { messageId origin status } }",
        variables: {
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            bodyTemplate: "Hello {{firstName}}",
            channel: "sms",
            origin: "ai_drafted"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    // `ai_drafted` (SDL) is mapped to the domain value `ai-drafted` before the
    // service is called.
    expect(draftCommunicationMessage).toHaveBeenCalledWith({
      actor,
      input: {
        audience: { kind: "segment", segmentRef: "segment_a" },
        bodyTemplate: "Hello {{firstName}}",
        channel: "sms",
        origin: "ai-drafted"
      },
      requestId: "request_1"
    });
    expect(response.body).toEqual({
      data: {
        draftCommunicationMessage: {
          messageId: "message_1",
          origin: "human",
          status: "draft"
        }
      }
    });
  });

  it("surfaces a typed Community domain error as a conflict code with a safe message", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: createCommunityCommandService({
            queueConfirmedCommunication: () =>
              Promise.reject(
                new CommunityDomainError(
                  "CONSENT_REQUIRED",
                  "No recipient has granted consent for this channel."
                )
              )
          }),
          communityQueryService: createCommunityQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation queue($input: QueueConfirmedCommunicationInput!) { queueConfirmedCommunication(input: $input) { messageId } }",
        variables: {
          input: {
            confirmationIntent: { confirmed: true, reason: "Send it" },
            messageId: "message_1"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]).toEqual({
      extensions: { code: "CONSENT_REQUIRED" },
      message: "No recipient has granted consent for this channel."
    });
  });

  it("rejects a confirmation-gated send when the confirmation intent is missing", async () => {
    const confirmCommunicationSend = vi.fn<
      CommunityCommandService["confirmCommunicationSend"]
    >(() => Promise.resolve(message));
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: createCommunityCommandService({
            confirmCommunicationSend
          }),
          communityQueryService: createCommunityQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation confirm($input: ConfirmCommunicationSendInput!) { confirmCommunicationSend(input: $input) { messageId } }",
        variables: {
          input: { confirmedByRef: "leader_1", messageId: "message_1" }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    // The required `confirmationIntent` is absent, so the schema rejects the input
    // before the service is reached.
    expect(response.body.errors).toBeDefined();
    expect(confirmCommunicationSend).not.toHaveBeenCalled();
  });

  it("drafts with AI through the full transport over the REAL service + a FAKE port (no network) and returns an ai-drafted draft", async () => {
    // A FAKE ai-draft port: returns a canned, schema-valid suggestion and records
    // the prompt it was handed. It never touches the network.
    const promptsSeen: unknown[] = [];
    const aiDraftPort = {
      draftCommunication: (prompt: unknown): Promise<unknown> => {
        promptsSeen.push(prompt);

        return Promise.resolve({
          bodyTemplate: "Hi {{firstName}}, we'd love to see you Sunday.",
          needsReview: true,
          rationale: "Re-engage members who have not attended recently.",
          status: "drafted",
          usedPlaceholders: ["firstName"]
        });
      }
    };

    // The REAL in-memory community service, wired with the fake AI port and a fixed
    // message id so the assertion is exact.
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort,
      clock: () => timestamp,
      ids: { messageId: () => "message_ai_real" }
    });
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: adapter.commandService,
          communityQueryService: adapter.queryService
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation aiDraft($input: DraftCommunicationWithAiInput!) { draftCommunicationWithAi(input: $input) { messageId origin status channel bodyTemplate } }",
        variables: {
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            campaignIntent: "Re-engage members who have not attended recently.",
            channel: "sms",
            churchToneSummary: "Warm, brief, hopeful.",
            forbiddenTopics: ["giving"],
            requiredPlaceholders: ["firstName"]
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    // The created draft is `ai-drafted` (serialized as the underscore SDL name
    // `ai_drafted`) and still `draft` — it did NOT self-advance.
    expect(response.body).toEqual({
      data: {
        draftCommunicationWithAi: {
          bodyTemplate: "Hi {{firstName}}, we'd love to see you Sunday.",
          channel: "sms",
          messageId: "message_ai_real",
          origin: "ai_drafted",
          status: "draft"
        }
      }
    });
    // The fake port was handed exactly one PII-free projection (no contact value,
    // no member name) — versioned and carrying the non-PII hints only.
    expect(promptsSeen).toHaveLength(1);
    expect(JSON.stringify(promptsSeen[0])).not.toContain("@");
  });

  it("an AI-origin draft created through the transport still cannot be queued without a human confirm", async () => {
    // Same REAL service + FAKE port, but now drive the lifecycle: the AI draft is
    // created, then a queue is attempted straight from `draft` — the lifecycle gate
    // refuses it (no human confirm), proving an ai-drafted message can't self-send.
    const aiDraftPort = {
      draftCommunication: (): Promise<unknown> =>
        Promise.resolve({
          bodyTemplate: "Hi {{firstName}}, join us Sunday.",
          needsReview: true,
          rationale: "Re-engage low-attendance members.",
          status: "drafted"
        })
    };
    const adapter = createInMemoryCommunityServicesAdapter({
      aiDraftPort,
      clock: () => timestamp,
      ids: { messageId: () => "message_ai_gate" }
    });
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        community: {
          communityCommandService: adapter.commandService,
          communityQueryService: adapter.queryService
        }
      })
    });

    const draftResponse = await handler({
      body: {
        query:
          "mutation aiDraft($input: DraftCommunicationWithAiInput!) { draftCommunicationWithAi(input: $input) { messageId origin status } }",
        variables: {
          input: {
            audience: { kind: "segment", segmentRef: "segment_a" },
            campaignIntent: "Re-engage members who have not attended recently.",
            channel: "sms",
            churchToneSummary: "Warm, brief, hopeful."
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });
    expect(draftResponse.body.data).toEqual({
      draftCommunicationWithAi: {
        messageId: "message_ai_gate",
        origin: "ai_drafted",
        status: "draft"
      }
    });

    // Attempt to queue the ai-drafted message directly (no review, no confirm) →
    // refused by the lifecycle gate with a typed error code.
    const queueResponse = await handler({
      body: {
        query:
          "mutation queue($input: QueueConfirmedCommunicationInput!) { queueConfirmedCommunication(input: $input) { messageId status } }",
        variables: {
          input: {
            confirmationIntent: { confirmed: true, reason: "Send it." },
            messageId: "message_ai_gate"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_2" }
    });
    // The mutation errored, so no `data` is returned; the typed lifecycle-gate
    // error is surfaced as a stable conflict code. The carrier is never reached.
    expect(queueResponse.body.data).toBeUndefined();
    expect(queueResponse.body.errors?.[0]?.extensions?.["code"]).toBe(
      "INVALID_LIFECYCLE_TRANSITION"
    );
  });
});
