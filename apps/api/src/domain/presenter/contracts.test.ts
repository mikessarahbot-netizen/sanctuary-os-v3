import { describe, expect, it } from "vitest";
import {
  parsePresenterLocalSyncQueuedOperation,
  parsePresenterLocalSyncQueueEntry,
  parsePresenterLocalSyncQueueStatusTransition,
  parsePresenterDesktopOutputWindow,
  parsePresenterDesktopRunModeStatus,
  parsePresentation,
  parsePresenterLoadedRunModeState,
  parsePresenterOutputWindowRenderContext,
  parsePresenterRunModeAction,
  sortPresenterLocalSyncQueueEntriesForReplay
} from "./contracts.js";

const timestamp = "2026-06-16T20:55:00.000Z";

const baseTheme = {
  colors: {
    background: "#101820",
    lowerThirdBackground: "#000000",
    lowerThirdText: "#ffffff",
    text: "#f7f7f2"
  },
  lowerThird: {
    maxLines: 2,
    placement: "bottom-center"
  },
  name: "Sunday Standard",
  spacing: {
    blockGap: 24,
    slidePadding: 72
  },
  tenantId: "tenant_1",
  themeId: "theme_1",
  typography: {
    baseFontSize: 48,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter Display",
    lineHeight: 1.2
  }
};

const titleSlide = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_title",
      kind: "text",
      text: "Welcome",
      textStyle: "heading"
    }
  ],
  layout: "title",
  order: 0,
  presentationId: "presentation_1",
  slideId: "slide_1",
  tenantId: "tenant_1",
  title: "Welcome"
};

const scriptureSlide = {
  blocks: [
    {
      blockId: "block_scripture",
      displayStyle: "reference-and-text",
      kind: "scripture",
      passage: {
        displayGrouping: "by-verse",
        passageId: "passage_1",
        referenceText: "Psalm 100:1-2",
        tenantId: "tenant_1",
        translationRef: "public-domain-demo",
        verses: [
          {
            chapter: 100,
            text: "Make a joyful noise to the Lord, all the earth.",
            verseStart: 1
          },
          {
            chapter: 100,
            text: "Serve the Lord with gladness.",
            verseStart: 2
          }
        ]
      }
    }
  ],
  layout: "scripture",
  order: 1,
  presentationId: "presentation_1",
  slideId: "slide_2",
  tenantId: "tenant_1",
  title: "Scripture Reading"
};

const mediaSlide = {
  blocks: [
    {
      altText: "Baptism announcement background",
      blockId: "block_image",
      fit: "cover",
      kind: "image",
      mediaAssetRef: "asset_image_1"
    }
  ],
  backgroundRef: "asset_background_1",
  layout: "media",
  order: 2,
  presentationId: "presentation_1",
  serviceItemId: "service_item_1",
  slideId: "slide_3",
  tenantId: "tenant_1",
  title: "Announcement"
};

const basePresentation = {
  createdAt: timestamp,
  mediaCues: [
    {
      label: "Announcement image",
      mediaAssetRef: "asset_image_1",
      mediaCueId: "cue_1",
      playbackHint: "manual",
      presentationId: "presentation_1",
      slideId: "slide_3",
      tenantId: "tenant_1"
    }
  ],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [titleSlide, scriptureSlide, mediaSlide],
  tenantId: "tenant_1",
  theme: baseTheme,
  title: "Sunday Worship",
  updatedAt: timestamp
};

const mainOutputTarget = {
  confidenceOutputEnabled: false,
  displayName: "Projector",
  outputTargetId: "output_main",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display:main"
};

const mainOutputWindow = {
  confidenceOutputEligible: false,
  displayName: "Main Projector",
  lastHealthCheckAt: timestamp,
  lifecycleState: "visible",
  outputRole: "main",
  outputTargetId: "output_main",
  safeBlanked: false,
  tenantId: "tenant_1",
  windowId: "window_main",
  windowRef: "display:main"
};

const confidenceOutputWindow = {
  confidenceOutputEligible: true,
  displayName: "Confidence Monitor",
  lifecycleState: "visible",
  outputRole: "confidence",
  outputTargetId: "output_confidence",
  safeBlanked: false,
  tenantId: "tenant_1",
  windowId: "window_confidence",
  windowRef: "display:confidence"
};

const localRunModeStatus = {
  apiConnectionState: "offline",
  lastApiReachableAt: timestamp,
  localPlaybackReady: true,
  offlineSince: "2026-06-16T20:56:00.000Z",
  pendingSyncQueueSize: 1,
  syncState: "queued"
};

