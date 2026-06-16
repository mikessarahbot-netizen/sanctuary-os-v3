import { z } from "zod";
import { AIPolicyProfileSchema } from "./schemas.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const churchContextProjectionNames = [
  "planning-setlist",
  "planning-readiness",
  "service-summary",
  "integration-status"
] as const;

export const ChurchContextProjectionNameSchema = z.enum(churchContextProjectionNames);

export const ChurchContextProjectionMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  projectionName: ChurchContextProjectionNameSchema,
  schemaVersion: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema
});

export const PlanningSetlistChurchContextSongSchema = z
  .object({
    artist: OptionalNonEmptyStringSchema,
    availableKeys: z.array(NonEmptyStringSchema).default([]),
    defaultKey: OptionalNonEmptyStringSchema,
    energyLabel: OptionalNonEmptyStringSchema,
    isBannedOrPaused: z.boolean().default(false),
    lastUsedAt: z.string().datetime().optional(),
    licensingFlags: z.array(NonEmptyStringSchema).default([]),
    songId: NonEmptyStringSchema,
    tempoBpm: z.number().int().positive().optional(),
    title: NonEmptyStringSchema,
    usageCount: z.number().int().nonnegative().default(0)
  })
  .strict();

export const PlanningSetlistChurchContextServiceSchema = z
  .object({
    serviceId: NonEmptyStringSchema,
    serviceType: NonEmptyStringSchema,
    serviceTypeId: OptionalNonEmptyStringSchema,
    startsAt: z.string().datetime().optional(),
    scriptureReference: OptionalNonEmptyStringSchema,
    sermonTheme: OptionalNonEmptyStringSchema,
    targetSetLength: z.number().int().min(1).max(12)
  })
  .strict();

export const PlanningSetlistChurchPreferencesSchema = z
  .object({
    bannedOrPausedSongIds: z.array(NonEmptyStringSchema).default([]),
    defaultServiceFlow: z.array(NonEmptyStringSchema).default([]),
    preferredKeys: z.array(NonEmptyStringSchema).default([]),
    styleNotes: z.array(NonEmptyStringSchema).default([])
  })
  .strict();

export const PlanningSetlistConstraintsSchema = z
  .object({
    availableRoleIds: z.array(NonEmptyStringSchema).default([]),
    excludedSongIds: z.array(NonEmptyStringSchema).default([]),
    keyTransitionsAllowed: z.boolean().default(true),
    maxNewSongs: z.number().int().nonnegative().optional(),
    requiredSongIds: z.array(NonEmptyStringSchema).default([])
  })
  .strict();

export const PlanningSetlistRecentUsageSummarySchema = z
  .object({
    lastServiceDate: z.string().datetime().optional(),
    overusedSongIds: z.array(NonEmptyStringSchema).default([]),
    recentlyUsedSongIds: z.array(NonEmptyStringSchema).default([]),
    summaryNotes: z.array(NonEmptyStringSchema).default([])
  })
  .strict();

export const PlanningSetlistIntegrationsSummarySchema = z
  .object({
    ccliAvailable: z.boolean(),
    songSelectAvailable: z.boolean()
  })
  .strict();

export const PlanningSetlistChurchContextProjectionSchema = z
  .object({
    aiPolicyProfile: AIPolicyProfileSchema,
    churchContextSummary: NonEmptyStringSchema,
    churchPreferences: PlanningSetlistChurchPreferencesSchema,
    contextMetadata: ChurchContextProjectionMetadataSchema.extend({
      projectionName: z.literal("planning-setlist")
    }),
    integrations: PlanningSetlistIntegrationsSummarySchema,
    planningConstraints: PlanningSetlistConstraintsSchema,
    recentUsageHistory: PlanningSetlistRecentUsageSummarySchema,
    service: PlanningSetlistChurchContextServiceSchema,
    songLibrary: z.array(PlanningSetlistChurchContextSongSchema).min(1),
    targetSetLength: z.number().int().min(1).max(12),
    teamConstraints: z.array(NonEmptyStringSchema).default([])
  })
  .strict()
  .superRefine((projection, context) => {
    if (
      !projection.aiPolicyProfile.enabledAIFeatures.includes("setlist-generation")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection requires setlist-generation to be enabled.",
        path: ["aiPolicyProfile", "enabledAIFeatures"]
      });
    }

    if (
      !projection.aiPolicyProfile.humanReviewRequiredFor.includes(
        "ai-suggested-write"
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection requires AI suggested writes review.",
        path: ["aiPolicyProfile", "humanReviewRequiredFor"]
      });
    }

    const availableSongCount = projection.songLibrary.filter(
      (song) => !song.isBannedOrPaused
    ).length;
    const bannedOrPausedSongIds = new Set(
      projection.churchPreferences.bannedOrPausedSongIds
    );
    const excludedSongIds = new Set(projection.planningConstraints.excludedSongIds);

    if (availableSongCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection requires at least one available song.",
        path: ["songLibrary"]
      });
    }

    if (projection.targetSetLength !== projection.service.targetSetLength) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist target length must match service context.",
        path: ["targetSetLength"]
      });
    }

    if (projection.targetSetLength > availableSongCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Target set length cannot exceed available song count.",
        path: ["targetSetLength"]
      });
    }

    for (const song of projection.songLibrary) {
      if (song.isBannedOrPaused && !bannedOrPausedSongIds.has(song.songId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Banned or paused songs must be listed in church preferences.",
          path: ["churchPreferences", "bannedOrPausedSongIds"]
        });
      }
    }

    for (const songId of projection.planningConstraints.requiredSongIds) {
      if (bannedOrPausedSongIds.has(songId) || excludedSongIds.has(songId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required songs cannot be banned, paused, or excluded.",
          path: ["planningConstraints", "requiredSongIds"]
        });
      }
    }
  });

export type ChurchContextProjectionName = z.infer<typeof ChurchContextProjectionNameSchema>;
export type ChurchContextProjectionMetadata = z.infer<typeof ChurchContextProjectionMetadataSchema>;
export type PlanningSetlistChurchContextProjection = z.infer<
  typeof PlanningSetlistChurchContextProjectionSchema
>;
export type PlanningSetlistChurchPreferences = z.infer<
  typeof PlanningSetlistChurchPreferencesSchema
>;
export type PlanningSetlistConstraints = z.infer<
  typeof PlanningSetlistConstraintsSchema
>;
export type PlanningSetlistRecentUsageSummary = z.infer<
  typeof PlanningSetlistRecentUsageSummarySchema
>;
export type PlanningSetlistChurchContextService = z.infer<
  typeof PlanningSetlistChurchContextServiceSchema
>;
export type PlanningSetlistChurchContextSong = z.infer<
  typeof PlanningSetlistChurchContextSongSchema
>;
