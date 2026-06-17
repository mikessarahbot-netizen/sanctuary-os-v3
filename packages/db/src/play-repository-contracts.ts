import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema
} from "./repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().nonnegative();
const PositiveNumberSchema = z.number().positive();
const GainSchema = z.number().min(0).max(1);

export const PlayPersistenceReadOptionsSchema = RepositoryReadOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play persistence read operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const PlayPersistenceWriteOptionsSchema = RepositoryWriteOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Play persistence write operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const PlayStorageSchemaVersionSchema = z.literal("play.v1");
export const PlaySectionKindSchema = z.enum([
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "instrumental",
  "tag",
  "outro",
  "other"
]);
export const PlayCueActionSchema = z.enum([
  "play",
  "stop",
  "jump",
  "pad-change",
  "click-toggle"
]);
export const PlayCueFireModeSchema = z.enum(["manual", "auto"]);
export const TransportStatusSchema = z.enum(["stopped", "playing", "paused"]);
export const TrackRoleSchema = z.enum(["click", "guide", "stem", "pad", "other"]);

export const TrackMemberRefPersistenceRecordSchema = z
  .object({
    label: OptionalNonEmptyStringSchema,
    muted: z.boolean(),
    role: TrackRoleSchema,
    trackRef: NonEmptyStringSchema
  })
  .strict();

export const TrackSetPersistenceRecordSchema = z
  .object({
    arrangementRef: OptionalNonEmptyStringSchema,
    createdAt: IsoDateTimeStringSchema,
    defaultKey: NonEmptyStringSchema,
    schemaVersion: PlayStorageSchemaVersionSchema,
    serviceRef: OptionalNonEmptyStringSchema,
    songRef: NonEmptyStringSchema,
    tempoBpm: PositiveNumberSchema,
    tenantId: NonEmptyStringSchema,
    title: OptionalNonEmptyStringSchema,
    trackRefs: z.array(TrackMemberRefPersistenceRecordSchema),
    trackSetId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((trackSet, context) => {
    const seenTrackRefs = new Set<string>();

    trackSet.trackRefs.forEach((member, index) => {
      if (seenTrackRefs.has(member.trackRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Track-set members must be unique by trackRef.",
          path: ["trackRefs", index, "trackRef"]
        });
      }

      seenTrackRefs.add(member.trackRef);
    });

    const clickMemberCount = trackSet.trackRefs.filter(
      (member) => member.role === "click"
    ).length;

    if (clickMemberCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A track set may have at most one click member.",
        path: ["trackRefs"]
      });
    }
  });

export const PlayArrangementPersistenceRecordSchema = z
  .object({
    arrangementRef: NonEmptyStringSchema,
    defaultKey: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    loopSectionRef: OptionalNonEmptyStringSchema,
    sectionOrder: z.array(NonEmptyStringSchema),
    songRef: NonEmptyStringSchema,
    tempoBpm: PositiveNumberSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((arrangement, context) => {
    if (
      arrangement.loopSectionRef !== undefined &&
      !arrangement.sectionOrder.includes(arrangement.loopSectionRef)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "loopSectionRef must appear in sectionOrder.",
        path: ["loopSectionRef"]
      });
    }
  });

export const PlaySectionPersistenceRecordSchema = z
  .object({
    arrangementRef: NonEmptyStringSchema,
    clickEnabledDefault: z.boolean(),
    kind: PlaySectionKindSchema,
    label: OptionalNonEmptyStringSchema,
    lengthBars: NonNegativeIntegerSchema,
    padLayerRef: OptionalNonEmptyStringSchema,
    sectionId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export const PlayCuePersistenceRecordSchema = z
  .object({
    action: PlayCueActionSchema,
    createdAt: IsoDateTimeStringSchema,
    cueId: NonEmptyStringSchema,
    fireMode: PlayCueFireModeSchema,
    label: NonEmptyStringSchema,
    markerOffsetBeats: NonNegativeIntegerSchema,
    padLayerRef: OptionalNonEmptyStringSchema,
    sectionId: NonEmptyStringSchema,
    targetSectionRef: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    trackSetId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.action === "jump" && cue.targetSectionRef === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Jump cues require a targetSectionRef.",
        path: ["targetSectionRef"]
      });
    }

    if (cue.action === "pad-change" && cue.padLayerRef === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pad-change cues require a padLayerRef.",
        path: ["padLayerRef"]
      });
    }
  });

