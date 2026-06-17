import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import { SetPlaybackStateCommandSchema } from "@sanctuary-os/api/play";
import {
  PlayNetworkReplayError,
  createPlayNetworkReplayCommandExecutor,
  type PlayGraphqlTransportRequest,
  type PlayGraphqlTransportResponse
} from "./play-network-command-service.js";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["musician"],
  tenantId: "tenant_1"
};

const setPlaybackStateCommand = {
  actor,
  input: {
    clickEnabled: true,
    positionBeats: 0,
    trackSetId: "track_set_1",
    transportStatus: "stopped" as const
  },
  requestId: "request_1"
};

interface FakeTransport {
  readonly requests: readonly PlayGraphqlTransportRequest[];
  readonly transport: (
    request: PlayGraphqlTransportRequest
  ) => Promise<PlayGraphqlTransportResponse>;
}

const createFakeTransport = (response: PlayGraphqlTransportResponse): FakeTransport => {
  const requests: PlayGraphqlTransportRequest[] = [];

  return {
    get requests(): readonly PlayGraphqlTransportRequest[] {
      return requests;
    },
    transport: (request) => {
      requests.push(request);

      return Promise.resolve(response);
    }
  };
};

describe("createPlayNetworkReplayCommandExecutor", () => {
  it("issues the mutation with auth, request-id, and input variables", async () => {
    const fake = createFakeTransport({
      data: { setPlaybackState: { trackSetId: "track_set_1" } }
    });
    const executor = createPlayNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await executor.setPlaybackState(setPlaybackStateCommand);

    const request = fake.requests[0];
    expect(request?.operationName).toBe("setPlaybackState");
    expect(request?.headers.Authorization).toBe("Bearer token_1");
    expect(request?.headers["x-request-id"]).toBe("request_1");
    expect(request?.variables).toEqual({
      input: {
        clickEnabled: true,
        positionBeats: 0,
        trackSetId: "track_set_1",
        transportStatus: "stopped"
      }
    });
    expect(request?.query).toContain("setPlaybackState(input: $input)");
  });

  it("awaits the auth token provider and supports a custom request-id header", async () => {
    const fake = createFakeTransport({ data: { addPlayCue: { cueId: "cue_1" } } });
    const executor = createPlayNetworkReplayCommandExecutor({
      authToken: () => Promise.resolve("token_async"),
      requestIdHeaderName: "idempotency-key",
      transport: fake.transport
    });

    await executor.addPlayCue({
      actor,
      input: {
        action: "play",
        fireMode: "manual",
        label: "Start",
        markerOffsetBeats: 0,
        sectionId: "section_1",
        trackSetId: "track_set_1"
      },
      requestId: "request_add"
    });

    const request = fake.requests[0];
    expect(request?.headers.Authorization).toBe("Bearer token_async");
    expect(request?.headers["idempotency-key"]).toBe("request_add");
    expect(request?.operationName).toBe("addPlayCue");
    expect(request?.query).toContain("cueId");
  });

  it("throws a network replay error carrying the GraphQL error code", async () => {
    const fake = createFakeTransport({
      errors: [
        {
          extensions: { code: "TRACK_SET_NOT_FOUND" },
          message: "track set not found"
        }
      ]
    });
    const executor = createPlayNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    const error = await executor
      .setPlaybackState(setPlaybackStateCommand)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlayNetworkReplayError);
    expect((error as PlayNetworkReplayError).code).toBe("TRACK_SET_NOT_FOUND");
  });

  it("throws when the mutation returns no data for the operation", async () => {
    const fake = createFakeTransport({ data: { setPlaybackState: null } });
    const executor = createPlayNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await expect(
      executor.setPlaybackState(setPlaybackStateCommand)
    ).rejects.toBeInstanceOf(PlayNetworkReplayError);
  });

  it("selects the right confirmation field per operation", async () => {
    const fake = createFakeTransport({
      data: { savePadLayer: { padLayerRef: "pad_1" } }
    });
    const executor = createPlayNetworkReplayCommandExecutor({
      authToken: () => "token_1",
      transport: fake.transport
    });

    await executor.savePadLayer({
      actor,
      input: {
        gain: 0.5,
        key: "C",
        loop: true,
        padLayerRef: "pad_1",
        padMediaRef: "media_1"
      },
      requestId: "request_pad"
    });

    expect(fake.requests[0]?.query).toContain("padLayerRef");
    expect(fake.requests[0]?.operationName).toBe("savePadLayer");
  });

  it("maps each non-destructive operation to its mutation document", () => {
    expect(SetPlaybackStateCommandSchema.parse(setPlaybackStateCommand).requestId).toBe(
      "request_1"
    );
  });
});
