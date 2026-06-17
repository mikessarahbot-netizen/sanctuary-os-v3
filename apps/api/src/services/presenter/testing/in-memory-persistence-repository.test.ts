import { describe, expect, it } from "vitest";
import type {
  PresenterOutputTargetPersistenceRecord,
  PresenterPersistenceReadOptions,
  PresenterPersistenceWriteOptions,
  PresenterPresentationPersistenceRecord,
  PresenterSlidePersistenceRecord,
  PresenterThemePersistenceRecord
} from "@sanctuary-os/db";
import {
  PresenterOutputTargetPersistenceRecordSchema,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  PresenterThemePersistenceRecordSchema
} from "@sanctuary-os/db";
import { createInMemoryPresenterPersistenceRepositoryAdapter } from "./in-memory-persistence-repository.js";

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

const otherTenantReadOptions: PresenterPersistenceReadOptions = {
  context: {
    actorId: "actor_2",
    requestId: "request_other",
    tenantId: "tenant_2"
  }
};

const theme: PresenterThemePersistenceRecord = PresenterThemePersistenceRecordSchema.parse({
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
});

const otherTheme: PresenterThemePersistenceRecord = PresenterThemePersistenceRecordSchema.parse({
  ...theme,
  name: "Other Tenant Theme",
  tenantId: "tenant_2",
  themeId: "theme_2"
});

const slideOne: PresenterSlidePersistenceRecord =
  PresenterSlidePersistenceRecordSchema.parse({
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
  });

const slideTwo: PresenterSlidePersistenceRecord =
  PresenterSlidePersistenceRecordSchema.parse({
    ...slideOne,
    blocks: [
      {
        alignment: "center",
        blockId: "block_2",
        kind: "text",
        text: "Announcements",
        textStyle: "body"
      }
    ],
    layout: "content",
    order: 1,
    slideId: "slide_2",
    title: "Announcements"
  });

const presentation: PresenterPresentationPersistenceRecord =
  PresenterPresentationPersistenceRecordSchema.parse({
    createdAt: "2026-06-21T14:00:00.000Z",
    mediaCues: [],
    presentationId: "presentation_1",
    serviceId: "service_1",
    slides: [slideOne, slideTwo],
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
        ...slideOne,
        presentationId: "presentation_2",
        slideId: "slide_3",
        tenantId: "tenant_2"
      }
    ],
    tenantId: "tenant_2",
    theme: otherTheme,
    title: "Other Tenant Worship"
  });

const outputTarget: PresenterOutputTargetPersistenceRecord =
  PresenterOutputTargetPersistenceRecordSchema.parse({
    confidenceOutputEnabled: false,
    displayName: "Main Projector",
    outputTargetId: "output_1",
    safeBlanked: true,
    targetKind: "main",
    tenantId: "tenant_1",
    windowRef: "display-main"
  });

