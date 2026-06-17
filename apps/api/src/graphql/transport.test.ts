import { describe, expect, it } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import {
  PresentationSchema,
  type Presentation
} from "../domain/presenter/index.js";
import type {
  PresenterCommandService,
  PresenterQueryService
} from "../services/presenter/index.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";
import { createPresenterGraphqlRequestHandler } from "./transport.js";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const presentation: Presentation = PresentationSchema.parse({
  createdAt: "2026-06-17T00:00:00.000Z",
  mediaCues: [],
  presentationId: "presentation_1",
  slides: [
    {
      blocks: [
        { alignment: "center", blockId: "block_1", kind: "text", text: "Welcome", textStyle: "heading" }
      ],
      layout: "title",
      order: 0,
      presentationId: "presentation_1",
      slideId: "slide_1",
      tenantId: "tenant_1"
    }
  ],
  tenantId: "tenant_1",
  theme: {
    colors: {
      background: "#101820",
      lowerThirdBackground: "#000000",
      lowerThirdText: "#ffffff",
      text: "#f7f7f2"
    },
    lowerThird: { maxLines: 2, placement: "bottom-center" },
    name: "Standard",
    spacing: { blockGap: 24, slidePadding: 72 },
    tenantId: "tenant_1",
    themeId: "theme_1",
    typography: {
      baseFontSize: 48,
      bodyFontFamily: "Inter",
      headingFontFamily: "Inter Display",
      lineHeight: 1.2
    }
  },
  title: "Sunday Gathering",
  updatedAt: "2026-06-17T00:00:00.000Z"
});

const notUsed = (): Promise<never> => Promise.reject(new Error("not used"));

interface FakeServices {
  readonly commandService: PresenterCommandService;
  readonly queryService: PresenterQueryService;
  readonly recordedRequestIds: readonly string[];
}

const createFakeServices = (): FakeServices => {
  const recordedRequestIds: string[] = [];

  const queryService = {
    outputTargets: notUsed,
    presentation: notUsed,
    presentationForService: notUsed,
    presentations: (query: { readonly requestId: string }) => {
      recordedRequestIds.push(query.requestId);

      return Promise.resolve([]);
    },
    presenterThemes: notUsed
  } satisfies PresenterQueryService;

  const commandService = {
    addSlide: notUsed,
    applyPresenterTheme: notUsed,
    createPresentationFromService: notUsed,
    removeSlide: notUsed,
    reorderSlides: notUsed,
    setOutputTarget: notUsed,
    updatePresentation: (command: { readonly requestId: string }) => {
      recordedRequestIds.push(command.requestId);

      return Promise.resolve(presentation);
    },
    updateSlide: notUsed
  } satisfies PresenterCommandService;

  return {
    commandService,
    queryService,
    get recordedRequestIds() {
      return recordedRequestIds;
    }
  };
};

const authBoundary: AuthBoundary = {
  resolveActor: (authHeader) =>
    authHeader === "Bearer good-token"
      ? Promise.resolve(actor)
      : Promise.reject(new Error("invalid token"))
};

const createHandler = (services: FakeServices) =>
  createPresenterGraphqlRequestHandler({
    authBoundary,
    generateRequestId: () => "generated-request-id",
    schema: createPresenterGraphqlSchema({
      presenterCommandService: services.commandService,
      presenterQueryService: services.queryService
    })
  });

describe("createPresenterGraphqlRequestHandler", () => {
  it("executes a mutation for an authenticated actor", async () => {
    const services = createFakeServices();
    const handler = createHandler(services);

    const response = await handler({
      body: {
        query:
          "mutation updatePresentation($input: UpdatePresentationInput!) { updatePresentation(input: $input) { presentationId } }",
        variables: { input: { presentationId: "presentation_1", title: "Sunday Gathering" } }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { updatePresentation: { presentationId: "presentation_1" } }
    });
  });

  it("conveys the request-id header to the service", async () => {
    const services = createFakeServices();
    const handler = createHandler(services);

    await handler({
      body: { query: "{ presentations { presentationId } }" },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_xyz" }
    });

    expect(services.recordedRequestIds).toEqual(["request_xyz"]);
  });

  it("generates a request-id when the header is absent", async () => {
    const services = createFakeServices();
    const handler = createHandler(services);

    await handler({
      body: { query: "{ presentations { presentationId } }" },
      headers: { Authorization: "Bearer good-token" }
    });

    expect(services.recordedRequestIds).toEqual(["generated-request-id"]);
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const services = createFakeServices();
    const handler = createHandler(services);

    const response = await handler({
      body: { query: "{ presentations { presentationId } }" },
      headers: {}
    });

    expect(response.status).toBe(401);
    expect(response.body.errors?.[0]?.extensions?.["code"]).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 401 when the actor cannot be resolved", async () => {
    const services = createFakeServices();
    const handler = createHandler(services);

    const response = await handler({
      body: { query: "{ presentations { presentationId } }" },
      headers: { Authorization: "Bearer bad-token" }
    });

    expect(response.status).toBe(401);
    expect(response.body.errors?.[0]?.extensions?.["code"]).toBe("AUTHENTICATION_FAILED");
  });
});
