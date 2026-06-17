import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  PlayArrangementSchema,
  PlayCueSchema,
  PlaySectionSchema,
  PlaybackStateSchema,
  TrackSetSchema,
  isPlayDomainError,
  type PlayArrangement,
  type PlayCue,
  type PlayDomainErrorCode,
  type PlaySection,
  type PlaybackState,
  type TrackSet
} from "../../domain/play/index.js";
import { createInMemoryEventPublisher } from "../../events/index.js";
import { createPlayGraphqlResolvers } from "../../graphql/play.js";
import { createInMemoryPlayServicesAdapter } from "./in-memory.js";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
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

const introSection: PlaySection = PlaySectionSchema.parse({
  arrangementRef: "arrangement_1",
  clickEnabledDefault: true,
  kind: "intro",
  label: "section_intro",
  lengthBars: 4,
  sectionId: "section_intro",
  tenantId: "tenant_1"
});

const verseSection: PlaySection = PlaySectionSchema.parse({
  arrangementRef: "arrangement_1",
  clickEnabledDefault: true,
  kind: "verse",
  label: "section_verse",
  lengthBars: 8,
  sectionId: "section_verse",
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

const playbackState: PlaybackState = PlaybackStateSchema.parse({
  clickEnabled: true,
  positionBeats: 0,
  tenantId: "tenant_1",
  trackSetId: "track_set_1",
  transportStatus: "stopped",
  updatedAt: timestamp
});

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: PlayDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isPlayDomainError(error)).toBe(true);
  if (isPlayDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

describe("createInMemoryPlayServicesAdapter", () => {
  it("creates track sets with deterministic IDs and tenant scope", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => timestamp,
      ids: {
        trackSetId: () => "track_set_created"
      }
    });

    await expect(
      adapter.commandService.saveTrackSet({
        actor: leader,
        input: {
          defaultKey: "A",
          songRef: "song_created",
          tempoBpm: 132,
          title: "New Set",
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }]
        },
        requestId: "request_create"
      })
    ).resolves.toMatchObject({
      defaultKey: "A",
      songRef: "song_created",
      tenantId: "tenant_1",
      title: "New Set",
      trackSetId: "track_set_created"
    });

    expect(adapter.readTrackSets()).toHaveLength(1);
  });

  it("keeps reads tenant-scoped and returns null for cross-tenant track-set lookups", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.queryService.getTrackSet({
        actor: otherTenantLeader,
        input: { trackSetId: "track_set_1" },
        requestId: "request_other"
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryService.listTrackSets({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_other"
      })
    ).resolves.toEqual([]);
  });

  it("filters track sets by song and lists them for a song within the tenant", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.queryService.listTrackSets({
        actor: leader,
        input: { filter: { songRef: "song_1" } },
        requestId: "request_filter"
      })
    ).resolves.toHaveLength(1);

    await expect(
      adapter.queryService.listTrackSetsForSong({
        actor: leader,
        input: { songRef: "song_other" },
        requestId: "request_for_song"
      })
    ).resolves.toEqual([]);
  });

  it("updates track-set members in place and refreshes the timestamp", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => "2026-06-21T15:00:00.000Z",
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.updateTrackSetMembers({
        actor: leader,
        input: {
          trackRefs: [
            { muted: false, role: "click", trackRef: "media_click" },
            { muted: true, role: "stem", trackRef: "media_stem" }
          ],
          trackSetId: "track_set_1"
        },
        requestId: "request_update_members"
      })
    ).resolves.toMatchObject({
      createdAt: timestamp,
      trackSetId: "track_set_1",
      updatedAt: "2026-06-21T15:00:00.000Z"
    });

    expect(adapter.readTrackSets()[0]?.trackRefs).toHaveLength(2);
  });

  it("throws TRACK_SET_NOT_FOUND when updating members of an unknown track set", async () => {
    const adapter = createInMemoryPlayServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.updateTrackSetMembers({
        actor: leader,
        input: {
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
          trackSetId: "track_set_missing"
        },
        requestId: "request_missing"
      }),
      "TRACK_SET_NOT_FOUND"
    );
  });

  it("rejects viewer mutations in the service layer with AUTHORIZATION_FAILED", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.queryService.getTrackSet({
        actor: viewer,
        input: { trackSetId: "track_set_1" },
        requestId: "request_viewer_read"
      })
    ).resolves.toEqual(trackSet);

    await expectDomainErrorCode(
      adapter.commandService.updateTrackSetMembers({
        actor: viewer,
        input: {
          trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }],
          trackSetId: "track_set_1"
        },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("round-trips arrangements scoped to the song and tenant", async () => {
    const adapter = createInMemoryPlayServicesAdapter();

    await adapter.commandService.savePlayArrangement({
      actor: leader,
      input: {
        arrangementRef: "arrangement_1",
        defaultKey: "G",
        label: "Acoustic",
        sectionOrder: ["section_intro", "section_verse"],
        songRef: "song_1",
        tempoBpm: 120
      },
      requestId: "request_arrangement"
    });

    await expect(
      adapter.queryService.listPlayArrangements({
        actor: leader,
        input: { songRef: "song_1" },
        requestId: "request_list_arrangements"
      })
    ).resolves.toMatchObject([
      {
        arrangementRef: "arrangement_1",
        label: "Acoustic",
        songRef: "song_1",
        tenantId: "tenant_1"
      }
    ]);

    await expect(
      adapter.queryService.listPlayArrangements({
        actor: otherTenantLeader,
        input: { songRef: "song_1" },
        requestId: "request_other_arrangements"
      })
    ).resolves.toEqual([]);
  });

  it("rejects an arrangement whose loop section is absent from the section order", async () => {
    const adapter = createInMemoryPlayServicesAdapter();

    await expect(
      adapter.commandService.savePlayArrangement({
        actor: leader,
        input: {
          arrangementRef: "arrangement_invalid",
          defaultKey: "G",
          label: "Broken",
          loopSectionRef: "section_missing",
          sectionOrder: ["section_intro"],
          songRef: "song_1",
          tempoBpm: 120
        },
        requestId: "request_invalid_arrangement"
      })
    ).rejects.toThrow("loopSectionRef must appear in sectionOrder.");
  });

  it("saves sections only against an existing arrangement and reorders them", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      ids: { sectionId: () => "section_generated" },
      seed: { arrangements: [arrangement], sections: [introSection, verseSection] }
    });

    await expect(
      adapter.commandService.savePlaySection({
        actor: leader,
        input: {
          arrangementRef: "arrangement_1",
          clickEnabledDefault: false,
          kind: "chorus",
          lengthBars: 8
        },
        requestId: "request_save_section"
      })
    ).resolves.toMatchObject({
      arrangementRef: "arrangement_1",
      kind: "chorus",
      sectionId: "section_generated"
    });

    await expect(
      adapter.commandService.reorderPlaySections({
        actor: leader,
        input: {
          arrangementRef: "arrangement_1",
          orderedSectionIds: ["section_verse", "section_intro"]
        },
        requestId: "request_reorder"
      })
    ).resolves.toMatchObject([{ sectionId: "section_verse" }, { sectionId: "section_intro" }]);

    expect(adapter.readArrangements()[0]?.sectionOrder).toEqual([
      "section_verse",
      "section_intro"
    ]);
  });

  it("throws ARRANGEMENT_NOT_FOUND when saving a section for an unknown arrangement", async () => {
    const adapter = createInMemoryPlayServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.savePlaySection({
        actor: leader,
        input: {
          arrangementRef: "arrangement_missing",
          clickEnabledDefault: true,
          kind: "intro",
          lengthBars: 4
        },
        requestId: "request_section_missing"
      }),
      "ARRANGEMENT_NOT_FOUND"
    );
  });

  it("throws SECTION_NOT_FOUND when reordering with an unknown section id", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { arrangements: [arrangement], sections: [introSection] }
    });

    await expectDomainErrorCode(
      adapter.commandService.reorderPlaySections({
        actor: leader,
        input: {
          arrangementRef: "arrangement_1",
          orderedSectionIds: ["section_intro", "section_unknown"]
        },
        requestId: "request_reorder_missing"
      }),
      "SECTION_NOT_FOUND"
    );
  });

  it("resolves the play sequence for an arrangement and flags unresolved entries", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { arrangements: [arrangement], sections: [introSection] }
    });

    const resolved = await adapter.queryService.resolvePlaySequence({
      actor: leader,
      input: { arrangementRef: "arrangement_1" },
      requestId: "request_resolve"
    });

    expect(resolved?.entries).toMatchObject([
      { sectionRef: "section_intro", status: "resolved" },
      { sectionRef: "section_verse", status: "unresolved" }
    ]);

    await expect(
      adapter.queryService.resolvePlaySequence({
        actor: leader,
        input: { arrangementRef: "arrangement_missing" },
        requestId: "request_resolve_missing"
      })
    ).resolves.toBeNull();
  });

  it("adds, updates, and removes cues bound to a track set", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => timestamp,
      ids: { cueId: () => "cue_created" },
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.addPlayCue({
        actor: leader,
        input: {
          action: "play",
          fireMode: "manual",
          label: "Start",
          markerOffsetBeats: 0,
          sectionId: "section_intro",
          trackSetId: "track_set_1"
        },
        requestId: "request_add_cue"
      })
    ).resolves.toMatchObject({
      action: "play",
      cueId: "cue_created",
      trackSetId: "track_set_1"
    });

    await expect(
      adapter.commandService.updatePlayCue({
        actor: leader,
        input: {
          action: "stop",
          cueId: "cue_created",
          fireMode: "auto",
          label: "Stop",
          markerOffsetBeats: 16,
          sectionId: "section_intro",
          trackSetId: "track_set_1"
        },
        requestId: "request_update_cue"
      })
    ).resolves.toMatchObject({
      action: "stop",
      fireMode: "auto",
      label: "Stop"
    });

    await expect(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "No longer needed" },
          cueId: "cue_created",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_cue"
      })
    ).resolves.toBeUndefined();

    await expect(
      adapter.queryService.listPlayCues({
        actor: leader,
        input: { trackSetId: "track_set_1" },
        requestId: "request_list_cues"
      })
    ).resolves.toEqual([]);
  });

  it("rejects jump cues without a target section via the validation contract", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.addPlayCue({
        actor: leader,
        input: {
          action: "jump",
          fireMode: "manual",
          label: "Jump",
          markerOffsetBeats: 0,
          sectionId: "section_intro",
          trackSetId: "track_set_1"
        },
        requestId: "request_invalid_cue"
      })
    ).rejects.toThrow("Jump cues require a targetSectionRef.");
  });

  it("throws CUE_NOT_FOUND when removing an unknown cue", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { trackSets: [trackSet] }
    });

    await expectDomainErrorCode(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Cleanup" },
          cueId: "cue_missing",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_missing_cue"
      }),
      "CUE_NOT_FOUND"
    );
  });

  it("requires an explicit confirmation intent to remove a cue", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      seed: { cues: [cue], trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.removePlayCue({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: false, reason: "Oops" },
          cueId: "cue_1",
          trackSetId: "track_set_1"
        },
        requestId: "request_remove_unconfirmed"
      } as unknown as Parameters<typeof adapter.commandService.removePlayCue>[0])
    ).rejects.toThrow();

    expect(adapter.readCues()).toHaveLength(1);
  });

  it("round-trips pad layers filtered by song within the tenant", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => timestamp
    });

    await adapter.commandService.savePadLayer({
      actor: leader,
      input: {
        gain: 0.75,
        key: "G",
        loop: true,
        padLayerRef: "pad_1",
        padMediaRef: "media_pad",
        songRef: "song_1"
      },
      requestId: "request_save_pad"
    });

    await expect(
      adapter.queryService.listPadLayers({
        actor: leader,
        input: { filter: { songRef: "song_1" } },
        requestId: "request_list_pads"
      })
    ).resolves.toMatchObject([{ gain: 0.75, padLayerRef: "pad_1", tenantId: "tenant_1" }]);

    await expect(
      adapter.queryService.listPadLayers({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_other_pads"
      })
    ).resolves.toEqual([]);
  });

  it("persists a resumable playback-state snapshot keyed by track set", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => timestamp,
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.setPlaybackState({
        actor: leader,
        input: {
          activeSectionRef: "section_intro",
          clickEnabled: true,
          positionBeats: 4,
          transportStatus: "playing",
          trackSetId: "track_set_1"
        },
        requestId: "request_set_state"
      })
    ).resolves.toMatchObject({
      activeSectionRef: "section_intro",
      positionBeats: 4,
      transportStatus: "playing",
      trackSetId: "track_set_1"
    });

    await expect(
      adapter.queryService.getPlaybackState({
        actor: leader,
        input: { trackSetId: "track_set_1" },
        requestId: "request_get_state"
      })
    ).resolves.toMatchObject({ transportStatus: "playing" });
  });

  it("throws TRACK_SET_NOT_FOUND when setting playback state for an unknown track set", async () => {
    const adapter = createInMemoryPlayServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.setPlaybackState({
        actor: leader,
        input: {
          clickEnabled: false,
          positionBeats: 0,
          transportStatus: "stopped",
          trackSetId: "track_set_missing"
        },
        requestId: "request_state_missing"
      }),
      "TRACK_SET_NOT_FOUND"
    );
  });

  it("supports Play GraphQL resolver composition through in-memory services", async () => {
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => timestamp,
      seed: { playbackStates: [playbackState], trackSets: [trackSet] }
    });
    const resolvers = createPlayGraphqlResolvers({
      playCommandService: adapter.commandService,
      playQueryService: adapter.queryService
    });

    await expect(
      resolvers.Query.trackSetsForSong(
        undefined,
        { songRef: "song_1" },
        { actor: leader, requestId: "request_graphql_query" }
      )
    ).resolves.toMatchObject([{ songRef: "song_1", trackSetId: "track_set_1" }]);

    await expect(
      resolvers.Mutation.setPlaybackState(
        undefined,
        {
          input: {
            clickEnabled: false,
            positionBeats: 8,
            transportStatus: "paused",
            trackSetId: "track_set_1"
          }
        },
        { actor: leader, requestId: "request_graphql_mutation" }
      )
    ).resolves.toMatchObject({
      positionBeats: 8,
      transportStatus: "paused"
    });
  });

  it("publishes validated track-set and playback-state events after durable commits", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => "2026-06-21T14:10:00.000Z",
      eventPublisher,
      ids: {
        trackSetId: () => "track_set_created"
      },
      seed: { trackSets: [trackSet] }
    });

    await adapter.commandService.saveTrackSet({
      actor: leader,
      input: {
        defaultKey: "A",
        songRef: "song_created",
        tempoBpm: 132,
        title: "New Set",
        trackRefs: [{ muted: false, role: "guide", trackRef: "media_guide" }]
      },
      requestId: "request_create_track_set"
    });
    await adapter.commandService.updateTrackSetMembers({
      actor: leader,
      input: {
        trackRefs: [{ muted: true, role: "stem", trackRef: "media_stem" }],
        trackSetId: "track_set_1"
      },
      requestId: "request_update_members"
    });
    await adapter.commandService.setPlaybackState({
      actor: leader,
      input: {
        activePadLayerRef: "pad_layer_1",
        activeSectionRef: "section_intro",
        clickEnabled: false,
        positionBeats: 8,
        transportStatus: "playing",
        trackSetId: "track_set_1"
      },
      requestId: "request_playback_state"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        aggregateId: event.aggregateId,
        actorId: event.actorId,
        eventType: event.eventType,
        payload: event.payload,
        requestId: event.requestId,
        schemaVersion: event.schemaVersion,
        tenantId: event.tenantId
      }))
    ).toEqual([
      {
        aggregateId: "track_set_created",
        actorId: "leader_1",
        eventType: "trackSet.updated",
        payload: {
          changeKind: "created",
          tenantId: "tenant_1",
          trackSetId: "track_set_created",
          updatedAt: "2026-06-21T14:10:00.000Z"
        },
        requestId: "request_create_track_set",
        schemaVersion: "play-track-set-updated.v1",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "track_set_1",
        actorId: "leader_1",
        eventType: "trackSet.updated",
        payload: {
          changeKind: "updated",
          tenantId: "tenant_1",
          trackSetId: "track_set_1",
          updatedAt: "2026-06-21T14:10:00.000Z"
        },
        requestId: "request_update_members",
        schemaVersion: "play-track-set-updated.v1",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "track_set_1",
        actorId: "leader_1",
        eventType: "play.playbackStateChanged",
        payload: {
          activePadLayerRef: "pad_layer_1",
          activeSectionRef: "section_intro",
          clickEnabled: false,
          positionBeats: 8,
          tenantId: "tenant_1",
          trackSetId: "track_set_1",
          transportStatus: "playing",
          updatedAt: "2026-06-21T14:10:00.000Z"
        },
        requestId: "request_playback_state",
        schemaVersion: "play-playback-state-changed.v1",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("publishes a cue-fired event after a cue is durably committed", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPlayServicesAdapter({
      clock: () => "2026-06-21T14:15:00.000Z",
      eventPublisher,
      ids: {
        cueId: () => "cue_fired"
      },
      seed: { trackSets: [trackSet] }
    });

    await adapter.commandService.addPlayCue({
      actor: leader,
      input: {
        action: "play",
        fireMode: "manual",
        label: "Start",
        markerOffsetBeats: 0,
        sectionId: "section_intro",
        trackSetId: "track_set_1"
      },
      requestId: "request_add_cue"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.payload,
        requestId: event.requestId,
        schemaVersion: event.schemaVersion
      }))
    ).toEqual([
      {
        aggregateId: "track_set_1",
        eventType: "play.cueFired",
        occurredAt: "2026-06-21T14:15:00.000Z",
        payload: {
          action: "play",
          cueId: "cue_fired",
          firedAt: "2026-06-21T14:15:00.000Z",
          tenantId: "tenant_1",
          trackSetId: "track_set_1"
        },
        requestId: "request_add_cue",
        schemaVersion: "play-cue-fired.v1"
      }
    ]);
  });

  it("does not publish Play events when a command is rejected before its state change", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPlayServicesAdapter({
      eventPublisher,
      seed: { trackSets: [trackSet] }
    });

    await expect(
      adapter.commandService.setPlaybackState({
        actor: leader,
        input: {
          clickEnabled: false,
          positionBeats: 0,
          transportStatus: "stopped",
          trackSetId: "track_set_missing"
        },
        requestId: "request_state_missing"
      })
    ).rejects.toThrow();

    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });
});
