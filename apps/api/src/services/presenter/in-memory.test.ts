import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  OutputTargetSchema,
  PresentationSchema,
  PresenterOutputTargetIdSchema,
  PresenterServiceIdSchema,
  PresenterSlideBlockIdSchema,
  PresenterTenantIdSchema,
  PresenterThemeSchema,
  SlideSchema,
  type OutputTarget,
  type Presentation,
  type PresenterTheme,
  type Slide
} from "../../domain/presenter/index.js";
import { createInMemoryEventPublisher } from "../../events/index.js";
import { createPresenterGraphqlResolvers } from "../../graphql/presenter.js";
import { createInMemoryPresenterServicesAdapter } from "./in-memory.js";

const worshipLeader: AuthenticatedActor = {
  actorId: "actor_worship_leader",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const viewer: AuthenticatedActor = {
  actorId: "actor_viewer",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "actor_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const theme: PresenterTheme = PresenterThemeSchema.parse({
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

const alternateTheme: PresenterTheme = PresenterThemeSchema.parse({
  ...theme,
  name: "Teaching Theme",
  themeId: "theme_2"
});

const slideOne: Slide = SlideSchema.parse({
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

const slideTwo: Slide = SlideSchema.parse({
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
  presentationId: "presentation_1",
  slideId: "slide_2",
  tenantId: "tenant_1",
  title: "Announcements"
});

const presentation: Presentation = PresentationSchema.parse({
  createdAt: timestamp,
  mediaCues: [],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [slideOne, slideTwo],
  tenantId: "tenant_1",
  theme,
  title: "Sunday Worship",
  updatedAt: timestamp
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

describe("createInMemoryPresenterServicesAdapter", () => {
  it("creates service-linked presentations with deterministic IDs and default tenant theme", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      clock: () => timestamp,
      ids: {
        presentationId: () => "presentation_created",
        slideBlockId: () => "block_created",
        slideId: () => "slide_created"
      }
    });

    await expect(
      adapter.commandService.createPresentationFromService({
        actor: worshipLeader,
        input: {
          serviceId: PresenterServiceIdSchema.parse("service_created"),
          title: "Created Slides"
        },
        requestId: "request_create"
      })
    ).resolves.toMatchObject({
      presentationId: "presentation_created",
      serviceId: "service_created",
      tenantId: "tenant_1",
      title: "Created Slides"
    });

    expect(adapter.readPresentations()).toHaveLength(1);
    expect(adapter.readThemes()).toHaveLength(1);
    expect(adapter.readPresentations()[0]?.slides[0]).toMatchObject({
      slideId: "slide_created",
      title: "Created Slides"
    });
    expect(adapter.readPresentations()[0]?.slides[0]?.blocks[0]).toMatchObject({
      blockId: "block_created"
    });
  });

  it("keeps reads tenant-scoped and returns null for cross-tenant presentation lookups", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      adapter.queryService.presentation({
        actor: otherTenantLeader,
        input: {
          presentationId: "presentation_1"
        },
        requestId: "request_other"
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryService.presentations({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_other"
      })
    ).resolves.toEqual([]);
  });

  it("allows read roles but rejects viewer mutations in the service layer", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      adapter.queryService.presentationForService({
        actor: viewer,
        input: {
          serviceId: PresenterServiceIdSchema.parse("service_1")
        },
        requestId: "request_viewer"
      })
    ).resolves.toEqual(presentation);

    await expect(
      adapter.commandService.updatePresentation({
        actor: viewer,
        input: {
          presentationId: "presentation_1",
          title: "Viewer Edit"
        },
        requestId: "request_viewer"
      })
    ).rejects.toThrow("Actor is not allowed to change Presenter resources.");
  });

  it("mutates slides through add, reorder, update, and remove commands", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      clock: () => "2026-06-21T14:05:00.000Z",
      ids: {
        slideId: () => "slide_3"
      },
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      adapter.commandService.addSlide({
        actor: worshipLeader,
        input: {
          afterSlideId: "slide_1",
          presentationId: "presentation_1",
          slide: {
            blocks: [
              {
                alignment: "center",
                blockId: PresenterSlideBlockIdSchema.parse("block_3"),
                kind: "text",
                text: "Message",
                textStyle: "heading"
              }
            ],
            layout: "content",
            title: "Message"
          }
        },
        requestId: "request_add"
      })
    ).resolves.toMatchObject({
      order: 1,
      slideId: "slide_3",
      tenantId: "tenant_1"
    });

    await expect(
      adapter.commandService.reorderSlides({
        actor: worshipLeader,
        input: {
          orderedSlideIds: ["slide_2", "slide_3", "slide_1"],
          presentationId: "presentation_1"
        },
        requestId: "request_reorder"
      })
    ).resolves.toMatchObject([
      { order: 0, slideId: "slide_2" },
      { order: 1, slideId: "slide_3" },
      { order: 2, slideId: "slide_1" }
    ]);

    await expect(
      adapter.commandService.updateSlide({
        actor: worshipLeader,
        input: {
          presentationId: "presentation_1",
          slide: {
            ...slideOne,
            notes: "Operator note",
            title: "Opening Welcome"
          }
        },
        requestId: "request_update_slide"
      })
    ).resolves.toMatchObject({
      notes: "Operator note",
      order: 2,
      title: "Opening Welcome"
    });

    await expect(
      adapter.commandService.removeSlide({
        actor: worshipLeader,
        input: {
          confirmationIntent: {
            confirmed: true,
            reason: "Duplicate slide"
          },
          presentationId: "presentation_1",
          slideId: "slide_3"
        },
        requestId: "request_remove"
      })
    ).resolves.toMatchObject({
      slides: [
        { order: 0, slideId: "slide_2" },
        { order: 1, slideId: "slide_1" }
      ]
    });
  });

  it("validates slide order, tenant, and output target mutations", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      seed: {
        outputTargets: [outputTarget],
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      adapter.commandService.reorderSlides({
        actor: worshipLeader,
        input: {
          orderedSlideIds: ["slide_1"],
          presentationId: "presentation_1"
        },
        requestId: "request_bad_order"
      })
    ).rejects.toThrow("Presenter slide order must include every slide exactly once.");

    await expect(
      adapter.commandService.setOutputTarget({
        actor: worshipLeader,
        input: {
          outputTarget: {
            ...outputTarget,
            outputTargetId: PresenterOutputTargetIdSchema.parse("output_cross_tenant"),
            tenantId: PresenterTenantIdSchema.parse("tenant_2")
          },
          presentationId: "presentation_1"
        },
        requestId: "request_output"
      })
    ).rejects.toThrow("Presenter output target tenant must match actor tenant.");
  });

  it("supports Presenter GraphQL resolver composition through in-memory services", async () => {
    const adapter = createInMemoryPresenterServicesAdapter({
      seed: {
        outputTargets: [outputTarget],
        presentations: [presentation],
        themes: [theme, alternateTheme]
      }
    });
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: adapter.commandService,
      presenterQueryService: adapter.queryService
    });

    await expect(
      resolvers.Query.presentationForService(
        undefined,
        {
          serviceId: "service_1"
        },
        {
          actor: worshipLeader,
          requestId: "request_graphql_query"
        }
      )
    ).resolves.toEqual(presentation);

    await expect(
      resolvers.Mutation.applyPresenterTheme(
        undefined,
        {
          input: {
            presentationId: "presentation_1",
            themeId: "theme_2"
          }
        },
        {
          actor: worshipLeader,
          requestId: "request_graphql_mutation"
        }
      )
    ).resolves.toMatchObject({
      presentationId: "presentation_1",
      theme: {
        themeId: "theme_2"
      }
    });
  });

  it("publishes validated presentation and slide events after successful mutations", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPresenterServicesAdapter({
      clock: () => "2026-06-21T14:10:00.000Z",
      eventPublisher,
      ids: {
        slideId: () => "slide_3"
      },
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await adapter.commandService.updatePresentation({
      actor: worshipLeader,
      input: {
        presentationId: "presentation_1",
        title: "Updated Sunday Worship"
      },
      requestId: "request_update_presentation"
    });
    await adapter.commandService.addSlide({
      actor: worshipLeader,
      input: {
        afterSlideId: "slide_1",
        presentationId: "presentation_1",
        slide: {
          blocks: [
            {
              alignment: "center",
              blockId: PresenterSlideBlockIdSchema.parse("block_3"),
              kind: "text",
              text: "Sending",
              textStyle: "heading"
            }
          ],
          layout: "content",
          title: "Sending"
        }
      },
      requestId: "request_add_slide"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        aggregateId: event.aggregateId,
        actorId: event.actorId,
        eventType: event.eventType,
        payload: event.payload,
        requestId: event.requestId,
        schemaVersion: event.schemaVersion,
        tenantId: event.tenantId
      }))
    ).toEqual([
      {
        aggregateId: "presentation_1",
        actorId: "actor_worship_leader",
        eventType: "presentation.updated",
        payload: {
          changeKind: "updated",
          presentationId: "presentation_1",
          serviceId: "service_1",
          tenantId: "tenant_1",
          updatedAt: "2026-06-21T14:10:00.000Z"
        },
        requestId: "request_update_presentation",
        schemaVersion: "presenter-presentation-updated.v1",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "presentation_1",
        actorId: "actor_worship_leader",
        eventType: "presentation.updated",
        payload: {
          changeKind: "updated",
          presentationId: "presentation_1",
          serviceId: "service_1",
          tenantId: "tenant_1",
          updatedAt: "2026-06-21T14:10:00.000Z"
        },
        requestId: "request_add_slide",
        schemaVersion: "presenter-presentation-updated.v1",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "presentation_1",
        actorId: "actor_worship_leader",
        eventType: "presenter.slideChanged",
        payload: {
          activeSlideId: "slide_3",
          presentationId: "presentation_1",
          previousSlideId: "slide_1",
          tenantId: "tenant_1"
        },
        requestId: "request_add_slide",
        schemaVersion: "presenter-slide-changed.v1",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("publishes output blanked and restored events from output target mutations", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPresenterServicesAdapter({
      clock: () => "2026-06-21T14:15:00.000Z",
      eventPublisher,
      seed: {
        outputTargets: [outputTarget],
        presentations: [presentation],
        themes: [theme]
      }
    });

    await adapter.commandService.setOutputTarget({
      actor: worshipLeader,
      input: {
        outputTarget: {
          ...outputTarget,
          safeBlanked: true
        },
        presentationId: "presentation_1"
      },
      requestId: "request_blank"
    });
    await adapter.commandService.setOutputTarget({
      actor: worshipLeader,
      input: {
        outputTarget: {
          ...outputTarget,
          safeBlanked: false
        },
        presentationId: "presentation_1"
      },
      requestId: "request_restore"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.payload,
        requestId: event.requestId
      }))
    ).toEqual([
      {
        eventType: "presenter.outputBlanked",
        occurredAt: "2026-06-21T14:15:00.000Z",
        payload: {
          outputTargetId: "output_1",
          presentationId: "presentation_1",
          tenantId: "tenant_1"
        },
        requestId: "request_blank"
      },
      {
        eventType: "presenter.outputRestored",
        occurredAt: "2026-06-21T14:15:00.000Z",
        payload: {
          outputTargetId: "output_1",
          presentationId: "presentation_1",
          tenantId: "tenant_1"
        },
        requestId: "request_restore"
      }
    ]);
  });

  it("does not publish events when mutations are rejected before state changes", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    const adapter = createInMemoryPresenterServicesAdapter({
      eventPublisher,
      seed: {
        presentations: [presentation],
        themes: [theme]
      }
    });

    await expect(
      adapter.commandService.reorderSlides({
        actor: worshipLeader,
        input: {
          orderedSlideIds: ["slide_1"],
          presentationId: "presentation_1"
        },
        requestId: "request_bad_order"
      })
    ).rejects.toThrow("Presenter slide order must include every slide exactly once.");

    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });
});