const queuedUpdatePresentationOperation = {
  operation: "updatePresentation",
  payload: {
    presentationId: "presentation_1",
    title: "Updated Sunday Worship"
  }
};

const queuedUpdateSlideOperation = {
  operation: "updateSlide",
  payload: {
    presentationId: "presentation_1",
    slide: scriptureSlide
  }
};

const queuedSetOutputTargetOperation = {
  operation: "setOutputTarget",
  payload: {
    outputTarget: mainOutputTarget,
    presentationId: "presentation_1"
  }
};

const baseQueueEntry = {
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "event_10",
  operation: queuedUpdatePresentationOperation,
  presentationId: "presentation_1",
  queuedAt: "2026-06-16T20:57:00.000Z",
  queueEntryId: "queue_1",
  requestId: "request_queue_1",
  status: "queued",
  tenantId: "tenant_1"
};

describe("Presenter domain contracts", () => {
  it("validates a tenant-scoped presentation with slides, scripture, media cues, and theme", () => {
    const presentation = parsePresentation(basePresentation);

    expect(presentation.tenantId).toBe("tenant_1");
    expect(presentation.slides).toHaveLength(3);
    expect(presentation.slides[1]?.blocks[0]?.kind).toBe("scripture");
    expect(presentation.mediaCues[0]?.slideId).toBe("slide_3");
  });

  it("rejects cross-tenant slides, media cues, and themes", () => {
    expect(() =>
      parsePresentation({
        ...basePresentation,
        slides: [{ ...titleSlide, tenantId: "tenant_2" }]
      })
    ).toThrow("Slide tenant must match presentation tenant.");

    expect(() =>
      parsePresentation({
        ...basePresentation,
        mediaCues: [
          {
            ...basePresentation.mediaCues[0],
            tenantId: "tenant_2"
          }
        ]
      })
    ).toThrow("Media cue tenant must match presentation tenant.");

    expect(() =>
      parsePresentation({
        ...basePresentation,
        theme: { ...baseTheme, tenantId: "tenant_2" }
      })
    ).toThrow("Theme tenant must match presentation tenant.");
  });

  it("rejects media cues for missing slides and duplicate slide IDs", () => {
    expect(() =>
      parsePresentation({
        ...basePresentation,
        mediaCues: [
          {
            ...basePresentation.mediaCues[0],
            slideId: "missing_slide"
          }
        ]
      })
    ).toThrow("Media cue must reference an existing slide.");

    expect(() =>
      parsePresentation({
        ...basePresentation,
        slides: [titleSlide, { ...scriptureSlide, slideId: "slide_1" }]
      })
    ).toThrow("Slide IDs must be unique within a presentation.");
  });

  it("keeps loaded run mode offline-safe by embedding the presentation and validating active slide", () => {
    const state = parsePresenterLoadedRunModeState({
      activeSlideId: "slide_2",
      confidenceOutputEnabled: true,
      loadedAt: timestamp,
      outputBlanked: false,
      outputTargets: [mainOutputTarget],
      presentation: basePresentation,
      tenantId: "tenant_1"
    });

    expect(state.presentation.slides.map((slide) => slide.slideId)).toEqual([
      "slide_1",
      "slide_2",
      "slide_3"
    ]);
    expect(state.activeSlideId).toBe("slide_2");

    expect(() =>
      parsePresenterLoadedRunModeState({
        ...state,
        activeSlideId: "missing_slide"
      })
    ).toThrow("Active slide must exist in the loaded presentation.");
  });

  it("validates local run-mode load and navigation actions", () => {
    expect(
      parsePresenterRunModeAction({
        action: "loadPresentation",
        loadedAt: timestamp,
        outputTargets: [mainOutputTarget],
        presentation: basePresentation,
        tenantId: "tenant_1"
      })
    ).toMatchObject({ action: "loadPresentation" });

    expect(
      parsePresenterRunModeAction({
        action: "goToSlide",
        slideId: "slide_2",
        tenantId: "tenant_1"
      })
    ).toMatchObject({ action: "goToSlide", slideId: "slide_2" });

    expect(parsePresenterRunModeAction({ action: "nextSlide", tenantId: "tenant_1" }))
      .toMatchObject({ action: "nextSlide" });
    expect(
      parsePresenterRunModeAction({ action: "previousSlide", tenantId: "tenant_1" })
    ).toMatchObject({ action: "previousSlide" });
  });

  it("rejects load actions that cross tenant boundaries", () => {
    expect(() =>
      parsePresenterRunModeAction({
        action: "loadPresentation",
        loadedAt: timestamp,
        outputTargets: [mainOutputTarget],
        presentation: basePresentation,
        tenantId: "tenant_2"
      })
    ).toThrow("Load action tenant must match presentation tenant.");

    expect(() =>
      parsePresenterRunModeAction({
        action: "loadPresentation",
        loadedAt: timestamp,
        outputTargets: [{ ...mainOutputTarget, tenantId: "tenant_2" }],
        presentation: basePresentation,
        tenantId: "tenant_1"
      })
    ).toThrow("Output target tenant must match load action tenant.");
  });

  it("validates output blank, restore, and confidence output actions without destructive intent", () => {
    expect(
      parsePresenterRunModeAction({
        action: "blankOutput",
        reason: "Prayer ministry",
        tenantId: "tenant_1"
      })
    ).toMatchObject({ action: "blankOutput" });

    expect(parsePresenterRunModeAction({ action: "restoreOutput", tenantId: "tenant_1" }))
      .toMatchObject({ action: "restoreOutput" });

    expect(
      parsePresenterRunModeAction({
        action: "toggleConfidenceOutput",
        enabled: false,
        tenantId: "tenant_1"
      })
    ).toMatchObject({ action: "toggleConfidenceOutput", enabled: false });
  });

  it("rejects secret-like fields at Presenter boundaries", () => {
    expect(() =>
      parsePresentation({
        ...basePresentation,
        bibleApiKey: "secret"
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      parsePresenterRunModeAction({
        action: "blankOutput",
        obsToken: "secret",
        tenantId: "tenant_1"
      })
    ).toThrow("Unrecognized key");
  });

  it("validates desktop output windows and local offline run-mode status", () => {
    expect(parsePresenterDesktopOutputWindow(mainOutputWindow)).toMatchObject({
      outputRole: "main",
      windowId: "window_main"
    });

    expect(parsePresenterDesktopRunModeStatus(localRunModeStatus)).toMatchObject({
      apiConnectionState: "offline",
      syncState: "queued"
    });

    expect(() =>
      parsePresenterDesktopRunModeStatus({
        ...localRunModeStatus,
        offlineSince: undefined
      })
    ).toThrow("Offline run mode status must include when offline mode began.");

    expect(() =>
      parsePresenterDesktopRunModeStatus({
        ...localRunModeStatus,
        pendingSyncQueueSize: 2,
        syncState: "synced"
      })
    ).toThrow("Queued local changes cannot be marked synced.");
  });

  it("rejects unsafe desktop output window states", () => {
    expect(() =>
      parsePresenterDesktopOutputWindow({
        ...mainOutputWindow,
        confidenceOutputEligible: true
      })
    ).toThrow("Main output windows cannot be confidence-output eligible.");

    expect(() =>
      parsePresenterDesktopOutputWindow({
        ...mainOutputWindow,
        lifecycleState: "failed",
        safeBlanked: false
      })
    ).toThrow("Failed output windows must include a failure reason.");

    expect(() =>
      parsePresenterDesktopOutputWindow({
        ...mainOutputWindow,
        failureReason: "Display disconnected",
        lifecycleState: "failed",
        safeBlanked: false
      })
    ).toThrow("Failed output windows must remain safe blanked.");
  });

  it("validates active slide rendering context for desktop output windows", () => {
    const context = parsePresenterOutputWindowRenderContext({
      activeSlide: scriptureSlide,
      confidenceOutputEnabled: true,
      localStatus: localRunModeStatus,
      outputBlanked: false,
      presentationId: "presentation_1",
      tenantId: "tenant_1",
      theme: baseTheme,
      window: mainOutputWindow
    });

    expect(context.activeSlide.slideId).toBe("slide_2");
    expect(context.window.windowRef).toBe("display:main");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        ...context,
        activeSlide: { ...scriptureSlide, tenantId: "tenant_2" }
      })
    ).toThrow("Active slide tenant must match render context tenant.");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        ...context,
        activeSlide: { ...scriptureSlide, presentationId: "presentation_2" }
      })
    ).toThrow("Active slide presentation must match render context presentation.");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        ...context,
        window: { ...mainOutputWindow, tenantId: "tenant_2" }
      })
    ).toThrow("Output window tenant must match render context tenant.");
  });

  it("keeps blanked and disabled confidence output windows safe", () => {
    expect(() =>
      parsePresenterOutputWindowRenderContext({
        activeSlide: scriptureSlide,
        confidenceOutputEnabled: true,
        localStatus: localRunModeStatus,
        outputBlanked: true,
        presentationId: "presentation_1",
        tenantId: "tenant_1",
        theme: baseTheme,
        window: mainOutputWindow
      })
    ).toThrow("Output window must be safe blanked when run mode output is blanked.");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        activeSlide: scriptureSlide,
        confidenceOutputEnabled: false,
        localStatus: localRunModeStatus,
        outputBlanked: false,
        presentationId: "presentation_1",
        tenantId: "tenant_1",
        theme: baseTheme,
        window: confidenceOutputWindow
      })
    ).toThrow("Disabled confidence output windows must remain safe blanked.");
  });

  it("rejects OBS, stream, raw media, and secret fields at desktop output boundaries", () => {
    expect(() =>
      parsePresenterDesktopOutputWindow({
        ...mainOutputWindow,
        obsScene: "scene_main"
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        activeSlide: scriptureSlide,
        confidenceOutputEnabled: true,
        localStatus: localRunModeStatus,
        outputBlanked: false,
        presentationId: "presentation_1",
        rawMediaPayload: "base64",
        tenantId: "tenant_1",
        theme: baseTheme,
        window: mainOutputWindow
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      parsePresenterOutputWindowRenderContext({
        activeSlide: scriptureSlide,
        confidenceOutputEnabled: true,
        localStatus: localRunModeStatus,
        outputBlanked: false,
        presentationId: "presentation_1",
        startStream: true,
        tenantId: "tenant_1",
        theme: baseTheme,
        vendorToken: "secret",
        window: mainOutputWindow
      })
    ).toThrow("Unrecognized key");
  });

  it("validates approved local sync queued operations", () => {
    expect(parsePresenterLocalSyncQueuedOperation(queuedUpdatePresentationOperation))
      .toMatchObject({ operation: "updatePresentation" });

    expect(
      parsePresenterLocalSyncQueuedOperation({
        operation: "addSlide",
        payload: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: {
            blocks: [
              {
                alignment: "center",
                blockId: "block_added",
                kind: "text",
                text: "Offering",
                textStyle: "heading"
              }
            ],
            layout: "title"
          }
        }
      })
    ).toMatchObject({ operation: "addSlide" });

    expect(parsePresenterLocalSyncQueuedOperation(queuedUpdateSlideOperation))
      .toMatchObject({ operation: "updateSlide" });
    expect(
      parsePresenterLocalSyncQueuedOperation({
        operation: "reorderSlides",
        payload: {
          orderedSlideIds: ["slide_2", "slide_1", "slide_3"],
          presentationId: "presentation_1"
        }
      })
    ).toMatchObject({ operation: "reorderSlides" });
    expect(
      parsePresenterLocalSyncQueuedOperation({
        operation: "applyPresenterTheme",
        payload: {
          presentationId: "presentation_1",
          themeId: "theme_1"
        }
      })
    ).toMatchObject({ operation: "applyPresenterTheme" });
    expect(parsePresenterLocalSyncQueuedOperation(queuedSetOutputTargetOperation))
      .toMatchObject({ operation: "setOutputTarget" });
  });

  it("validates queue entries with tenant, presentation, actor, and request metadata", () => {
    expect(parsePresenterLocalSyncQueueEntry(baseQueueEntry)).toMatchObject({
      actorId: "actor_1",
      presentationId: "presentation_1",
      requestId: "request_queue_1",
      status: "queued",
      tenantId: "tenant_1"
    });

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        operation: {
          ...queuedUpdatePresentationOperation,
          payload: {
            ...queuedUpdatePresentationOperation.payload,
            presentationId: "presentation_2"
          }
        }
      })
    ).toThrow("Queued operation presentation must match queue entry presentation.");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        operation: {
          ...queuedUpdateSlideOperation,
          payload: {
            ...queuedUpdateSlideOperation.payload,
            slide: { ...scriptureSlide, tenantId: "tenant_2" }
          }
        }
      })
    ).toThrow("Queued slide tenant must match queue entry tenant.");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        operation: {
          ...queuedSetOutputTargetOperation,
          payload: {
            ...queuedSetOutputTargetOperation.payload,
            outputTarget: { ...mainOutputTarget, tenantId: "tenant_2" }
          }
        }
      })
    ).toThrow("Queued output target tenant must match queue entry tenant.");
  });

  it("validates queue conflict details and failure metadata", () => {
    expect(
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        conflict: {
          conflictKind: "stale-presentation",
          localBaseRevision: "event_10",
          safeMessage: "Presentation changed on another device.",
          serverRevision: "event_12"
        },
        status: "conflict"
      })
    ).toMatchObject({ status: "conflict" });

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        status: "conflict"
      })
    ).toThrow("Conflicted queue entries must include conflict details.");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        conflict: {
          conflictKind: "stale-presentation",
          localBaseRevision: "event_10",
          safeMessage: "Presentation changed on another device.",
          serverRevision: "event_12"
        }
      })
    ).toThrow("Only conflicted queue entries can include conflict details.");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        status: "failed"
      })
    ).toThrow("Failed queue entries must include a safe error message.");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        lastAttemptedAt: "2026-06-16T21:00:00.000Z"
      })
    ).toThrow("Queue entries with a replay attempt timestamp must record an attempt.");
  });

  it("validates local sync queue status transitions", () => {
    expect(
      parsePresenterLocalSyncQueueStatusTransition({
        from: "queued",
        to: "replaying",
        transitionedAt: "2026-06-16T20:58:00.000Z"
      })
    ).toMatchObject({ from: "queued", to: "replaying" });

    expect(
      parsePresenterLocalSyncQueueStatusTransition({
        from: "replaying",
        safeReason: "Network unavailable, retry later.",
        to: "queued",
        transitionedAt: "2026-06-16T20:59:00.000Z"
      })
    ).toMatchObject({ from: "replaying", to: "queued" });

    expect(() =>
      parsePresenterLocalSyncQueueStatusTransition({
        from: "synced",
        to: "queued",
        transitionedAt: "2026-06-16T21:00:00.000Z"
      })
    ).toThrow("Presenter local sync queue status transition is not allowed.");

    expect(() =>
      parsePresenterLocalSyncQueueStatusTransition({
        from: "queued",
        to: "queued",
        transitionedAt: "2026-06-16T21:00:00.000Z"
      })
    ).toThrow("Presenter local sync queue status transition is not allowed.");
  });

  it("sorts queued entries for replay by tenant, presentation, and queued time", () => {
    expect(
      sortPresenterLocalSyncQueueEntriesForReplay([
        {
          ...baseQueueEntry,
          queueEntryId: "queue_3",
          queuedAt: "2026-06-16T20:59:00.000Z"
        },
        {
          ...baseQueueEntry,
          presentationId: "presentation_2",
          queueEntryId: "queue_4",
          queuedAt: "2026-06-16T20:56:00.000Z",
          operation: {
            ...queuedUpdatePresentationOperation,
            payload: {
              ...queuedUpdatePresentationOperation.payload,
              presentationId: "presentation_2"
            }
          }
        },
        {
          ...baseQueueEntry,
          queueEntryId: "queue_synced",
          status: "synced"
        },
        {
          ...baseQueueEntry,
          queueEntryId: "queue_2",
          queuedAt: "2026-06-16T20:58:00.000Z"
        },
        baseQueueEntry
      ]).map((entry) => entry.queueEntryId)
    ).toEqual(["queue_1", "queue_2", "queue_3", "queue_4"]);
  });

  it("rejects destructive, local run-mode, OBS, stream, raw media, and secret queued payloads", () => {
    expect(() =>
      parsePresenterLocalSyncQueuedOperation({
        operation: "removeSlide",
        payload: {
          confirmationIntent: {
            confirmed: true,
            reason: "Remove duplicate slide"
          },
          presentationId: "presentation_1",
          slideId: "slide_3"
        }
      })
    ).toThrow();

    expect(() =>
      parsePresenterLocalSyncQueuedOperation({
        action: "goToSlide",
        slideId: "slide_2",
        tenantId: "tenant_1"
      })
    ).toThrow();

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        operation: {
          ...queuedUpdatePresentationOperation,
          payload: {
            ...queuedUpdatePresentationOperation.payload,
            obsScene: "scene_main"
          }
        }
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        rawMediaPayload: "base64"
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      parsePresenterLocalSyncQueueEntry({
        ...baseQueueEntry,
        startStream: true,
        vendorToken: "secret"
      })
    ).toThrow("Unrecognized key");
  });
});
