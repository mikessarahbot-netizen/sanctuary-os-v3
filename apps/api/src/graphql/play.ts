import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
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
  RemovePlayCueCommandSchema,
  ReorderPlaySectionsCommandSchema,
  ResolvePlaySequenceQuerySchema,
  SavePadLayerCommandSchema,
  SavePlayArrangementCommandSchema,
  SavePlaySectionCommandSchema,
  SaveTrackSetCommandSchema,
  SetPlaybackStateCommandSchema,
  UpdatePlayCueCommandSchema,
  UpdateTrackSetMembersCommandSchema,
  type PadLayer,
  type PlayArrangement,
  type PlayCommandService,
  type PlayCue,
  type PlayQueryService,
  type PlaySection,
  type PlaybackState,
  type ResolvedPlaySequence,
  type TrackSet
} from "../domain/play/index.js";

const NonEmptyStringSchema = z.string().min(1);

export const playGraphqlTypeDefs = /* GraphQL */ `
  enum PlaySectionKind {
    intro
    verse
    prechorus
    chorus
    bridge
    instrumental
    tag
    outro
    other
  }

  enum PlayCueAction {
    play
    stop
    jump
    pad_change
    click_toggle
  }

  enum PlayCueFireMode {
    manual
    auto
  }

  enum TransportStatus {
    stopped
    playing
    paused
  }

  enum TrackRole {
    click
    guide
    stem
    pad
    other
  }

  type TrackMemberRef {
    label: String
    muted: Boolean!
    role: TrackRole!
    trackRef: ID!
  }

  type TrackSet {
    arrangementRef: ID
    createdAt: DateTime!
    defaultKey: String!
    serviceRef: ID
    songRef: ID!
    tempoBpm: Float!
    tenantId: ID!
    title: String
    trackRefs: [TrackMemberRef!]!
    trackSetId: ID!
    updatedAt: DateTime!
  }

  type PlayArrangement {
    arrangementRef: ID!
    defaultKey: String!
    label: String!
    loopSectionRef: ID
    sectionOrder: [String!]!
    songRef: ID!
    tempoBpm: Float!
    tenantId: ID!
  }

  type PlaySection {
    arrangementRef: ID!
    clickEnabledDefault: Boolean!
    kind: PlaySectionKind!
    label: String
    lengthBars: Int!
    padLayerRef: ID
    sectionId: ID!
    tenantId: ID!
  }

  type PlayCue {
    action: PlayCueAction!
    createdAt: DateTime!
    cueId: ID!
    fireMode: PlayCueFireMode!
    label: String!
    markerOffsetBeats: Int!
    padLayerRef: ID
    sectionId: ID!
    targetSectionRef: ID
    tenantId: ID!
    trackSetId: ID!
    updatedAt: DateTime!
  }

  type PadLayer {
    gain: Float!
    key: String!
    label: String
    loop: Boolean!
    padLayerRef: ID!
    padMediaRef: ID!
    sectionScopeRef: ID
    songRef: ID
    tenantId: ID!
    updatedAt: DateTime!
  }

  type PlaybackState {
    activePadLayerRef: ID
    activeSectionRef: ID
    clickEnabled: Boolean!
    positionBeats: Float!
    tenantId: ID!
    trackSetId: ID!
    transportStatus: TransportStatus!
    updatedAt: DateTime!
  }

  type ResolvedPlaySequenceEntry {
    clickEnabledDefault: Boolean
    isLoopSection: Boolean
    kind: PlaySectionKind
    lengthBars: Int
    orderIndex: Int!
    padLayerRef: ID
    sectionId: ID
    sectionRef: String!
    status: String!
  }

  type ResolvedPlaySequence {
    arrangementRef: String!
    entries: [ResolvedPlaySequenceEntry!]!
    loopSectionRef: String
  }

  input PlayTrackSetsFilterInput {
    songRef: ID
  }

  input PlayPadLayersFilterInput {
    songRef: ID
  }

  input TrackMemberRefInput {
    label: String
    muted: Boolean!
    role: TrackRole!
    trackRef: ID!
  }

  input SaveTrackSetInput {
    arrangementRef: ID
    defaultKey: String!
    serviceRef: ID
    songRef: ID!
    tempoBpm: Float!
    title: String
    trackRefs: [TrackMemberRefInput!]!
    trackSetId: ID
  }

  input UpdateTrackSetMembersInput {
    trackRefs: [TrackMemberRefInput!]!
    trackSetId: ID!
  }

  input SavePlayArrangementInput {
    arrangementRef: ID!
    defaultKey: String!
    label: String!
    loopSectionRef: ID
    sectionOrder: [String!]!
    songRef: ID!
    tempoBpm: Float!
  }

  input SavePlaySectionInput {
    arrangementRef: ID!
    clickEnabledDefault: Boolean!
    kind: PlaySectionKind!
    label: String
    lengthBars: Int!
    padLayerRef: ID
    sectionId: ID
  }

  input ReorderPlaySectionsInput {
    arrangementRef: ID!
    orderedSectionIds: [ID!]!
  }

  input AddPlayCueInput {
    action: PlayCueAction!
    fireMode: PlayCueFireMode!
    label: String!
    markerOffsetBeats: Int!
    padLayerRef: ID
    sectionId: ID!
    targetSectionRef: ID
    trackSetId: ID!
  }

  input UpdatePlayCueInput {
    action: PlayCueAction!
    cueId: ID!
    fireMode: PlayCueFireMode!
    label: String!
    markerOffsetBeats: Int!
    padLayerRef: ID
    sectionId: ID!
    targetSectionRef: ID
    trackSetId: ID!
  }

  input PlayConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input RemovePlayCueInput {
    confirmationIntent: PlayConfirmationIntentInput!
    cueId: ID!
    trackSetId: ID!
  }

  input SavePadLayerInput {
    gain: Float!
    key: String!
    label: String
    loop: Boolean!
    padLayerRef: ID!
    padMediaRef: ID!
    sectionScopeRef: ID
    songRef: ID
  }

  input SetPlaybackStateInput {
    activePadLayerRef: ID
    activeSectionRef: ID
    clickEnabled: Boolean!
    positionBeats: Float!
    transportStatus: TransportStatus!
    trackSetId: ID!
  }

  extend type Query {
    trackSets(filter: PlayTrackSetsFilterInput): [TrackSet!]!
    trackSet(id: ID!): TrackSet
    trackSetsForSong(songRef: ID!): [TrackSet!]!
    playArrangements(songRef: ID!): [PlayArrangement!]!
    playSections(arrangementRef: ID!): [PlaySection!]!
    playCues(trackSetId: ID!): [PlayCue!]!
    padLayers(filter: PlayPadLayersFilterInput): [PadLayer!]!
    playbackState(trackSetId: ID!): PlaybackState
    resolvedPlaySequence(arrangementRef: ID!): ResolvedPlaySequence
  }

  extend type Mutation {
    saveTrackSet(input: SaveTrackSetInput!): TrackSet!
    updateTrackSetMembers(input: UpdateTrackSetMembersInput!): TrackSet!
    savePlayArrangement(input: SavePlayArrangementInput!): PlayArrangement!
    savePlaySection(input: SavePlaySectionInput!): PlaySection!
    reorderPlaySections(input: ReorderPlaySectionsInput!): [PlaySection!]!
    addPlayCue(input: AddPlayCueInput!): PlayCue!
    updatePlayCue(input: UpdatePlayCueInput!): PlayCue!
    removePlayCue(input: RemovePlayCueInput!): Boolean!
    savePadLayer(input: SavePadLayerInput!): PadLayer!
    setPlaybackState(input: SetPlaybackStateInput!): PlaybackState!
  }
`;

