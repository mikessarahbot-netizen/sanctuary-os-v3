import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoServer, DemoAuthBoundary } from "./server.js";

/**
 * Gate test for the runnable demo server.
 *
 * Boots the composed demo server on an ephemeral port, performs real HTTP POSTs
 * to `/graphql`, and asserts the seeded Charts round-trip end-to-end (and that a
 * mutation persists into a subsequent query). This proves the server actually
 * runs over a socket — not just that the resolver functions resolve — so the
 * parent can rely on `pnpm --filter @sanctuary-os/api dev` serving live data.
 */
interface GraphqlChart {
  readonly chartId: string;
  readonly defaultKey: string;
  readonly title: string | null;
}

interface GraphqlTrackSet {
  readonly arrangementRef: string | null;
  readonly defaultKey: string;
  readonly title: string | null;
  readonly trackSetId: string;
}

interface GraphqlPlaySection {
  readonly label: string | null;
  readonly sectionId: string;
}

interface GraphqlPlayCue {
  readonly action: string;
  readonly label: string;
}

interface GraphqlCommunityGroup {
  readonly groupId: string;
  readonly kind: string;
  readonly label: string;
  readonly leaderMemberRef: string | null;
}

interface GraphqlContactChannelRef {
  readonly channelRef: string;
  readonly consentStatus: string;
  readonly kind: string;
}

interface GraphqlMember {
  readonly contactChannelRefs: readonly GraphqlContactChannelRef[];
  readonly displayName: string;
  readonly memberId: string;
  readonly status: string;
}

interface GraphqlGroupMembership {
  readonly memberRef: string;
  readonly roleInGroup: string;
}

interface GraphqlEngagementSummary {
  readonly scope: { readonly memberRef?: string };
  readonly servingCount: number;
  readonly summaryId: string;
}

interface GraphqlBody<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly { readonly message: string }[];
}

const DEMO_AUTH_HEADER = "Bearer demo-token";

