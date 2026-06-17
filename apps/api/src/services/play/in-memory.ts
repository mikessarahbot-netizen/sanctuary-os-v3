import type { AuthenticatedActor } from "../../auth/index.js";
import type { ApiEventEnvelope, EventPublisher } from "../../events/index.js";
import {
  AddPlayCueCommandSchema,
  GetPlaybackStateQuerySchema,
  GetTrackSetQuerySchema,
  ListPadLayersQuerySchema,
  ListPlayArrangementsQuerySchema,
  ListPlayCuesQuerySchema,
  ListPlaySectionsQuerySchema,
  ListTrackSetsForSongQuerySchema,
  ListTrackSetsQuerySchema,
  PadLayerSchema,
  PlayArrangementSchema,
  PlayCueSchema,
  PlayDomainError,
  PlaySectionSchema,
  PlaybackStateSchema,
  RemovePlayCueCommandSchema,
  ReorderPlaySectionsCommandSchema,
  ResolvePlaySequenceQuerySchema,
  SavePadLayerCommandSchema,
  SavePlayArrangementCommandSchema,
  SavePlaySectionCommandSchema,
  SaveTrackSetCommandSchema,
  SetPlaybackStateCommandSchema,
  TrackSetSchema,
  UpdatePlayCueCommandSchema,
  UpdateTrackSetMembersCommandSchema,
  resolvePlaySequence,
  type PadLayer,
  type PlayArrangement,
  type PlayCommandService,
  type PlayCue,
  type PlayQueryService,
  type PlaySection,
  type PlaybackState,
  type ResolvedPlaySequence,
  type TrackSet
} from "../../domain/play/index.js";

const playQueryRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
] as const;

const playCommandRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician"
] as const;

export interface InMemoryPlayServiceSeed {
  readonly arrangements?: readonly PlayArrangement[];
  readonly cues?: readonly PlayCue[];
  readonly padLayers?: readonly PadLayer[];
  readonly playbackStates?: readonly PlaybackState[];
  readonly sections?: readonly PlaySection[];
  readonly trackSets?: readonly TrackSet[];
}

export interface InMemoryPlayServiceIds {
  readonly cueId: () => string;
  readonly sectionId: () => string;
  readonly trackSetId: () => string;
}

export interface InMemoryPlayServiceDependencies {
  readonly clock?: () => string;
  readonly eventPublisher?: EventPublisher;
  readonly ids?: Partial<InMemoryPlayServiceIds>;
  readonly seed?: InMemoryPlayServiceSeed;
}

export interface InMemoryPlayServicesAdapter {
  readonly commandService: PlayCommandService;
  readonly queryService: PlayQueryService;
  readonly readArrangements: () => readonly PlayArrangement[];
  readonly readCues: () => readonly PlayCue[];
  readonly readPadLayers: () => readonly PadLayer[];
  readonly readPlaybackStates: () => readonly PlaybackState[];
  readonly readSections: () => readonly PlaySection[];
  readonly readTrackSets: () => readonly TrackSet[];
}

const trackSetKey = (tenantId: string, trackSetId: string): string =>
  `${tenantId}::${trackSetId}`;

const arrangementKey = (tenantId: string, arrangementRef: string): string =>
  `${tenantId}::${arrangementRef}`;

const sectionKey = (tenantId: string, sectionId: string): string =>
  `${tenantId}::${sectionId}`;

const cueKey = (tenantId: string, trackSetId: string, cueId: string): string =>
  `${tenantId}::${trackSetId}::${cueId}`;

const padLayerKey = (tenantId: string, padLayerRef: string): string =>
  `${tenantId}::${padLayerRef}`;

const playbackStateKey = (tenantId: string, trackSetId: string): string =>
  `${tenantId}::${trackSetId}`;

