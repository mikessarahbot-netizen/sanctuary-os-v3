import { describe, expect, it } from "vitest";
import {
  AddPresenterSlidePersistenceOperationSchema,
  CreatePresenterPresentationPersistenceOperationSchema,
  GetPresenterPresentationForServicePersistenceOperationSchema,
  ListPresenterOutputTargetsPersistenceOperationSchema,
  ListPresenterPresentationsPersistenceOperationSchema,
  PresenterPersistenceWriteOptionsSchema,
  PresenterPresentationPersistenceRecordSchema,
  ReorderPresenterSlidesPersistenceOperationSchema,
  RemovePresenterSlidePersistenceOperationSchema,
  SavePresenterThemePersistenceOperationSchema,
  SetPresenterOutputTargetPersistenceOperationSchema,
  UpdatePresenterPresentationPersistenceOperationSchema,
  UpdatePresenterSlidePersistenceOperationSchema,
  type PresenterCommandPersistenceRepository,
  type PresenterOutputTargetPersistenceRecord,
  type PresenterPresentationPersistenceRecord,
  type PresenterQueryPersistenceRepository,
  type PresenterSlidePersistenceRecord,
  type PresenterThemePersistenceRecord
} from "./index.js";

const timestamp = "2026-06-21T14:00:00.000Z";

