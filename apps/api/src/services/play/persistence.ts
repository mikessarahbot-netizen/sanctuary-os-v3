import type {
  PadLayerPersistenceRecord,
  PlayArrangementPersistenceRecord,
  PlayCommandPersistenceRepository,
  PlayCuePersistenceRecord,
  PlayPersistenceReadOptions,
  PlayPersistenceWriteOptions,
  PlayQueryPersistenceRepository,
  PlaySectionPersistenceRecord,
  PlaybackStatePersistenceRecord,
  RepositoryMutationIntent,
  TrackSetPersistenceRecord
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
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

const PLAY_STORAGE_SCHEMA_VERSION = "play.v1";

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

export interface PersistenceBackedPlayServiceIds {
  readonly cueId: () => string;
  readonly sectionId: () => string;
  readonly trackSetId: () => string;
}

export interface PersistenceBackedPlayServiceDependencies {
  readonly clock?: () => string;
  readonly commandRepository: PlayCommandPersistenceRepository;
  readonly ids?: Partial<PersistenceBackedPlayServiceIds>;
  readonly queryRepository: PlayQueryPersistenceRepository;
}

export interface PersistenceBackedPlayServicesAdapter {
  readonly commandService: PlayCommandService;
  readonly queryService: PlayQueryService;
}

export const createPersistenceBackedPlayServicesAdapter = (
  dependencies: PersistenceBackedPlayServiceDependencies
): PersistenceBackedPlayServicesAdapter => {
  const clock = dependencies.clock ?? ((): string => new Date().toISOString());
  const ids = createPlayIds(dependencies.ids);
  const { commandRepository, queryRepository } = dependencies;

  const requireTenantTrackSet = async (
    trackSetId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<TrackSetPersistenceRecord> => {
    const trackSet = await queryRepository.getTrackSet({
      input: { trackSetId },
      options: toReadOptions(actor, requestId)
    });

    if (trackSet === null) {
      throw new PlayDomainError(
        "TRACK_SET_NOT_FOUND",
        "This track set is no longer available on the server."
      );
    }

    return assertTenantScopedPersistenceTrackSet(trackSet, actor.tenantId);
  };

  const requireTenantArrangement = async (
    arrangementRef: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<PlayArrangementPersistenceRecord> => {
    const arrangement = await queryRepository.getPlayArrangement({
      input: { arrangementRef },
      options: toReadOptions(actor, requestId)
    });

    if (arrangement === null) {
      throw new PlayDomainError(
        "ARRANGEMENT_NOT_FOUND",
        "This arrangement is no longer available on the server."
      );
    }

    return assertTenantScopedPersistenceArrangement(arrangement, actor.tenantId);
  };

  const queryService: PlayQueryService = {
    listTrackSets: async (rawQuery): Promise<readonly TrackSet[]> => {
      const query = ListTrackSetsQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listTrackSets({
        input:
          query.input.filter?.songRef === undefined
            ? {}
            : { filter: { songRef: query.input.filter.songRef } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainTrackSet(
          assertTenantScopedPersistenceTrackSet(record, query.actor.tenantId)
        )
      );
    },

    getTrackSet: async (rawQuery): Promise<TrackSet | null> => {
      const query = GetTrackSetQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const record = await queryRepository.getTrackSet({
        input: { trackSetId: query.input.trackSetId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainTrackSet(record);
    },

    listTrackSetsForSong: async (rawQuery): Promise<readonly TrackSet[]> => {
      const query = ListTrackSetsForSongQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listTrackSetsForSong({
        input: { songRef: query.input.songRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainTrackSet(
          assertTenantScopedPersistenceTrackSet(record, query.actor.tenantId)
        )
      );
    },

    listPlayArrangements: async (rawQuery): Promise<readonly PlayArrangement[]> => {
      const query = ListPlayArrangementsQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listPlayArrangements({
        input: { songRef: query.input.songRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainArrangement(
          assertTenantScopedPersistenceArrangement(record, query.actor.tenantId)
        )
      );
    },

    listPlaySections: async (rawQuery): Promise<readonly PlaySection[]> => {
      const query = ListPlaySectionsQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listPlaySections({
        input: { arrangementRef: query.input.arrangementRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainSection(
          assertTenantScopedPersistenceSection(record, query.actor.tenantId)
        )
      );
    },

    listPlayCues: async (rawQuery): Promise<readonly PlayCue[]> => {
      const query = ListPlayCuesQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listPlayCues({
        input: { trackSetId: query.input.trackSetId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainCue(assertTenantScopedPersistenceCue(record, query.actor.tenantId))
      );
    },

    listPadLayers: async (rawQuery): Promise<readonly PadLayer[]> => {
      const query = ListPadLayersQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const records = await queryRepository.listPadLayers({
        input:
          query.input.filter?.songRef === undefined
            ? {}
            : { filter: { songRef: query.input.filter.songRef } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainPadLayer(
          assertTenantScopedPersistencePadLayer(record, query.actor.tenantId)
        )
      );
    },

    getPlaybackState: async (rawQuery): Promise<PlaybackState | null> => {
      const query = GetPlaybackStateQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const record = await queryRepository.getPlaybackState({
        input: { trackSetId: query.input.trackSetId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainPlaybackState(record);
    },

    resolvePlaySequence: async (rawQuery): Promise<ResolvedPlaySequence | null> => {
      const query = ResolvePlaySequenceQuerySchema.parse(rawQuery);
      assertPlayQueryRole(query.actor);
      const arrangementRecord = await queryRepository.getPlayArrangement({
        input: { arrangementRef: query.input.arrangementRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      if (arrangementRecord === null || arrangementRecord.tenantId !== query.actor.tenantId) {
        return null;
      }

      const sectionRecords = await queryRepository.listPlaySections({
        input: { arrangementRef: query.input.arrangementRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return resolvePlaySequence(
        toDomainArrangement(arrangementRecord),
        sectionRecords.map((record) =>
          toDomainSection(
            assertTenantScopedPersistenceSection(record, query.actor.tenantId)
          )
        )
      );
    }
  };

  const commandService: PlayCommandService = {
    saveTrackSet: async (rawCommand): Promise<TrackSet> => {
      const command = SaveTrackSetCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      const now = clock();
      const trackSetId = command.input.trackSetId ?? ids.trackSetId();
      const existing = await queryRepository.getTrackSet({
        input: { trackSetId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new PlayDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this track set."
        );
      }

      const record = await commandRepository.saveTrackSet({
        input: {
          createdAt: existing?.createdAt ?? now,
          defaultKey: command.input.defaultKey,
          schemaVersion: PLAY_STORAGE_SCHEMA_VERSION,
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
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainTrackSet(
        assertTenantScopedPersistenceTrackSet(record, command.actor.tenantId)
      );
    },

    updateTrackSetMembers: async (rawCommand): Promise<TrackSet> => {
      const command = UpdateTrackSetMembersCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantTrackSet(
        command.input.trackSetId,
        command.actor,
        command.requestId
      );
      const record = await commandRepository.updateTrackSetMembers({
        input: {
          trackRefs: command.input.trackRefs,
          trackSetId: command.input.trackSetId
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainTrackSet(
        assertTenantScopedPersistenceTrackSet(record, command.actor.tenantId)
      );
    },

    savePlayArrangement: async (rawCommand): Promise<PlayArrangement> => {
      const command = SavePlayArrangementCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      const record = await commandRepository.savePlayArrangement({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainArrangement(
        assertTenantScopedPersistenceArrangement(record, command.actor.tenantId)
      );
    },

    savePlaySection: async (rawCommand): Promise<PlaySection> => {
      const command = SavePlaySectionCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantArrangement(
        command.input.arrangementRef,
        command.actor,
        command.requestId
      );
      const sectionId = command.input.sectionId ?? ids.sectionId();
      const record = await commandRepository.savePlaySection({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainSection(
        assertTenantScopedPersistenceSection(record, command.actor.tenantId)
      );
    },

    reorderPlaySections: async (rawCommand): Promise<readonly PlaySection[]> => {
      const command = ReorderPlaySectionsCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantArrangement(
        command.input.arrangementRef,
        command.actor,
        command.requestId
      );
      const sections = await queryRepository.listPlaySections({
        input: { arrangementRef: command.input.arrangementRef },
        options: toReadOptions(command.actor, command.requestId)
      });
      const sectionsById = new Map(
        sections.map((section) => [section.sectionId, section] as const)
      );

      for (const sectionId of command.input.orderedSectionIds) {
        const section = sectionsById.get(sectionId);

        if (
          section === undefined ||
          section.tenantId !== command.actor.tenantId ||
          section.arrangementRef !== command.input.arrangementRef
        ) {
          throw new PlayDomainError(
            "SECTION_NOT_FOUND",
            "This section is no longer available on the server."
          );
        }
      }

      const records = await commandRepository.reorderPlaySections({
        input: {
          arrangementRef: command.input.arrangementRef,
          orderedSectionIds: command.input.orderedSectionIds
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return records.map((record) =>
        toDomainSection(
          assertTenantScopedPersistenceSection(record, command.actor.tenantId)
        )
      );
    },

    addPlayCue: async (rawCommand): Promise<PlayCue> => {
      const command = AddPlayCueCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantTrackSet(
        command.input.trackSetId,
        command.actor,
        command.requestId
      );
      const now = clock();
      const record = await commandRepository.addPlayCue({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainCue(
        assertTenantScopedPersistenceCue(record, command.actor.tenantId)
      );
    },

    updatePlayCue: async (rawCommand): Promise<PlayCue> => {
      const command = UpdatePlayCueCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantTrackSet(
        command.input.trackSetId,
        command.actor,
        command.requestId
      );
      const existing = await findTenantCue(
        queryRepository,
        command.actor,
        command.requestId,
        command.input.trackSetId,
        command.input.cueId
      );
      const record = await commandRepository.updatePlayCue({
        input: {
          action: command.input.action,
          createdAt: existing.createdAt,
          cueId: existing.cueId,
          fireMode: command.input.fireMode,
          label: command.input.label,
          markerOffsetBeats: command.input.markerOffsetBeats,
          sectionId: command.input.sectionId,
          tenantId: existing.tenantId,
          trackSetId: existing.trackSetId,
          updatedAt: clock(),
          ...(command.input.padLayerRef !== undefined
            ? { padLayerRef: command.input.padLayerRef }
            : {}),
          ...(command.input.targetSectionRef !== undefined
            ? { targetSectionRef: command.input.targetSectionRef }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainCue(
        assertTenantScopedPersistenceCue(record, command.actor.tenantId)
      );
    },

    removePlayCue: async (rawCommand): Promise<void> => {
      const command = RemovePlayCueCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await findTenantCue(
        queryRepository,
        command.actor,
        command.requestId,
        command.input.trackSetId,
        command.input.cueId
      );
      await commandRepository.removePlayCue({
        input: {
          cueId: command.input.cueId,
          trackSetId: command.input.trackSetId
        },
        options: toWriteOptions(command.actor, command.requestId, "destructive-confirmed")
      });
    },

    savePadLayer: async (rawCommand): Promise<PadLayer> => {
      const command = SavePadLayerCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      const record = await commandRepository.savePadLayer({
        input: {
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
          ...(command.input.songRef !== undefined
            ? { songRef: command.input.songRef }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainPadLayer(
        assertTenantScopedPersistencePadLayer(record, command.actor.tenantId)
      );
    },

    setPlaybackState: async (rawCommand): Promise<PlaybackState> => {
      const command = SetPlaybackStateCommandSchema.parse(rawCommand);
      assertPlayCommandRole(command.actor);
      await requireTenantTrackSet(
        command.input.trackSetId,
        command.actor,
        command.requestId
      );
      const record = await commandRepository.setPlaybackState({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainPlaybackState(
        assertTenantScopedPersistencePlaybackState(record, command.actor.tenantId)
      );
    }
  };

  return { commandService, queryService };
};

const findTenantCue = async (
  queryRepository: PlayQueryPersistenceRepository,
  actor: AuthenticatedActor,
  requestId: string,
  trackSetId: string,
  cueId: string
): Promise<PlayCuePersistenceRecord> => {
  const cues = await queryRepository.listPlayCues({
    input: { trackSetId },
    options: toReadOptions(actor, requestId)
  });
  const cue = cues.find(
    (candidate) =>
      candidate.cueId === cueId &&
      candidate.tenantId === actor.tenantId &&
      candidate.trackSetId === trackSetId
  );

  if (cue === undefined) {
    throw new PlayDomainError(
      "CUE_NOT_FOUND",
      "This cue is no longer available on the server."
    );
  }

  return cue;
};

const toDomainTrackSet = (record: TrackSetPersistenceRecord): TrackSet =>
  TrackSetSchema.parse({
    createdAt: record.createdAt,
    defaultKey: record.defaultKey,
    songRef: record.songRef,
    tempoBpm: record.tempoBpm,
    tenantId: record.tenantId,
    trackRefs: record.trackRefs,
    trackSetId: record.trackSetId,
    updatedAt: record.updatedAt,
    ...(record.arrangementRef !== undefined
      ? { arrangementRef: record.arrangementRef }
      : {}),
    ...(record.serviceRef !== undefined ? { serviceRef: record.serviceRef } : {}),
    ...(record.title !== undefined ? { title: record.title } : {})
  });

const toDomainArrangement = (
  record: PlayArrangementPersistenceRecord
): PlayArrangement =>
  PlayArrangementSchema.parse({
    arrangementRef: record.arrangementRef,
    defaultKey: record.defaultKey,
    label: record.label,
    sectionOrder: record.sectionOrder,
    songRef: record.songRef,
    tempoBpm: record.tempoBpm,
    tenantId: record.tenantId,
    ...(record.loopSectionRef !== undefined
      ? { loopSectionRef: record.loopSectionRef }
      : {})
  });

const toDomainSection = (record: PlaySectionPersistenceRecord): PlaySection =>
  PlaySectionSchema.parse({
    arrangementRef: record.arrangementRef,
    clickEnabledDefault: record.clickEnabledDefault,
    kind: record.kind,
    lengthBars: record.lengthBars,
    sectionId: record.sectionId,
    tenantId: record.tenantId,
    ...(record.label !== undefined ? { label: record.label } : {}),
    ...(record.padLayerRef !== undefined ? { padLayerRef: record.padLayerRef } : {})
  });

const toDomainCue = (record: PlayCuePersistenceRecord): PlayCue =>
  PlayCueSchema.parse({
    action: record.action,
    createdAt: record.createdAt,
    cueId: record.cueId,
    fireMode: record.fireMode,
    label: record.label,
    markerOffsetBeats: record.markerOffsetBeats,
    sectionId: record.sectionId,
    tenantId: record.tenantId,
    trackSetId: record.trackSetId,
    updatedAt: record.updatedAt,
    ...(record.padLayerRef !== undefined ? { padLayerRef: record.padLayerRef } : {}),
    ...(record.targetSectionRef !== undefined
      ? { targetSectionRef: record.targetSectionRef }
      : {})
  });

const toDomainPadLayer = (record: PadLayerPersistenceRecord): PadLayer =>
  PadLayerSchema.parse({
    gain: record.gain,
    key: record.key,
    loop: record.loop,
    padLayerRef: record.padLayerRef,
    padMediaRef: record.padMediaRef,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.label !== undefined ? { label: record.label } : {}),
    ...(record.sectionScopeRef !== undefined
      ? { sectionScopeRef: record.sectionScopeRef }
      : {}),
    ...(record.songRef !== undefined ? { songRef: record.songRef } : {})
  });

const toDomainPlaybackState = (
  record: PlaybackStatePersistenceRecord
): PlaybackState =>
  PlaybackStateSchema.parse({
    clickEnabled: record.clickEnabled,
    positionBeats: record.positionBeats,
    tenantId: record.tenantId,
    trackSetId: record.trackSetId,
    transportStatus: record.transportStatus,
    updatedAt: record.updatedAt,
    ...(record.activePadLayerRef !== undefined
      ? { activePadLayerRef: record.activePadLayerRef }
      : {}),
    ...(record.activeSectionRef !== undefined
      ? { activeSectionRef: record.activeSectionRef }
      : {})
  });

const toReadOptions = (
  actor: AuthenticatedActor,
  requestId: string
): PlayPersistenceReadOptions => ({
  context: {
    actorId: actor.actorId,
    requestId,
    tenantId: actor.tenantId
  }
});

const toWriteOptions = (
  actor: AuthenticatedActor,
  requestId: string,
  intent: RepositoryMutationIntent
): PlayPersistenceWriteOptions => ({
  ...toReadOptions(actor, requestId),
  intent
});

const createPlayIds = (
  overrides: Partial<PersistenceBackedPlayServiceIds> | undefined
): PersistenceBackedPlayServiceIds => {
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

const assertTenantScopedPersistenceTrackSet = (
  record: TrackSetPersistenceRecord,
  expectedTenantId: string
): TrackSetPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this track set."
    );
  }

  return record;
};

const assertTenantScopedPersistenceArrangement = (
  record: PlayArrangementPersistenceRecord,
  expectedTenantId: string
): PlayArrangementPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this arrangement."
    );
  }

  return record;
};

const assertTenantScopedPersistenceSection = (
  record: PlaySectionPersistenceRecord,
  expectedTenantId: string
): PlaySectionPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this section."
    );
  }

  return record;
};

const assertTenantScopedPersistenceCue = (
  record: PlayCuePersistenceRecord,
  expectedTenantId: string
): PlayCuePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this cue."
    );
  }

  return record;
};

const assertTenantScopedPersistencePadLayer = (
  record: PadLayerPersistenceRecord,
  expectedTenantId: string
): PadLayerPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this pad layer."
    );
  }

  return record;
};

const assertTenantScopedPersistencePlaybackState = (
  record: PlaybackStatePersistenceRecord,
  expectedTenantId: string
): PlaybackStatePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new PlayDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this playback state."
    );
  }

  return record;
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));
