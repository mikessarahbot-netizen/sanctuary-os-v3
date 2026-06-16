import { describe, expect, it } from "vitest";
import type { PlanningSetlistChurchContextProjection } from "@sanctuary-os/church-context";
import {
  buildPlanningSetlistChurchContextProjectionEnvelope,
  PlanningSetlistChurchContextProjectionEnvelopeSchema
} from "./index.js";

const planningSetlistProjection: PlanningSetlistChurchContextProjection = {
  aiPolicyProfile: {
    enabledAIFeatures: ["setlist-generation"],
    humanReviewRequiredFor: ["ai-suggested-write"],
    lastReviewedAt: "2026-06-16T15:00:00.000Z",
    piiSharingAllowed: false,
    retentionPolicy: "minimal"
  },
  churchContextSummary: "Non-PII summary for Sunday worship planning.",
  churchPreferences: {
    bannedOrPausedSongIds: ["song_paused"],
    defaultServiceFlow: ["gathering", "response"],
    preferredKeys: ["G", "D"],
    styleNotes: ["Congregational and familiar."]
  },
  contextMetadata: {
    generatedAt: "2026-06-16T15:30:00.000Z",
    projectionName: "planning-setlist",
    schemaVersion: "planning-setlist.v1",
    tenantId: "tenant_1"
  },
  integrations: {
    ccliAvailable: true,
    songSelectAvailable: false
  },
  planningConstraints: {
    availableRoleIds: ["role_worship_leader", "role_acoustic"],
    excludedSongIds: ["song_paused"],
    keyTransitionsAllowed: true,
    maxNewSongs: 1,
    requiredSongIds: ["song_open"]
  },
  recentUsageHistory: {
    lastServiceDate: "2026-06-09T14:00:00.000Z",
    overusedSongIds: [],
    recentlyUsedSongIds: ["song_response"],
    summaryNotes: ["Avoid repeating last week's closer."]
  },
  service: {
    scriptureReference: "Psalm 24",
    sermonTheme: "King of Glory",
    serviceId: "service_1",
    serviceType: "Sunday Worship",
    serviceTypeId: "type_sunday",
    startsAt: "2026-06-21T14:00:00.000Z",
    targetSetLength: 2
  },
  songLibrary: [
    {
      artist: "Sanctuary Collective",
      availableKeys: ["G", "A"],
      defaultKey: "G",
      energyLabel: "medium",
      isBannedOrPaused: false,
      licensingFlags: ["ccli-reportable"],
      songId: "song_open",
      tempoBpm: 104,
      title: "Open The Gates",
      usageCount: 4
    },
    {
      artist: "Sanctuary Collective",
      availableKeys: ["D"],
      defaultKey: "D",
      energyLabel: "low",
      isBannedOrPaused: false,
      licensingFlags: ["ccli-reportable"],
      songId: "song_response",
      tempoBpm: 78,
      title: "King Of Glory",
      usageCount: 2
    },
    {
      availableKeys: ["C"],
      isBannedOrPaused: true,
      licensingFlags: [],
      songId: "song_paused",
      title: "Paused Song",
      usageCount: 8
    }
  ],
  targetSetLength: 2,
  teamConstraints: ["Use acoustic-friendly keys."]
};

describe("Planning setlist ChurchContext projection contracts", () => {
  it("builds a strict planning-setlist envelope with request metadata", () => {
    expect(
      buildPlanningSetlistChurchContextProjectionEnvelope({
        payload: planningSetlistProjection,
        request: {
          projectionName: "planning-setlist",
          requestId: "request_1",
          requestedByActorId: "actor_1",
          serviceId: "service_1",
          tenantId: "tenant_1"
        }
      })
    ).toEqual({
      generatedAt: "2026-06-16T15:30:00.000Z",
      payload: planningSetlistProjection,
      projectionName: "planning-setlist",
      requestId: "request_1",
      requestedByActorId: "actor_1",
      schemaVersion: "planning-setlist.v1",
      serviceId: "service_1",
      tenantId: "tenant_1"
    });
  });

  it("rejects PII-shaped fields in AI-safe song candidates", () => {
    expect(() =>
      PlanningSetlistChurchContextProjectionEnvelopeSchema.parse({
        generatedAt: planningSetlistProjection.contextMetadata.generatedAt,
        payload: {
          ...planningSetlistProjection,
          songLibrary: [
            {
              artist: "Sanctuary Collective",
              availableKeys: ["G"],
              isBannedOrPaused: false,
              licensingFlags: [],
              songId: "song_open",
              title: "Open The Gates",
              usageCount: 4,
              vocalistEmail: "volunteer@example.com"
            }
          ]
        },
        projectionName: "planning-setlist",
        requestId: "request_1",
        requestedByActorId: "actor_1",
        schemaVersion: planningSetlistProjection.contextMetadata.schemaVersion,
        serviceId: "service_1",
        tenantId: "tenant_1"
      })
    ).toThrow();
  });

  it("requires paused song candidates to be listed in bannedOrPausedSongIds", () => {
    expect(() =>
      buildPlanningSetlistChurchContextProjectionEnvelope({
        payload: {
          ...planningSetlistProjection,
          churchPreferences: {
            ...planningSetlistProjection.churchPreferences,
            bannedOrPausedSongIds: []
          }
        },
        request: {
          projectionName: "planning-setlist",
          requestId: "request_1",
          requestedByActorId: "actor_1",
          serviceId: "service_1",
          tenantId: "tenant_1"
        }
      })
    ).toThrow("Banned or paused songs must be listed in church preferences.");
  });

  it("rejects request metadata that does not match the projection payload", () => {
    expect(() =>
      PlanningSetlistChurchContextProjectionEnvelopeSchema.parse({
        generatedAt: planningSetlistProjection.contextMetadata.generatedAt,
        payload: planningSetlistProjection,
        projectionName: "planning-setlist",
        requestId: "request_1",
        requestedByActorId: "actor_1",
        schemaVersion: planningSetlistProjection.contextMetadata.schemaVersion,
        serviceId: "service_other",
        tenantId: "tenant_1"
      })
    ).toThrow("Planning setlist projection envelope service mismatch.");
  });
});
