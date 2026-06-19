import { describe, expect, it, vi } from "vitest";
import {
  assembleGroupMemberRows,
  createCommunityClient,
  DEFAULT_API_URL
} from "./client.js";
import {
  SAMPLE_COMMUNITY_GROUPS,
  SAMPLE_ENGAGEMENT_SUMMARIES,
  SAMPLE_GROUP_MEMBERSHIPS,
  SAMPLE_MEMBERS
} from "./sample-data.js";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });

const queryOf = (init: RequestInit | undefined): string => {
  const body = init?.body;

  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  return (JSON.parse(body) as { query: string }).query;
};

const hospitalityMemberships = SAMPLE_GROUP_MEMBERSHIPS.filter(
  (membership) => membership.groupId === "group-hospitality"
);

describe("createCommunityClient", () => {
  it("POSTs the communityGroups query to the configured endpoint and returns the list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({ data: { communityGroups: SAMPLE_COMMUNITY_GROUPS } })
      )
    );

    const groups = await createCommunityClient({
      endpoint: "http://example.test/graphql",
      fetchImpl
    }).listCommunityGroups();

    expect(groups).toEqual(SAMPLE_COMMUNITY_GROUPS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://example.test/graphql");
    expect(init?.method).toBe("POST");
    expect(queryOf(init)).toContain("communityGroups");
  });

  it("defaults the endpoint to the api http listener path", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { communityGroups: [] } }))
    );

    await createCommunityClient({ fetchImpl }).listCommunityGroups();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DEFAULT_API_URL);
  });

  it("assembles a group detail from the group, memberships, members, and engagement queries", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const query = queryOf(init);

      if (query.includes("communityGroup(id:")) {
        return Promise.resolve(
          jsonResponse({ data: { communityGroup: SAMPLE_COMMUNITY_GROUPS[0] } })
        );
      }

      if (query.includes("groupMemberships(")) {
        return Promise.resolve(
          jsonResponse({ data: { groupMemberships: hospitalityMemberships } })
        );
      }

      if (query.includes("members {")) {
        return Promise.resolve(jsonResponse({ data: { members: SAMPLE_MEMBERS } }));
      }

      if (query.includes("engagementSummaries(")) {
        return Promise.resolve(
          jsonResponse({
            data: { engagementSummaries: SAMPLE_ENGAGEMENT_SUMMARIES }
          })
        );
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const result = await createCommunityClient({ fetchImpl }).getCommunityGroupDetail(
      "group-hospitality"
    );

    expect(result?.group.label).toBe("Hospitality Team");
    expect(result?.members.map((row) => row.member?.displayName)).toEqual([
      "Anita Bello",
      "David Okoye",
      "Maria Santos"
    ]);
    expect(result?.members[0]?.engagement?.servingCount).toBe(2);
    // communityGroup -> groupMemberships -> members -> engagementSummaries.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("returns null and does not query memberships when the group is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { communityGroup: null } }))
    );

    const result = await createCommunityClient({ fetchImpl }).getCommunityGroupDetail(
      "missing"
    );

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("PRIVACY: never selects a phone/email/address contact-value field", async () => {
    const queries: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const query = queryOf(init);
      queries.push(query);

      if (query.includes("communityGroup(id:")) {
        return Promise.resolve(
          jsonResponse({ data: { communityGroup: SAMPLE_COMMUNITY_GROUPS[0] } })
        );
      }
      if (query.includes("groupMemberships(")) {
        return Promise.resolve(jsonResponse({ data: { groupMemberships: [] } }));
      }
      if (query.includes("members {")) {
        return Promise.resolve(jsonResponse({ data: { members: [] } }));
      }
      if (query.includes("engagementSummaries(")) {
        return Promise.resolve(jsonResponse({ data: { engagementSummaries: [] } }));
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await createCommunityClient({ fetchImpl }).getCommunityGroupDetail(
      "group-hospitality"
    );

    // No query selects a contact-value field (the schema exposes none; this
    // guards against a future regression).
    for (const query of queries) {
      expect(query).not.toMatch(/\b(phone|address|phoneNumber|emailAddress)\b/i);
    }

    // The member selection set requests ONLY the opaque contact ref (channelRef /
    // kind / consentStatus) — never a contact value. `email` appears only as the
    // ContactChannelKind enum, never as a contact-value field.
    const membersQuery = queries.find((query) => query.includes("members {"));
    expect(membersQuery).toBeDefined();
    expect(membersQuery).toContain("channelRef");
    expect(membersQuery).toContain("consentStatus");
    expect(membersQuery).not.toMatch(/\bemailAddress\b/i);
  });

  it("throws the first GraphQL error message", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ errors: [{ message: "Unauthorized." }] }))
    );

    await expect(
      createCommunityClient({ fetchImpl }).listCommunityGroups()
    ).rejects.toThrow("Unauthorized.");
  });

  it("throws when the HTTP status is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("nope", { status: 500 }))
    );

    await expect(
      createCommunityClient({ fetchImpl }).listCommunityGroups()
    ).rejects.toThrow("HTTP 500");
  });
});

