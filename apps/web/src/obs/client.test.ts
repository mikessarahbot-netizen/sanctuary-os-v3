import { describe, expect, it, vi } from "vitest";
import {
  createObsClient,
  DEFAULT_API_URL,
  SWITCH_SCENE_ACTION_KIND
} from "./client.js";
import type {
  ObsActionIntent,
  ObsConnectionProfile,
  ObsScene
} from "./types.js";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });

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

const CONNECTION: ObsConnectionProfile = {
  connectionProfileId: "obs-connection-sanctuary",
  connectionRef: "vault://obs/demo-sanctuary",
  connectionStatus: "connected",
  label: "Sanctuary OBS",
  obsWebsocketVersion: "5.0.0",
  tenantId: "tenant-demo"
};

const WORSHIP_SCENE: ObsScene = {
  connectionProfileId: "obs-connection-sanctuary",
  displayName: "Worship",
  isCurrentProgramScene: true,
  obsSceneRef: "scene-worship",
  orderHint: 0,
  sceneId: "scene-1",
  tenantId: "tenant-demo"
};

const REQUESTED_INTENT: ObsActionIntent = {
  actionIntentId: "action_1",
  kind: "switch_scene",
  origin: "human",
  safeFailureMessage: null,
  status: "requested",
  targetSceneRef: "scene-sermon"
};

/**
 * Route a GraphQL POST to a canned response by inspecting the operation name in
 * the query string, so `loadConsole`'s connections + 4 parallel reads each get a
 * matching body.
 */
const routedFetch = (): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>((_, init) => {
    const { query } = requestBody(init);

    if (query.includes("ListObsConnections")) {
      return Promise.resolve(
        jsonResponse({ data: { obsConnectionProfiles: [CONNECTION] } })
      );
    }

    if (query.includes("ObsScenes")) {
      return Promise.resolve(jsonResponse({ data: { obsScenes: [WORSHIP_SCENE] } }));
    }

    if (query.includes("ObsStreamState")) {
      return Promise.resolve(
        jsonResponse({
          data: {
            obsStreamState: {
              connectionProfileId: "obs-connection-sanctuary",
              streamStatus: "active",
              tenantId: "tenant-demo",
              updatedAt: "2026-06-18T00:00:00.000Z"
            }
          }
        })
      );
    }

    if (query.includes("ObsRecordingState")) {
      return Promise.resolve(
        jsonResponse({
          data: {
            obsRecordingState: {
              connectionProfileId: "obs-connection-sanctuary",
              recordingStatus: "inactive",
              tenantId: "tenant-demo",
              updatedAt: "2026-06-18T00:00:00.000Z"
            }
          }
        })
      );
    }

    if (query.includes("ObsActionLog")) {
      return Promise.resolve(jsonResponse({ data: { obsActionLog: [] } }));
    }

    throw new Error(`Unexpected query: ${query}`);
  });

describe("createObsClient", () => {
  it("loads the console from the connection + scene + state + log queries", async () => {
    const fetchImpl = routedFetch();

    const console = await createObsClient({
      endpoint: "http://example.test/graphql",
      fetchImpl
    }).loadConsole();

    expect(console.connection?.label).toBe("Sanctuary OBS");
    expect(console.scenes).toEqual([WORSHIP_SCENE]);
    expect(console.streamState?.streamStatus).toBe("active");
    expect(console.recordingState?.recordingStatus).toBe("inactive");
    // The first call is the connections query at the configured endpoint.
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://example.test/graphql");
  });

  it("returns an empty console when no connection exists", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { obsConnectionProfiles: [] } }))
    );

    const console = await createObsClient({ fetchImpl }).loadConsole();

    expect(console.connection).toBeNull();
    expect(console.scenes).toEqual([]);
    // Only the connections query runs; the per-connection reads are skipped.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DEFAULT_API_URL);
  });

  it("POSTs requestObsAction with the switch_scene kind + human origin + target", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { requestObsAction: REQUESTED_INTENT } }))
    );

    const intent = await createObsClient({ fetchImpl }).requestSwitchScene({
      connectionProfileId: "obs-connection-sanctuary",
      requestedByRef: "demo-web-operator",
      targetSceneRef: "scene-sermon"
    });

    expect(intent).toEqual(REQUESTED_INTENT);
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("mutation RequestObsAction");
    expect(body.query).toContain("$input: RequestObsActionInput!");
    expect(body.variables.input).toEqual({
      connectionProfileId: "obs-connection-sanctuary",
      kind: SWITCH_SCENE_ACTION_KIND,
      origin: "human",
      requestedByRef: "demo-web-operator",
      targetSceneRef: "scene-sermon"
    });
  });

  it("POSTs confirmObsAction with the confirmationIntent reason + confirmedByRef", async () => {
    const confirmed: ObsActionIntent = { ...REQUESTED_INTENT, status: "confirmed" };
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { confirmObsAction: confirmed } }))
    );

    const intent = await createObsClient({ fetchImpl }).confirmAction({
      actionIntentId: "action_1",
      confirmedByRef: "demo-web-operator",
      reason: "Pastor is walking up."
    });

    expect(intent.status).toBe("confirmed");
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("mutation ConfirmObsAction");
    expect(body.variables.input).toEqual({
      actionIntentId: "action_1",
      confirmationIntent: { confirmed: true, reason: "Pastor is walking up." },
      confirmedByRef: "demo-web-operator"
    });
  });

  it("POSTs dispatchObsAction with just the action intent id", async () => {
    const succeeded: ObsActionIntent = { ...REQUESTED_INTENT, status: "succeeded" };
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ data: { dispatchObsAction: succeeded } }))
    );

    const intent = await createObsClient({ fetchImpl }).dispatchAction({
      actionIntentId: "action_1"
    });

    expect(intent.status).toBe("succeeded");
    const body = requestBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.query).toContain("mutation DispatchObsAction");
    expect(body.variables.input).toEqual({ actionIntentId: "action_1" });
  });

  it("throws the first GraphQL error message", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          errors: [
            { message: "This OBS action cannot be dispatched until a human has confirmed it." }
          ]
        })
      )
    );

    await expect(
      createObsClient({ fetchImpl }).dispatchAction({ actionIntentId: "action_1" })
    ).rejects.toThrow(/confirmed/);
  });

  it("throws when the HTTP status is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("nope", { status: 401 }))
    );

    await expect(
      createObsClient({ fetchImpl }).loadConsole()
    ).rejects.toThrow("HTTP 401");
  });
});