export const PadLayerPersistenceRecordSchema = z
  .object({
    gain: GainSchema,
    key: NonEmptyStringSchema,
    label: OptionalNonEmptyStringSchema,
    loop: z.boolean(),
    padLayerRef: NonEmptyStringSchema,
    padMediaRef: NonEmptyStringSchema,
    sectionScopeRef: OptionalNonEmptyStringSchema,
    songRef: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const PlaybackStatePersistenceRecordSchema = z
  .object({
    activePadLayerRef: OptionalNonEmptyStringSchema,
    activeSectionRef: OptionalNonEmptyStringSchema,
    clickEnabled: z.boolean(),
    positionBeats: NonNegativeNumberSchema,
    tenantId: NonEmptyStringSchema,
    trackSetId: NonEmptyStringSchema,
    transportStatus: TransportStatusSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ListTrackSetsPersistenceInputSchema = z
  .object({ filter: z.object({ songRef: OptionalNonEmptyStringSchema }).strict().optional() })
  .strict();
export const GetTrackSetPersistenceInputSchema = z
  .object({ trackSetId: NonEmptyStringSchema })
  .strict();
export const ListTrackSetsForSongPersistenceInputSchema = z
  .object({ songRef: NonEmptyStringSchema })
  .strict();
export const ListPlayArrangementsPersistenceInputSchema = z
  .object({ songRef: NonEmptyStringSchema })
  .strict();
export const GetPlayArrangementPersistenceInputSchema = z
  .object({ arrangementRef: NonEmptyStringSchema })
  .strict();
export const ListPlaySectionsPersistenceInputSchema = z
  .object({ arrangementRef: NonEmptyStringSchema })
  .strict();
export const ListPlayCuesPersistenceInputSchema = z
  .object({ trackSetId: NonEmptyStringSchema })
  .strict();
export const ListPadLayersPersistenceInputSchema = z
  .object({ filter: z.object({ songRef: OptionalNonEmptyStringSchema }).strict().optional() })
  .strict();
export const GetPlaybackStatePersistenceInputSchema = z
  .object({ trackSetId: NonEmptyStringSchema })
  .strict();

export const SaveTrackSetPersistenceInputSchema = TrackSetPersistenceRecordSchema;
export const UpdateTrackSetMembersPersistenceInputSchema = z
  .object({
    trackRefs: z.array(TrackMemberRefPersistenceRecordSchema),
    trackSetId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    const seenTrackRefs = new Set<string>();

    input.trackRefs.forEach((member, index) => {
      if (seenTrackRefs.has(member.trackRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Track-set members must be unique by trackRef.",
          path: ["trackRefs", index, "trackRef"]
        });
      }

      seenTrackRefs.add(member.trackRef);
    });

    const clickMemberCount = input.trackRefs.filter(
      (member) => member.role === "click"
    ).length;

    if (clickMemberCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A track set may have at most one click member.",
        path: ["trackRefs"]
      });
    }
  });
export const SavePlayArrangementPersistenceInputSchema = PlayArrangementPersistenceRecordSchema;
export const SavePlaySectionPersistenceInputSchema = PlaySectionPersistenceRecordSchema;
export const ReorderPlaySectionsPersistenceInputSchema = z
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
  });
export const AddPlayCuePersistenceInputSchema = PlayCuePersistenceRecordSchema;
export const UpdatePlayCuePersistenceInputSchema = PlayCuePersistenceRecordSchema;
export const RemovePlayCuePersistenceInputSchema = z
  .object({
    cueId: NonEmptyStringSchema,
    trackSetId: NonEmptyStringSchema
  })
  .strict();
export const SavePadLayerPersistenceInputSchema = PadLayerPersistenceRecordSchema;
export const SetPlaybackStatePersistenceInputSchema = PlaybackStatePersistenceRecordSchema;

const readOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: PlayPersistenceReadOptionsSchema }).strict();
const writeOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: PlayPersistenceWriteOptionsSchema }).strict();