export const createInMemoryPlayServicesAdapter = (
  dependencies: InMemoryPlayServiceDependencies = {}
): InMemoryPlayServicesAdapter => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const eventPublisher = dependencies.eventPublisher;
  const ids = createPlayIds(dependencies.ids);
  const trackSets = new Map<string, TrackSet>();
  const arrangements = new Map<string, PlayArrangement>();
  const sections = new Map<string, PlaySection>();
  const cues = new Map<string, PlayCue>();
  const padLayers = new Map<string, PadLayer>();
  const playbackStates = new Map<string, PlaybackState>();

  dependencies.seed?.trackSets?.forEach((trackSet) => {
    const parsedTrackSet = TrackSetSchema.parse(trackSet);
    trackSets.set(trackSetKey(parsedTrackSet.tenantId, parsedTrackSet.trackSetId), parsedTrackSet);
  });

  dependencies.seed?.arrangements?.forEach((arrangement) => {
    const parsedArrangement = PlayArrangementSchema.parse(arrangement);
    arrangements.set(
      arrangementKey(parsedArrangement.tenantId, parsedArrangement.arrangementRef),
      parsedArrangement
    );
  });

  dependencies.seed?.sections?.forEach((section) => {
    const parsedSection = PlaySectionSchema.parse(section);
    sections.set(sectionKey(parsedSection.tenantId, parsedSection.sectionId), parsedSection);
  });

  dependencies.seed?.cues?.forEach((cue) => {
    const parsedCue = PlayCueSchema.parse(cue);
    cues.set(cueKey(parsedCue.tenantId, parsedCue.trackSetId, parsedCue.cueId), parsedCue);
  });

  dependencies.seed?.padLayers?.forEach((padLayer) => {
    const parsedPadLayer = PadLayerSchema.parse(padLayer);
    padLayers.set(padLayerKey(parsedPadLayer.tenantId, parsedPadLayer.padLayerRef), parsedPadLayer);
  });

  dependencies.seed?.playbackStates?.forEach((playbackState) => {
    const parsedPlaybackState = PlaybackStateSchema.parse(playbackState);
    playbackStates.set(
      playbackStateKey(parsedPlaybackState.tenantId, parsedPlaybackState.trackSetId),
      parsedPlaybackState
    );
  });

  const findTenantTrackSet = (
    trackSetId: string,
    actor: AuthenticatedActor
  ): TrackSet => {
    const trackSet = trackSets.get(trackSetKey(actor.tenantId, trackSetId));

    if (trackSet === undefined) {
      throw new PlayDomainError(
        "TRACK_SET_NOT_FOUND",
        "This track set is no longer available on the server."
      );
    }

    return trackSet;
  };

  const findTenantArrangement = (
    arrangementRef: string,
    actor: AuthenticatedActor
  ): PlayArrangement => {
    const arrangement = arrangements.get(arrangementKey(actor.tenantId, arrangementRef));

    if (arrangement === undefined) {
      throw new PlayDomainError(
        "ARRANGEMENT_NOT_FOUND",
        "This arrangement is no longer available on the server."
      );
    }

    return arrangement;
  };

  const saveTrackSetRecord = (trackSet: TrackSet): TrackSet => {
    const parsedTrackSet = TrackSetSchema.parse(trackSet);
    trackSets.set(trackSetKey(parsedTrackSet.tenantId, parsedTrackSet.trackSetId), parsedTrackSet);

    return parsedTrackSet;
  };

  const queryService: PlayQueryService = {
    listTrackSets: (rawQuery): Promise<readonly TrackSet[]> =>
      runPlayOperation((): readonly TrackSet[] => {
        const query = ListTrackSetsQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...trackSets.values()].filter(
          (trackSet) =>
            trackSet.tenantId === query.actor.tenantId &&
            (query.input.filter?.songRef === undefined ||
              trackSet.songRef === query.input.filter.songRef)
        );
      }),

    getTrackSet: (rawQuery): Promise<TrackSet | null> =>
      runPlayOperation((): TrackSet | null => {
        const query = GetTrackSetQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);
        const trackSet = trackSets.get(trackSetKey(query.actor.tenantId, query.input.trackSetId));

        return trackSet ?? null;
      }),

    listTrackSetsForSong: (rawQuery): Promise<readonly TrackSet[]> =>
      runPlayOperation((): readonly TrackSet[] => {
        const query = ListTrackSetsForSongQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...trackSets.values()].filter(
          (trackSet) =>
            trackSet.tenantId === query.actor.tenantId &&
            trackSet.songRef === query.input.songRef
        );
      }),

    listPlayArrangements: (rawQuery): Promise<readonly PlayArrangement[]> =>
      runPlayOperation((): readonly PlayArrangement[] => {
        const query = ListPlayArrangementsQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...arrangements.values()].filter(
          (arrangement) =>
            arrangement.tenantId === query.actor.tenantId &&
            arrangement.songRef === query.input.songRef
        );
      }),

    listPlaySections: (rawQuery): Promise<readonly PlaySection[]> =>
      runPlayOperation((): readonly PlaySection[] => {
        const query = ListPlaySectionsQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...sections.values()].filter(
          (section) =>
            section.tenantId === query.actor.tenantId &&
            section.arrangementRef === query.input.arrangementRef
        );
      }),

    listPlayCues: (rawQuery): Promise<readonly PlayCue[]> =>
      runPlayOperation((): readonly PlayCue[] => {
        const query = ListPlayCuesQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...cues.values()].filter(
          (cue) =>
            cue.tenantId === query.actor.tenantId &&
            cue.trackSetId === query.input.trackSetId
        );
      }),

    listPadLayers: (rawQuery): Promise<readonly PadLayer[]> =>
      runPlayOperation((): readonly PadLayer[] => {
        const query = ListPadLayersQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);

        return [...padLayers.values()].filter(
          (padLayer) =>
            padLayer.tenantId === query.actor.tenantId &&
            (query.input.filter?.songRef === undefined ||
              padLayer.songRef === query.input.filter.songRef)
        );
      }),

    getPlaybackState: (rawQuery): Promise<PlaybackState | null> =>
      runPlayOperation((): PlaybackState | null => {
        const query = GetPlaybackStateQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);
        const playbackState = playbackStates.get(
          playbackStateKey(query.actor.tenantId, query.input.trackSetId)
        );

        return playbackState ?? null;
      }),

    resolvePlaySequence: (rawQuery): Promise<ResolvedPlaySequence | null> =>
      runPlayOperation((): ResolvedPlaySequence | null => {
        const query = ResolvePlaySequenceQuerySchema.parse(rawQuery);
        assertPlayQueryRole(query.actor);
        const arrangement = arrangements.get(
          arrangementKey(query.actor.tenantId, query.input.arrangementRef)
        );

        if (arrangement === undefined) {
          return null;
        }

        const arrangementSections = [...sections.values()].filter(
          (section) =>
            section.tenantId === query.actor.tenantId &&
            section.arrangementRef === query.input.arrangementRef
        );

        return resolvePlaySequence(arrangement, arrangementSections);
      })
  };

  const commandService: PlayCommandService = {
    saveTrackSet: (rawCommand): Promise<TrackSet> =>
      runPlayOperation(async (): Promise<TrackSet> => {
        const command = SaveTrackSetCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const now = clock();
        const trackSetId = command.input.trackSetId ?? ids.trackSetId();
        const existingTrackSet = trackSets.get(trackSetKey(command.actor.tenantId, trackSetId));

        const savedTrackSet = saveTrackSetRecord(
          TrackSetSchema.parse({
            createdAt: existingTrackSet?.createdAt ?? now,
            defaultKey: command.input.defaultKey,
            songRef: command.input.songRef,
            tempoBpm: command.input.tempoBpm,
            tenantId: command.actor.tenantId,
            trackRefs: command.input.trackRefs,
            trackSetId,
            updatedAt: now,
            ...(command.input.arrangementRef !== undefined
              ? { arrangementRef: command.input.arrangementRef }
              : {}),
            ...(command.input.serviceRef !== undefined
              ? { serviceRef: command.input.serviceRef }
              : {}),
            ...(command.input.title !== undefined ? { title: command.input.title } : {})
          })
        );

        await publishPlayEvents(eventPublisher, [
          createTrackSetUpdatedEvent({
            actor: command.actor,
            changeKind: existingTrackSet === undefined ? "created" : "updated",
            occurredAt: savedTrackSet.updatedAt,
            requestId: command.requestId,
            trackSet: savedTrackSet
          })
        ]);

        return savedTrackSet;
      }),

    updateTrackSetMembers: (rawCommand): Promise<TrackSet> =>
      runPlayOperation(async (): Promise<TrackSet> => {
        const command = UpdateTrackSetMembersCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const trackSet = findTenantTrackSet(command.input.trackSetId, command.actor);

        const savedTrackSet = saveTrackSetRecord(
          TrackSetSchema.parse({
            ...trackSet,
            trackRefs: command.input.trackRefs,
            updatedAt: clock()
          })
        );

        await publishPlayEvents(eventPublisher, [
          createTrackSetUpdatedEvent({
            actor: command.actor,
            changeKind: "updated",
            occurredAt: savedTrackSet.updatedAt,
            requestId: command.requestId,
            trackSet: savedTrackSet
          })
        ]);

        return savedTrackSet;
      }),

    savePlayArrangement: (rawCommand): Promise<PlayArrangement> =>
      runPlayOperation((): PlayArrangement => {
        const command = SavePlayArrangementCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const arrangement = PlayArrangementSchema.parse({
          arrangementRef: command.input.arrangementRef,
          defaultKey: command.input.defaultKey,
          label: command.input.label,
          sectionOrder: command.input.sectionOrder,
          songRef: command.input.songRef,
          tempoBpm: command.input.tempoBpm,
          tenantId: command.actor.tenantId,
          ...(command.input.loopSectionRef !== undefined
            ? { loopSectionRef: command.input.loopSectionRef }
            : {})
        });
        arrangements.set(
          arrangementKey(arrangement.tenantId, arrangement.arrangementRef),
          arrangement
        );

        return arrangement;
      }),

    savePlaySection: (rawCommand): Promise<PlaySection> =>
      runPlayOperation((): PlaySection => {
        const command = SavePlaySectionCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        findTenantArrangement(command.input.arrangementRef, command.actor);
        const sectionId = command.input.sectionId ?? ids.sectionId();
        const section = PlaySectionSchema.parse({
          arrangementRef: command.input.arrangementRef,
          clickEnabledDefault: command.input.clickEnabledDefault,
          kind: command.input.kind,
          lengthBars: command.input.lengthBars,
          sectionId,
          tenantId: command.actor.tenantId,
          ...(command.input.label !== undefined ? { label: command.input.label } : {}),
          ...(command.input.padLayerRef !== undefined
            ? { padLayerRef: command.input.padLayerRef }
            : {})
        });
        sections.set(sectionKey(section.tenantId, section.sectionId), section);

        return section;
      }),

    reorderPlaySections: (rawCommand): Promise<readonly PlaySection[]> =>
      runPlayOperation((): readonly PlaySection[] => {
        const command = ReorderPlaySectionsCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const arrangement = findTenantArrangement(command.input.arrangementRef, command.actor);
        const orderedSections = command.input.orderedSectionIds.map((sectionId) => {
          const section = sections.get(sectionKey(command.actor.tenantId, sectionId));

          if (
            section === undefined ||
            section.arrangementRef !== command.input.arrangementRef
          ) {
            throw new PlayDomainError(
              "SECTION_NOT_FOUND",
              "This section is no longer available on the server."
            );
          }

          return section;
        });
        const reorderedArrangement = PlayArrangementSchema.parse({
          ...arrangement,
          sectionOrder: command.input.orderedSectionIds
        });
        arrangements.set(
          arrangementKey(reorderedArrangement.tenantId, reorderedArrangement.arrangementRef),
          reorderedArrangement
        );

        return orderedSections;
      }),

    addPlayCue: (rawCommand): Promise<PlayCue> =>
      runPlayOperation(async (): Promise<PlayCue> => {
        const command = AddPlayCueCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        findTenantTrackSet(command.input.trackSetId, command.actor);
        const now = clock();
        const cue = PlayCueSchema.parse({
          action: command.input.action,
          createdAt: now,
          cueId: ids.cueId(),
          fireMode: command.input.fireMode,
          label: command.input.label,
          markerOffsetBeats: command.input.markerOffsetBeats,
          sectionId: command.input.sectionId,
          tenantId: command.actor.tenantId,
          trackSetId: command.input.trackSetId,
          updatedAt: now,
          ...(command.input.padLayerRef !== undefined
            ? { padLayerRef: command.input.padLayerRef }
            : {}),
          ...(command.input.targetSectionRef !== undefined
            ? { targetSectionRef: command.input.targetSectionRef }
            : {})
        });
        cues.set(cueKey(cue.tenantId, cue.trackSetId, cue.cueId), cue);

        await publishPlayEvents(eventPublisher, [
          createPlayCueFiredEvent({
            actor: command.actor,
            cue,
            occurredAt: cue.updatedAt,
            requestId: command.requestId
          })
        ]);

        return cue;
      }),

    updatePlayCue: (rawCommand): Promise<PlayCue> =>
      runPlayOperation((): PlayCue => {
        const command = UpdatePlayCueCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        findTenantTrackSet(command.input.trackSetId, command.actor);
        const key = cueKey(
          command.actor.tenantId,
          command.input.trackSetId,
          command.input.cueId
        );
        const existingCue = cues.get(key);

        if (existingCue === undefined) {
          throw new PlayDomainError(
            "CUE_NOT_FOUND",
            "This cue is no longer available on the server."
          );
        }

        const cue = PlayCueSchema.parse({
          action: command.input.action,
          createdAt: existingCue.createdAt,
          cueId: existingCue.cueId,
          fireMode: command.input.fireMode,
          label: command.input.label,
          markerOffsetBeats: command.input.markerOffsetBeats,
          sectionId: command.input.sectionId,
          tenantId: existingCue.tenantId,
          trackSetId: existingCue.trackSetId,
          updatedAt: clock(),
          ...(command.input.padLayerRef !== undefined
            ? { padLayerRef: command.input.padLayerRef }
            : {}),
          ...(command.input.targetSectionRef !== undefined
            ? { targetSectionRef: command.input.targetSectionRef }
            : {})
        });
        cues.set(key, cue);

        return cue;
      }),

    removePlayCue: (rawCommand): Promise<void> =>
      runPlayOperation((): void => {
        const command = RemovePlayCueCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const key = cueKey(
          command.actor.tenantId,
          command.input.trackSetId,
          command.input.cueId
        );

        if (!cues.has(key)) {
          throw new PlayDomainError(
            "CUE_NOT_FOUND",
            "This cue is no longer available on the server."
          );
        }

        cues.delete(key);
      }),

    savePadLayer: (rawCommand): Promise<PadLayer> =>
      runPlayOperation((): PadLayer => {
        const command = SavePadLayerCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        const padLayer = PadLayerSchema.parse({
          gain: command.input.gain,
          key: command.input.key,
          loop: command.input.loop,
          padLayerRef: command.input.padLayerRef,
          padMediaRef: command.input.padMediaRef,
          tenantId: command.actor.tenantId,
          updatedAt: clock(),
          ...(command.input.label !== undefined ? { label: command.input.label } : {}),
          ...(command.input.sectionScopeRef !== undefined
            ? { sectionScopeRef: command.input.sectionScopeRef }
            : {}),
          ...(command.input.songRef !== undefined ? { songRef: command.input.songRef } : {})
        });
        padLayers.set(padLayerKey(padLayer.tenantId, padLayer.padLayerRef), padLayer);

        return padLayer;
      }),

    setPlaybackState: (rawCommand): Promise<PlaybackState> =>
      runPlayOperation(async (): Promise<PlaybackState> => {
        const command = SetPlaybackStateCommandSchema.parse(rawCommand);
        assertPlayCommandRole(command.actor);
        findTenantTrackSet(command.input.trackSetId, command.actor);
        const playbackState = PlaybackStateSchema.parse({
          clickEnabled: command.input.clickEnabled,
          positionBeats: command.input.positionBeats,
          tenantId: command.actor.tenantId,
          trackSetId: command.input.trackSetId,
          transportStatus: command.input.transportStatus,
          updatedAt: clock(),
          ...(command.input.activePadLayerRef !== undefined
            ? { activePadLayerRef: command.input.activePadLayerRef }
            : {}),
          ...(command.input.activeSectionRef !== undefined
            ? { activeSectionRef: command.input.activeSectionRef }
            : {})
        });
        playbackStates.set(
          playbackStateKey(playbackState.tenantId, playbackState.trackSetId),
          playbackState
        );

        await publishPlayEvents(eventPublisher, [
          createPlayPlaybackStateChangedEvent({
            actor: command.actor,
            occurredAt: playbackState.updatedAt,
            playbackState,
            requestId: command.requestId
          })
        ]);

        return playbackState;
      })
  };

  return {
    commandService,
    queryService,
    readArrangements: (): readonly PlayArrangement[] => [...arrangements.values()],
    readCues: (): readonly PlayCue[] => [...cues.values()],
    readPadLayers: (): readonly PadLayer[] => [...padLayers.values()],
    readPlaybackStates: (): readonly PlaybackState[] => [...playbackStates.values()],
    readSections: (): readonly PlaySection[] => [...sections.values()],
    readTrackSets: (): readonly TrackSet[] => [...trackSets.values()]
  };
};

