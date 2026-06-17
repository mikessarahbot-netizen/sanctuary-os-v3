import { z } from "zod";

/**
 * Play domain records for the desktop playback surface.
 *
 * Strict, tenant-scoped, branded-ID Zod schemas for the six Play records
 * (`TrackSet`, `PlayArrangement`, `PlaySection`, `PlayCue`, `PadLayer`,
 * `PlaybackState`) plus the section/cue/transport enums. Every record is
 * `.strict()`, carries `tenantId`, and stores only references — never raw
 * audio/stem/pad bytes, credentials, or PII. Invariants from the Play plan are
 * encoded via `superRefine` so an invalid record can never parse. These shapes
 * are the durable contract the persistence layer (`packages/db`) and the
 * pure transforms (`sequence.ts`/`timing.ts`) agree on.
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().nonnegative();
const PositiveNumberSchema = z.number().positive();
const GainSchema = z.number().min(0).max(1);

export const PlayTenantIdSchema = NonEmptyStringSchema.brand<"PlayTenantId">();
export const TrackSetIdSchema = NonEmptyStringSchema.brand<"TrackSetId">();
export const PlaySongRefSchema = NonEmptyStringSchema.brand<"PlaySongRef">();
export const PlayServiceRefSchema = NonEmptyStringSchema.brand<"PlayServiceRef">();
export const PlayArrangementRefSchema =
  NonEmptyStringSchema.brand<"PlayArrangementRef">();
export const PlaySectionIdSchema = NonEmptyStringSchema.brand<"PlaySectionId">();
export const PlayCueIdSchema = NonEmptyStringSchema.brand<"PlayCueId">();
export const PadLayerRefSchema = NonEmptyStringSchema.brand<"PadLayerRef">();
export const TrackMediaRefSchema = NonEmptyStringSchema.brand<"TrackMediaRef">();
export const PadMediaRefSchema = NonEmptyStringSchema.brand<"PadMediaRef">();

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

export const TrackMemberRefSchema = z
  .object({
    label: OptionalNonEmptyStringSchema,
    muted: z.boolean(),
    role: TrackRoleSchema,
    trackRef: TrackMediaRefSchema
  })
  .strict();

export const TrackSetSchema = z
  .object({
    arrangementRef: PlayArrangementRefSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    defaultKey: NonEmptyStringSchema,
    serviceRef: PlayServiceRefSchema.optional(),
    songRef: PlaySongRefSchema,
    tempoBpm: PositiveNumberSchema,
    tenantId: PlayTenantIdSchema,
    title: OptionalNonEmptyStringSchema,
    trackRefs: z.array(TrackMemberRefSchema),
    trackSetId: TrackSetIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((trackSet, context) => {
    const seenTrackRefs = new Set<string>();

    for (const [index, member] of trackSet.trackRefs.entries()) {
      if (seenTrackRefs.has(member.trackRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Track-set members must be unique by trackRef.",
          path: ["trackRefs", index, "trackRef"]
        });
      }

      seenTrackRefs.add(member.trackRef);
    }

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

export const PlayArrangementSchema = z
  .object({
    arrangementRef: PlayArrangementRefSchema,
    defaultKey: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    loopSectionRef: OptionalNonEmptyStringSchema,
    sectionOrder: z.array(NonEmptyStringSchema),
    songRef: PlaySongRefSchema,
    tempoBpm: PositiveNumberSchema,
    tenantId: PlayTenantIdSchema
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

export const PlaySectionSchema = z
  .object({
    arrangementRef: PlayArrangementRefSchema,
    clickEnabledDefault: z.boolean(),
    kind: PlaySectionKindSchema,
    label: OptionalNonEmptyStringSchema,
    lengthBars: NonNegativeIntegerSchema,
    padLayerRef: PadLayerRefSchema.optional(),
    sectionId: PlaySectionIdSchema,
    tenantId: PlayTenantIdSchema
  })
  .strict();

export const PlayCueSchema = z
  .object({
    action: PlayCueActionSchema,
    createdAt: IsoDateTimeStringSchema,
    cueId: PlayCueIdSchema,
    fireMode: PlayCueFireModeSchema,
    label: NonEmptyStringSchema,
    markerOffsetBeats: NonNegativeIntegerSchema,
    padLayerRef: PadLayerRefSchema.optional(),
    sectionId: PlaySectionIdSchema,
    targetSectionRef: PlaySectionIdSchema.optional(),
    tenantId: PlayTenantIdSchema,
    trackSetId: TrackSetIdSchema,
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

export const PadLayerSchema = z
  .object({
    gain: GainSchema,
    key: NonEmptyStringSchema,
    label: OptionalNonEmptyStringSchema,
    loop: z.boolean(),
    padLayerRef: PadLayerRefSchema,
    padMediaRef: PadMediaRefSchema,
    sectionScopeRef: PlaySectionIdSchema.optional(),
    songRef: PlaySongRefSchema.optional(),
    tenantId: PlayTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const PlaybackStateSchema = z
  .object({
    activePadLayerRef: PadLayerRefSchema.optional(),
    activeSectionRef: PlaySectionIdSchema.optional(),
    clickEnabled: z.boolean(),
    positionBeats: NonNegativeNumberSchema,
    tenantId: PlayTenantIdSchema,
    trackSetId: TrackSetIdSchema,
    transportStatus: TransportStatusSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export type PlayTenantId = z.infer<typeof PlayTenantIdSchema>;
export type TrackSetId = z.infer<typeof TrackSetIdSchema>;
export type PlaySongRef = z.infer<typeof PlaySongRefSchema>;
export type PlayServiceRef = z.infer<typeof PlayServiceRefSchema>;
export type PlayArrangementRef = z.infer<typeof PlayArrangementRefSchema>;
export type PlaySectionId = z.infer<typeof PlaySectionIdSchema>;
export type PlayCueId = z.infer<typeof PlayCueIdSchema>;
export type PadLayerRef = z.infer<typeof PadLayerRefSchema>;
export type TrackMediaRef = z.infer<typeof TrackMediaRefSchema>;
export type PadMediaRef = z.infer<typeof PadMediaRefSchema>;
export type PlaySectionKind = z.infer<typeof PlaySectionKindSchema>;
export type PlayCueAction = z.infer<typeof PlayCueActionSchema>;
export type PlayCueFireMode = z.infer<typeof PlayCueFireModeSchema>;
export type TransportStatus = z.infer<typeof TransportStatusSchema>;
export type TrackRole = z.infer<typeof TrackRoleSchema>;
export type TrackMemberRef = z.infer<typeof TrackMemberRefSchema>;
export type TrackSet = z.infer<typeof TrackSetSchema>;
export type PlayArrangement = z.infer<typeof PlayArrangementSchema>;
export type PlaySection = z.infer<typeof PlaySectionSchema>;
export type PlayCue = z.infer<typeof PlayCueSchema>;
export type PadLayer = z.infer<typeof PadLayerSchema>;
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

export const parseTrackSet = (rawInput: unknown): TrackSet =>
  TrackSetSchema.parse(rawInput);

export const parsePlayArrangement = (rawInput: unknown): PlayArrangement =>
  PlayArrangementSchema.parse(rawInput);

export const parsePlaySection = (rawInput: unknown): PlaySection =>
  PlaySectionSchema.parse(rawInput);

export const parsePlayCue = (rawInput: unknown): PlayCue => PlayCueSchema.parse(rawInput);

export const parsePadLayer = (rawInput: unknown): PadLayer =>
  PadLayerSchema.parse(rawInput);

export const parsePlaybackState = (rawInput: unknown): PlaybackState =>
  PlaybackStateSchema.parse(rawInput);
