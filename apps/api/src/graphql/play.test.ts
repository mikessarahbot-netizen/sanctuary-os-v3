import { describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import {
  PlayArrangementSchema,
  PlayCueSchema,
  PlayDomainError,
  PlaybackStateSchema,
  TrackSetSchema,
  type PlayArrangement,
  type PlayCommandService,
  type PlayCue,
  type PlayQueryService,
  type PlaybackState,
  type TrackSet
} from "../domain/play/index.js";
import { createPlayGraphqlResolvers, playGraphqlTypeDefs, type PlayGraphqlContext } from "./play.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";
import { createPresenterGraphqlRequestHandler } from "./transport.js";

const graphqlContext: PlayGraphqlContext = {
  actor: {
    actorId: "leader_1",
    roles: ["worship_leader"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const trackSet: TrackSet = TrackSetSchema.parse({
  createdAt: timestamp,
  defaultKey: "G",
  songRef: "song_1",
  tempoBpm: 120,
  tenantId: "tenant_1",
  title: "Amazing Grace",
  trackRefs: [{ muted: false, role: "click", trackRef: "media_click" }],
  trackSetId: "track_set_1",
  updatedAt: timestamp
});

const arrangement: PlayArrangement = PlayArrangementSchema.parse({
  arrangementRef: "arrangement_1",
  defaultKey: "G",
  label: "Acoustic",
  sectionOrder: ["section_intro", "section_verse"],
  songRef: "song_1",
  tempoBpm: 120,
  tenantId: "tenant_1"
});

const cue: PlayCue = PlayCueSchema.parse({
  action: "play",
  createdAt: timestamp,
  cueId: "cue_1",
  fireMode: "manual",
  label: "Start",
  markerOffsetBeats: 0,
  sectionId: "section_intro",
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  updatedAt: timestamp
});

const padChangeCue: PlayCue = PlayCueSchema.parse({
  action: "pad-change",
  createdAt: timestamp,
  cueId: "cue_pad",
  fireMode: "manual",
  label: "Swap pad",
  markerOffsetBeats: 0,
  padLayerRef: "pad_layer_1",
  sectionId: "section_intro",
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  updatedAt: timestamp
});

const clickToggleCue: PlayCue = PlayCueSchema.parse({
  action: "click-toggle",
  createdAt: timestamp,
  cueId: "cue_click",
  fireMode: "manual",
  label: "Toggle click",
  markerOffsetBeats: 0,
  sectionId: "section_intro",
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  updatedAt: timestamp
});

const playbackState: PlaybackState = PlaybackStateSchema.parse({
  clickEnabled: true,
  positionBeats: 0,
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  transportStatus: "stopped",
  updatedAt: timestamp
});

const createPlayQueryService = (
  overrides: Partial<PlayQueryService> = {}
): PlayQueryService => ({
  getPlaybackState: vi.fn<PlayQueryService["getPlaybackState"]>(() =>
    Promise.resolve(playbackState)
  ),
  getTrackSet: vi.fn<PlayQueryService["getTrackSet"]>(() => Promise.resolve(trackSet)),
  listPadLayers: vi.fn<PlayQueryService["listPadLayers"]>(() => Promise.resolve([])),
  listPlayArrangements: vi.fn<PlayQueryService["listPlayArrangements"]>(() =>
    Promise.resolve([arrangement])
  ),
  listPlayCues: vi.fn<PlayQueryService["listPlayCues"]>(() => Promise.resolve([cue])),
  listPlaySections: vi.fn<PlayQueryService["listPlaySections"]>(() => Promise.resolve([])),
  listTrackSets: vi.fn<PlayQueryService["listTrackSets"]>(() => Promise.resolve([trackSet])),
  listTrackSetsForSong: vi.fn<PlayQueryService["listTrackSetsForSong"]>(() =>
    Promise.resolve([trackSet])
  ),
  resolvePlaySequence: vi.fn<PlayQueryService["resolvePlaySequence"]>(() =>
    Promise.resolve(null)
  ),
  ...overrides
});

const createPlayCommandService = (
  overrides: Partial<PlayCommandService> = {}
): PlayCommandService => ({
  addPlayCue: vi.fn<PlayCommandService["addPlayCue"]>(() => Promise.resolve(cue)),
  removePlayCue: vi.fn<PlayCommandService["removePlayCue"]>(() => Promise.resolve()),
  reorderPlaySections: vi.fn<PlayCommandService["reorderPlaySections"]>(() =>
    Promise.resolve([])
  ),
  savePadLayer: vi.fn<PlayCommandService["savePadLayer"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  savePlayArrangement: vi.fn<PlayCommandService["savePlayArrangement"]>(() =>
    Promise.resolve(arrangement)
  ),
  savePlaySection: vi.fn<PlayCommandService["savePlaySection"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  saveTrackSet: vi.fn<PlayCommandService["saveTrackSet"]>(() => Promise.resolve(trackSet)),
  setPlaybackState: vi.fn<PlayCommandService["setPlaybackState"]>(() =>
    Promise.resolve(playbackState)
  ),
  updatePlayCue: vi.fn<PlayCommandService["updatePlayCue"]>(() => Promise.resolve(cue)),
  updateTrackSetMembers: vi.fn<PlayCommandService["updateTrackSetMembers"]>(() =>
    Promise.resolve(trackSet)
  ),
  ...overrides
});

describe("playGraphqlTypeDefs", () => {
  it("declares the planned Play query contract", () => {
    expect(playGraphqlTypeDefs).toContain(
      "trackSets(filter: PlayTrackSetsFilterInput): [TrackSet!]!"
    );
    expect(playGraphqlTypeDefs).toContain("trackSet(id: ID!): TrackSet");
    expect(playGraphqlTypeDefs).toContain("trackSetsForSong(songRef: ID!): [TrackSet!]!");
    expect(playGraphqlTypeDefs).toContain(
      "playArrangements(songRef: ID!): [PlayArrangement!]!"
    );
    expect(playGraphqlTypeDefs).toContain("playSections(arrangementRef: ID!): [PlaySection!]!");
    expect(playGraphqlTypeDefs).toContain("playCues(trackSetId: ID!): [PlayCue!]!");
    expect(playGraphqlTypeDefs).toContain("padLayers(filter: PlayPadLayersFilterInput): [PadLayer!]!");
    expect(playGraphqlTypeDefs).toContain("playbackState(trackSetId: ID!): PlaybackState");
    expect(playGraphqlTypeDefs).toContain(
      "resolvedPlaySequence(arrangementRef: ID!): ResolvedPlaySequence"
    );
  });

  it("declares the planned Play mutation contract", () => {
    expect(playGraphqlTypeDefs).toContain("saveTrackSet(input: SaveTrackSetInput!): TrackSet!");
    expect(playGraphqlTypeDefs).toContain(
      "updateTrackSetMembers(input: UpdateTrackSetMembersInput!): TrackSet!"
    );
    expect(playGraphqlTypeDefs).toContain(
      "reorderPlaySections(input: ReorderPlaySectionsInput!): [PlaySection!]!"
    );
    expect(playGraphqlTypeDefs).toContain("addPlayCue(input: AddPlayCueInput!): PlayCue!");
    expect(playGraphqlTypeDefs).toContain("removePlayCue(input: RemovePlayCueInput!): Boolean!");
    expect(playGraphqlTypeDefs).toContain(
      "setPlaybackState(input: SetPlaybackStateInput!): PlaybackState!"
    );
  });

  it("keeps raw media bytes and hardware handles out of Play v1", () => {
    expect(playGraphqlTypeDefs).not.toContain("audioBytes");
    expect(playGraphqlTypeDefs).not.toContain("midiDevice");
    expect(playGraphqlTypeDefs).not.toContain("obsScene");
  });
});

describe("createPlayGraphqlResolvers", () => {
  it("delegates trackSetsForSong with actor and request scope", async () => {
    const listTrackSetsForSong = vi.fn<PlayQueryService["listTrackSetsForSong"]>(() =>
      Promise.resolve([trackSet])
    );
    const resolvers = createPlayGraphqlResolvers({
      playCommandService: createPlayCommandService(),
      playQueryService: createPlayQueryService({ listTrackSetsForSong })
    });

    await expect(
      resolvers.Query.trackSetsForSong(undefined, { songRef: "song_1" }, graphqlContext)
    ).resolves.toEqual([trackSet]);

    expect(listTrackSetsForSong).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: { songRef: "song_1" },
      requestId: "request_1"
    });
  });

  it("delegates saveTrackSet to the Play command service", async () => {
    const saveTrackSet = vi.fn<PlayCommandService["saveTrackSet"]>(() =>
      Promise.resolve(trackSet)
    );
    const resolvers = createPlayGraphqlResolvers({
      playCommandService: createPlayCommandService({ saveTrackSet }),
      playQueryService: createPlayQueryService()
    });

    await expect(
      resolvers.Mutation.saveTrackSet(
        undefined,
        {
          input: {
            defaultKey: "G",
            songRef: "song_1",
            tempoBpm: 120,
            title: "Amazing Grace",
            trackRefs: [{ muted: false, role: "click", trackRef: "media_click" }]
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(trackSet);

    expect(saveTrackSet).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        defaultKey: "G",
        songRef: "song_1",
        tempoBpm: 120,
        title: "Amazing Grace",
        trackRefs: [{ muted: false, role: "click", trackRef: "media_click" }]
      },
      requestId: "request_1"
    });
  });

  it("requires explicit confirmation for destructive cue removal", async () => {
    const removePlayCue = vi.fn<PlayCommandService["removePlayCue"]>(() => Promise.resolve());
    const resolvers = createPlayGraphqlResolvers({
      playCommandService: createPlayCommandService({ removePlayCue }),
      playQueryService: createPlayQueryService()
    });

    await expect(
      resolvers.Mutation.removePlayCue(
        undefined,
        {
          input: {
            cueId: "cue_1",
            trackSetId: "track_set_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(removePlayCue).not.toHaveBeenCalled();
  });

  it("propagates service errors without replacing them with vendor details", async () => {
    const listTrackSets = vi.fn<PlayQueryService["listTrackSets"]>(() =>
      Promise.reject(new Error("Play store unavailable."))
    );
    const resolvers = createPlayGraphqlResolvers({
      playCommandService: createPlayCommandService(),
      playQueryService: createPlayQueryService({ listTrackSets })
    });

    await expect(
      resolvers.Query.trackSets(undefined, {}, graphqlContext)
    ).rejects.toThrow("Play store unavailable.");
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

describe("Play GraphQL transport", () => {
  it("builds the executable schema with Play dependencies and executes a query", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        play: {
          playCommandService: createPlayCommandService(),
          playQueryService: createPlayQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query: "{ trackSetsForSong(songRef: \"song_1\") { trackSetId songRef } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { trackSetsForSong: [{ songRef: "song_1", trackSetId: "track_set_1" }] }
    });
  });

  it("round-trips the hyphenated PlayCueAction pad-change through the full transport", async () => {
    const addPlayCue = vi.fn<PlayCommandService["addPlayCue"]>(() =>
      Promise.resolve(padChangeCue)
    );
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        play: {
          playCommandService: createPlayCommandService({ addPlayCue }),
          playQueryService: createPlayQueryService({
            listPlayCues: vi.fn<PlayQueryService["listPlayCues"]>(() =>
              Promise.resolve([padChangeCue])
            )
          })
        }
      })
    });

    const mutationResponse = await handler({
      body: {
        query:
          "mutation add($input: AddPlayCueInput!) { addPlayCue(input: $input) { cueId action } }",
        variables: {
          input: {
            action: "pad_change",
            fireMode: "manual",
            label: "Swap pad",
            markerOffsetBeats: 0,
            padLayerRef: "pad_layer_1",
            sectionId: "section_intro",
            trackSetId: "track_set_1"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(mutationResponse.status).toBe(200);
    // `pad_change` (SDL) is mapped to the domain value `pad-change` before the
    // service is called.
    expect(addPlayCue).toHaveBeenCalledWith({
      actor,
      input: {
        action: "pad-change",
        fireMode: "manual",
        label: "Swap pad",
        markerOffsetBeats: 0,
        padLayerRef: "pad_layer_1",
        sectionId: "section_intro",
        trackSetId: "track_set_1"
      },
      requestId: "request_1"
    });
    // The hyphenated domain action serializes back as the underscore SDL enum name.
    expect(mutationResponse.body).toEqual({
      data: { addPlayCue: { action: "pad_change", cueId: "cue_pad" } }
    });

    const queryResponse = await handler({
      body: {
        query: "{ playCues(trackSetId: \"track_set_1\") { cueId action } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(queryResponse.status).toBe(200);
    expect(queryResponse.body).toEqual({
      data: { playCues: [{ action: "pad_change", cueId: "cue_pad" }] }
    });
  });

  it("round-trips the hyphenated PlayCueAction click-toggle through the full transport", async () => {
    const addPlayCue = vi.fn<PlayCommandService["addPlayCue"]>(() =>
      Promise.resolve(clickToggleCue)
    );
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        play: {
          playCommandService: createPlayCommandService({ addPlayCue }),
          playQueryService: createPlayQueryService({
            listPlayCues: vi.fn<PlayQueryService["listPlayCues"]>(() =>
              Promise.resolve([clickToggleCue])
            )
          })
        }
      })
    });

    const mutationResponse = await handler({
      body: {
        query:
          "mutation add($input: AddPlayCueInput!) { addPlayCue(input: $input) { cueId action } }",
        variables: {
          input: {
            action: "click_toggle",
            fireMode: "manual",
            label: "Toggle click",
            markerOffsetBeats: 0,
            sectionId: "section_intro",
            trackSetId: "track_set_1"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(mutationResponse.status).toBe(200);
    // `click_toggle` (SDL) is mapped to the domain value `click-toggle` before the
    // service is called.
    expect(addPlayCue).toHaveBeenCalledWith({
      actor,
      input: {
        action: "click-toggle",
        fireMode: "manual",
        label: "Toggle click",
        markerOffsetBeats: 0,
        sectionId: "section_intro",
        trackSetId: "track_set_1"
      },
      requestId: "request_1"
    });
    // The hyphenated domain action serializes back as the underscore SDL enum name.
    expect(mutationResponse.body).toEqual({
      data: { addPlayCue: { action: "click_toggle", cueId: "cue_click" } }
    });

    const queryResponse = await handler({
      body: {
        query: "{ playCues(trackSetId: \"track_set_1\") { cueId action } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(queryResponse.status).toBe(200);
    expect(queryResponse.body).toEqual({
      data: { playCues: [{ action: "click_toggle", cueId: "cue_click" }] }
    });
  });

  it("surfaces a typed Play domain error as a conflict code with a safe message", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        play: {
          playCommandService: createPlayCommandService({
            updateTrackSetMembers: () =>
              Promise.reject(
                new PlayDomainError(
                  "TRACK_SET_NOT_FOUND",
                  "This track set is no longer available on the server."
                )
              )
          }),
          playQueryService: createPlayQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation updateTrackSetMembers($input: UpdateTrackSetMembersInput!) { updateTrackSetMembers(input: $input) { trackSetId } }",
        variables: {
          input: {
            trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
            trackSetId: "track_set_missing"
          }
        }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]).toEqual({
      extensions: { code: "TRACK_SET_NOT_FOUND" },
      message: "This track set is no longer available on the server."
    });
  });
});