describe("createDemoServer", () => {
  const servers: Server[] = [];

  const startServer = async (server: Server): Promise<string> => {
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;

    return `http://127.0.0.1:${String(address.port)}/graphql`;
  };

  const postGraphql = async <TData>(
    endpoint: string,
    body: Readonly<Record<string, unknown>>
  ): Promise<GraphqlBody<TData>> => {
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers: { authorization: DEMO_AUTH_HEADER, "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(200);

    return (await response.json()) as GraphqlBody<TData>;
  };

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          })
      )
    );
  });

  it("serves the seeded charts over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{ readonly charts: readonly GraphqlChart[] }>(endpoint, {
      query: "{ charts { chartId title defaultKey } }"
    });

    expect(payload.errors).toBeUndefined();
    const titles = (payload.data?.charts ?? []).map((chart) => chart.title);
    expect(titles).toContain("Amazing Grace");
    expect(titles).toContain("How Great Thou Art");
    expect(titles).toContain("Cornerstone");
  });

  it("resolves a single seeded chart by id over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{ readonly chart: GraphqlChart | null }>(endpoint, {
      query: "query GetChart($id: ID!) { chart(id: $id) { chartId title defaultKey } }",
      variables: { id: "chart-cornerstone" }
    });

    expect(payload.errors).toBeUndefined();
    expect(payload.data?.chart).toEqual({
      chartId: "chart-cornerstone",
      defaultKey: "C",
      title: "Cornerstone"
    });
  });

  it("round-trips a saveChart mutation into a follow-up query over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const mutation = await postGraphql<{ readonly saveChart: GraphqlChart }>(endpoint, {
      query:
        "mutation Save($input: SaveChartInput!) { saveChart(input: $input) { chartId title defaultKey } }",
      variables: {
        input: {
          chartId: "chart-demo-roundtrip",
          chordProSource: "{title: Demo Round Trip}\n[A]Live [D]from the [E]server",
          defaultKey: "A",
          songRef: "song-demo-roundtrip",
          title: "Demo Round Trip"
        }
      }
    });

    expect(mutation.errors).toBeUndefined();
    expect(mutation.data?.saveChart.chartId).toBe("chart-demo-roundtrip");

    const query = await postGraphql<{ readonly chart: GraphqlChart | null }>(endpoint, {
      query: "query GetChart($id: ID!) { chart(id: $id) { chartId title } }",
      variables: { id: "chart-demo-roundtrip" }
    });

    expect(query.errors).toBeUndefined();
    expect(query.data?.chart).toEqual({
      chartId: "chart-demo-roundtrip",
      title: "Demo Round Trip"
    });
  });

  it("serves the seeded play track sets over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{ readonly trackSets: readonly GraphqlTrackSet[] }>(
      endpoint,
      {
        query:
          "{ trackSets { trackSetId title defaultKey arrangementRef } }"
      }
    );

    expect(payload.errors).toBeUndefined();
    const titles = (payload.data?.trackSets ?? []).map((trackSet) => trackSet.title);
    expect(titles).toContain("Build My Life");
    expect(titles).toContain("Goodness of God");
  });

  it("resolves a seeded track set's sections and cues over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const trackSetPayload = await postGraphql<{
      readonly trackSet: GraphqlTrackSet | null;
    }>(endpoint, {
      query:
        "query GetTrackSet($id: ID!) { trackSet(id: $id) { trackSetId title arrangementRef } }",
      variables: { id: "track-set-build-my-life" }
    });

    expect(trackSetPayload.errors).toBeUndefined();
    expect(trackSetPayload.data?.trackSet?.title).toBe("Build My Life");
    expect(trackSetPayload.data?.trackSet?.arrangementRef).toBe("arr-build-my-life");

    const sectionsPayload = await postGraphql<{
      readonly playSections: readonly GraphqlPlaySection[];
    }>(endpoint, {
      query:
        "query Sections($arrangementRef: ID!) { playSections(arrangementRef: $arrangementRef) { sectionId label } }",
      variables: { arrangementRef: "arr-build-my-life" }
    });

    expect(sectionsPayload.errors).toBeUndefined();
    const sectionIds = (sectionsPayload.data?.playSections ?? []).map(
      (section) => section.sectionId
    );
    expect(sectionIds).toContain("section-bml-intro");
    expect(sectionIds).toContain("section-bml-verse");
    expect(sectionIds).toContain("section-bml-chorus");

    const cuesPayload = await postGraphql<{
      readonly playCues: readonly GraphqlPlayCue[];
    }>(endpoint, {
      query:
        "query Cues($trackSetId: ID!) { playCues(trackSetId: $trackSetId) { label action } }",
      variables: { trackSetId: "track-set-build-my-life" }
    });

    expect(cuesPayload.errors).toBeUndefined();
    const cueLabels = (cuesPayload.data?.playCues ?? []).map((cue) => cue.label);
    expect(cueLabels).toContain("Start intro pad");
    expect(cueLabels).toContain("Jump to chorus");
  });

  it("serves the seeded community groups over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{
      readonly communityGroups: readonly GraphqlCommunityGroup[];
    }>(endpoint, {
      query: "{ communityGroups { groupId kind label leaderMemberRef } }"
    });

    expect(payload.errors).toBeUndefined();
    const groups = payload.data?.communityGroups ?? [];
    const labels = groups.map((group) => group.label);
    expect(labels).toContain("Hospitality Team");
    expect(labels).toContain("Tuesday Small Group");
    // GraphQL serializes the hyphenated domain kind to the underscored SDL name.
    const hospitality = groups.find((group) => group.groupId === "group-hospitality");
    expect(hospitality?.kind).toBe("serving_team");
    expect(hospitality?.leaderMemberRef).toBe("member-anita");
  });

  it("resolves a seeded group's memberships and members over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const membershipsPayload = await postGraphql<{
      readonly groupMemberships: readonly GraphqlGroupMembership[];
    }>(endpoint, {
      query:
        "query Memberships($groupId: ID!) { groupMemberships(groupId: $groupId) { memberRef roleInGroup } }",
      variables: { groupId: "group-hospitality" }
    });

    expect(membershipsPayload.errors).toBeUndefined();
    const memberRefs = (membershipsPayload.data?.groupMemberships ?? []).map(
      (membership) => membership.memberRef
    );
    expect(memberRefs).toContain("member-anita");
    expect(memberRefs).toContain("member-david");
    expect(memberRefs).toContain("member-maria");

    const membersPayload = await postGraphql<{
      readonly members: readonly GraphqlMember[];
    }>(endpoint, {
      query:
        "{ members { memberId displayName status contactChannelRefs { channelRef kind consentStatus } } }"
    });

    expect(membersPayload.errors).toBeUndefined();
    const members = membersPayload.data?.members ?? [];
    const names = members.map((member) => member.displayName);
    expect(names).toContain("Anita Bello");
    expect(names).toContain("Jon Pierce");
  });

  it("PRIVACY: serves only opaque contact refs (no contact-value field, no value leak)", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    // Selecting a contact-value field must be a schema error — no such field
    // exists on Member; only the opaque ref (channelRef / kind / consentStatus).
    const invalid = await postGraphql<{ readonly members: unknown }>(endpoint, {
      query: "{ members { displayName phone email address } }"
    });
    expect(invalid.errors).toBeDefined();

    // The valid projection carries only the opaque ref + consent — never a
    // phone/email/address value.
    const valid = await postGraphql<{ readonly members: readonly GraphqlMember[] }>(
      endpoint,
      {
        query:
          "{ members { displayName contactChannelRefs { channelRef kind consentStatus } } }"
      }
    );
    expect(valid.errors).toBeUndefined();
    const serialized = JSON.stringify(valid.data?.members ?? []);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/\d{7,}/);
    const anita = (valid.data?.members ?? []).find(
      (member) => member.displayName === "Anita Bello"
    );
    expect(anita?.contactChannelRefs.map((ref) => ref.kind).sort()).toEqual([
      "email",
      "sms"
    ]);
  });

  it("serves the derived engagement summaries over HTTP", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const payload = await postGraphql<{
      readonly engagementSummaries: readonly GraphqlEngagementSummary[];
    }>(endpoint, {
      query:
        "{ engagementSummaries(filter: { scopeKind: member }) { summaryId servingCount scope { ... on EngagementMemberScope { memberRef } } } }"
    });

    expect(payload.errors).toBeUndefined();
    const summaries = payload.data?.engagementSummaries ?? [];
    const memberRefs = summaries
      .map((summary) => summary.scope.memberRef)
      .filter((ref): ref is string => ref !== undefined);
    // Anita is in two active groups, so her serving count is 2.
    const anita = summaries.find(
      (summary) => summary.scope.memberRef === "member-anita"
    );
    expect(memberRefs).toContain("member-anita");
    expect(anita?.servingCount).toBe(2);
  });

  it("rejects a request with no Authorization header", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const response = await fetch(endpoint, {
      body: JSON.stringify({ query: "{ charts { chartId } }" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(401);
  });
});

describe("DemoAuthBoundary", () => {
  it("resolves every request to the fixed demo actor", async () => {
    const actor = await new DemoAuthBoundary().resolveActor("Bearer anything");

    expect(actor.tenantId).toBe("tenant-demo");
    expect(actor.actorId).toBe("demo-actor");
    expect(actor.roles).toContain("worship_leader");
  });
});