export const ListTrackSetsPersistenceOperationSchema = readOperation(
  ListTrackSetsPersistenceInputSchema
);
export const GetTrackSetPersistenceOperationSchema = readOperation(
  GetTrackSetPersistenceInputSchema
);
export const ListTrackSetsForSongPersistenceOperationSchema = readOperation(
  ListTrackSetsForSongPersistenceInputSchema
);
export const ListPlayArrangementsPersistenceOperationSchema = readOperation(
  ListPlayArrangementsPersistenceInputSchema
);
export const GetPlayArrangementPersistenceOperationSchema = readOperation(
  GetPlayArrangementPersistenceInputSchema
);
export const ListPlaySectionsPersistenceOperationSchema = readOperation(
  ListPlaySectionsPersistenceInputSchema
);
export const ListPlayCuesPersistenceOperationSchema = readOperation(
  ListPlayCuesPersistenceInputSchema
);
export const ListPadLayersPersistenceOperationSchema = readOperation(
  ListPadLayersPersistenceInputSchema
);
export const GetPlaybackStatePersistenceOperationSchema = readOperation(
  GetPlaybackStatePersistenceInputSchema
);
export const SaveTrackSetPersistenceOperationSchema = writeOperation(
  SaveTrackSetPersistenceInputSchema
);
export const UpdateTrackSetMembersPersistenceOperationSchema = writeOperation(
  UpdateTrackSetMembersPersistenceInputSchema
);
export const SavePlayArrangementPersistenceOperationSchema = writeOperation(
  SavePlayArrangementPersistenceInputSchema
);
export const SavePlaySectionPersistenceOperationSchema = writeOperation(
  SavePlaySectionPersistenceInputSchema
);
export const ReorderPlaySectionsPersistenceOperationSchema = writeOperation(
  ReorderPlaySectionsPersistenceInputSchema
);
export const AddPlayCuePersistenceOperationSchema = writeOperation(
  AddPlayCuePersistenceInputSchema
);
export const UpdatePlayCuePersistenceOperationSchema = writeOperation(
  UpdatePlayCuePersistenceInputSchema
);
export const RemovePlayCuePersistenceOperationSchema = writeOperation(
  RemovePlayCuePersistenceInputSchema
);
export const SavePadLayerPersistenceOperationSchema = writeOperation(
  SavePadLayerPersistenceInputSchema
);
export const SetPlaybackStatePersistenceOperationSchema = writeOperation(
  SetPlaybackStatePersistenceInputSchema
);

export type PlayPersistenceReadOptions = z.infer<typeof PlayPersistenceReadOptionsSchema>;
export type PlayPersistenceWriteOptions = z.infer<typeof PlayPersistenceWriteOptionsSchema>;
export type PlaySectionKind = z.infer<typeof PlaySectionKindSchema>;
export type PlayCueAction = z.infer<typeof PlayCueActionSchema>;
export type PlayCueFireMode = z.infer<typeof PlayCueFireModeSchema>;
export type TransportStatus = z.infer<typeof TransportStatusSchema>;
export type TrackRole = z.infer<typeof TrackRoleSchema>;
export type TrackMemberRefPersistenceRecord = z.infer<
  typeof TrackMemberRefPersistenceRecordSchema
>;
export type TrackSetPersistenceRecord = z.infer<typeof TrackSetPersistenceRecordSchema>;
export type PlayArrangementPersistenceRecord = z.infer<
  typeof PlayArrangementPersistenceRecordSchema
>;
export type PlaySectionPersistenceRecord = z.infer<typeof PlaySectionPersistenceRecordSchema>;
export type PlayCuePersistenceRecord = z.infer<typeof PlayCuePersistenceRecordSchema>;
export type PadLayerPersistenceRecord = z.infer<typeof PadLayerPersistenceRecordSchema>;
export type PlaybackStatePersistenceRecord = z.infer<
  typeof PlaybackStatePersistenceRecordSchema
>;
export type ListTrackSetsPersistenceInput = z.infer<typeof ListTrackSetsPersistenceInputSchema>;
export type GetTrackSetPersistenceInput = z.infer<typeof GetTrackSetPersistenceInputSchema>;
export type ListTrackSetsForSongPersistenceInput = z.infer<
  typeof ListTrackSetsForSongPersistenceInputSchema
>;
export type ListPlayArrangementsPersistenceInput = z.infer<
  typeof ListPlayArrangementsPersistenceInputSchema
>;
export type GetPlayArrangementPersistenceInput = z.infer<
  typeof GetPlayArrangementPersistenceInputSchema
>;
export type ListPlaySectionsPersistenceInput = z.infer<
  typeof ListPlaySectionsPersistenceInputSchema
