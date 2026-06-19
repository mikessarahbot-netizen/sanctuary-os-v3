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
