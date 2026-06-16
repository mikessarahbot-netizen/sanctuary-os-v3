import { describe, expect, it } from "vitest";
import {
  AIPolicyProfileSchema,
  ChurchContextSchema,
  blockedAiContextFields,
  churchContextProjectionNames
} from "./index.js";

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
});
