import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import { SetPresenterOutputTargetCommandSchema } from "@sanctuary-os/api/presenter";
import {
  PresenterNetworkReplayError,
  createPresenterNetworkReplayCommandExecutor,
  type PresenterGraphqlTransportRequest,
  type PresenterGraphqlTransportResponse
} from "./network-command-service.js";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const updateCommand = {
  actor,
  input: { presentationId: "presentation_1", title: "Sunday Gathering" },
  requestId: "request_1"
};

interface FakeTransport {
  readonly requests: readonly PresenterGraphqlTransportRequest[];
  readonly transport: (
    request: PresenterGraphqlTransportRequest
  ) => Promise<PresenterGraphqlTransportResponse>;
}

const createFakeTransport = (response: PresenterGraphqlTransportResponse): FakeTransport => {
  const requests: PresenterGraphqlTransportRequest[] = [];

  return {
    get requests(): readonly PresenterGraphqlTransportRequest[] {
      return requests;
    },
    transport: (request) => {
      requests.push(request);

      return Promise.resolve(response);
    }
  };
};

describe("createPresenterNetworkReplayCommandExecutor", () => {
  it("issues the mutation with auth, request-id, and input variables", async () => {
    const fake = createFakeTransport({
      data: { updatePresentation: { presentationId: "presentation_1" } }
    });
    const executor = createPresenterNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await executor.updatePresentation(updateCommand);

    const request = fake.requests[0];
    expect(request?.operationName).toBe("updatePresentation");
    expect(request?.headers.Authorization).toBe("Bearer token_1");
    expect(request?.headers["x-request-id"]).toBe("request_1");
    expect(request?.variables).toEqual({
      input: { presentationId: "presentation_1", title: "Sunday Gathering" }
    });
    expect(request?.query).toContain("updatePresentation(input: $input)");
  });

  it("awaits the auth token provider and supports a custom request-id header", async () => {
    const fake = createFakeTransport({ data: { addSlide: { slideId: "slide_1" } } });
    const executor = createPresenterNetworkReplayCommandExecutor({
      authToken: () => Promise.resolve("token_async"),
      requestIdHeaderName: "idempotency-key",
      transport: fake.transport
    });

    await executor.addSlide({
      actor,
      input: { presentationId: "presentation_1", slide: { blocks: [], layout: "title" } },
      requestId: "request_add"
    });

    const request = fake.requests[0];
    expect(request?.headers.Authorization).toBe("Bearer token_async");
    expect(request?.headers["idempotency-key"]).toBe("request_add");
    expect(request?.operationName).toBe("addSlide");
    expect(request?.query).toContain("slideId");
  });

  it("throws a network replay error carrying the GraphQL error code", async () => {
    const fake = createFakeTransport({
      errors: [
        {
          extensions: { code: "STALE_PRESENTATION", serverRevision: "revision_9" },
          message: "stale presentation"
        }
      ]
    });
    const executor = createPresenterNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    const error = await executor.updatePresentation(updateCommand).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PresenterNetworkReplayError);
    expect((error as PresenterNetworkReplayError).code).toBe("STALE_PRESENTATION");
    expect((error as PresenterNetworkReplayError).extensions?.["serverRevision"]).toBe(
      "revision_9"
    );
  });

  it("throws when the mutation returns no data for the operation", async () => {
    const fake = createFakeTransport({ data: { updatePresentation: null } });
    const executor = createPresenterNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await expect(executor.updatePresentation(updateCommand)).rejects.toBeInstanceOf(
      PresenterNetworkReplayError
    );
  });

  it("selects the right confirmation field per operation", async () => {
    const fake = createFakeTransport({
      data: { setOutputTarget: { outputTargetId: "output_1" } }
    });
    const executor = createPresenterNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await executor.setOutputTarget(
      SetPresenterOutputTargetCommandSchema.parse({
        actor,
        input: {
          outputTarget: {
            confidenceOutputEnabled: false,
            displayName: "Main",
            outputTargetId: "output_1",
            safeBlanked: true,
            targetKind: "main",
            tenantId: "tenant_1",
            windowRef: "display-main"
          },
          presentationId: "presentation_1"
        },
        requestId: "request_output"
      })
    );

    expect(fake.requests[0]?.query).toContain("outputTargetId");
  });
});
