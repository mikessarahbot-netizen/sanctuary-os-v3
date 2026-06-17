import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import type {
  OutputTarget,
  Presentation,
  PresenterTheme,
  Slide
} from "../../domain/presenter/index.js";
import {
  OutputTargetSchema,
  PresentationSchema,
  PresenterThemeSchema,
  SlideSchema
} from "../../domain/presenter/index.js";
import { createPresenterGraphqlResolvers } from "../../graphql/presenter.js";
import {
  AddPresenterSlideCommandSchema,
  CreatePresentationFromServiceCommandSchema,
  GetPresenterPresentationQuerySchema,
  ListPresenterPresentationsQuerySchema,
  ListPresenterThemesQuerySchema,
  RemovePresenterSlideCommandSchema,
  ReorderPresenterSlidesCommandSchema,
  SetPresenterOutputTargetCommandSchema,
  UpdatePresentationCommandSchema,
  UpdatePresenterSlideCommandSchema
} from "./contracts.js";
import { createInMemoryPresenterServices } from "./composition.js";

const worshipLeader: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const viewer: AuthenticatedActor = {
  actorId: "actor_viewer",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const theme: PresenterTheme = PresenterThemeSchema.parse({
  colors: {
    background: "#101820",
    lowerThirdBackground: "#123456",
    lowerThirdText: "#ffffff",
    text: "#ffffff"
  },
  lowerThird: {
    maxLines: 2,
    placement: "bottom-center"
  },
  name: "Sunday Theme",
  spacing: {
    blockGap: 24,
    slidePadding: 64
  },
  tenantId: "tenant_1",
  themeId: "theme_1",
  typography: {
    baseFontSize: 48,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter",
    lineHeight: 1.2
  }
});

const otherTenantTheme: PresenterTheme = PresenterThemeSchema.parse({
  ...theme,
  name: "Other Tenant Theme",
  tenantId: "tenant_2",
  themeId: "theme_2"
});

const slide: Slide = SlideSchema.parse({
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

const secondSlide: Slide = SlideSchema.parse({
  blocks: [
    {
      alignment: "center",
      blockId: "block_2",
      kind: "text",
      text: "Song One",
      textStyle: "body"
    }
  ],
  layout: "lyrics",
  order: 1,
  presentationId: "presentation_1",
  slideId: "slide_2",
  tenantId: "tenant_1",
  title: "Song One"
});

const presentation: Presentation = PresentationSchema.parse({
  createdAt: "2026-06-21T14:00:00.000Z",
  mediaCues: [],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [slide, secondSlide],
  tenantId: "tenant_1",
  theme,
  title: "Sunday Worship Slides",
  updatedAt: "2026-06-21T14:05:00.000Z"
});

const otherTenantPresentation: Presentation = PresentationSchema.parse({
  ...presentation,
  presentationId: "presentation_2",
  serviceId: "service_2",
  slides: [
    {
      ...slide,
      presentationId: "presentation_2",
      slideId: "slide_3",
      tenantId: "tenant_2"
    }
  ],
  tenantId: "tenant_2",
  theme: otherTenantTheme,
  title: "Other Tenant Slides"
});

const outputTarget: OutputTarget = OutputTargetSchema.parse({
  confidenceOutputEnabled: false,
  displayName: "Main Projector",
  outputTargetId: "output_1",
  safeBlanked: true,
  targetKind: "main",
  tenantId: "tenant_1",
  windowRef: "display-main"
});

describe("createInMemoryPresenterServices", () => {
  it("tenant-scopes presentation and theme queries", async () => {
    const services = createInMemoryPresenterServices({
      seed: {
        presentations: [presentation, otherTenantPresentation],
        themes: [theme, otherTenantTheme]
      }
    });

    await expect(
      services.presenterQueryService.presentations(
        ListPresenterPresentationsQuerySchema.parse({
          actor: worshipLeader,
          input: {},
          requestId: "request_list"
        })
      )
    ).resolves.toEqual([presentation]);

    await expect(
      services.presenterQueryService.presentation(
        GetPresenterPresentationQuerySchema.parse({
          actor: worshipLeader,
          input: {
            presentationId: "presentation_2"
          },
          requestId: "request_cross_tenant"
        })
      )
    ).resolves.toBeNull();

    await expect(
      services.presenterQueryService.presenterThemes(
        ListPresenterThemesQuerySchema.parse({
          actor: worshipLeader,
          input: {},
          requestId: "request_themes"
        })
      )
    ).resolves.toEqual([theme]);
  });

  it("enforces Presenter write roles in services", async () => {
    const services = createInMemoryPresenterServices({
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      services.presenterCommandService.updatePresentation(
        UpdatePresentationCommandSchema.parse({
          actor: viewer,
          input: {
            presentationId: "presentation_1",
            title: "Viewer Update"
          },
          requestId: "request_forbidden"
        })
      )
    ).rejects.toThrow("Actor is not allowed to change Presenter presentations.");
  });

  it("creates a presentation from a service without mutating Planning state", async () => {
    const services = createInMemoryPresenterServices({
      clock: () => "2026-06-21T15:00:00.000Z",
      ids: {
        presentationId: () => "presentation_created",
        slideBlockId: () => "block_created",
        slideId: () => "slide_created",
        themeId: () => "theme_created"
      },
      seed: {
        themes: [theme]
      }
    });

    await expect(
      services.presenterCommandService.createPresentationFromService(
        CreatePresentationFromServiceCommandSchema.parse({
          actor: worshipLeader,
          input: {
            serviceId: "service_1",
            title: "Imported Service Slides"
          },
          requestId: "request_create"
        })
      )
    ).resolves.toMatchObject({
      presentationId: "presentation_created",
      serviceId: "service_1",
      slides: [
        {
          presentationId: "presentation_created",
          slideId: "slide_created",
          tenantId: "tenant_1",
          title: "Imported Service Slides"
        }
      ],
      tenantId: "tenant_1",
      title: "Imported Service Slides"
    });

    expect(services.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "createPresentationFromService",
        requestId: "request_create",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("adds, reorders, updates, and removes slides with validated presentation state", async () => {
    const services = createInMemoryPresenterServices({
      clock: () => "2026-06-21T15:00:00.000Z",
      ids: {
        slideId: () => "slide_added"
      },
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    const addedSlide = await services.presenterCommandService.addSlide(
      AddPresenterSlideCommandSchema.parse({
        actor: worshipLeader,
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: {
            blocks: [
              {
                alignment: "center",
                blockId: "block_added",
                kind: "text",
                text: "New Slide",
                textStyle: "body"
              }
            ],
            layout: "content",
            title: "New Slide"
          }
        },
        requestId: "request_add"
      })
    );

    expect(addedSlide).toMatchObject({
      order: 1,
      presentationId: "presentation_1",
      slideId: "slide_added",
      tenantId: "tenant_1"
    });

    await expect(
      services.presenterCommandService.reorderSlides(
        ReorderPresenterSlidesCommandSchema.parse({
          actor: worshipLeader,
          input: {
            orderedSlideIds: ["slide_2", "slide_added", "slide_1"],
            presentationId: "presentation_1"
          },
          requestId: "request_reorder"
        })
      )
    ).resolves.toMatchObject([
      {
        order: 0,
        slideId: "slide_2"
      },
      {
        order: 1,
        slideId: "slide_added"
      },
      {
        order: 2,
        slideId: "slide_1"
      }
    ]);

    await expect(
      services.presenterCommandService.updateSlide(
        UpdatePresenterSlideCommandSchema.parse({
          actor: worshipLeader,
          input: {
            presentationId: "presentation_1",
            slide: {
              ...addedSlide,
              notes: "Keep this concise.",
              order: 1,
              title: "Updated Slide"
            }
          },
          requestId: "request_update_slide"
        })
      )
    ).resolves.toMatchObject({
      notes: "Keep this concise.",
      slideId: "slide_added",
      title: "Updated Slide"
    });

    await expect(
      services.presenterCommandService.removeSlide(
        RemovePresenterSlideCommandSchema.parse({
          actor: worshipLeader,
          input: {
            confirmationIntent: {
              confirmed: true,
              reason: "Remove rehearsal-only slide."
            },
            presentationId: "presentation_1",
            slideId: "slide_added"
          },
          requestId: "request_remove"
        })
      )
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
  });

  it("rejects tenant-mismatched output target commands", async () => {
    const services = createInMemoryPresenterServices({
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      services.presenterCommandService.setOutputTarget(
        SetPresenterOutputTargetCommandSchema.parse({
          actor: worshipLeader,
          input: {
            outputTarget: {
              ...outputTarget,
              outputTargetId: "output_cross_tenant",
              tenantId: "tenant_2"
            },
            presentationId: "presentation_1"
          },
          requestId: "request_output"
        })
      )
    ).rejects.toThrow("Presenter output target tenant mismatch.");
  });

  it("composes GraphQL resolver shells with real in-memory services", async () => {
    const services = createInMemoryPresenterServices({
      seed: {
        outputTargets: [outputTarget],
        presentations: [presentation],
        themes: [theme]
      }
    });
    const resolvers = createPresenterGraphqlResolvers(services);

    await expect(
      resolvers.Query.presentationForService(
        undefined,
        {
          serviceId: "service_1"
        },
        {
          actor: worshipLeader,
          requestId: "request_graphql"
        }
      )
    ).resolves.toEqual(presentation);

    await expect(
      resolvers.Mutation.setOutputTarget(
        undefined,
        {
          input: {
            outputTarget,
            presentationId: "presentation_1"
          }
        },
        {
          actor: worshipLeader,
          requestId: "request_graphql_output"
        }
      )
    ).resolves.toEqual(outputTarget);
  });
});