export const PlayGraphqlContextSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

const GraphqlInputArgsSchema = z
  .object({
    input: z.unknown()
  })
  .strict();

export type PlayGraphqlContext = z.infer<typeof PlayGraphqlContextSchema>;

export interface PlayGraphqlResolverDependencies {
  readonly playCommandService: PlayCommandService;
  readonly playQueryService: PlayQueryService;
}

export interface PlayQueryResolvers {
  readonly trackSets: GraphqlQueryResolver<readonly TrackSet[]>;
  readonly trackSet: GraphqlQueryResolver<TrackSet | null>;
  readonly trackSetsForSong: GraphqlQueryResolver<readonly TrackSet[]>;
  readonly playArrangements: GraphqlQueryResolver<readonly PlayArrangement[]>;
  readonly playSections: GraphqlQueryResolver<readonly PlaySection[]>;
  readonly playCues: GraphqlQueryResolver<readonly PlayCue[]>;
  readonly padLayers: GraphqlQueryResolver<readonly PadLayer[]>;
  readonly playbackState: GraphqlQueryResolver<PlaybackState | null>;
  readonly resolvedPlaySequence: GraphqlQueryResolver<ResolvedPlaySequence | null>;
}

export interface PlayMutationResolvers {
  readonly saveTrackSet: GraphqlMutationResolver<TrackSet>;
  readonly updateTrackSetMembers: GraphqlMutationResolver<TrackSet>;
  readonly savePlayArrangement: GraphqlMutationResolver<PlayArrangement>;
  readonly savePlaySection: GraphqlMutationResolver<PlaySection>;
  readonly reorderPlaySections: GraphqlMutationResolver<readonly PlaySection[]>;
  readonly addPlayCue: GraphqlMutationResolver<PlayCue>;
  readonly updatePlayCue: GraphqlMutationResolver<PlayCue>;
  readonly removePlayCue: GraphqlMutationResolver<boolean>;
  readonly savePadLayer: GraphqlMutationResolver<PadLayer>;
  readonly setPlaybackState: GraphqlMutationResolver<PlaybackState>;
}

