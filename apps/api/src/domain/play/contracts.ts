import { z } from "zod";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import {
  PadLayerSchema,
  PlayArrangementSchema,
  PlayCueActionSchema,
  PlayCueFireModeSchema,
  PlayCueSchema,
  PlaySectionKindSchema,
  PlaySectionSchema,
  PlaybackStateSchema,
  TrackMemberRefSchema,
  TrackSetSchema,
  TransportStatusSchema,
  type PadLayer,
  type PlayArrangement,
  type PlayCue,
  type PlaySection,
  type PlaybackState,
  type TrackSet
} from "./schemas.js";
import { ResolvedPlaySequenceSchema, type ResolvedPlaySequence } from "./sequence.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().nonnegative();
const PositiveNumberSchema = z.number().positive();
const GainSchema = z.number().min(0).max(1);

const TrackMemberRefInputSchema = z
  .object({
    label: OptionalNonEmptyStringSchema,
    muted: z.boolean(),
    role: TrackMemberRefSchema.shape.role,
    trackRef: NonEmptyStringSchema
  })
  .strict();

const PlayServiceRequestSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

export const PlayTrackSetsFilterSchema = z
  .object({
    songRef: OptionalNonEmptyStringSchema
  })
  .strict();

export const PlayPadLayersFilterSchema = z
  .object({
    songRef: OptionalNonEmptyStringSchema
  })
  .strict();

export const ListTrackSetsQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      filter: PlayTrackSetsFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetTrackSetQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListTrackSetsForSongQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      songRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListPlayArrangementsQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      songRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListPlaySectionsQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListPlayCuesQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListPadLayersQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      filter: PlayPadLayersFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetPlaybackStateQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ResolvePlaySequenceQuerySchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SaveTrackSetCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: OptionalNonEmptyStringSchema,
      defaultKey: NonEmptyStringSchema,
      serviceRef: OptionalNonEmptyStringSchema,
      songRef: NonEmptyStringSchema,
      tempoBpm: PositiveNumberSchema,
      title: OptionalNonEmptyStringSchema,
      trackRefs: z.array(TrackMemberRefInputSchema),
      trackSetId: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const UpdateTrackSetMembersCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      trackRefs: z.array(TrackMemberRefInputSchema),
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SavePlayArrangementCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema,
      defaultKey: NonEmptyStringSchema,
      label: NonEmptyStringSchema,
      loopSectionRef: OptionalNonEmptyStringSchema,
      sectionOrder: z.array(NonEmptyStringSchema),
      songRef: NonEmptyStringSchema,
      tempoBpm: PositiveNumberSchema
    })
    .strict()
}).strict();

export const SavePlaySectionCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema,
      clickEnabledDefault: z.boolean(),
      kind: PlaySectionKindSchema,
      label: OptionalNonEmptyStringSchema,
      lengthBars: NonNegativeIntegerSchema,
      padLayerRef: OptionalNonEmptyStringSchema,
      sectionId: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const ReorderPlaySectionsCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema,
      orderedSectionIds: z.array(NonEmptyStringSchema).min(1)
    })
    .strict()
    .superRefine((input, context) => {
      if (new Set(input.orderedSectionIds).size !== input.orderedSectionIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Play section order cannot contain duplicate section IDs.",
          path: ["orderedSectionIds"]
        });
      }
    })
}).strict();

export const AddPlayCueCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      action: PlayCueActionSchema,
      fireMode: PlayCueFireModeSchema,
      label: NonEmptyStringSchema,
      markerOffsetBeats: NonNegativeIntegerSchema,
      padLayerRef: OptionalNonEmptyStringSchema,
      sectionId: NonEmptyStringSchema,
      targetSectionRef: OptionalNonEmptyStringSchema,
      trackSetId: NonEmptyStringSchema
    })
    .strict()
    .superRefine((input, context) => {
      if (input.action === "jump" && input.targetSectionRef === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jump cues require a targetSectionRef.",
          path: ["targetSectionRef"]
        });
      }

      if (input.action === "pad-change" && input.padLayerRef === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pad-change cues require a padLayerRef.",
          path: ["padLayerRef"]
        });
      }
    })
}).strict();

export const UpdatePlayCueCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      action: PlayCueActionSchema,
      cueId: NonEmptyStringSchema,
      fireMode: PlayCueFireModeSchema,
      label: NonEmptyStringSchema,
      markerOffsetBeats: NonNegativeIntegerSchema,
      padLayerRef: OptionalNonEmptyStringSchema,
      sectionId: NonEmptyStringSchema,
      targetSectionRef: OptionalNonEmptyStringSchema,
      trackSetId: NonEmptyStringSchema
    })
    .strict()
    .superRefine((input, context) => {
      if (input.action === "jump" && input.targetSectionRef === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jump cues require a targetSectionRef.",
          path: ["targetSectionRef"]
        });
      }

      if (input.action === "pad-change" && input.padLayerRef === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pad-change cues require a padLayerRef.",
          path: ["padLayerRef"]
        });
      }
    })
}).strict();

