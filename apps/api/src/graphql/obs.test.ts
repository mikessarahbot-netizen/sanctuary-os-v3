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

/**
 * A `requested`, `origin = "ai-suggested"` intent — the exact shape
 * `suggestObsActionWithAi` returns (the service turned a validated AI suggestion
 * into a requested intent). It is born unconfirmed and bound by the same
 * confirm→dispatch gate as a human request: it can never self-advance.
 */
const aiSuggestedIntent: ObsActionIntent = ObsActionIntentSchema.parse({
  ...requestedIntent,
  actionIntentId: "action_ai",
  origin: "ai-suggested"
});

const confirmation = {
  confirmed: true,
  confirmedAt: timestamp,
  confirmedByRef: "operator_1",
  reason: "Go to the lower-third for announcements."
} as const;

const confirmedIntent: ObsActionIntent = ObsActionIntentSchema.parse({
  ...requestedIntent,
  confirmation,
  status: "confirmed"
});

const succeededIntent: ObsActionIntent = ObsActionIntentSchema.parse({
  ...requestedIntent,
  confirmation,
  status: "succeeded"
});

const canceledIntent: ObsActionIntent = ObsActionIntentSchema.parse({
  ...requestedIntent,
  status: "canceled"
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
  cancelObsAction: vi.fn<ObsCommandService["cancelObsAction"]>(() =>
    Promise.resolve(canceledIntent)
  ),
  confirmObsAction: vi.fn<ObsCommandService["confirmObsAction"]>(() =>
    Promise.resolve(confirmedIntent)
  ),
  dispatchObsAction: vi.fn<ObsCommandService["dispatchObsAction"]>(() =>
    Promise.resolve(succeededIntent)
  ),
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
  suggestObsActionWithAi: vi.fn<ObsCommandService["suggestObsActionWithAi"]>(() =>
    Promise.resolve(requestedIntent)
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

  it("declares the slice-7 confirm/dispatch/cancel gate mutations returning the intent", () => {
    expect(obsGraphqlTypeDefs).toContain(
      "confirmObsAction(input: ConfirmObsActionInput!): ObsActionIntent!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "dispatchObsAction(input: DispatchObsActionInput!): ObsActionIntent!"
    );
    expect(obsGraphqlTypeDefs).toContain(
      "cancelObsAction(input: CancelObsActionInput!): ObsActionIntent!"
    );
    // The confirm step carries the explicit human confirmation intent.
    expect(obsGraphqlTypeDefs).toContain("input ConfirmObsActionInput {");
    expect(obsGraphqlTypeDefs).toContain("confirmationIntent: ObsConfirmationIntentInput!");
  });

  it("declares the AI-suggest mutation returning the same gated intent (AI suggests, a human confirms)", () => {
    expect(obsGraphqlTypeDefs).toContain(
      "suggestObsActionWithAi(\n      input: SuggestObsActionWithAiInput!\n    ): ObsActionIntent!"
    );
    // The input carries only the connection + actor + optional non-PII hints (no
    // host/port/password/token/stream key, no connectionRef): the secret-free shape.
    expect(obsGraphqlTypeDefs).toContain("input SuggestObsActionWithAiInput {");
    expect(obsGraphqlTypeDefs).toContain("operatorIntent: String");
    expect(obsGraphqlTypeDefs).toContain("serviceSegmentLabels: [String!]");
    // The returned intent's `ai_suggested` origin is part of the existing enum.
    expect(obsGraphqlTypeDefs).toContain("ai_suggested");
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

  it("delegates suggestObsActionWithAi, returning a requested ai-suggested intent (a FAKE port, no network)", async () => {
    // The command service stands in for the service that calls the injected AI port;
    // here it returns a canned `ai-suggested` intent so NO real model is reached.
    const suggestObsActionWithAi = vi.fn<
      ObsCommandService["suggestObsActionWithAi"]
    >(() => Promise.resolve(aiSuggestedIntent));
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ suggestObsActionWithAi }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.suggestObsActionWithAi(
        undefined,
        {
          input: {
            connectionProfileId: "connection_1",
            operatorIntent: "Moving into announcements.",
            requestedByRef: "operator_1",
            serviceSegmentLabels: ["Welcome", "Announcements"]
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(aiSuggestedIntent);

    // The resolver forwards the secret-free input verbatim and lets the command
    // schema apply its `serviceSegmentLabels` default. `origin`/`status`/`kind` are
    // NOT inputs — the service derives them from the validated AI suggestion.
    expect(suggestObsActionWithAi).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        connectionProfileId: "connection_1",
        operatorIntent: "Moving into announcements.",
        requestedByRef: "operator_1",
        serviceSegmentLabels: ["Welcome", "Announcements"]
      },
      requestId: "request_1"
    });
  });

  it("suggestObsActionWithAi omits absent optional hints so the command schema default applies", async () => {
    const suggestObsActionWithAi = vi.fn<
      ObsCommandService["suggestObsActionWithAi"]
    >(() => Promise.resolve(aiSuggestedIntent));
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ suggestObsActionWithAi }),
      obsQueryService: createObsQueryService()
    });

    // No operatorIntent, no serviceSegmentLabels, no aiPolicyProfile: the resolver
    // must NOT forward them as `null`/`undefined` (the `.strict()` schema would
    // reject that); the segment-label default ([]) applies instead.
    await resolvers.Mutation.suggestObsActionWithAi(
      undefined,
      { input: { connectionProfileId: "connection_1", requestedByRef: "operator_1" } },
      graphqlContext
    );

    expect(suggestObsActionWithAi).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        connectionProfileId: "connection_1",
        requestedByRef: "operator_1",
        serviceSegmentLabels: []
      },
      requestId: "request_1"
    });
  });

  it("delegates confirmObsAction with the confirmation intent and confirmedByRef", async () => {
    const confirmObsAction = vi.fn<ObsCommandService["confirmObsAction"]>(() =>
      Promise.resolve(confirmedIntent)
    );
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ confirmObsAction }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.confirmObsAction(
        undefined,
        {
          input: {
            actionIntentId: "action_1",
            confirmationIntent: { confirmed: true, reason: "Go live now." },
            confirmedByRef: "operator_1"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(confirmedIntent);

    expect(confirmObsAction).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        actionIntentId: "action_1",
        confirmationIntent: { confirmed: true, reason: "Go live now." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_1"
    });
  });

  it("delegates dispatchObsAction and returns the updated intent", async () => {
    const dispatchObsAction = vi.fn<ObsCommandService["dispatchObsAction"]>(() =>
      Promise.resolve(succeededIntent)
    );
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ dispatchObsAction }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.dispatchObsAction(
        undefined,
        { input: { actionIntentId: "action_1" } },
        graphqlContext
      )
    ).resolves.toEqual(succeededIntent);

    expect(dispatchObsAction).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: { actionIntentId: "action_1" },
      requestId: "request_1"
    });
  });

  it("rejects a confirmObsAction whose confirmation intent is not confirmed=true", async () => {
    const confirmObsAction = vi.fn<ObsCommandService["confirmObsAction"]>(() =>
      Promise.resolve(confirmedIntent)
    );
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ confirmObsAction }),
      obsQueryService: createObsQueryService()
    });

    // `confirmed: false` cannot satisfy the literal(true) gate, so the command is
    // rejected before the service is ever called — the human gate is structural.
    await expect(
      resolvers.Mutation.confirmObsAction(
        undefined,
        {
          input: {
            actionIntentId: "action_1",
            confirmationIntent: { confirmed: false, reason: "Nope." },
            confirmedByRef: "operator_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(confirmObsAction).not.toHaveBeenCalled();
  });

  it("delegates cancelObsAction with the cancellation reason", async () => {
    const cancelObsAction = vi.fn<ObsCommandService["cancelObsAction"]>(() =>
      Promise.resolve(canceledIntent)
    );
    const resolvers = createObsGraphqlResolvers({
      obsCommandService: createObsCommandService({ cancelObsAction }),
      obsQueryService: createObsQueryService()
    });

    await expect(
      resolvers.Mutation.cancelObsAction(
        undefined,
        { input: { actionIntentId: "action_1", reason: "Changed my mind." } },
        graphqlContext
      )
    ).resolves.toEqual(canceledIntent);

    expect(cancelObsAction).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: { actionIntentId: "action_1", reason: "Changed my mind." },
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

  it("executes suggestObsActionWithAi through the full transport, returning a requested ai_suggested intent", async () => {
    // A FAKE suggestion path: the command service returns a canned `ai-suggested`
    // intent, so NO real model is reached through the transport either.
    const suggestObsActionWithAi = vi.fn<
      ObsCommandService["suggestObsActionWithAi"]
    >(() => Promise.resolve(aiSuggestedIntent));
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService({ suggestObsActionWithAi }),
          obsQueryService: createObsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation suggest($input: SuggestObsActionWithAiInput!) { suggestObsActionWithAi(input: $input) { actionIntentId kind origin status targetSceneRef } }",
        variables: {
          input: {
            connectionProfileId: "connection_1",
            operatorIntent: "Moving into announcements.",
            requestedByRef: "operator_1",
            serviceSegmentLabels: ["Welcome", "Announcements"]
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(suggestObsActionWithAi).toHaveBeenCalledWith({
      actor,
      input: {
        connectionProfileId: "connection_1",
        operatorIntent: "Moving into announcements.",
        requestedByRef: "operator_1",
        serviceSegmentLabels: ["Welcome", "Announcements"]
      },
      requestId: "request_1"
    });
    // The hyphenated domain origin `ai-suggested` serializes back as the underscore
    // SDL enum name `ai_suggested`. The intent is `requested` — AI suggested it, but
    // a human must still confirm + dispatch through the gate.
    expect(response.body).toEqual({
      data: {
        suggestObsActionWithAi: {
          actionIntentId: "action_ai",
          kind: "switch_scene",
          origin: "ai_suggested",
          status: "requested",
          targetSceneRef: "scene-lower"
        }
      }
    });
  });

  it("executes the dispatchObsAction mutation through the full transport, returning the updated intent", async () => {
    const dispatchObsAction = vi.fn<ObsCommandService["dispatchObsAction"]>(() =>
      Promise.resolve(succeededIntent)
    );
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService({ dispatchObsAction }),
          obsQueryService: createObsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation dispatch($input: DispatchObsActionInput!) { dispatchObsAction(input: $input) { actionIntentId status } }",
        variables: { input: { actionIntentId: "action_1" } }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(dispatchObsAction).toHaveBeenCalledWith({
      actor,
      input: { actionIntentId: "action_1" },
      requestId: "request_1"
    });
    expect(response.body).toEqual({
      data: { dispatchObsAction: { actionIntentId: "action_1", status: "succeeded" } }
    });
  });

  it("maps a NOT_CONFIRMED dispatch refusal to extensions.code with a safe message", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        obs: {
          obsCommandService: createObsCommandService({
            dispatchObsAction: () =>
              Promise.reject(
                new ObsDomainError(
                  "NOT_CONFIRMED",
                  "This OBS action cannot be dispatched until a human has confirmed it."
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
          "mutation dispatch($input: DispatchObsActionInput!) { dispatchObsAction(input: $input) { actionIntentId } }",
        variables: { input: { actionIntentId: "action_1" } }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]).toEqual({
      extensions: { code: "NOT_CONFIRMED" },
      message: "This OBS action cannot be dispatched until a human has confirmed it."
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