describe("createCommunityClient comms gate", () => {
  const messageRef = {
    channel: "sms",
    messageId: "message_1",
    origin: "human",
    status: "draft"
  };

  const requestBody = (
    init: RequestInit | undefined
  ): { readonly query: string; readonly variables: Record<string, unknown> } => {
    const body = init?.body;

    if (typeof body !== "string") {
      throw new Error("Expected a string request body.");
    }

    return JSON.parse(body) as {
      query: string;
      variables: Record<string, unknown>;
    };
  };

  it("composeDraft POSTs draftCommunicationMessage with a group audience + human origin", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({ data: { draftCommunicationMessage: messageRef } })
      )
    );

    const result = await createCommunityClient({ fetchImpl }).composeDraft({
      bodyTemplate: "Setup is at 9am.",
      channel: "sms",
      groupId: "group-hospitality"
    });

    expect(result).toEqual(messageRef);
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("mutation DraftCommunicationMessage");
    expect(body.query).toContain("$input: DraftCommunicationMessageInput!");
    expect(body.variables.input).toEqual({
      audience: { groupId: "group-hospitality", kind: "group" },
      bodyTemplate: "Setup is at 9am.",
      channel: "sms",
      origin: "human"
    });
    // No subject is sent on a non-email channel (the server schema rejects one).
    expect(body.variables.input).not.toHaveProperty("subject");
  });

  it("composeDraft includes a subject only on the email channel", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          data: {
            draftCommunicationMessage: { ...messageRef, channel: "email" }
          }
        })
      )
    );

    await createCommunityClient({ fetchImpl }).composeDraft({
      bodyTemplate: "Schedule below.",
      channel: "email",
      groupId: "group-hospitality",
      subject: "This Sunday"
    });

    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.variables.input).toMatchObject({
      channel: "email",
      subject: "This Sunday"
    });
  });

  it("draftWithAi POSTs draftCommunicationWithAi with a group audience + PII-free hints and returns the ai-drafted draft", async () => {
    const aiDrafted = {
      bodyTemplate: "Hi {{firstName}}, we'd love to see you Sunday.",
      channel: "sms",
      messageId: "ai_message_1",
      origin: "ai_drafted",
      status: "draft",
      subject: null
    };
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({ data: { draftCommunicationWithAi: aiDrafted } })
      )
    );

    const result = await createCommunityClient({ fetchImpl }).draftWithAi({
      campaignIntent: "Re-engage members who have not attended recently.",
      channel: "sms",
      churchToneSummary: "Warm, brief, hopeful.",
      groupId: "group-hospitality",
      forbiddenTopics: ["giving"],
      requiredPlaceholders: ["firstName"]
    });

    expect(result).toEqual(aiDrafted);
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("mutation DraftCommunicationWithAi");
    expect(body.query).toContain("$input: DraftCommunicationWithAiInput!");
    // The mutation selects the drafted TEXT so the panel can show it for review.
    expect(body.query).toContain("bodyTemplate");
    // The audience is the group; only PII-free hints are sent — no recipient, no
    // contact value.
    expect(body.variables.input).toEqual({
      audience: { groupId: "group-hospitality", kind: "group" },
      campaignIntent: "Re-engage members who have not attended recently.",
      channel: "sms",
      churchToneSummary: "Warm, brief, hopeful.",
      forbiddenTopics: ["giving"],
      requiredPlaceholders: ["firstName"]
    });
  });

  it("draftWithAi omits the optional list hints when they are not provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          data: {
            draftCommunicationWithAi: {
              bodyTemplate: "Hi {{firstName}}.",
              channel: "sms",
              messageId: "ai_message_2",
              origin: "ai_drafted",
              status: "draft",
              subject: null
            }
          }
        })
      )
    );

    await createCommunityClient({ fetchImpl }).draftWithAi({
      campaignIntent: "Invite the team to setup.",
      channel: "sms",
      churchToneSummary: "Warm.",
      groupId: "group-hospitality"
    });

    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    // Absent optional lists are not sent (kept absent, not null — the server schema
    // applies its own [] defaults).
    expect(body.variables.input).not.toHaveProperty("forbiddenTopics");
    expect(body.variables.input).not.toHaveProperty("requiredPlaceholders");
  });

  it("getResolvedAudience POSTs resolvedAudience and returns included + suppressed refs", async () => {
    const audience = {
      channel: "sms",
      included: [{ channelRef: "channel-anita-sms", memberRef: "member-anita" }],
      suppressed: [
        {
          consentStatus: "denied",
          memberRef: "member-david",
          reason: "consent-not-granted"
        }
      ]
    };
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { resolvedAudience: audience } }))
    );

    const result = await createCommunityClient({ fetchImpl }).getResolvedAudience(
      "message_1"
    );

    expect(result).toEqual(audience);
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("query ResolvedAudience");
    expect(body.query).toContain("$messageId: ID!");
    expect(body.variables).toEqual({ messageId: "message_1" });
  });

  it("confirmAndQueue resolves audience, then reviews, confirms (with reason), then queues — in that order", async () => {
    const operations: string[] = [];
    const audience = {
      channel: "sms",
      included: [{ channelRef: "channel-anita-sms", memberRef: "member-anita" }],
      suppressed: [
        {
          consentStatus: "denied",
          memberRef: "member-david",
          reason: "consent-not-granted"
        },
        { consentStatus: null, memberRef: "member-maria", reason: "no-channel-of-kind" }
      ]
    };
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const { query } = requestBody(init);

      if (query.includes("query ResolvedAudience")) {
        operations.push("audience");

        return Promise.resolve(jsonResponse({ data: { resolvedAudience: audience } }));
      }
      if (query.includes("mutation MarkCommunicationReviewed")) {
        operations.push("review");

        return Promise.resolve(
          jsonResponse({
            data: {
              markCommunicationReviewed: { ...messageRef, status: "reviewed" }
            }
          })
        );
      }
      if (query.includes("mutation ConfirmCommunicationSend")) {
        operations.push("confirm");

        return Promise.resolve(
          jsonResponse({
            data: {
              confirmCommunicationSend: { ...messageRef, status: "confirmed" }
            }
          })
        );
      }
      if (query.includes("mutation QueueConfirmedCommunication")) {
        operations.push("queue");

        return Promise.resolve(
          jsonResponse({
            data: {
              queueConfirmedCommunication: { ...messageRef, status: "sent" }
            }
          })
        );
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const result = await createCommunityClient({ fetchImpl }).confirmAndQueue({
      confirmedByRef: "demo-web-operator",
      messageId: "message_1",
      reason: "Approved by lead"
    });

    // The queued result reports the included + suppressed counts.
    expect(result.includedCount).toBe(1);
    expect(result.suppressedCount).toBe(2);
    expect(result.message.status).toBe("sent");

    // INVARIANT: confirm precedes queue, and queue is the last operation.
    expect(operations).toEqual(["audience", "review", "confirm", "queue"]);
    expect(operations.indexOf("confirm")).toBeLessThan(operations.indexOf("queue"));

    // The confirm carries the human confirmationIntent (confirmed + reason).
    const confirmCall = fetchImpl.mock.calls.find((call) =>
      requestBody(call[1]).query.includes("mutation ConfirmCommunicationSend")
    );
    expect(requestBody(confirmCall?.[1]).variables.input).toEqual({
      confirmationIntent: { confirmed: true, reason: "Approved by lead" },
      confirmedByRef: "demo-web-operator",
      messageId: "message_1"
    });
    // The queue also carries the confirmationIntent.
    const queueCall = fetchImpl.mock.calls.find((call) =>
      requestBody(call[1]).query.includes("mutation QueueConfirmedCommunication")
    );
    expect(requestBody(queueCall?.[1]).variables.input).toEqual({
      confirmationIntent: { confirmed: true, reason: "Approved by lead" },
      messageId: "message_1"
    });
  });

  it("PRIVACY: no comms document selects a contact-value field", async () => {
    const queries: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const { query } = requestBody(init);
      queries.push(query);

      if (query.includes("query ResolvedAudience")) {
        return Promise.resolve(
          jsonResponse({
            data: { resolvedAudience: { channel: "sms", included: [], suppressed: [] } }
          })
        );
      }
      if (query.includes("MarkCommunicationReviewed")) {
        return Promise.resolve(
          jsonResponse({ data: { markCommunicationReviewed: messageRef } })
        );
      }
      if (query.includes("ConfirmCommunicationSend")) {
        return Promise.resolve(
          jsonResponse({ data: { confirmCommunicationSend: messageRef } })
        );
      }
      if (query.includes("QueueConfirmedCommunication")) {
        return Promise.resolve(
          jsonResponse({ data: { queueConfirmedCommunication: messageRef } })
        );
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await createCommunityClient({ fetchImpl }).confirmAndQueue({
      confirmedByRef: "demo-web-operator",
      messageId: "message_1",
      reason: "go"
    });

    for (const query of queries) {
      expect(query).not.toMatch(/\b(phone|address|phoneNumber|emailAddress)\b/i);
    }
  });
});

describe("assembleGroupMemberRows", () => {
  it("joins memberships to members and engagement by memberRef", () => {
    const rows = assembleGroupMemberRows(
      hospitalityMemberships,
      SAMPLE_MEMBERS,
      SAMPLE_ENGAGEMENT_SUMMARIES
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]?.member?.displayName).toBe("Anita Bello");
    expect(rows[0]?.engagement?.attendanceStreak).toBe(4);
  });

  it("keeps a null member when the membership references an unresolved member", () => {
    const orphan = hospitalityMemberships.map((membership) => ({
      ...membership,
      memberRef: "member-ghost"
    }));

    const rows = assembleGroupMemberRows(orphan, SAMPLE_MEMBERS, []);

    expect(rows[0]?.member).toBeNull();
    expect(rows[0]?.engagement).toBeNull();
  });
});
