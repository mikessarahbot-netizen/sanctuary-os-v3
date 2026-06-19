import { describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import {
  ObsActionIntentSchema,
  ObsConnectionProfileSchema,
  ObsDomainError,
  type ObsActionIntent,
  type ObsCommandService,
  type ObsConnectionProfile,
  type ObsQueryService
} from "../domain/obs/index.js";
import {
  createObsGraphqlResolvers,
  obsGraphqlTypeDefs,
  type ObsGraphqlContext
} from "./obs.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";
import { createPresenterGraphqlRequestHandler } from "./transport.js";

const graphqlContext: ObsGraphqlContext = {
  actor: {
    actorId: "leader_1",
    roles: ["worship_leader"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const connectionProfile: ObsConnectionProfile = ObsConnectionProfileSchema.parse({
  connectionProfileId: "connection_1",
  connectionRef: "vault://obs/connection_1",
  connectionStatus: "connected",
  createdAt: timestamp,
  label: "Sanctuary OBS",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const requestedIntent: ObsActionIntent = ObsActionIntentSchema.parse({
  actionIntentId: "action_1",
  affectsLiveOutput: true,
  connectionProfileId: "connection_1",
  createdAt: timestamp,
  kind: "switch-scene",
  origin: "human",
  requestedByRef: "operator_1",
  status: "requested",
  targetSceneRef: "scene-lower",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

const createObsQueryService = (
  overrides: Partial<ObsQueryService> = {}
): ObsQueryService => ({
  getObsConnectionProfile: vi.fn<ObsQueryService["getObsConnectionProfile"]>(() =>
    Promise.resolve(connectionProfile)
  ),
  getObsRecordingState: vi.fn<ObsQueryService["getObsRecordingState"]>(() =>
    Promise.resolve(null)
  ),
  getObsStreamState: vi.fn<ObsQueryService["getObsStreamState"]>(() =>
    Promise.resolve(null)
  ),
  listObsActionIntents: vi.fn<ObsQueryService["listObsActionIntents"]>(() =>
    Promise.resolve([requestedIntent])
  ),
  listObsActionLog: vi.fn<ObsQueryService["listObsActionLog"]>(() =>
    Promise.resolve([])
  ),
  listObsConnectionProfiles: vi.fn<ObsQueryService["listObsConnectionProfiles"]>(
    () => Promise.resolve([connectionProfile])
  ),
  listObsSceneItems: vi.fn<ObsQueryService["listObsSceneItems"]>(() =>
    Promise.resolve([])
  ),
  listObsScenes: vi.fn<ObsQueryService["listObsScenes"]>(() => Promise.resolve([])),
  listObsSources: vi.fn<ObsQueryService["listObsSources"]>(() => Promise.resolve([])),
  ...overrides
});

const createObsCommandService = (
  overrides: Partial<ObsCommandService> = {}
): ObsCommandService => ({
  refreshObsCatalog: vi.fn<ObsCommandService["refreshObsCatalog"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  removeObsConnectionProfile: vi.fn<ObsCommandService["removeObsConnectionProfile"]>(
    () => Promise.resolve()
  ),
  requestObsAction: vi.fn<ObsCommandService["requestObsAction"]>(() =>
    Promise.resolve(requestedIntent)
  ),
  saveObsConnectionProfile: vi.fn<ObsCommandService["saveObsConnectionProfile"]>(
    () => Promise.resolve(connectionProfile)
  ),
  ...overrides
});

describe("obsGraphqlTypeDefs", () => {
  it("declares the planned OBS read + connection/catalog + request contract", () => {
    expect(obsGraphqlTypeDefs).toContain(
      "obsConnectionProfiles(\n      filter: ObsConnectionProfilesFilterInput\n    ): [ObsConnectionProfile!]!"
    );
    expect(obsGraphqlTypeDefs).toContain("obsConnectionProfile(id: ID!): ObsConnectionProfile");
    expect(obsGraphqlTypeDefs).toContain(
      "obsSceneItems(connectionProfileId: ID!, sceneRef: ID): [ObsSceneItem!]!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "saveObsConnectionProfile(\n      input: SaveObsConnectionProfileInput!\n    ): ObsConnectionProfile!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "removeObsConnectionProfile(input: RemoveObsConnectionProfileInput!): Boolean!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "refreshObsCatalog(input: RefreshObsCatalogInput!): ObsCatalogSnapshot!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "requestObsAction(input: RequestObsActionInput!): ObsActionIntent!"
    );
  });

  it("does not declare the slice-7 confirm/dispatch gate mutations", () => {
    expect(obsGraphqlTypeDefs).not.toContain("confirmObsAction");
    expect(obsGraphqlTypeDefs).not.toContain("dispatchObsAction");
  });

  it("never exposes a host/port/password/token/stream-key field on any OBS type", () => {
    expect(obsGraphqlTypeDefs).not.toContain("host");
    expect(obsGraphqlTypeDefs).not.toContain("port:");
    expect(obsGraphqlTypeDefs).not.toContain("password");
    expect(obsGraphqlTypeDefs).not.toContain("token");
    expect(obsGraphqlTypeDefs).not.toContain("streamKey");
  });
});

describe("createObsGraphqlResolvers", () => {
  it("delegates obsConnectionProfiles with actor and request scope", async () => {
    const listObsConnectionProfiles = vi.fn<
      ObsQueryService["listObsConnectionProfiles"]
    >(() => Promise.resolve([connectionProfile]));
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService(),
      obsQueryService: createObsQueryService({ listObsConnectionProfiles })
    });

    await expect(
      resolvers.Query.obsConnectionProfiles(undefined, {}, graphqlContext)
    ).resolves.toEqual([connectionProfile]);

    expect(listObsConnectionProfiles).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {},
      requestId: "request_1"
    });
  });

  it("delegates requestObsAction to the command service", async () => {
    const requestObsAction = vi.fn<ObsCommandService["requestObsAction"]>(() =>
      Promise.resolve(requestedIntent)
    );
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ requestObsAction }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.requestObsAction(
        undefined,
        {
          input: {
            connectionProfileId: "connection_1",
            kind: "switch-scene",
            origin: "human",
            requestedByRef: "operator_1",
            targetSceneRef: "scene-lower"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(requestedIntent);

    expect(requestObsAction).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_1"
    });
  });

  it("requires an explicit confirmation intent to remove a connection profile", async () => {
    const removeObsConnectionProfile = vi.fn<
      ObsCommandService["removeObsConnectionProfile"]
    >(() => Promise.resolve());
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ removeObsConnectionProfile }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.removeObsConnectionProfile(
        undefined,
        { input: { connectionProfileId: "connection_1" } },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(removeObsConnectionProfile).not.toHaveBeenCalled();
  });

  it("propagates service errors without replacing them with vendor details", async () => {
    const listObsConnectionProfiles = vi.fn<
      ObsQueryService["listObsConnectionProfiles"]
    >(() => Promise.reject(new Error("OBS store unavailable.")));
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService(),
      obsQueryService: createObsQueryService({ listObsConnectionProfiles })
    });

    await expect(
      resolvers.Query.obsConnectionProfiles(undefined, {}, graphqlContext)
    ).rejects.toThrow("OBS store unavailable.");
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

describe("OBS GraphQL transport", () => {
  it("builds the executable schema with OBS deps and executes a query", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService(),
          obsQueryService: createObsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "{ obsConnectionProfiles { connectionProfileId connectionRef connectionStatus label } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        obsConnectionProfiles: [
          {
            connectionProfileId: "connection_1",
            connectionRef: "vault://obs/connection_1",
            connectionStatus: "connected",
            label: "Sanctuary OBS"
          }
        ]
      }
    });
  });

  it("executes the requestObsAction mutation through the full transport with hyphenated enum mapping", async () => {
    const requestObsAction = vi.fn<ObsCommandService["requestObsAction"]>(() =>
      Promise.resolve(requestedIntent)
    );
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService({ requestObsAction }),
          obsQueryService: createObsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation request($input: RequestObsActionInput!) { requestObsAction(input: $input) { actionIntentId kind origin status targetSceneRef } }",
        variables: {
          input: {
            connectionProfileId: "connection_1",
            kind: "switch_scene",
            origin: "human",
            requestedByRef: "operator_1",
            targetSceneRef: "scene-lower"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    // `switch_scene` (SDL) is mapped to the domain value `switch-scene` before the
    // service is called.
    expect(requestObsAction).toHaveBeenCalledWith({
      actor,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_1"
    });
    // The hyphenated domain kind serializes back as the underscore SDL enum name.
    expect(response.body).toEqual({
      data: {
        requestObsAction: {
          actionIntentId: "action_1",
          kind: "switch_scene",
          origin: "human",
          status: "requested",
          targetSceneRef: "scene-lower"
        }
      }
    });
  });

  it("surfaces a typed OBS domain error as a conflict code with a safe message", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService({
            requestObsAction: () =>
              Promise.reject(
                new ObsDomainError(
                  "ACTION_INELIGIBLE",
                  "This OBS action is not eligible against the current snapshot."
                )
              )
          }),
          obsQueryService: createObsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation request($input: RequestObsActionInput!) { requestObsAction(input: $input) { actionIntentId } }",
        variables: {
          input: {
            connectionProfileId: "connection_1",
            kind: "start_stream",
            origin: "human",
            requestedByRef: "operator_1"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]).toEqual({
      extensions: { code: "ACTION_INELIGIBLE" },
      message: "This OBS action is not eligible against the current snapshot."
    });
  });
});
