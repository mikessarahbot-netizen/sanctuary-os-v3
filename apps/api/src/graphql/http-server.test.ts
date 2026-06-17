import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import type {
  PresenterCommandService,
  PresenterQueryService
} from "../services/presenter/index.js";
import {
  createPresenterGraphqlHttpServer,
  handlePresenterGraphqlHttpInvocation,
  type PresenterGraphqlRequestHandler
} from "./http-server.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";

const okHandler: PresenterGraphqlRequestHandler = () =>
  Promise.resolve({ body: { data: { presentations: [] } }, status: 200 });

describe("handlePresenterGraphqlHttpInvocation", () => {
  it("routes a valid POST to the handler and serializes the response", async () => {
    const result = await handlePresenterGraphqlHttpInvocation(
      okHandler,
      {
        headers: { authorization: "Bearer good-token" },
        method: "POST",
        path: "/graphql",
        rawBody: JSON.stringify({ query: "{ presentations { presentationId } }" })
      },
      { path: "/graphql" }
    );

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(result.body)).toEqual({ data: { presentations: [] } });
  });

  it("returns 404 for a non-matching path", async () => {
    const result = await handlePresenterGraphqlHttpInvocation(
      okHandler,
      { headers: {}, method: "POST", path: "/other", rawBody: "{}" },
      { path: "/graphql" }
    );

    expect(result.status).toBe(404);
  });

  it("returns 405 for a non-POST method", async () => {
    const result = await handlePresenterGraphqlHttpInvocation(
      okHandler,
      { headers: {}, method: "GET", path: "/graphql", rawBody: "" },
      { path: "/graphql" }
    );

    expect(result.status).toBe(405);
  });

  it("returns 400 for a malformed body", async () => {
    const result = await handlePresenterGraphqlHttpInvocation(
      okHandler,
      { headers: {}, method: "POST", path: "/graphql", rawBody: "not json" },
      { path: "/graphql" }
    );

    expect(result.status).toBe(400);
  });
});

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const notUsed = (): Promise<never> => Promise.reject(new Error("not used"));

const queryService = {
  outputTargets: notUsed,
  presentation: notUsed,
  presentationForService: notUsed,
  presentations: () => Promise.resolve([]),
  presenterThemes: notUsed
} satisfies PresenterQueryService;

const commandService = {
  addSlide: notUsed,
  applyPresenterTheme: notUsed,
  createPresentationFromService: notUsed,
  removeSlide: notUsed,
  reorderSlides: notUsed,
  setOutputTarget: notUsed,
  updatePresentation: notUsed,
  updateSlide: notUsed
} satisfies PresenterCommandService;

const authBoundary: AuthBoundary = {
  resolveActor: (header) =>
    header === "Bearer good-token"
      ? Promise.resolve(actor)
      : Promise.reject(new Error("invalid token"))
};

describe("createPresenterGraphqlHttpServer", () => {
  const servers: import("node:http").Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          })
      )
    );
  });

  it("serves the Presenter GraphQL schema over HTTP", async () => {
    const server = createPresenterGraphqlHttpServer({
      authBoundary,
      generateRequestId: () => "generated-request-id",
      schema: createPresenterGraphqlSchema({
        presenterCommandService: commandService,
        presenterQueryService: queryService
      })
    });
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${String(address.port)}/graphql`, {
      body: JSON.stringify({ query: "{ presentations { presentationId } }" }),
      headers: { Authorization: "Bearer good-token", "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { presentations: [] } });
  });

  it("rejects an unauthenticated request with 401", async () => {
    const server = createPresenterGraphqlHttpServer({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        presenterCommandService: commandService,
        presenterQueryService: queryService
      })
    });
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${String(address.port)}/graphql`, {
      body: JSON.stringify({ query: "{ presentations { presentationId } }" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(401);
  });
});
