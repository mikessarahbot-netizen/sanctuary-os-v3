import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);
const OptionalStringArraySchema = z.array(NonEmptyStringSchema).default([]);

export const ChurchProfileSchema = z.object({
  campusIds: OptionalStringArraySchema,
  churchId: NonEmptyStringSchema,
  displayName: NonEmptyStringSchema,
  timezone: NonEmptyStringSchema,
  tradition: NonEmptyStringSchema.optional()
});

export const ServiceProfileSchema = z.object({
  rehearsalNorms: OptionalStringArraySchema,
  serviceTypeIds: OptionalStringArraySchema,
  templateIds: OptionalStringArraySchema
});

export const SongLibraryProfileSchema = z.object({
  arrangementCount: z.number().int().nonnegative(),
  bannedOrPausedSongIds: OptionalStringArraySchema,
  defaultKeyPolicy: NonEmptyStringSchema,
  songCount: z.number().int().nonnegative()
});

export const TeamProfileSchema = z.object({
  activeRoleIds: OptionalStringArraySchema,
  schedulingPolicies: OptionalStringArraySchema,
  volunteerCount: z.number().int().nonnegative()
});

export const PeopleProfileSchema = z.object({
  customFieldKeys: OptionalStringArraySchema,
  memberCount: z.number().int().nonnegative(),
  segmentKeys: OptionalStringArraySchema
});

export const EngagementProfileSchema = z.object({
  attendanceTrendLabel: NonEmptyStringSchema,
  communicationPatternLabels: OptionalStringArraySchema,
  volunteerEngagementLabel: NonEmptyStringSchema
});

export const StyleProfileSchema = z.object({
  brandColorTokens: OptionalStringArraySchema,
  fontTokens: OptionalStringArraySchema,
  tone: NonEmptyStringSchema
});

export const AIFeatureSchema = z.enum([
  "setlist-generation",
  "readiness-scoring",
  "comms-drafting",
  "chord-generation",
  "band-cues"
]);

export const HumanReviewGateSchema = z.enum([
  "ai-suggested-write",
  "destructive-mutation",
  "people-comms",
  "stream-control"
]);

export const AIPolicyProfileSchema = z.object({
  enabledAIFeatures: z.array(AIFeatureSchema),
  humanReviewRequiredFor: z.array(HumanReviewGateSchema),
  lastReviewedAt: z.string().datetime(),
  piiSharingAllowed: z.boolean(),
  retentionPolicy: NonEmptyStringSchema
});

export const OperationalProfileSchema = z.object({
  offlineCapableModules: OptionalStringArraySchema,
  primaryDevices: OptionalStringArraySchema,
  reliabilityLabel: NonEmptyStringSchema
});

export const IntegrationsProfileSchema = z.object({
  connectedVendors: OptionalStringArraySchema,
  unavailableVendors: OptionalStringArraySchema
});

export const ContextMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  projectionName: NonEmptyStringSchema,
  schemaVersion: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema
});

export const ChurchContextSchema = z.object({
  aiPolicyProfile: AIPolicyProfileSchema,
  churchProfile: ChurchProfileSchema,
  contextMetadata: ContextMetadataSchema,
  engagementProfile: EngagementProfileSchema,
  integrationsProfile: IntegrationsProfileSchema,
  operationalProfile: OperationalProfileSchema,
  peopleProfile: PeopleProfileSchema,
  serviceProfile: ServiceProfileSchema,
  songLibraryProfile: SongLibraryProfileSchema,
  styleProfile: StyleProfileSchema,
  teamProfile: TeamProfileSchema
});

export type AIFeature = z.infer<typeof AIFeatureSchema>;
export type AIPolicyProfile = z.infer<typeof AIPolicyProfileSchema>;
export type ChurchContext = z.infer<typeof ChurchContextSchema>;
export type ChurchProfile = z.infer<typeof ChurchProfileSchema>;
export type ContextMetadata = z.infer<typeof ContextMetadataSchema>;
export type EngagementProfile = z.infer<typeof EngagementProfileSchema>;
export type HumanReviewGate = z.infer<typeof HumanReviewGateSchema>;
export type IntegrationsProfile = z.infer<typeof IntegrationsProfileSchema>;
export type OperationalProfile = z.infer<typeof OperationalProfileSchema>;
export type PeopleProfile = z.infer<typeof PeopleProfileSchema>;
export type ServiceProfile = z.infer<typeof ServiceProfileSchema>;
export type SongLibraryProfile = z.infer<typeof SongLibraryProfileSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type TeamProfile = z.infer<typeof TeamProfileSchema>;
