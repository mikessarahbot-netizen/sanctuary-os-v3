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

interface GraphqlObsConnectionProfile {
  readonly connectionProfileId: string;
  readonly connectionRef: string;
  readonly connectionStatus: string;
  readonly label: string;
}

interface GraphqlObsScene {
  readonly displayName: string;
  readonly isCurrentProgramScene: boolean;
  readonly obsSceneRef: string;
}

interface GraphqlObsStreamState {
  readonly streamStatus: string;
}

interface GraphqlObsRecordingState {
  readonly recordingStatus: string;
}

interface GraphqlObsActionIntent {
  readonly actionIntentId: string;
  readonly kind: string;
  readonly origin: string;
  readonly status: string;
  readonly targetSceneRef: string | null;
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

  it("serves the seeded OBS connection + scene catalog with the program scene highlighted", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const profilesPayload = await postGraphql<{
      readonly obsConnectionProfiles: readonly GraphqlObsConnectionProfile[];
    }>(endpoint, {
      query:
        "{ obsConnectionProfiles { connectionProfileId connectionRef connectionStatus label } }"
    });

    expect(profilesPayload.errors).toBeUndefined();
    const profiles = profilesPayload.data?.obsConnectionProfiles ?? [];
    const profile = profiles.find(
      (entry) => entry.connectionProfileId === "obs-connection-sanctuary"
    );
    expect(profile?.label).toBe("Sanctuary OBS");
    // A refresh reads the live (fake) port, so the connection is marked connected.
    expect(profile?.connectionStatus).toBe("connected");
    // The connection carries only an opaque vault ref — never a secret.
    expect(profile?.connectionRef).toBe("vault://obs/demo-sanctuary");

    const scenesPayload = await postGraphql<{
      readonly obsScenes: readonly GraphqlObsScene[];
    }>(endpoint, {
      query:
        "query Scenes($id: ID!) { obsScenes(connectionProfileId: $id) { displayName obsSceneRef isCurrentProgramScene } }",
      variables: { id: "obs-connection-sanctuary" }
    });

    expect(scenesPayload.errors).toBeUndefined();
    const scenes = scenesPayload.data?.obsScenes ?? [];
    expect(scenes.map((scene) => scene.displayName).sort()).toEqual([
      "Announcements",
      "Sermon",
      "Worship"
    ]);
    // Exactly one program scene, and it is Worship (the seeded program scene).
    const programScenes = scenes.filter((scene) => scene.isCurrentProgramScene);
    expect(programScenes).toHaveLength(1);
    expect(programScenes[0]?.obsSceneRef).toBe("scene-worship");

    const statePayload = await postGraphql<{
      readonly obsStreamState: GraphqlObsStreamState | null;
      readonly obsRecordingState: GraphqlObsRecordingState | null;
    }>(endpoint, {
      query:
        "query State($id: ID!) { obsStreamState(connectionProfileId: $id) { streamStatus } obsRecordingState(connectionProfileId: $id) { recordingStatus } }",
      variables: { id: "obs-connection-sanctuary" }
    });

    expect(statePayload.errors).toBeUndefined();
    expect(statePayload.data?.obsStreamState?.streamStatus).toBe("active");
    expect(statePayload.data?.obsRecordingState?.recordingStatus).toBe("inactive");
  });

  it("PRIVACY: OBS connection exposes no host/port/password/stream-key field", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    // Selecting a connection-secret field must be a schema error — no such field
    // exists on ObsConnectionProfile; only the opaque connectionRef.
    const invalid = await postGraphql<{ readonly obsConnectionProfiles: unknown }>(
      endpoint,
      {
        query:
          "{ obsConnectionProfiles { connectionRef host port password streamKey } }"
      }
    );
    expect(invalid.errors).toBeDefined();

    const valid = await postGraphql<{
      readonly obsConnectionProfiles: readonly GraphqlObsConnectionProfile[];
    }>(endpoint, {
      query: "{ obsConnectionProfiles { connectionProfileId connectionRef label } }"
    });
    expect(valid.errors).toBeUndefined();
    const serialized = JSON.stringify(valid.data?.obsConnectionProfiles ?? []);
    // Only an opaque vault:// ref, never a ws:// URL, password, or stream key.
    expect(serialized).toContain("vault://");
    expect(serialized).not.toContain("ws://");
    expect(serialized).not.toContain("password");
  });

  it("drives the request -> confirm -> dispatch scene-switch gate over HTTP and moves the program scene", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    // 1. Request a switch to Sermon. This proposes a `requested` intent and does
    //    NOT touch OBS — the program scene is unchanged.
    const requested = await postGraphql<{
      readonly requestObsAction: GraphqlObsActionIntent;
    }>(endpoint, {
      query:
        "mutation Request($input: RequestObsActionInput!) { requestObsAction(input: $input) { actionIntentId kind origin status targetSceneRef } }",
      variables: {
        input: {
          connectionProfileId: "obs-connection-sanctuary",
          kind: "switch_scene",
          origin: "human",
          requestedByRef: "demo-actor",
          targetSceneRef: "scene-sermon"
        }
      }
    });

    expect(requested.errors).toBeUndefined();
    const intent = requested.data?.requestObsAction;
    expect(intent?.status).toBe("requested");
    // The SDL underscored enum round-trips back to the SDL value name.
    expect(intent?.kind).toBe("switch_scene");
    expect(intent?.targetSceneRef).toBe("scene-sermon");
    const actionIntentId = intent?.actionIntentId ?? "";

    // Program scene is still Worship — a request alone never goes live.
    const afterRequest = await postGraphql<{
      readonly obsScenes: readonly GraphqlObsScene[];
    }>(endpoint, {
      query:
        "query Scenes($id: ID!) { obsScenes(connectionProfileId: $id) { obsSceneRef isCurrentProgramScene } }",
      variables: { id: "obs-connection-sanctuary" }
    });
    const programAfterRequest = (afterRequest.data?.obsScenes ?? []).find(
      (scene) => scene.isCurrentProgramScene
    );
    expect(programAfterRequest?.obsSceneRef).toBe("scene-worship");

    // 2. Confirm (human gate) with a reason.
    const confirmed = await postGraphql<{
      readonly confirmObsAction: GraphqlObsActionIntent;
    }>(endpoint, {
      query:
        "mutation Confirm($input: ConfirmObsActionInput!) { confirmObsAction(input: $input) { actionIntentId status } }",
      variables: {
        input: {
          actionIntentId,
          confirmationIntent: { confirmed: true, reason: "Pastor is walking up." },
          confirmedByRef: "demo-actor"
        }
      }
    });
    expect(confirmed.errors).toBeUndefined();
    expect(confirmed.data?.confirmObsAction.status).toBe("confirmed");

    // 3. Dispatch — the only step that reaches the (fake) OBS port.
    const dispatched = await postGraphql<{
      readonly dispatchObsAction: GraphqlObsActionIntent;
    }>(endpoint, {
      query:
        "mutation Dispatch($input: DispatchObsActionInput!) { dispatchObsAction(input: $input) { actionIntentId status } }",
      variables: { input: { actionIntentId } }
    });
    expect(dispatched.errors).toBeUndefined();
    expect(dispatched.data?.dispatchObsAction.status).toBe("succeeded");

    // The fake port applied the switch; refresh reconciles the durable snapshot so
    // the program scene is now Sermon.
    await postGraphql<{ readonly refreshObsCatalog: { readonly streamState: GraphqlObsStreamState } }>(
      endpoint,
      {
        query:
          "mutation Refresh($input: RefreshObsCatalogInput!) { refreshObsCatalog(input: $input) { streamState { streamStatus } } }",
        variables: { input: { connectionProfileId: "obs-connection-sanctuary" } }
      }
    );

    const afterDispatch = await postGraphql<{
      readonly obsScenes: readonly GraphqlObsScene[];
    }>(endpoint, {
      query:
        "query Scenes($id: ID!) { obsScenes(connectionProfileId: $id) { obsSceneRef isCurrentProgramScene } }",
      variables: { id: "obs-connection-sanctuary" }
    });
    const programAfterDispatch = (afterDispatch.data?.obsScenes ?? []).find(
      (scene) => scene.isCurrentProgramScene
    );
    expect(programAfterDispatch?.obsSceneRef).toBe("scene-sermon");
  });

  it("GATE: refuses to dispatch a scene switch that was not confirmed", async () => {
    const { seed, server } = createDemoServer();
    await seed();
    const endpoint = await startServer(server);

    const requested = await postGraphql<{
      readonly requestObsAction: GraphqlObsActionIntent;
    }>(endpoint, {
      query:
        "mutation Request($input: RequestObsActionInput!) { requestObsAction(input: $input) { actionIntentId status } }",
      variables: {
        input: {
          connectionProfileId: "obs-connection-sanctuary",
          kind: "switch_scene",
          origin: "human",
          requestedByRef: "demo-actor",
          targetSceneRef: "scene-announcements"
        }
      }
    });
    const actionIntentId = requested.data?.requestObsAction.actionIntentId ?? "";

    // Dispatch WITHOUT confirming → the gate refuses (NOT_CONFIRMED), and the
    // program scene is unchanged.
    const dispatched = await postGraphql<{
      readonly dispatchObsAction: GraphqlObsActionIntent | null;
    }>(endpoint, {
      query:
        "mutation Dispatch($input: DispatchObsActionInput!) { dispatchObsAction(input: $input) { actionIntentId status } }",
      variables: { input: { actionIntentId } }
    });
    expect(dispatched.errors).toBeDefined();
    expect(dispatched.data?.dispatchObsAction ?? null).toBeNull();

    const scenes = await postGraphql<{
      readonly obsScenes: readonly GraphqlObsScene[];
    }>(endpoint, {
      query:
        "query Scenes($id: ID!) { obsScenes(connectionProfileId: $id) { obsSceneRef isCurrentProgramScene } }",
      variables: { id: "obs-connection-sanctuary" }
    });
    const program = (scenes.data?.obsScenes ?? []).find(
      (scene) => scene.isCurrentProgramScene
    );
    expect(program?.obsSceneRef).toBe("scene-worship");
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
