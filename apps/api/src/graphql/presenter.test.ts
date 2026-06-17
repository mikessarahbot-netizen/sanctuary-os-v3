import { describe, expect, it, vi } from "vitest";
import type {
  OutputTarget,
  Presentation,
  PresenterTheme,
  Slide
} from "../domain/presenter/index.js";
import {
  OutputTargetSchema,
  PresentationSchema,
  PresenterThemeSchema,
  SlideSchema
} from "../domain/presenter/index.js";
import type {
  PresenterCommandService,
  PresenterQueryService
} from "../services/presenter/index.js";
import {
  createPresenterGraphqlResolvers,
  presenterGraphqlTypeDefs,
  type PresenterGraphqlContext
} from "./presenter.js";

const graphqlContext: PresenterGraphqlContext = {
  actor: {
    actorId: "actor_1",
    roles: ["worship_leader"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
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

const slide: Slide = SlideSchema.parse({
  blocks: [
    {
      blockId: "block_1",
      kind: "text",
      text: "Welcome",
      textStyle: "heading",
      alignment: "center"
    }
  ],
  layout: "title",
  order: 0,
  presentationId: "presentation_1",
  slideId: "slide_1",
  tenantId: "tenant_1",
  title: "Welcome"
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

const presentation: Presentation = PresentationSchema.parse({
  createdAt: "2026-06-21T14:00:00.000Z",
  mediaCues: [],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [slide],
  tenantId: "tenant_1",
  theme,
  title: "Sunday Worship Slides",
  updatedAt: "2026-06-21T14:05:00.000Z"
});

const createPresenterQueryService = (
  overrides: Partial<PresenterQueryService> = {}
): PresenterQueryService => ({
  outputTargets: vi.fn<PresenterQueryService["outputTargets"]>(() =>
    Promise.resolve([outputTarget])
  ),
  presentation: vi.fn<PresenterQueryService["presentation"]>(() =>
    Promise.resolve(presentation)
  ),
  presentationForService: vi.fn<PresenterQueryService["presentationForService"]>(() =>
    Promise.resolve(presentation)
  ),
  presentations: vi.fn<PresenterQueryService["presentations"]>(() =>
    Promise.resolve([presentation])
  ),
  presenterThemes: vi.fn<PresenterQueryService["presenterThemes"]>(() =>
    Promise.resolve([theme])
  ),
  ...overrides
});

const createPresenterCommandService = (
  overrides: Partial<PresenterCommandService> = {}
): PresenterCommandService => ({
  addSlide: vi.fn<PresenterCommandService["addSlide"]>(() => Promise.resolve(slide)),
  applyPresenterTheme: vi.fn<PresenterCommandService["applyPresenterTheme"]>(() =>
    Promise.resolve(presentation)
  ),
  createPresentationFromService: vi.fn<
    PresenterCommandService["createPresentationFromService"]
  >(() => Promise.resolve(presentation)),
  removeSlide: vi.fn<PresenterCommandService["removeSlide"]>(() =>
    Promise.resolve(presentation)
  ),
  reorderSlides: vi.fn<PresenterCommandService["reorderSlides"]>(() =>
    Promise.resolve([slide])
  ),
  setOutputTarget: vi.fn<PresenterCommandService["setOutputTarget"]>(() =>
    Promise.resolve(outputTarget)
  ),
  updatePresentation: vi.fn<PresenterCommandService["updatePresentation"]>(() =>
    Promise.resolve(presentation)
  ),
  updateSlide: vi.fn<PresenterCommandService["updateSlide"]>(() => Promise.resolve(slide)),
  ...overrides
});

describe("presenterGraphqlTypeDefs", () => {
  it("declares the planned Presenter query contract placeholders", () => {
    expect(presenterGraphqlTypeDefs).toContain(
      "presentations(filter: PresenterPresentationsFilterInput): [Presentation!]!"
    );
    expect(presenterGraphqlTypeDefs).toContain("presentation(id: ID!): Presentation");
    expect(presenterGraphqlTypeDefs).toContain(
      "presentationForService(serviceId: ID!): Presentation"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "presenterThemes(filter: PresenterThemesFilterInput): [PresenterTheme!]!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "outputTargets(input: PresenterOutputTargetsInput!): [PresenterOutputTarget!]!"
    );
  });

  it("declares the planned Presenter mutation contract placeholders", () => {
    expect(presenterGraphqlTypeDefs).toContain(
      "createPresentationFromService(input: CreatePresentationFromServiceInput!): Presentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "updatePresentation(input: UpdatePresentationInput!): Presentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "addSlide(input: AddPresenterSlideInput!): PresenterSlide!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "updateSlide(input: UpdatePresenterSlideInput!): PresenterSlide!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "reorderSlides(input: ReorderPresenterSlidesInput!): [PresenterSlide!]!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "removeSlide(input: RemovePresenterSlideInput!): Presentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "applyPresenterTheme(input: ApplyPresenterThemeInput!): Presentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "setOutputTarget(input: SetPresenterOutputTargetInput!): PresenterOutputTarget!"
    );
  });

  it("keeps stream control, OBS automation, and raw media payloads out of Presenter v1", () => {
    expect(presenterGraphqlTypeDefs).not.toContain("startStream");
    expect(presenterGraphqlTypeDefs).not.toContain("stopStream");
    expect(presenterGraphqlTypeDefs).not.toContain("obsScene");
    expect(presenterGraphqlTypeDefs).not.toContain("rawMediaPayload");
  });
});

describe("createPresenterGraphqlResolvers", () => {
  it("delegates presentationForService with actor and request scope", async () => {
    const presentationForService = vi.fn<
      PresenterQueryService["presentationForService"]
    >(() => Promise.resolve(presentation));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService(),
      presenterQueryService: createPresenterQueryService({ presentationForService })
    });

    await expect(
      resolvers.Query.presentationForService(
        undefined,
        {
          serviceId: "service_1"
        },
        graphqlContext
      )
    ).resolves.toEqual(presentation);

    expect(presentationForService).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1"
      },
      requestId: "request_1"
    });
  });

  it("delegates createPresentationFromService to the Presenter command service", async () => {
    const createPresentationFromService = vi.fn<
      PresenterCommandService["createPresentationFromService"]
    >(() => Promise.resolve(presentation));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({
        createPresentationFromService
      }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.createPresentationFromService(
        undefined,
        {
          input: {
            serviceId: "service_1",
            title: "Sunday Worship Slides"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(presentation);

    expect(createPresentationFromService).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1",
        title: "Sunday Worship Slides"
      },
      requestId: "request_1"
    });
  });

  it("rejects duplicate slide order before delegating", async () => {
    const reorderSlides = vi.fn<PresenterCommandService["reorderSlides"]>(() =>
      Promise.resolve([slide])
    );
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({ reorderSlides }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.reorderSlides(
        undefined,
        {
          input: {
            orderedSlideIds: ["slide_1", "slide_1"],
            presentationId: "presentation_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Presenter slide order cannot contain duplicate slide IDs.");

    expect(reorderSlides).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation for destructive slide removal", async () => {
    const removeSlide = vi.fn<PresenterCommandService["removeSlide"]>(() =>
      Promise.resolve(presentation)
    );
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({ removeSlide }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.removeSlide(
        undefined,
        {
          input: {
            presentationId: "presentation_1",
            slideId: "slide_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(removeSlide).not.toHaveBeenCalled();
  });

  it("rejects raw media payloads before delegating slide updates", async () => {
    const updateSlide = vi.fn<PresenterCommandService["updateSlide"]>(() =>
      Promise.resolve(slide)
    );
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({ updateSlide }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.updateSlide(
        undefined,
        {
          input: {
            presentationId: "presentation_1",
            rawMediaPayload: "not allowed",
            slide
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(updateSlide).not.toHaveBeenCalled();
  });

  it("propagates service errors without replacing them with vendor details", async () => {
    const outputTargets = vi.fn<PresenterQueryService["outputTargets"]>(() =>
      Promise.reject(new Error("Presenter output targets unavailable."))
    );
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService(),
      presenterQueryService: createPresenterQueryService({ outputTargets })
    });

    await expect(
      resolvers.Query.outputTargets(
        undefined,
        {
          input: {
            presentationId: "presentation_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow("Presenter output targets unavailable.");
  });
});