export const RemovePlayCueCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      confirmationIntent: z
        .object({
          confirmed: z.literal(true),
          reason: NonEmptyStringSchema
        })
        .strict(),
      cueId: NonEmptyStringSchema,
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SavePadLayerCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      gain: GainSchema,
      key: NonEmptyStringSchema,
      label: OptionalNonEmptyStringSchema,
      loop: z.boolean(),
      padLayerRef: NonEmptyStringSchema,
      padMediaRef: NonEmptyStringSchema,
      sectionScopeRef: OptionalNonEmptyStringSchema,
      songRef: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const SetPlaybackStateCommandSchema = PlayServiceRequestSchema.extend({
  input: z
    .object({
      activePadLayerRef: OptionalNonEmptyStringSchema,
      activeSectionRef: OptionalNonEmptyStringSchema,
      clickEnabled: z.boolean(),
      positionBeats: NonNegativeNumberSchema,
      transportStatus: TransportStatusSchema,
      trackSetId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export type PlayTrackSetsFilter = z.infer<typeof PlayTrackSetsFilterSchema>;
export type PlayPadLayersFilter = z.infer<typeof PlayPadLayersFilterSchema>;
export type ListTrackSetsQuery = z.infer<typeof ListTrackSetsQuerySchema>;
export type GetTrackSetQuery = z.infer<typeof GetTrackSetQuerySchema>;
export type ListTrackSetsForSongQuery = z.infer<typeof ListTrackSetsForSongQuerySchema>;
export type ListPlayArrangementsQuery = z.infer<typeof ListPlayArrangementsQuerySchema>;
export type ListPlaySectionsQuery = z.infer<typeof ListPlaySectionsQuerySchema>;
export type ListPlayCuesQuery = z.infer<typeof ListPlayCuesQuerySchema>;
export type ListPadLayersQuery = z.infer<typeof ListPadLayersQuerySchema>;
export type GetPlaybackStateQuery = z.infer<typeof GetPlaybackStateQuerySchema>;
export type ResolvePlaySequenceQuery = z.infer<typeof ResolvePlaySequenceQuerySchema>;
export type SaveTrackSetCommand = z.infer<typeof SaveTrackSetCommandSchema>;
export type UpdateTrackSetMembersCommand = z.infer<
  typeof UpdateTrackSetMembersCommandSchema
>;
export type SavePlayArrangementCommand = z.infer<typeof SavePlayArrangementCommandSchema>;
export type SavePlaySectionCommand = z.infer<typeof SavePlaySectionCommandSchema>;
export type ReorderPlaySectionsCommand = z.infer<typeof ReorderPlaySectionsCommandSchema>;
export type AddPlayCueCommand = z.infer<typeof AddPlayCueCommandSchema>;
export type UpdatePlayCueCommand = z.infer<typeof UpdatePlayCueCommandSchema>;
export type RemovePlayCueCommand = z.infer<typeof RemovePlayCueCommandSchema>;
export type SavePadLayerCommand = z.infer<typeof SavePadLayerCommandSchema>;
export type SetPlaybackStateCommand = z.infer<typeof SetPlaybackStateCommandSchema>;

export interface PlayQueryService {
  readonly listTrackSets: (query: ListTrackSetsQuery) => Promise<readonly TrackSet[]>;
  readonly getTrackSet: (query: GetTrackSetQuery) => Promise<TrackSet | null>;
  readonly listTrackSetsForSong: (
    query: ListTrackSetsForSongQuery
  ) => Promise<readonly TrackSet[]>;
  readonly listPlayArrangements: (
    query: ListPlayArrangementsQuery
  ) => Promise<readonly PlayArrangement[]>;
  readonly listPlaySections: (
    query: ListPlaySectionsQuery
  ) => Promise<readonly PlaySection[]>;
  readonly listPlayCues: (query: ListPlayCuesQuery) => Promise<readonly PlayCue[]>;
  readonly listPadLayers: (query: ListPadLayersQuery) => Promise<readonly PadLayer[]>;
  readonly getPlaybackState: (
    query: GetPlaybackStateQuery
  ) => Promise<PlaybackState | null>;
  readonly resolvePlaySequence: (
    query: ResolvePlaySequenceQuery
  ) => Promise<ResolvedPlaySequence | null>;
}

export interface PlayCommandService {
  readonly saveTrackSet: (command: SaveTrackSetCommand) => Promise<TrackSet>;
  readonly updateTrackSetMembers: (
    command: UpdateTrackSetMembersCommand
  ) => Promise<TrackSet>;
  readonly savePlayArrangement: (
    command: SavePlayArrangementCommand
  ) => Promise<PlayArrangement>;
  readonly savePlaySection: (command: SavePlaySectionCommand) => Promise<PlaySection>;
  readonly reorderPlaySections: (
    command: ReorderPlaySectionsCommand
  ) => Promise<readonly PlaySection[]>;
  readonly addPlayCue: (command: AddPlayCueCommand) => Promise<PlayCue>;
  readonly updatePlayCue: (command: UpdatePlayCueCommand) => Promise<PlayCue>;
  readonly removePlayCue: (command: RemovePlayCueCommand) => Promise<void>;
  readonly savePadLayer: (command: SavePadLayerCommand) => Promise<PadLayer>;
  readonly setPlaybackState: (command: SetPlaybackStateCommand) => Promise<PlaybackState>;
}

export const parseTrackSetRecord = (rawInput: unknown): TrackSet =>
  TrackSetSchema.parse(rawInput);

export const parsePlayArrangementRecord = (rawInput: unknown): PlayArrangement =>
  PlayArrangementSchema.parse(rawInput);

export const parsePlaySectionRecord = (rawInput: unknown): PlaySection =>
  PlaySectionSchema.parse(rawInput);

export const parsePlayCueRecord = (rawInput: unknown): PlayCue =>
  PlayCueSchema.parse(rawInput);

export const parsePadLayerRecord = (rawInput: unknown): PadLayer =>
  PadLayerSchema.parse(rawInput);

export const parsePlaybackStateRecord = (rawInput: unknown): PlaybackState =>
  PlaybackStateSchema.parse(rawInput);

export const parseResolvedPlaySequence = (rawInput: unknown): ResolvedPlaySequence =>
  ResolvedPlaySequenceSchema.parse(rawInput);
