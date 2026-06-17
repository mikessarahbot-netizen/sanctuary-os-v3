import { z } from "zod";
import {
  PadLayerRefSchema,
  PlayArrangementSchema,
  PlayCueActionSchema,
  PlayCueFireModeSchema,
  PlayCueSchema,
  PlaySectionIdSchema,
  PlaySectionKindSchema,
  PlaySectionSchema,
  type PlayArrangement,
  type PlayCue,
  type PlaySection
} from "./schemas.js";

/**
 * Pure sequence/cue resolution for the Play module.
 *
 * `resolvePlaySequence` orders an arrangement's sections by `sectionOrder` and
 * attaches each section's resolved length/click/pad defaults. A `sectionOrder`
 * entry with no matching section is *flagged* as `unresolved` and passed
 * through rather than thrown — mirroring how an invalid chord passes through
 * flagged in `transposeChord`. `resolveCueTimeline` places each cue at its
 * `(section, markerOffsetBeats)` along the resolved sequence and validates the
 * action targets (`jump` target exists; `pad-change` pad resolves); invalid
 * targets are flagged, never silently dropped. Both are pure, deterministic,
 * Zod-validated, and take already-tenant-scoped records (no I/O, no clock).
 */
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const ResolvedSequenceEntrySchema = z.discriminatedUnion("status", [
  z
    .object({
      clickEnabledDefault: z.boolean(),
      isLoopSection: z.boolean(),
      kind: PlaySectionKindSchema,
      lengthBars: NonNegativeIntegerSchema,
      orderIndex: NonNegativeIntegerSchema,
      padLayerRef: PadLayerRefSchema.optional(),
      sectionId: PlaySectionIdSchema,
      sectionRef: z.string().min(1),
      status: z.literal("resolved")
    })
    .strict(),
  z
    .object({
      orderIndex: NonNegativeIntegerSchema,
      sectionRef: z.string().min(1),
      status: z.literal("unresolved")
    })
    .strict()
]);

export const ResolvedPlaySequenceSchema = z
  .object({
    arrangementRef: z.string().min(1),
    entries: z.array(ResolvedSequenceEntrySchema),
    loopSectionRef: z.string().min(1).optional()
  })
  .strict();

export const CueTargetStatusSchema = z.enum([
  "ok",
  "not-applicable",
  "invalid-jump-target",
  "invalid-pad-target"
]);

export const ResolvedCueEntrySchema = z
  .object({
    action: PlayCueActionSchema,
    cueId: z.string().min(1),
    fireMode: PlayCueFireModeSchema,
    markerOffsetBeats: NonNegativeIntegerSchema,
    padLayerRef: PadLayerRefSchema.optional(),
    sectionRef: z.string().min(1),
    sectionResolved: z.boolean(),
    targetSectionRef: z.string().min(1).optional(),
    targetStatus: CueTargetStatusSchema
  })
  .strict();

export const ResolvedCueTimelineSchema = z
  .object({
    entries: z.array(ResolvedCueEntrySchema),
    trackSetId: z.string().min(1).optional()
  })
  .strict();

export type ResolvedSequenceEntry = z.infer<typeof ResolvedSequenceEntrySchema>;
export type ResolvedPlaySequence = z.infer<typeof ResolvedPlaySequenceSchema>;
export type CueTargetStatus = z.infer<typeof CueTargetStatusSchema>;
export type ResolvedCueEntry = z.infer<typeof ResolvedCueEntrySchema>;
export type ResolvedCueTimeline = z.infer<typeof ResolvedCueTimelineSchema>;

/**
 * A `sectionOrder` entry may reference a section by either its branded
 * `sectionId` or its human `label`. Build a lookup keyed by both so resolution
 * matches whichever the arrangement author used, preferring `sectionId`.
 */
const indexSectionsByRef = (
  sections: readonly PlaySection[]
): ReadonlyMap<string, PlaySection> => {
  const byRef = new Map<string, PlaySection>();

  for (const section of sections) {
    if (!byRef.has(section.sectionId)) {
      byRef.set(section.sectionId, section);
    }
  }

  for (const section of sections) {
    if (section.label !== undefined && !byRef.has(section.label)) {
      byRef.set(section.label, section);
    }
  }

  return byRef;
};