const createPlayIds = (
  overrides: Partial<InMemoryPlayServiceIds> | undefined
): InMemoryPlayServiceIds => {
  let nextTrackSetNumber = 1;
  let nextCueNumber = 1;
  let nextSectionNumber = 1;

  return {
    cueId:
      overrides?.cueId ??
      ((): string => {
        const value = `cue_${String(nextCueNumber)}`;
        nextCueNumber += 1;
        return value;
      }),
    sectionId:
      overrides?.sectionId ??
      ((): string => {
        const value = `section_${String(nextSectionNumber)}`;
        nextSectionNumber += 1;
        return value;
      }),
    trackSetId:
      overrides?.trackSetId ??
      ((): string => {
        const value = `track_set_${String(nextTrackSetNumber)}`;
        nextTrackSetNumber += 1;
        return value;
      })
  };
};

const assertPlayQueryRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, playQueryRoles)) {
    throw new Error("Actor is not allowed to read Play resources.");
  }
};

const assertPlayCommandRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, playCommandRoles)) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to change this track set."
    );
  }
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));

const publishPlayEvents = (
  eventPublisher: EventPublisher | undefined,
  events: readonly ApiEventEnvelope[]
): Promise<void> => {
  if (eventPublisher === undefined) {
    return Promise.resolve();
  }

  return events.reduce(
    (previousPublish, event) =>
      previousPublish.then(() => eventPublisher.publishAfterCommit(event)),
    Promise.resolve()
  );
};

const createTrackSetUpdatedEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly changeKind: "created" | "updated";
  readonly occurredAt: string;
  readonly requestId: string;
  readonly trackSet: TrackSet;
}): ApiEventEnvelope => ({
  aggregateId: input.trackSet.trackSetId,
  actorId: input.actor.actorId,
  eventType: "trackSet.updated",
  occurredAt: input.occurredAt,
  payload: {
    changeKind: input.changeKind,
    tenantId: input.trackSet.tenantId,
    trackSetId: input.trackSet.trackSetId,
    updatedAt: input.trackSet.updatedAt
  },
  requestId: input.requestId,
  schemaVersion: "play-track-set-updated.v1",
  tenantId: input.trackSet.tenantId
});

const createPlayPlaybackStateChangedEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly occurredAt: string;
  readonly playbackState: PlaybackState;
  readonly requestId: string;
}): ApiEventEnvelope => ({
  aggregateId: input.playbackState.trackSetId,
  actorId: input.actor.actorId,
  eventType: "play.playbackStateChanged",
  occurredAt: input.occurredAt,
  payload: {
    clickEnabled: input.playbackState.clickEnabled,
    positionBeats: input.playbackState.positionBeats,
    tenantId: input.playbackState.tenantId,
    trackSetId: input.playbackState.trackSetId,
    transportStatus: input.playbackState.transportStatus,
    updatedAt: input.playbackState.updatedAt,
    ...(input.playbackState.activePadLayerRef !== undefined
      ? { activePadLayerRef: input.playbackState.activePadLayerRef }
      : {}),
    ...(input.playbackState.activeSectionRef !== undefined
      ? { activeSectionRef: input.playbackState.activeSectionRef }
      : {})
  },
  requestId: input.requestId,
  schemaVersion: "play-playback-state-changed.v1",
  tenantId: input.playbackState.tenantId
});

const createPlayCueFiredEvent = (input: {
  readonly actor: AuthenticatedActor;
  readonly cue: PlayCue;
  readonly occurredAt: string;
  readonly requestId: string;
}): ApiEventEnvelope => ({
  aggregateId: input.cue.trackSetId,
  actorId: input.actor.actorId,
  eventType: "play.cueFired",
  occurredAt: input.occurredAt,
  payload: {
    action: input.cue.action,
    cueId: input.cue.cueId,
    firedAt: input.occurredAt,
    tenantId: input.cue.tenantId,
    trackSetId: input.cue.trackSetId
  },
  requestId: input.requestId,
  schemaVersion: "play-cue-fired.v1",
  tenantId: input.cue.tenantId
});

const runPlayOperation = <TResult>(
  operation: () => TResult | Promise<TResult>
): Promise<TResult> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Play operation failed.")
    );
  }
};