describe("createInMemoryPresenterPersistenceRepositoryAdapter", () => {
  it("serves tenant-scoped Presenter queries and records actor/request metadata", async () => {
    const adapter = createInMemoryPresenterPersistenceRepositoryAdapter({
      outputTargets: [outputTarget],
      presentationOutputTargets: {
        presentation_1: ["output_1"]
      },
      presentations: [presentation, otherTenantPresentation],
      themes: [theme, otherTheme]
    });

    await expect(
      adapter.queryRepository.listPresentations({
        input: {
          filter: {
            serviceId: "service_1"
          }
        },
        options: readOptions
      })
    ).resolves.toEqual([presentation]);

    await expect(
      adapter.queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual(presentation);

    await expect(
      adapter.queryRepository.getPresentationForService({
        input: {
          serviceId: "service_1"
        },
        options: readOptions
      })
    ).resolves.toEqual(presentation);

    await expect(
      adapter.queryRepository.listPresenterThemes({
        input: {
          filter: {
            query: "sunday"
          }
        },
        options: readOptions
      })
    ).resolves.toEqual([theme]);

    await expect(
      adapter.queryRepository.listOutputTargets({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual([outputTarget]);

    await expect(
      adapter.queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: otherTenantReadOptions
      })
    ).resolves.toBeNull();

    expect(adapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listPresentations",
        requestId: "request_read",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "getPresentation",
        requestId: "request_read",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "getPresentationForService",
        requestId: "request_read",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listPresenterThemes",
        requestId: "request_read",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listOutputTargets",
        requestId: "request_read",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_2",
        operationName: "getPresentation",
        requestId: "request_other",
        tenantId: "tenant_2"
      }
    ]);
  });

  it("supports saved presentation, theme, output target, and slide mutations", async () => {
    const adapter = createInMemoryPresenterPersistenceRepositoryAdapter({
      presentations: [presentation],
      themes: [theme]
    });
    const teachingTheme: PresenterThemePersistenceRecord =
      PresenterThemePersistenceRecordSchema.parse({
        ...theme,
        name: "Teaching Theme",
        themeId: "theme_teaching"
      });
    const newSlide: PresenterSlidePersistenceRecord =
      PresenterSlidePersistenceRecordSchema.parse({
        ...slideOne,
        order: 2,
        slideId: "slide_3",
        title: "Prayer"
      });

    await expect(
      adapter.commandRepository.savePresenterTheme({
        input: teachingTheme,
        options: {
          ...writeOptions,
          intent: "create"
        }
      })
    ).resolves.toEqual(teachingTheme);

    await expect(
      adapter.commandRepository.addSlide({
        input: {
          afterSlideId: "slide_2",
          presentationId: "presentation_1",
          slide: newSlide
        },
        options: writeOptions
      })
    ).resolves.toEqual({
      ...newSlide,
      order: 2
    });

    const updatedSlide: PresenterSlidePersistenceRecord =
      PresenterSlidePersistenceRecordSchema.parse({
        ...newSlide,
        notes: "Keep this slide brief.",
        order: 99,
        title: "Prayer Focus"
      });

    await expect(
      adapter.commandRepository.updateSlide({
        input: {
          presentationId: "presentation_1",
          slide: updatedSlide
        },
        options: writeOptions
      })
    ).resolves.toEqual({
      ...updatedSlide,
      order: 2
    });

    await expect(
      adapter.commandRepository.reorderSlides({
        input: {
          orderedSlideIds: ["slide_3", "slide_1", "slide_2"],
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toMatchObject([
      {
        order: 0,
        slideId: "slide_3"
      },
      {
        order: 1,
        slideId: "slide_1"
      },
      {
        order: 2,
        slideId: "slide_2"
      }
    ]);

    await expect(
      adapter.commandRepository.setOutputTarget({
        input: {
          outputTarget,
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).resolves.toEqual(outputTarget);

    await expect(
      adapter.queryRepository.listOutputTargets({
        input: {
          presentationId: "presentation_1"
        },
        options: readOptions
      })
    ).resolves.toEqual([outputTarget]);

    await expect(
      adapter.commandRepository.removeSlide({
        input: {
          presentationId: "presentation_1",
          slideId: "slide_2"
        },
        options: {
          ...writeOptions,
          intent: "destructive-confirmed"
        }
      })
    ).resolves.toMatchObject({
      presentationId: "presentation_1",
      slides: [
        {
          order: 0,
          slideId: "slide_3"
        },
        {
          order: 1,
          slideId: "slide_1"
        }
      ]
    });

    const savedPresentation = PresenterPresentationPersistenceRecordSchema.parse({
      ...presentation,
      presentationId: "presentation_saved",
      serviceId: "service_saved",
      slides: [
        {
          ...slideOne,
          presentationId: "presentation_saved",
          slideId: "slide_saved"
        }
      ],
      title: "Saved Presentation"
    });

    await expect(
      adapter.commandRepository.savePresentation({
        input: savedPresentation,
        options: writeOptions
      })
    ).resolves.toEqual(savedPresentation);

    expect(adapter.readPresentationOutputTargetIds("presentation_1")).toEqual(["output_1"]);
    expect(adapter.readOperations().map((operation) => operation.operationName)).toEqual([
      "savePresenterTheme",
      "addSlide",
      "updateSlide",
      "reorderSlides",
      "setOutputTarget",
      "listOutputTargets",
      "removeSlide",
      "savePresentation"
    ]);
  });

  it("returns defensive copies from reads and debug helpers", async () => {
    const adapter = createInMemoryPresenterPersistenceRepositoryAdapter({
      presentations: [presentation]
    });

    const firstRead = await adapter.queryRepository.getPresentation({
      input: {
        presentationId: "presentation_1"
      },
      options: readOptions
    });

    if (firstRead === null) {
      throw new Error("Expected seeded presentation.");
    }

    firstRead.slides[0]?.blocks.push({
      alignment: "center",
      blockId: "mutated_block",
      kind: "text",
      text: "Mutated",
      textStyle: "body"
    });

    const secondRead = await adapter.queryRepository.getPresentation({
      input: {
        presentationId: "presentation_1"
      },
      options: readOptions
    });

    expect(secondRead?.slides[0]?.blocks).toHaveLength(1);

    const debugRead = adapter.readPresentations();
    debugRead[0]?.slides[0]?.blocks.push({
      alignment: "center",
      blockId: "mutated_debug_block",
      kind: "text",
      text: "Mutated again",
      textStyle: "body"
    });

    expect(adapter.readPresentations()[0]?.slides[0]?.blocks).toHaveLength(1);
  });

  it("rejects invalid operation scope and out-of-scope payload fields", async () => {
    const adapter = createInMemoryPresenterPersistenceRepositoryAdapter({
      presentations: [presentation]
    });

    await expect(
      adapter.queryRepository.listPresentations({
        input: {},
        options: {
          context: {
            requestId: "request_missing_actor",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow("Presenter persistence read operations require an actor ID.");

    await expect(
      adapter.commandRepository.savePresentation({
        input: {
          ...presentation,
          tenantId: "tenant_2"
        },
        options: writeOptions
      })
    ).rejects.toThrow("Presenter slide tenant must match presentation tenant.");

    const presentationWithRawMediaPayload: unknown = {
      ...presentation,
      rawMediaPayload: "base64"
    };

    await expect(
      adapter.commandRepository.savePresentation(
        {
          input: presentationWithRawMediaPayload,
          options: writeOptions
        } as Parameters<typeof adapter.commandRepository.savePresentation>[0]
      )
    ).rejects.toThrow("Unrecognized key");

    await expect(
      adapter.commandRepository.setOutputTarget({
        input: {
          outputTarget: {
            ...outputTarget,
            tenantId: "tenant_2"
          },
          presentationId: "presentation_1"
        },
        options: writeOptions
      })
    ).rejects.toThrow("Presenter output target tenant must match operation tenant.");
  });
});
