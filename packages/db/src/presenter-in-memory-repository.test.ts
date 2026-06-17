import { describe, expect, it } from "vitest";
import {
  createInMemoryPresenterPersistenceRepositoryAdapter,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  type PresenterPersistenceReadOptions,
  type PresenterPersistenceWriteOptions,
  type PresenterPresentationPersistenceRecord
} from "./index.js";

const readOptions: PresenterPersistenceReadOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId: "tenant_1"
  }
};

const writeOptions: PresenterPersistenceWriteOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_write",
    tenantId: "tenant_1"
  },
  intent: "update"
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

const otherTenantTheme = {
  ...theme,
  name: "Other Tenant Theme",
  tenantId: "tenant_2",
  themeId: "theme_2"
} as const;

const welcomeSlide = {
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

const messageSlide = {
  ...welcomeSlide,
  blocks: [
    {
      alignment: "center",
      blockId: "block_2",
      kind: "text",
      text: "Message",
      textStyle: "heading"
    }
  ],
  order: 1,
  slideId: "slide_2",
  title: "Message"
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

const otherTenantOutputTarget = {
  ...outputTarget,
  displayName: "Other Projector",
  outputTargetId: "output_2",
  tenantId: "tenant_2"
} as const;

const presentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    createdAt: "2026-06-21T14:00:00.000Z",
    mediaCues: [],
    presentationId: "presentation_1",
    serviceId: "service_1",
    slides: [welcomeSlide, messageSlide],
    tenantId: "tenant_1",
    theme,
    title: "Sunday Worship",
    updatedAt: "2026-06-21T14:05:00.000Z"
  });

const otherTenantPresentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    ...presentation,
    presentationId: "presentation_2",
    serviceId: "service_2",
    slides: [
      {
        ...welcomeSlide,
        presentationId: "presentation_2",
        slideId: "slide_other",
        tenantId: "tenant_2"
      }
    ],
    tenantId: "tenant_2",
    theme: otherTenantTheme
  });

const createAdapter = () =>
  createInMemoryPresenterPersistenceRepositoryAdapter({
    outputTargets: [outputTarget, otherTenantOutputTarget],
    presentationOutputTargets: {
      presentation_1: ["output_1"],
      presentation_2: ["output_2"]
    },
    presentations: [presentation, otherTenantPresentation],
    themes: [theme, otherTenantTheme]
  });