const theme: PresenterThemePersistenceRecord = {
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

const slide: PresenterSlidePersistenceRecord = {
  blocks: [
    {
      alignment: "center",
      blockId: "block_1",
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

const scriptureSlide: PresenterSlidePersistenceRecord = {
  blocks: [
    {
      blockId: "block_scripture",
      displayStyle: "reference-and-text",
      kind: "scripture",
      passage: {
        displayGrouping: "by-verse",
        passageId: "passage_1",
        referenceText: "Psalm 100:1",
        tenantId: "tenant_1",
        translationRef: "public-domain-demo",
        verses: [
          {
            chapter: 100,
            text: "Make a joyful noise to the Lord, all the earth.",
            verseStart: 1
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
  title: "Scripture"
};

const outputTarget: PresenterOutputTargetPersistenceRecord = {
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display-main"
};

const presentation: PresenterPresentationPersistenceRecord = {
  createdAt: timestamp,
  mediaCues: [
    {
      label: "Welcome background",
      mediaAssetRef: "asset_welcome_background",
      mediaCueId: "cue_1",
      playbackHint: "manual",
      presentationId: "presentation_1",
      slideId: "slide_1",
      tenantId: "tenant_1"
    }
  ],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [slide, scriptureSlide],
  tenantId: "tenant_1",
  theme,
  title: "Sunday Worship",
  updatedAt: timestamp
};

const writeOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_1",
    tenantId: "tenant_1"
  },
  intent: "update"
} as const;

const readOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId: "tenant_1"
  }
} as const;

describe("Presenter repository contracts", () => {
  it("validates tenant-scoped write options with actor audit metadata", () => {
    expect(PresenterPersistenceWriteOptionsSchema.parse(writeOptions).context.actorId).toBe(
      "actor_1"
    );

    expect(() =>
      PresenterPersistenceWriteOptionsSchema.parse({
        context: {
          requestId: "request_missing_actor",
          tenantId: "tenant_1"
        },
        intent: "update"
      })
    ).toThrow("Presenter persistence writes require actor audit metadata.");
  });

  it("validates saved presentation records and rejects cross-tenant children", () => {
    expect(PresenterPresentationPersistenceRecordSchema.parse(presentation).slides).toHaveLength(
      2
    );

    expect(() =>
      PresenterPresentationPersistenceRecordSchema.parse({
        ...presentation,
        slides: [{ ...slide, tenantId: "tenant_2" }]
      })
    ).toThrow("Slide tenant must match presentation tenant.");

    expect(() =>
      PresenterPresentationPersistenceRecordSchema.parse({
        ...presentation,
        mediaCues: [{ ...presentation.mediaCues[0], slideId: "missing_slide" }]
      })
    ).toThrow("Media cue must reference an existing persisted slide.");
  });

  it("validates Presenter presentation read operation shapes", () => {
    expect(
      ListPresenterPresentationsPersistenceOperationSchema.parse({
        input: {
          filter: {
            serviceId: "service_1"
          }
        },
        options: readOptions
      }).input.filter?.serviceId
    ).toBe("service_1");

    expect(
      GetPresenterPresentationForServicePersistenceOperationSchema.parse({
        input: {
          serviceId: "service_1"
        },
        options: readOptions
      }).options.context.tenantId
    ).toBe("tenant_1");

    expect(
      ListPresenterOutputTargetsPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      }).input.presentationId
    ).toBe("presentation_1");
  });

  it("validates Presenter presentation, theme, and output target write operations", () => {
    expect(
      CreatePresenterPresentationPersistenceOperationSchema.parse({
        input: presentation,
        options: {
          ...writeOptions,
          intent: "create"
        }
      }).input.presentationId
    ).toBe("presentation_1");

    expect(
      UpdatePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1",
          title: "Sunday Worship Updated",
          updatedAt: "2026-06-21T15:00:00.000Z"
        },
        options: writeOptions
      }).input.title
    ).toBe("Sunday Worship Updated");

    expect(
      SavePresenterThemePersistenceOperationSchema.parse({
        input: theme,
        options: writeOptions
      }).input.themeId
    ).toBe("theme_1");

    expect(
      SetPresenterOutputTargetPersistenceOperationSchema.parse({
        input: {
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      }).input.outputTarget.outputTargetId
    ).toBe("output_1");
  });

  it("validates slide mutation operation shapes needed by current Presenter services", () => {
    expect(
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: scriptureSlide,
          updatedAt: "2026-06-21T15:00:00.000Z"
        },
        options: writeOptions
      }).input.slide.slideId
    ).toBe("slide_2");

    expect(
      UpdatePresenterSlidePersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1",
          slide: {
            ...slide,
            notes: "Operator note"
          },
          updatedAt: "2026-06-21T15:05:00.000Z"
        },
        options: writeOptions
      }).input.slide.notes
    ).toBe("Operator note");

    expect(
      ReorderPresenterSlidesPersistenceOperationSchema.parse({
        input: {
          orderedSlideIds: ["slide_2", "slide_1"],
          presentationId: "presentation_1",
          updatedAt: "2026-06-21T15:10:00.000Z"
        },
        options: writeOptions
      }).input.orderedSlideIds
    ).toEqual(["slide_2", "slide_1"]);

    expect(
      RemovePresenterSlidePersistenceOperationSchema.parse({
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Duplicate announcement slide"
          },
          presentationId: "presentation_1",
          slideId: "slide_2",
          updatedAt: "2026-06-21T15:15:00.000Z"
        },
        options: {
          ...writeOptions,
          intent: "destructive-confirmed"
        }
      }).options.intent
    ).toBe("destructive-confirmed");
  });

  it("rejects tenant mismatches, duplicate slide order, and raw/vendor/secret fields", () => {
    expect(() =>
      CreatePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          tenantId: "tenant_2"
        },
        options: writeOptions
      })
    ).toThrow("Presenter persistence record tenant must match operation tenant.");

    expect(() =>
      ReorderPresenterSlidesPersistenceOperationSchema.parse({
        input: {
          orderedSlideIds: ["slide_1", "slide_1"],
          presentationId: "presentation_1",
          updatedAt: "2026-06-21T15:10:00.000Z"
        },
        options: writeOptions
      })
    ).toThrow("Presenter persistence slide order cannot contain duplicate slide IDs.");

    expect(() =>
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1",
          rawMediaPayload: "no file bytes",
          slide,
          updatedAt: "2026-06-21T15:00:00.000Z"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SavePresenterThemePersistenceOperationSchema.parse({
        input: {
          ...theme,
          bibleApiKey: "secret"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SetPresenterOutputTargetPersistenceOperationSchema.parse({
        input: {
          obsWebsocketToken: "secret",
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");
  });

  it("defines adapter-free Presenter persistence repository interfaces", async () => {
    const commandRepository: PresenterCommandPersistenceRepository = {
      addSlide: (operation) => Promise.resolve(operation.input.slide),
      applyPresenterTheme: (operation) =>
        Promise.resolve({
          ...presentation,
          theme: {
            ...theme,
            themeId: operation.input.themeId
          },
          updatedAt: operation.input.updatedAt
        }),
      createPresentation: (operation) => Promise.resolve(operation.input),
      removeSlide: (operation) =>
        Promise.resolve({
          ...presentation,
          slides: presentation.slides.filter(
            (candidate) => candidate.slideId !== operation.input.slideId
          ),
          updatedAt: operation.input.updatedAt
        }),
      reorderSlides: (operation) =>
        Promise.resolve(
          operation.input.orderedSlideIds.map((slideId, order) => ({
            ...(presentation.slides.find((candidate) => candidate.slideId === slideId) ??
              slide),
            order
          }))
        ),
      savePresenterTheme: (operation) => Promise.resolve(operation.input),
      setOutputTarget: (operation) => Promise.resolve(operation.input.outputTarget),
      updatePresentation: (operation) =>
        Promise.resolve({
          ...presentation,
          serviceId: operation.input.serviceId ?? presentation.serviceId,
          title: operation.input.title ?? presentation.title,
          updatedAt: operation.input.updatedAt
        }),
      updateSlide: (operation) => Promise.resolve(operation.input.slide)
    };

    const queryRepository: PresenterQueryPersistenceRepository = {
      getPresentation: () => Promise.resolve(presentation),
      getPresentationForService: () => Promise.resolve(presentation),
      listOutputTargets: () => Promise.resolve([outputTarget]),
      listPresenterThemes: () => Promise.resolve([theme]),
      listPresentations: () => Promise.resolve([presentation])
    };

    await expect(
      commandRepository.createPresentation({
        input: presentation,
        options: {
          ...writeOptions,
          intent: "create"
        }
      })
    ).resolves.toEqual(presentation);

    await expect(
      commandRepository.setOutputTarget({
        input: {
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toEqual(outputTarget);

    await expect(
      queryRepository.listPresentations({
        input: {
          filter: {
            serviceId: "service_1"
          }
        },
        options: readOptions
      })
    ).resolves.toEqual([presentation]);
  });
});