export interface PlayGraphqlResolvers {
  readonly Query: PlayQueryResolvers;
  readonly Mutation: PlayMutationResolvers;
}

type GraphqlQueryResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PlayGraphqlContext
) => Promise<TResult>;

type GraphqlMutationResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PlayGraphqlContext
) => Promise<TResult>;

export const createPlayGraphqlResolvers = (
  dependencies: PlayGraphqlResolverDependencies
): PlayGraphqlResolvers => ({
  Query: {
    trackSets: async (_parent, args, context): Promise<readonly TrackSet[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listTrackSets(
        ListTrackSetsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    trackSet: async (_parent, args, context): Promise<TrackSet | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          id: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.getTrackSet(
        GetTrackSetQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            trackSetId: queryArgs.id
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    trackSetsForSong: async (_parent, args, context): Promise<readonly TrackSet[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          songRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listTrackSetsForSong(
        ListTrackSetsForSongQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            songRef: queryArgs.songRef
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    playArrangements: async (
      _parent,
      args,
      context
    ): Promise<readonly PlayArrangement[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          songRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listPlayArrangements(
        ListPlayArrangementsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            songRef: queryArgs.songRef
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    playSections: async (_parent, args, context): Promise<readonly PlaySection[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          arrangementRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listPlaySections(
        ListPlaySectionsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            arrangementRef: queryArgs.arrangementRef
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    playCues: async (_parent, args, context): Promise<readonly PlayCue[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          trackSetId: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listPlayCues(
        ListPlayCuesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            trackSetId: queryArgs.trackSetId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    padLayers: async (_parent, args, context): Promise<readonly PadLayer[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.listPadLayers(
        ListPadLayersQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    playbackState: async (_parent, args, context): Promise<PlaybackState | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          trackSetId: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.getPlaybackState(
        GetPlaybackStateQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            trackSetId: queryArgs.trackSetId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    resolvedPlaySequence: async (
      _parent,
      args,
      context
    ): Promise<ResolvedPlaySequence | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          arrangementRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.playQueryService.resolvePlaySequence(
        ResolvePlaySequenceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            arrangementRef: queryArgs.arrangementRef
          },
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Mutation: {
    saveTrackSet: async (_parent, args, context): Promise<TrackSet> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.saveTrackSet(
        SaveTrackSetCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateTrackSetMembers: async (_parent, args, context): Promise<TrackSet> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.updateTrackSetMembers(
        UpdateTrackSetMembersCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    savePlayArrangement: async (_parent, args, context): Promise<PlayArrangement> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.savePlayArrangement(
        SavePlayArrangementCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    savePlaySection: async (_parent, args, context): Promise<PlaySection> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.savePlaySection(
        SavePlaySectionCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    reorderPlaySections: async (
      _parent,
      args,
      context
    ): Promise<readonly PlaySection[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.reorderPlaySections(
        ReorderPlaySectionsCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    addPlayCue: async (_parent, args, context): Promise<PlayCue> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.addPlayCue(
        AddPlayCueCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updatePlayCue: async (_parent, args, context): Promise<PlayCue> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.updatePlayCue(
        UpdatePlayCueCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    removePlayCue: async (_parent, args, context): Promise<boolean> => {
      const graphqlContext = parseContext(context);

      await dependencies.playCommandService.removePlayCue(
        RemovePlayCueCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );

      return true;
    },

    savePadLayer: async (_parent, args, context): Promise<PadLayer> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.savePadLayer(
        SavePadLayerCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    setPlaybackState: async (_parent, args, context): Promise<PlaybackState> => {
      const graphqlContext = parseContext(context);

      return dependencies.playCommandService.setPlaybackState(
        SetPlaybackStateCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    }
  }
});

const parseContext = (context: PlayGraphqlContext): PlayGraphqlContext =>
  PlayGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;