describe("createInMemoryPresenterPersistenceRepositoryAdapter", () => {
  it("tenant-scopes presentation, theme, and output target queries", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.queryRepository.listPresentations({
        input: {},
        options: readOptions
      })
    ).resolves.toMatchObject([
      {
        presentationId: "presentation_1",
        tenantId: "tenant_1"
      }
    ]);

    await expect(
      adapter.queryRepository.getPresentation({
        input: {
          presentationId: "presentation_2"
        },
        options: readOptions
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryRepository.getPresentationForService({
        input: {
          serviceId: "service_1"
        },
        options: readOptions
      })
    ).resolves.toMatchObject({
      presentationId: "presentation_1"
    });

    await expect(
      adapter.queryRepository.listPresenterThemes({
        input: {
          filter: {
            query: "standard"
          }
        },
        options: readOptions
      })
    ).resolves.toMatchObject([
      {
        themeId: "theme_1",
        tenantId: "tenant_1"
      }
    ]);

    await expect(
      adapter.queryRepository.listOutputTargets({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toMatchObject([
      {
        outputTargetId: "output_1",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("validates operation shape and records audit metadata for reads and writes", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.queryRepository.listPresentations({
        input: {},
        options: {
          context: {
            requestId: "request_without_actor",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow("Presenter persistence read operations require an actor ID.");

    await adapter.commandRepository.savePresenterTheme({
      input: {
        ...theme,
        name: "Sunday Bright",
        themeId: "theme_3"
      },
      options: {
        ...writeOptions,
        intent: "create",
        transaction: {
          transactionId: "transaction_1"
        }
      }
    });

    expect(adapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        intent: "create",
        operationName: "savePresenterTheme",
        requestId: "request_write",
        tenantId: "tenant_1",
        transactionId: "transaction_1"
      }
    ]);
  });

  it("saves presentations, themes, and output targets only inside the operation tenant", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.commandRepository.savePresentation({
        input: {
          ...presentation,
          title: "Updated Worship"
        },
        options: writeOptions
      })
    ).resolves.toMatchObject({
      title: "Updated Worship"
    });

    await expect(
      adapter.commandRepository.savePresentation({
        input: otherTenantPresentation,
        options: writeOptions
      })
    ).rejects.toThrow("Presenter presentation tenant must match operation tenant.");

    await expect(
      adapter.commandRepository.setOutputTarget({
        input: {
          outputTarget: {
            ...outputTarget,
            outputTargetId: "output_3",
            safeBlanked: false
          },
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toMatchObject({
      outputTargetId: "output_3",
      safeBlanked: false
    });
    expect(adapter.readPresentationOutputTargetIds("presentation_1")).toEqual([
      "output_1",
      "output_3"
    ]);

    await expect(
      adapter.commandRepository.setOutputTarget({
        input: {
          outputTarget: otherTenantOutputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).rejects.toThrow("Presenter output target tenant must match operation tenant.");
  });

  it("adds, updates, reorders, and removes slides while preserving normalized order", async () => {
    const adapter = createAdapter();
    const announcementSlide = PresenterSlidePersistenceRecordSchema.parse({
      ...welcomeSlide,
      blocks: [
        {
          alignment: "center",
          blockId: "block_3",
          kind: "text",
          text: "Announcements",
          textStyle: "body"
        }
      ],
      order: 4,
      slideId: "slide_3",
      title: "Announcements"
    });

    await expect(
      adapter.commandRepository.addSlide({
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: announcementSlide
        },
        options: writeOptions
      })
    ).resolves.toMatchObject({
      order: 1,
      slideId: "slide_3"
    });

    await expect(
      adapter.commandRepository.updateSlide({
        input: {
          presentationId: "presentation_1",
          slide: {
            ...announcementSlide,
            notes: "Read before sermon",
            order: 99
          }
        },
        options: writeOptions
      })
    ).resolves.toMatchObject({
      notes: "Read before sermon",
      order: 1
    });

    await expect(
      adapter.commandRepository.reorderSlides({
        input: {
          orderedSlideIds: ["slide_2", "slide_3", "slide_1"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toMatchObject([
      {
        order: 0,
        slideId: "slide_2"
      },
      {
        order: 1,
        slideId: "slide_3"
      },
      {
        order: 2,
        slideId: "slide_1"
      }
    ]);

    await expect(
      adapter.commandRepository.removeSlide({
        input: {
          presentationId: "presentation_1",
          slideId: "slide_3"
        },
        options: {
          ...writeOptions,
          intent: "destructive-confirmed"
        }
      })
    ).resolves.toMatchObject({
      slides: [
        {
          order: 0,
          slideId: "slide_2"
        },
        {
          order: 1,
          slideId: "slide_1"
        }
      ]
    });

    await expect(
      adapter.commandRepository.reorderSlides({
        input: {
          orderedSlideIds: ["slide_1"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).rejects.toThrow("Presenter slide order must include every slide exactly once.");
  });

  it("returns defensive copies from repository operations and adapter inspection helpers", async () => {
    const adapter = createAdapter();
    const fetchedPresentation = await adapter.queryRepository.getPresentation({
      input: {
        presentationId: "presentation_1"
      },
      options: readOptions
    });

    if (fetchedPresentation === null) {
      throw new Error("Expected seeded presentation.");
    }

    const fetchedSlide = fetchedPresentation.slides.at(0);
    const fetchedBlock = fetchedSlide?.blocks.at(0);

    if (fetchedBlock === undefined) {
      throw new Error("Expected seeded slide block.");
    }

    fetchedBlock.blockId = "mutated_block";

    const refetchedPresentation = await adapter.queryRepository.getPresentation({
      input: {
        presentationId: "presentation_1"
      },
      options: readOptions
    });

    expect(refetchedPresentation?.slides[0]?.blocks[0]?.blockId).toBe("block_1");

    const inspectedPresentations = adapter.readPresentations();
    const inspectedSlide = inspectedPresentations[0]?.slides[0];

    if (inspectedSlide === undefined) {
      throw new Error("Expected inspected slide.");
    }

    inspectedSlide.slideId = "mutated_slide";

    expect(adapter.readPresentations()[0]?.slides[0]?.slideId).toBe("slide_1");
  });
});