export const resolvePlaySequence = (
  arrangement: PlayArrangement,
  sections: readonly PlaySection[]
): ResolvedPlaySequence => {
  const parsedArrangement = PlayArrangementSchema.parse(arrangement);
  const parsedSections = sections.map((section) => PlaySectionSchema.parse(section));
  const sectionsByRef = indexSectionsByRef(parsedSections);

  const entries: ResolvedSequenceEntry[] = parsedArrangement.sectionOrder.map(
    (sectionRef, orderIndex): ResolvedSequenceEntry => {
      const section = sectionsByRef.get(sectionRef);

      if (section === undefined) {
        return { orderIndex, sectionRef, status: "unresolved" };
      }

      return {
        clickEnabledDefault: section.clickEnabledDefault,
        isLoopSection: parsedArrangement.loopSectionRef === sectionRef,
        kind: section.kind,
        lengthBars: section.lengthBars,
        orderIndex,
        sectionId: section.sectionId,
        sectionRef,
        status: "resolved",
        ...(section.padLayerRef !== undefined ? { padLayerRef: section.padLayerRef } : {})
      };
    }
  );

  return ResolvedPlaySequenceSchema.parse({
    arrangementRef: parsedArrangement.arrangementRef,
    entries,
    ...(parsedArrangement.loopSectionRef !== undefined
      ? { loopSectionRef: parsedArrangement.loopSectionRef }
      : {})
  });
};

const collectResolvedSectionRefs = (
  resolvedSequence: ResolvedPlaySequence
): ReadonlySet<string> => {
  const refs = new Set<string>();

  for (const entry of resolvedSequence.entries) {
    if (entry.status === "resolved") {
      refs.add(entry.sectionRef);
      refs.add(entry.sectionId);
    }
  }

  return refs;
};

const collectResolvedPadRefs = (
  resolvedSequence: ResolvedPlaySequence
): ReadonlySet<string> => {
  const refs = new Set<string>();

  for (const entry of resolvedSequence.entries) {
    if (entry.status === "resolved" && entry.padLayerRef !== undefined) {
      refs.add(entry.padLayerRef);
    }
  }

  return refs;
};

export const resolveCueTimeline = (
  arrangement: PlayArrangement,
  cues: readonly PlayCue[],
  resolvedSequence: ResolvedPlaySequence
): ResolvedCueTimeline => {
  PlayArrangementSchema.parse(arrangement);
  const parsedCues = cues.map((cue) => PlayCueSchema.parse(cue));
  const parsedSequence = ResolvedPlaySequenceSchema.parse(resolvedSequence);
  const resolvedSectionRefs = collectResolvedSectionRefs(parsedSequence);
  const resolvedPadRefs = collectResolvedPadRefs(parsedSequence);

  const ordered = [...parsedCues].sort((left, right) => {
    if (left.sectionId !== right.sectionId) {
      return left.sectionId < right.sectionId ? -1 : 1;
    }

    return left.markerOffsetBeats - right.markerOffsetBeats;
  });

  const trackSetId = ordered[0]?.trackSetId;

  const entries: ResolvedCueEntry[] = ordered.map((cue): ResolvedCueEntry => {
    const sectionResolved = resolvedSectionRefs.has(cue.sectionId);
    let targetStatus: CueTargetStatus = "not-applicable";

    if (cue.action === "jump") {
      targetStatus =
        cue.targetSectionRef !== undefined && resolvedSectionRefs.has(cue.targetSectionRef)
          ? "ok"
          : "invalid-jump-target";
    } else if (cue.action === "pad-change") {
      targetStatus =
        cue.padLayerRef !== undefined && resolvedPadRefs.has(cue.padLayerRef)
          ? "ok"
          : "invalid-pad-target";
    }

    return {
      action: cue.action,
      cueId: cue.cueId,
      fireMode: cue.fireMode,
      markerOffsetBeats: cue.markerOffsetBeats,
      sectionRef: cue.sectionId,
      sectionResolved,
      targetStatus,
      ...(cue.padLayerRef !== undefined ? { padLayerRef: cue.padLayerRef } : {}),
      ...(cue.targetSectionRef !== undefined
        ? { targetSectionRef: cue.targetSectionRef }
        : {})
    };
  });

  return ResolvedCueTimelineSchema.parse({
    entries,
    ...(trackSetId !== undefined ? { trackSetId } : {})
  });
};
