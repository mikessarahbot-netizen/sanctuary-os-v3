import { describe, expect, it } from "vitest";
import {
  AIPolicyProfileSchema,
  ChurchContextSchema,
  PlanningSetlistChurchContextProjectionSchema,
  blockedAiContextFields,
  churchContextProjectionNames
} from "./index.js";

const planningSetlistProjection = {
  aiPolicyProfile: {
    enabledAIFeatures: ["setlist-generation"],
    humanReviewRequiredFor: ["ai-suggested-write"],
    lastReviewedAt: "2026-06-16T15:00:00.000Z",
    piiSharingAllowed: false,
    retentionPolicy: "minimal"
  },
  churchContextSummary: "Sunday worship at Sanctuary Church.",
  churchPreferences: {
    bannedOrPausedSongIds: [],
    defaultServiceFlow: ["gathering", "response"],
    preferredKeys: ["G", "A"],
    styleNotes: ["Prefer congregational songs."]
  },
  contextMetadata: {
    generatedAt: "2026-06-16T15:05:00.000Z",
    projectionName: "planning-setlist",
    schemaVersion: "church-context.v1",
    tenantId: "tenant_1"
  },
  integrations: {
    ccliAvailable: true,
    songSelectAvailable: false
  },
  planningConstraints: {
    availableRoleIds: ["role_vocal", "role_guitar"],
    excludedSongIds: [],
    keyTransitionsAllowed: true,
    maxNewSongs: 1,
    requiredSongIds: []
  },
  recentUsageHistory: {
    recentlyUsedSongIds: ["song_1"],
    summaryNotes: ["song_1 used four weeks ago."]
  },
  service: {
    scriptureReference: "Psalm 24",
    sermonTheme: "King of Glory",
    serviceId: "service_1",
    serviceType: "Sunday",
    serviceTypeId: "type_sunday",
    startsAt: "2026-06-21T14:00:00.000Z",
    targetSetLength: 1
  },
  songLibrary: [
    {
      artist: "Sanctuary Collective",
      availableKeys: ["G", "A"],
      defaultKey: "G",
      isBannedOrPaused: false,
      licensingFlags: ["ccli-reportable"],
      songId: "song_1",
      title: "Open The Gates",
      usageCount: 4
    }
  ],
  targetSetLength: 1,
  teamConstraints: ["Prefer keys comfortable for volunteer vocalists."]
} as const;

describe("church-context scaffold", () => {
  it("requires AI policy fields before a context can be valid", () => {
    expect(() =>
      AIPolicyProfileSchema.parse({
        enabledAIFeatures: ["setlist-generation"],
        humanReviewRequiredFor: ["ai-suggested-write"],
        lastReviewedAt: "2026-06-16T15:00:00.000Z",
        piiSharingAllowed: false,
        retentionPolicy: "minimal"
      })
    ).not.toThrow();
  });

  it("rejects incomplete ChurchContext payloads", () => {
    expect(() => ChurchContextSchema.parse({})).toThrow();
  });

  it("publishes privacy and projection constants", () => {
    expect(blockedAiContextFields).toContain("phoneNumbers");
    expect(churchContextProjectionNames).toContain("planning-setlist");
  });

  it("validates Planning setlist projections with review policy and available songs", () => {
    expect(
      PlanningSetlistChurchContextProjectionSchema.parse(planningSetlistProjection)
        .contextMetadata.projectionName
    ).toBe("planning-setlist");

    expect(() =>
      PlanningSetlistChurchContextProjectionSchema.parse({
        ...planningSetlistProjection,
        aiPolicyProfile: {
          ...planningSetlistProjection.aiPolicyProfile,
          humanReviewRequiredFor: []
        }
      })
    ).toThrow("Planning setlist projection requires AI suggested writes review.");

    expect(() =>
      PlanningSetlistChurchContextProjectionSchema.parse({
        ...planningSetlistProjection,
        songLibrary: [
          {
            isBannedOrPaused: true,
            songId: "song_paused",
            title: "Paused Song"
          }
        ]
      })
    ).toThrow("Planning setlist projection requires at least one available song.");
  });

  it("rejects PII-shaped fields in Planning setlist projections", () => {
    expect(() =>
      PlanningSetlistChurchContextProjectionSchema.parse({
        ...planningSetlistProjection,
        phoneNumbers: ["+15555550123"]
      })
    ).toThrow();

    expect(() =>
      PlanningSetlistChurchContextProjectionSchema.parse({
        ...planningSetlistProjection,
        songLibrary: [
          {
            ...planningSetlistProjection.songLibrary[0],
            privateNotes: "Do not share this note."
          }
        ]
      })
    ).toThrow();
  });
});
