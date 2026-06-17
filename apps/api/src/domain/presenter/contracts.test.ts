import { describe, expect, it } from "vitest";
import {
  LoadedPresenterRunStateSchema,
  PresenterOutputStateSchema,
  PresenterPresentationSchema,
  PresenterRunModeActionSchema,
  PresenterSlideGroupSchema,
  PresenterStyleTemplateSchema
} from "./contracts.js";

const fixedUpdatedAt = "2026-06-17T12:00:00.000Z";

const createSlide = () => ({
  blocks: [
    {
      blockId: "block_1",
      kind: "text",
      styleRole: "heading",
      text: "Welcome"
    }
  ],
  slideId: "slide_1",
  title: "Welcome"
});

const createPresentation = () => ({
  presentationId: "presentation_1",
  serviceId: "service_1",
  slideGroups: [
    {
      groupId: "group_1",
      groupType: "service-item",
      serviceItemId: "item_1",
      slides: [createSlide()],
      title: "Welcome"
    }
  ],
  styleTemplateId: "style_1",
  tenantId: "tenant_1",
  title: "Sunday Worship",
  updatedAt: fixedUpdatedAt
});

const createOutputState = () => ({
  blackout: false,
  currentGroupId: "group_1",
  currentSlideId: "slide_1",
  freeze: false,
  mode: "live",
  presentationId: "presentation_1",
  tenantId: "tenant_1",
  updatedAt: fixedUpdatedAt
});

describe("Presenter domain contracts", () => {
  it("validates tenant-scoped presentations with service-linked slide groups", () => {
    expect(PresenterPresentationSchema.parse(createPresentation())).toMatchObject({
      presentationId: "presentation_1",
      serviceId: "service_1",
      syncStatus: "synced",
      tenantId: "tenant_1"
    });
  });

  it("requires service item refs for service-item slide groups", () => {
    expect(() =>
      PresenterSlideGroupSchema.parse({
        groupId: "group_1",
        groupType: "service-item",
        slides: [createSlide()],
        title: "Missing service item"
      })
    ).toThrow("Service-item slide groups require a serviceItemId.");
  });

  it("models offline-safe loaded presenter run state", () => {
    expect(
      LoadedPresenterRunStateSchema.parse({
        loadedAt: fixedUpdatedAt,
        offlineAvailable: true,
        outputState: createOutputState(),
        presentation: createPresentation(),
        source: "local-cache"
      })
    ).toMatchObject({
      offlineAvailable: true,
      source: "local-cache"
    });
  });

  it("rejects loaded run state when tenant scope does not match output state", () => {
    expect(() =>
      LoadedPresenterRunStateSchema.parse({
        loadedAt: fixedUpdatedAt,
        offlineAvailable: true,
        outputState: {
          ...createOutputState(),
          tenantId: "tenant_2"
        },
        presentation: createPresentation(),
        source: "api"
      })
    ).toThrow("Output state tenant must match loaded presentation tenant.");
  });

  it("validates local run-mode output actions", () => {
    expect(
      PresenterRunModeActionSchema.parse({
        actionType: "blackoutOutput"
      })
    ).toEqual({
      actionType: "blackoutOutput"
    });
    expect(
      PresenterRunModeActionSchema.parse({
        actionType: "selectOutputMode",
        mode: "preview"
      })
    ).toEqual({
      actionType: "selectOutputMode",
      mode: "preview"
    });
  });

  it("rejects raw media payloads and secret-like style fields", () => {
    expect(() =>
      PresenterPresentationSchema.parse({
        ...createPresentation(),
        slideGroups: [
          {
            groupId: "group_1",
            groupType: "media",
            slides: [
              {
                blocks: [
                  {
                    assetRef: "asset_1",
                    blockId: "block_media",
                    kind: "media-placeholder",
                    mediaType: "video",
                    rawMediaPayload: "base64-video"
                  }
                ],
                slideId: "slide_media"
              }
            ],
            title: "Video"
          }
        ]
      })
    ).toThrow();

    expect(() =>
      PresenterStyleTemplateSchema.parse({
        createdAt: fixedUpdatedAt,
        credentials: "secret-token",
        name: "Sunday",
        styleTemplateId: "style_1",
        tenantId: "tenant_1",
        tokens: {
          backgroundColor: "#000000",
          bodyFontFamily: "Inter",
          bodyTextColor: "#ffffff",
          headingFontFamily: "Inter",
          headingTextColor: "#ffffff",
          safeAreaInsetPercent: 8
        },
        updatedAt: fixedUpdatedAt
      })
    ).toThrow();
  });

  it("validates output state without owning OBS or stream lifecycle", () => {
    const outputState = PresenterOutputStateSchema.parse({
      ...createOutputState(),
      blackout: true,
      freeze: true
    });

    expect(outputState.blackout).toBe(true);
    expect(outputState.freeze).toBe(true);
    expect(JSON.stringify(outputState)).not.toContain("obs");
    expect(JSON.stringify(outputState)).not.toContain("stream");
  });
});
