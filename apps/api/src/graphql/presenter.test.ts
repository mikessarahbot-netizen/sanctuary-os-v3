import { describe, expect, it, vi } from "vitest";
import type {
  PresenterOutputState,
  PresenterPresentation,
  PresenterScriptureReference,
  PresenterSlide,
  PresenterSlideGroup,
  PresenterStyleTemplate
} from "../domain/index.js";
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

const fixedUpdatedAt = "2026-06-17T12:00:00.000Z";

const slide: PresenterSlide = {
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
};

const slideGroup: PresenterSlideGroup = {
  groupId: "group_1",
  groupType: "service-item",
  serviceItemId: "item_1",
  slides: [slide],
  title: "Welcome"
};

const presentation: PresenterPresentation = {
  presentationId: "presentation_1",
  serviceId: "service_1",
  slideGroups: [slideGroup],
  styleTemplateId: "style_1",
  syncStatus: "synced",
  tenantId: "tenant_1",
  title: "Sunday Worship",
  updatedAt: fixedUpdatedAt
};

const outputState: PresenterOutputState = {
  blackout: false,
  currentGroupId: "group_1",
  currentSlideId: "slide_1",
  freeze: false,
  mode: "live",
  presentationId: "presentation_1",
  tenantId: "tenant_1",
  updatedAt: fixedUpdatedAt
};

const styleTemplate: PresenterStyleTemplate = {
  createdAt: fixedUpdatedAt,
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
};

const scriptureReference: PresenterScriptureReference = {
  displayText: "For the Lord is good.",
  passageRef: "Psalm 100:5",
  scriptureReferenceId: "scripture_1",
  translationLabel: "Public Domain",
  verseRange: "5"
};

const createPresenterQueryService = (
  overrides: Partial<PresenterQueryService> = {}
): PresenterQueryService => ({
  getPresentation: vi.fn<PresenterQueryService["getPresentation"]>(() =>
    Promise.resolve(presentation)
  ),
  getPresentationForService: vi.fn<
    PresenterQueryService["getPresentationForService"]
  >(() => Promise.resolve(presentation)),
  getPresenterOutputState: vi.fn<
    PresenterQueryService["getPresenterOutputState"]
  >(() => Promise.resolve(outputState)),
  listPresenterStyleTemplates: vi.fn<
    PresenterQueryService["listPresenterStyleTemplates"]
  >(() => Promise.resolve([styleTemplate])),
  previewScripture: vi.fn<PresenterQueryService["previewScripture"]>(() =>
    Promise.resolve([scriptureReference])
  ),
  ...overrides
});

const createPresenterCommandService = (
  overrides: Partial<PresenterCommandService> = {}
): PresenterCommandService => ({
  applyPresenterStyleTemplate: vi.fn<
    PresenterCommandService["applyPresenterStyleTemplate"]
  >(() => Promise.resolve(presentation)),
  createPresentationFromService: vi.fn<
    PresenterCommandService["createPresentationFromService"]
  >(() => Promise.resolve(presentation)),
  deletePresentation: vi.fn<PresenterCommandService["deletePresentation"]>(() =>
    Promise.resolve({ presentationId: "presentation_1" })
  ),
  importScriptureSlides: vi.fn<PresenterCommandService["importScriptureSlides"]>(() =>
    Promise.resolve(slideGroup)
  ),
  reorderSlides: vi.fn<PresenterCommandService["reorderSlides"]>(() =>
    Promise.resolve(presentation)
  ),
  setPresenterOutputState: vi.fn<
    PresenterCommandService["setPresenterOutputState"]
  >(() => Promise.resolve(outputState)),
  updateSlide: vi.fn<PresenterCommandService["updateSlide"]>(() =>
    Promise.resolve(slide)
  ),
  updateSlideGroup: vi.fn<PresenterCommandService["updateSlideGroup"]>(() =>
    Promise.resolve(slideGroup)
  ),
  ...overrides
});

describe("presenterGraphqlTypeDefs", () => {
  it("declares the planned Presenter query operations", () => {
    expect(presenterGraphqlTypeDefs).toContain(
      "presentation(serviceId: ID!): PresenterPresentation"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "presenterStyleTemplates(input: PresenterStyleTemplatesInput): [PresenterStyleTemplate!]!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "presenterOutputState(presentationId: ID!): PresenterOutputState"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "scripturePreview(input: ScripturePreviewInput!): [PresenterScriptureReference!]!"
    );
  });

  it("declares the planned Presenter mutation operations", () => {
    expect(presenterGraphqlTypeDefs).toContain(
      "createPresentationFromService(input: CreatePresentationFromServiceInput!): PresenterPresentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "updateSlideGroup(input: UpdateSlideGroupInput!): PresenterSlideGroup!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "updateSlide(input: UpdateSlideInput!): PresenterSlide!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "reorderSlides(input: ReorderSlidesInput!): PresenterPresentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "applyPresenterStyleTemplate(input: ApplyPresenterStyleTemplateInput!): PresenterPresentation!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "importScriptureSlides(input: ImportScriptureSlidesInput!): PresenterSlideGroup!"
    );
    expect(presenterGraphqlTypeDefs).toContain(
      "setPresenterOutputState(input: SetPresenterOutputStateInput!): PresenterOutputState!"
    );
  });

  it("does not expose stream, OBS, or raw media fields", () => {
    expect(presenterGraphqlTypeDefs).not.toMatch(/startStream|stopStream/i);
    expect(presenterGraphqlTypeDefs).not.toMatch(/obs/i);
    expect(presenterGraphqlTypeDefs).not.toContain("rawMediaPayload");
  });
});

