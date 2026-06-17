import { describe, expect, it } from "vitest";
import {
  AddPresenterSlidePersistenceOperationSchema,
  GetPresenterPresentationPersistenceOperationSchema,
  ListPresenterOutputTargetsPersistenceOperationSchema,
  PresenterPersistenceReadOptionsSchema,
  PresenterPersistenceWriteOptionsSchema,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  ReorderPresenterSlidesPersistenceOperationSchema,
  SavePresenterPresentationPersistenceOperationSchema,
  SavePresenterThemePersistenceOperationSchema,
  SetPresenterOutputTargetPersistenceOperationSchema,
  type PresenterCommandPersistenceRepository,
  type PresenterPresentationPersistenceRecord,
  type PresenterQueryPersistenceRepository
} from "./index.js";

const writeOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_1",
    tenantId: "tenant_1"
  },
  intent: "update" as const
};

const readOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId: "tenant_1"
  }
};

const theme = {
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
} as const;

const slide = {
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
} as const;

const outputTarget = {
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display-main"
} as const;

const presentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    createdAt: "2026-06-21T14:00:00.000Z",
    mediaCues: [],
    presentationId: "presentation_1",
    serviceId: "service_1",
    slides: [slide],
    tenantId: "tenant_1",
    theme,
    title: "Sunday Worship",
    updatedAt: "2026-06-21T14:05:00.000Z"
  });

describe("Presenter repository contracts", () => {
  it("requires actor, request, and tenant scope for Presenter persistence operations", () => {
    expect(PresenterPersistenceReadOptionsSchema.parse(readOptions).context.actorId).toBe(
      "actor_1"
    );
    expect(PresenterPersistenceWriteOptionsSchema.parse(writeOptions).intent).toBe(
      "update"
    );

    expect(() =>
      PresenterPersistenceReadOptionsSchema.parse({
        context: {
          requestId: "request_read",
          tenantId: "tenant_1"
        }
      })
    ).toThrow("Presenter persistence read operations require an actor ID.");

    expect(() =>
      PresenterPersistenceWriteOptionsSchema.parse({
        context: {
          requestId: "request_write",
          tenantId: "tenant_1"
        },
        intent: "update"
      })
    ).toThrow("Presenter persistence write operations require an actor ID.");
  });

  it("validates saved presentation aggregates and tenant consistency", () => {
    expect(
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: presentation,
        options: writeOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          slides: [
            {
              ...slide,
              tenantId: "tenant_2"
            }
          ]
        },
        options: writeOptions
      })
    ).toThrow("Presenter slide tenant must match presentation tenant.");

    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          mediaCues: [
            {
              label: "Missing slide cue",
              mediaAssetRef: "asset_1",
              mediaCueId: "cue_1",
              playbackHint: "manual",
              presentationId: "presentation_1",
              slideId: "missing_slide",
              tenantId: "tenant_1"
            }
          ]
        },
        options: writeOptions
      })
    ).toThrow("Presenter media cue must reference an existing slide.");
  });

  it("validates query, theme, output target, and slide mutation operation shapes", () => {
    expect(
      GetPresenterPresentationPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(
      ListPresenterOutputTargetsPersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      }).input.presentationId
    ).toBe("presentation_1");

    expect(
      SavePresenterThemePersistenceOperationSchema.parse({
        input: theme,
        options: {
          ...writeOptions,
          intent: "create"
        }
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

    expect(
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: {
            ...slide,
            order: 1,
            slideId: "slide_2",
            title: "Announcements"
          }
        },
        options: writeOptions
      }).input.slide.slideId
    ).toBe("slide_2");

    expect(() =>
      ReorderPresenterSlidesPersistenceOperationSchema.parse({
        input: {
          orderedSlideIds: ["slide_1", "slide_1"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).toThrow("Presenter slide order cannot contain duplicate slide IDs.");
  });

  it("rejects raw media, OBS, vendor credential, and secret-like fields", () => {
    expect(() =>
      SavePresenterPresentationPersistenceOperationSchema.parse({
        input: {
          ...presentation,
          rawMediaPayload: "base64"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SetPresenterOutputTargetPersistenceOperationSchema.parse({
        input: {
          obsScene: "main",
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      AddPresenterSlidePersistenceOperationSchema.parse({
        input: {
          presentationId: "presentation_1",
          slide: {
            ...slide,
            bibleApiKey: "secret"
          }
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      SavePresenterThemePersistenceOperationSchema.parse({
        input: {
          ...theme,
          vendorToken: "secret"
        },
        options: writeOptions
      })
    ).toThrow("Unrecognized key");
  });

  it("defines adapter-free Presenter persistence repository interfaces", async () => {
    const queryRepository: PresenterQueryPersistenceRepository = {
      getPresentation: (operation) =>
        Promise.resolve(
          operation.input.presentationId === presentation.presentationId ? presentation : null
        ),
      getPresentationForService: (operation) =>
        Promise.resolve(
          operation.input.serviceId === presentation.serviceId ? presentation : null
        ),
      listOutputTargets: () => Promise.resolve([outputTarget]),
      listPresenterThemes: () => Promise.resolve([theme]),
      listPresentations: (operation) =>
        Promise.resolve(
          operation.input.filter?.serviceId === undefined ||
            operation.input.filter.serviceId === presentation.serviceId
            ? [presentation]
            : []
        )
    };
    const commandRepository: PresenterCommandPersistenceRepository = {
      addSlide: (operation) => Promise.resolve(operation.input.slide),
      removeSlide: () => Promise.resolve(presentation),
      reorderSlides: (operation) =>
        Promise.resolve(
          operation.input.orderedSlideIds.map((slideId, order) =>
            PresenterSlidePersistenceRecordSchema.parse({
              ...slide,
              order,
              slideId
            })
          )
        ),
      savePresentation: (operation) => Promise.resolve(operation.input),
      savePresenterTheme: (operation) => Promise.resolve(operation.input),
      setOutputTarget: (operation) => Promise.resolve(operation.input.outputTarget),
      updateSlide: (operation) => Promise.resolve(operation.input.slide)
    };

    await expect(
      queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual(presentation);

    await expect(
      commandRepository.savePresentation({
        input: presentation,
        options: {
          ...writeOptions,
          intent: "update"
        }
      })
    ).resolves.toEqual(presentation);
  });
});