>;
export type ListPlayCuesPersistenceInput = z.infer<typeof ListPlayCuesPersistenceInputSchema>;
export type ListPadLayersPersistenceInput = z.infer<typeof ListPadLayersPersistenceInputSchema>;
export type GetPlaybackStatePersistenceInput = z.infer<
  typeof GetPlaybackStatePersistenceInputSchema
>;
export type UpdateTrackSetMembersPersistenceInput = z.infer<
  typeof UpdateTrackSetMembersPersistenceInputSchema
>;
export type ReorderPlaySectionsPersistenceInput = z.infer<
  typeof ReorderPlaySectionsPersistenceInputSchema
>;
export type RemovePlayCuePersistenceInput = z.infer<
  typeof RemovePlayCuePersistenceInputSchema
>;

export interface PlayReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PlayPersistenceReadOptions;
}

export interface PlayPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: PlayPersistenceWriteOptions;
}

export interface PlayQueryPersistenceRepository {
  readonly listTrackSets: (
    operation: PlayReadPersistenceOperation<ListTrackSetsPersistenceInput>
  ) => Promise<readonly TrackSetPersistenceRecord[]>;
  readonly getTrackSet: (
    operation: PlayReadPersistenceOperation<GetTrackSetPersistenceInput>
  ) => Promise<TrackSetPersistenceRecord | null>;
  readonly listTrackSetsForSong: (
    operation: PlayReadPersistenceOperation<ListTrackSetsForSongPersistenceInput>
  ) => Promise<readonly TrackSetPersistenceRecord[]>;
  readonly listPlayArrangements: (
    operation: PlayReadPersistenceOperation<ListPlayArrangementsPersistenceInput>
  ) => Promise<readonly PlayArrangementPersistenceRecord[]>;
  readonly getPlayArrangement: (
    operation: PlayReadPersistenceOperation<GetPlayArrangementPersistenceInput>
  ) => Promise<PlayArrangementPersistenceRecord | null>;
  readonly listPlaySections: (
    operation: PlayReadPersistenceOperation<ListPlaySectionsPersistenceInput>
  ) => Promise<readonly PlaySectionPersistenceRecord[]>;
  readonly listPlayCues: (
    operation: PlayReadPersistenceOperation<ListPlayCuesPersistenceInput>
  ) => Promise<readonly PlayCuePersistenceRecord[]>;
  readonly listPadLayers: (
    operation: PlayReadPersistenceOperation<ListPadLayersPersistenceInput>
  ) => Promise<readonly PadLayerPersistenceRecord[]>;
  readonly getPlaybackState: (
    operation: PlayReadPersistenceOperation<GetPlaybackStatePersistenceInput>
  ) => Promise<PlaybackStatePersistenceRecord | null>;
}

export interface PlayCommandPersistenceRepository {
  readonly saveTrackSet: (
    operation: PlayPersistenceOperation<TrackSetPersistenceRecord>
  ) => Promise<TrackSetPersistenceRecord>;
  readonly updateTrackSetMembers: (
    operation: PlayPersistenceOperation<UpdateTrackSetMembersPersistenceInput>
  ) => Promise<TrackSetPersistenceRecord>;
  readonly savePlayArrangement: (
    operation: PlayPersistenceOperation<PlayArrangementPersistenceRecord>
  ) => Promise<PlayArrangementPersistenceRecord>;
  readonly savePlaySection: (
    operation: PlayPersistenceOperation<PlaySectionPersistenceRecord>
  ) => Promise<PlaySectionPersistenceRecord>;
  readonly reorderPlaySections: (
    operation: PlayPersistenceOperation<ReorderPlaySectionsPersistenceInput>
  ) => Promise<readonly PlaySectionPersistenceRecord[]>;
  readonly addPlayCue: (
    operation: PlayPersistenceOperation<PlayCuePersistenceRecord>
  ) => Promise<PlayCuePersistenceRecord>;
  readonly updatePlayCue: (
    operation: PlayPersistenceOperation<PlayCuePersistenceRecord>
  ) => Promise<PlayCuePersistenceRecord>;
  readonly removePlayCue: (
    operation: PlayPersistenceOperation<RemovePlayCuePersistenceInput>
  ) => Promise<void>;
  readonly savePadLayer: (
    operation: PlayPersistenceOperation<PadLayerPersistenceRecord>
  ) => Promise<PadLayerPersistenceRecord>;
  readonly setPlaybackState: (
    operation: PlayPersistenceOperation<PlaybackStatePersistenceRecord>
  ) => Promise<PlaybackStatePersistenceRecord>;
}