describe("createPresenterGraphqlResolvers", () => {
  it("delegates presentation queries with actor and request scope", async () => {
    const getPresentationForService = vi.fn<
      PresenterQueryService["getPresentationForService"]
    >(() => Promise.resolve(presentation));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService(),
      presenterQueryService: createPresenterQueryService({ getPresentationForService })
    });

    await expect(
      resolvers.Query.presentation(
        undefined,
        {
          serviceId: "service_1"
        },
        {
          ...graphqlContext,
          requestId: "request_presentation"
        }
      )
    ).resolves.toEqual(presentation);

    expect(getPresentationForService).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1"
      },
      requestId: "request_presentation"
    });
  });

  it("delegates presenterStyleTemplates with optional filter input", async () => {
    const listPresenterStyleTemplates = vi.fn<
      PresenterQueryService["listPresenterStyleTemplates"]
    >(() => Promise.resolve([styleTemplate]));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService(),
      presenterQueryService: createPresenterQueryService({
        listPresenterStyleTemplates
      })
    });

    await expect(
      resolvers.Query.presenterStyleTemplates(
        undefined,
        {
          input: {
            serviceTypeId: "type_sunday"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([styleTemplate]);

    expect(listPresenterStyleTemplates).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceTypeId: "type_sunday"
      },
      requestId: "request_1"
    });
  });

  it("delegates scripturePreview without importing or persisting slides", async () => {
    const previewScripture = vi.fn<PresenterQueryService["previewScripture"]>(() =>
      Promise.resolve([scriptureReference])
    );
    const importScriptureSlides = vi.fn<
      PresenterCommandService["importScriptureSlides"]
    >(() => Promise.resolve(slideGroup));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({
        importScriptureSlides
      }),
      presenterQueryService: createPresenterQueryService({ previewScripture })
    });

    await expect(
      resolvers.Query.scripturePreview(
        undefined,
        {
          input: {
            passageRef: "Psalm 100:5",
            serviceId: "service_1",
            translationLabel: "Public Domain"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual([scriptureReference]);

    expect(previewScripture).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        passageRef: "Psalm 100:5",
        serviceId: "service_1",
        translationLabel: "Public Domain"
      },
      requestId: "request_1"
    });
    expect(importScriptureSlides).not.toHaveBeenCalled();
  });

  it("delegates createPresentationFromService with create intent", async () => {
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
            styleTemplateId: "style_1",
            title: "Sunday Worship"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(presentation);

    expect(createPresentationFromService).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        serviceId: "service_1",
        styleTemplateId: "style_1",
        title: "Sunday Worship"
      },
      intent: "create",
      requestId: "request_1"
    });
  });

  it("normalizes GraphQL enum values and delegates updateSlideGroup", async () => {
    const updateSlideGroup = vi.fn<PresenterCommandService["updateSlideGroup"]>(() =>
      Promise.resolve(slideGroup)
    );
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({ updateSlideGroup }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.updateSlideGroup(
        undefined,
        {
          input: {
            presentationId: "presentation_1",
            slideGroup: {
              groupId: "group_1",
              groupType: "service_item",
              serviceItemId: "item_1",
              slides: [
                {
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
                }
              ],
              title: "Welcome"
            }
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(slideGroup);

    expect(updateSlideGroup).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        presentationId: "presentation_1",
        slideGroup
      },
      intent: "update",
      requestId: "request_1"
    });
  });

  it("delegates setPresenterOutputState with tenant from actor context", async () => {
    const setPresenterOutputState = vi.fn<
      PresenterCommandService["setPresenterOutputState"]
    >(() => Promise.resolve(outputState));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({
        setPresenterOutputState
      }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.setPresenterOutputState(
        undefined,
        {
          input: {
            blackout: true,
            currentGroupId: "group_1",
            currentSlideId: "slide_1",
            freeze: false,
            mode: "live",
            presentationId: "presentation_1",
            updatedAt: fixedUpdatedAt
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(outputState);

    expect(setPresenterOutputState).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        blackout: true,
        currentGroupId: "group_1",
        currentSlideId: "slide_1",
        freeze: false,
        mode: "live",
        presentationId: "presentation_1",
        tenantId: "tenant_1",
        updatedAt: fixedUpdatedAt
      },
      intent: "update",
      requestId: "request_1"
    });
  });

  it("rejects invalid output-state stream fields before delegating", async () => {
    const setPresenterOutputState = vi.fn<
      PresenterCommandService["setPresenterOutputState"]
    >(() => Promise.resolve(outputState));
    const resolvers = createPresenterGraphqlResolvers({
      presenterCommandService: createPresenterCommandService({
        setPresenterOutputState
      }),
      presenterQueryService: createPresenterQueryService()
    });

    await expect(
      resolvers.Mutation.setPresenterOutputState(
        undefined,
        {
          input: {
            currentGroupId: "group_1",
            currentSlideId: "slide_1",
            mode: "live",
            presentationId: "presentation_1",
            startStream: true,
            updatedAt: fixedUpdatedAt
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(setPresenterOutputState).not.toHaveBeenCalled();
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
            slide: {
              blocks: [
                {
                  blockId: "block_media",
                  kind: "media_placeholder",
                  mediaType: "video",
                  rawMediaPayload: "base64-video"
                }
              ],
              slideId: "slide_1"
            },
            slideGroupId: "group_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(updateSlide).not.toHaveBeenCalled();
  });

  it("propagates service errors without converting them in the resolver shell", async () => {
    const serviceError = new Error("presenter service unavailable");
    const reorderSlides = vi.fn<PresenterCommandService["reorderSlides"]>(() =>
      Promise.reject(serviceError)
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
            orderedSlideIds: ["slide_2", "slide_1"],
            presentationId: "presentation_1",
            slideGroupId: "group_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow(serviceError);
  });
});
