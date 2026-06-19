import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  ObsConnectionProfileSchema,
  isObsDomainError,
  type ObsConnectionProfile,
  type ObsDomainErrorCode
} from "../../domain/obs/index.js";
import { createInMemoryObsServicesAdapter } from "./in-memory.js";
import {
  createFakeObsControlPort,
  type FakeObsControlPort,
  type FakeObsOperation
} from "./fake-control-port.js";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const connectedProfile: ObsConnectionProfile = ObsConnectionProfileSchema.parse({
  connectionProfileId: "connection_1",
  connectionRef: "vault://obs/connection_1",
  connectionStatus: "connected",
  createdAt: timestamp,
  label: "Sanctuary OBS",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

/**
 * The set of port methods that mutate live OBS state. requestObsAction (and every
 * read/connection/catalog op this slice exposes) must NEVER call any of these —
 * dispatch is slice 7. Tests assert these never appear in the fake's call log.
 */
const PORT_MUTATE_OPERATIONS: readonly FakeObsOperation[] = [
  "setCurrentProgramScene",
  "setInputMute",
  "setSceneItemEnabled",
  "startStream",
  "stopStream",
  "startRecord",
  "stopRecord"
];

const expectNoPortMutation = (fakePort: FakeObsControlPort): void => {
  const mutatingCalls = fakePort
    .calls()
    .filter((call) => PORT_MUTATE_OPERATIONS.includes(call.operation));

  expect(mutatingCalls).toEqual([]);
};

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: ObsDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isObsDomainError(error)).toBe(true);
  if (isObsDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

const connectedFakePort = (): FakeObsControlPort =>
  createFakeObsControlPort({
    currentProgramSceneRef: "scene-main",
    scenes: [
      { displayName: "Main", obsSceneRef: "scene-main" },
      { displayName: "Lower Third", obsSceneRef: "scene-lower" }
    ],
    sceneItems: [
      {
        obsSceneItemId: "item-1",
        obsSceneRef: "scene-main",
        obsSourceRef: "source-cam",
        visibleHint: true
      }
    ],
    sources: [{ kindLabel: "v4l2_source", obsSourceRef: "source-cam" }],
    streamStatus: "inactive"
  });

describe("createInMemoryObsServicesAdapter", () => {
  it("saves a connection profile with deterministic IDs, tenant scope, and an opaque ref", async () => {
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      ids: { connectionProfileId: () => "connection_created" }
    });

    await expect(
      adapter.commandService.saveObsConnectionProfile({
        actor: leader,
        input: {
          connectionRef: "vault://obs/abc",
          label: "Booth OBS"
        },
        requestId: "request_save"
      })
    ).resolves.toMatchObject({
      connectionProfileId: "connection_created",
      connectionRef: "vault://obs/abc",
      connectionStatus: "unknown",
      label: "Booth OBS",
      tenantId: "tenant_1"
    });

    expect(adapter.readConnectionProfiles()).toHaveLength(1);
  });

  it("rejects a save that smuggles a host/password field (no-secret posture is structural)", async () => {
    const adapter = createInMemoryObsServicesAdapter({ clock: () => timestamp });

    // The save input schema is `.strict()` and has no host/port/password field at
    // all, so any attempt to pass one is rejected before persistence — the
    // credential cannot enter the domain boundary.
    await expect(
      adapter.commandService.saveObsConnectionProfile({
        actor: leader,
        input: {
          connectionRef: "vault://obs/abc",
          host: "10.0.0.5",
          label: "Booth OBS",
          password: "hunter2"
        } as never,
        requestId: "request_save_secret"
      })
    ).rejects.toThrow();

    expect(adapter.readConnectionProfiles()).toHaveLength(0);
  });

  it("keeps reads tenant-scoped and returns null/empty for cross-tenant lookups", async () => {
    const adapter = createInMemoryObsServicesAdapter({
      seed: { connectionProfiles: [connectedProfile] }
    });

    await expect(
      adapter.queryService.getObsConnectionProfile({
        actor: otherTenantLeader,
        input: { connectionProfileId: "connection_1" },
        requestId: "request_cross_get"
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryService.listObsConnectionProfiles({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_cross_list"
      })
    ).resolves.toEqual([]);
  });

  it("filters connection profiles by connection status", async () => {
    const adapter = createInMemoryObsServicesAdapter({
      seed: {
        connectionProfiles: [
          connectedProfile,
          ObsConnectionProfileSchema.parse({
            ...connectedProfile,
            connectionProfileId: "connection_2",
            connectionStatus: "disconnected"
          })
        ]
      }
    });

    await expect(
      adapter.queryService.listObsConnectionProfiles({
        actor: leader,
        input: { filter: { connectionStatus: "disconnected" } },
        requestId: "request_filter"
      })
    ).resolves.toMatchObject([
      { connectionProfileId: "connection_2", connectionStatus: "disconnected" }
    ]);
  });

  it("removes a connection profile with explicit confirmation", async () => {
    const adapter = createInMemoryObsServicesAdapter({
      seed: { connectionProfiles: [connectedProfile] }
    });

    await expect(
      adapter.commandService.removeObsConnectionProfile({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Decommissioned" },
          connectionProfileId: "connection_1"
        },
        requestId: "request_remove"
      })
    ).resolves.toBeUndefined();

    expect(adapter.readConnectionProfiles()).toHaveLength(0);
  });

  it("throws CONNECTION_PROFILE_NOT_FOUND when removing an unknown profile", async () => {
    const adapter = createInMemoryObsServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.removeObsConnectionProfile({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Cleanup" },
          connectionProfileId: "connection_missing"
        },
        requestId: "request_remove_missing"
      }),
      "CONNECTION_PROFILE_NOT_FOUND"
    );
  });

  it("rejects a viewer from managing OBS resources with AUTHORIZATION_FAILED", async () => {
    const adapter = createInMemoryObsServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.saveObsConnectionProfile({
        actor: viewer,
        input: { connectionRef: "vault://obs/abc", label: "Booth OBS" },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("refreshes the catalog snapshot from the fake port without mutating OBS state", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: {
        sceneId: (() => {
          let next = 0;
          return () => {
            next += 1;
            return `scene_${String(next)}`;
          };
        })(),
        sceneItemId: () => "scene_item_1",
        sourceId: () => "source_1"
      },
      seed: { connectionProfiles: [connectedProfile] }
    });

    const snapshot = await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

    // The reconciled snapshot mirrors the observed catalog with a single program
    // scene and coarse stream/recording state.
    expect(snapshot.scenes).toHaveLength(2);
    expect(snapshot.scenes.filter((scene) => scene.isCurrentProgramScene)).toHaveLength(1);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sceneItems).toHaveLength(1);
    expect(snapshot.streamState.streamStatus).toBe("inactive");
    expect(snapshot.recordingState.recordingStatus).toBe("inactive");
    // A successful read marks the profile connected and stamps lastSeenAt.
    expect(snapshot.connectionProfile.connectionStatus).toBe("connected");
    expect(snapshot.connectionProfile.lastSeenAt).toBe(timestamp);

    // The snapshot is persisted and queryable.
    await expect(
      adapter.queryService.listObsScenes({
        actor: leader,
        input: { connectionProfileId: "connection_1" },
        requestId: "request_scenes"
      })
    ).resolves.toHaveLength(2);

    // Refresh reads OBS; it never calls an output-affecting port method.
    expect(fakePort.calls().map((call) => call.operation)).toEqual([
      "getSceneList",
      "getStreamStatus",
      "getRecordStatus"
    ]);
    expectNoPortMutation(fakePort);
  });

  it("surfaces OBS_DISCONNECTED when the port read fails during refresh", async () => {
    const fakePort = createFakeObsControlPort({
      failures: { getSceneList: { code: "disconnected" } }
    });
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      seed: { connectionProfiles: [connectedProfile] }
    });

    await expectDomainErrorCode(
      adapter.commandService.refreshObsCatalog({
        actor: leader,
        input: { connectionProfileId: "connection_1" },
        requestId: "request_refresh_disconnected"
      }),
      "OBS_DISCONNECTED"
    );

    expectNoPortMutation(fakePort);
  });

  it("throws CONNECTION_PROFILE_NOT_FOUND when refreshing an unknown profile", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      controlPort: fakePort.port
    });

    await expectDomainErrorCode(
      adapter.commandService.refreshObsCatalog({
        actor: leader,
        input: { connectionProfileId: "connection_missing" },
        requestId: "request_refresh_missing"
      }),
      "CONNECTION_PROFILE_NOT_FOUND"
    );

    // A missing profile short-circuits before any port read.
    expect(fakePort.calls()).toEqual([]);
  });

  it("requestObsAction runs eligibility, creates a requested intent, and never touches the port", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: { actionIntentId: () => "action_1", logEntryId: () => "log_1" },
      seed: { connectionProfiles: [connectedProfile] }
    });

    // Refresh first so the catalog/state snapshot is populated for the
    // eligibility check.
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });
    const callsBeforeRequest = fakePort.calls().length;

    // origin="human" + the operator's requestedByRef. The intent is proposed; no
    // dispatch happens.
    const created = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_action_ok"
    });

    expect(created).toMatchObject({
      actionIntentId: "action_1",
      affectsLiveOutput: true,
      kind: "switch-scene",
      origin: "human",
      status: "requested",
      targetSceneRef: "scene-lower"
    });
    // A requested intent is never born confirmed.
    expect(created.confirmation).toBeUndefined();

    // The intent is persisted and an audit log row was written.
    expect(adapter.readActionIntents()).toHaveLength(1);
    expect(adapter.readActionLog()).toMatchObject([
      { actionIntentRef: "action_1", outcome: "requested" }
    ]);

    // CRITICAL: requesting an action issued NO further port calls at all — and
    // certainly no output-affecting (dispatch) call. The port stays untouched
    // between the refresh and after the request.
    expect(fakePort.calls()).toHaveLength(callsBeforeRequest);
    expectNoPortMutation(fakePort);
  });

  it("accepts an ai-suggested requested intent that still cannot self-advance", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: { actionIntentId: () => "action_ai" },
      seed: { connectionProfiles: [connectedProfile] }
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

    const intent = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "ai-suggested",
        requestedByRef: "ai_assistant",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_ai_action"
    });

    expect(intent).toMatchObject({ origin: "ai-suggested", status: "requested" });
    expect(intent.confirmation).toBeUndefined();
    expectNoPortMutation(fakePort);
  });

  it("rejects an ineligible action (unknown scene) with ACTION_INELIGIBLE and persists nothing", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      seed: { connectionProfiles: [connectedProfile] }
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

    await expectDomainErrorCode(
      adapter.commandService.requestObsAction({
        actor: leader,
        input: {
          connectionProfileId: "connection_1",
          kind: "switch-scene",
          origin: "human",
          requestedByRef: "operator_1",
          targetSceneRef: "scene-does-not-exist"
        },
        requestId: "request_ineligible"
      }),
      "ACTION_INELIGIBLE"
    );

    expect(adapter.readActionIntents()).toEqual([]);
    expectNoPortMutation(fakePort);
  });

  it("rejects requesting a start-stream while disconnected with OBS_DISCONNECTED", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      // A disconnected profile, no refresh — eligibility blocks on connection.
      seed: {
        connectionProfiles: [
          ObsConnectionProfileSchema.parse({
            ...connectedProfile,
            connectionStatus: "disconnected"
          })
        ]
      }
    });

    await expectDomainErrorCode(
      adapter.commandService.requestObsAction({
        actor: leader,
        input: {
          connectionProfileId: "connection_1",
          kind: "start-stream",
          origin: "human",
          requestedByRef: "operator_1"
        },
        requestId: "request_disconnected_action"
      }),
      "OBS_DISCONNECTED"
    );

    expect(adapter.readActionIntents()).toEqual([]);
    expectNoPortMutation(fakePort);
  });

  it("throws CONNECTION_PROFILE_NOT_FOUND when requesting an action for an unknown profile", async () => {
    const adapter = createInMemoryObsServicesAdapter({ clock: () => timestamp });

    await expectDomainErrorCode(
      adapter.commandService.requestObsAction({
        actor: leader,
        input: {
          connectionProfileId: "connection_missing",
          kind: "start-stream",
          origin: "human",
          requestedByRef: "operator_1"
        },
        requestId: "request_action_missing"
      }),
      "CONNECTION_PROFILE_NOT_FOUND"
    );
  });

  it("filters action intents by connection and status, and lists the action log per connection", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: {
        actionIntentId: (() => {
          let next = 0;
          return () => {
            next += 1;
            return `action_${String(next)}`;
          };
        })(),
        logEntryId: (() => {
          let next = 0;
          return () => {
            next += 1;
            return `log_${String(next)}`;
          };
        })()
      },
      seed: { connectionProfiles: [connectedProfile] }
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });
    await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_action"
    });

    await expect(
      adapter.queryService.listObsActionIntents({
        actor: leader,
        input: { filter: { connectionProfileId: "connection_1", status: "requested" } },
        requestId: "request_intents"
      })
    ).resolves.toHaveLength(1);

    await expect(
      adapter.queryService.listObsActionIntents({
        actor: leader,
        input: { filter: { status: "succeeded" } },
        requestId: "request_intents_none"
      })
    ).resolves.toEqual([]);

    await expect(
      adapter.queryService.listObsActionLog({
        actor: leader,
        input: { connectionProfileId: "connection_1" },
        requestId: "request_log"
      })
    ).resolves.toHaveLength(1);

    expectNoPortMutation(fakePort);
  });

  it("never persists an OBS host/password anywhere in stored records", async () => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      seed: { connectionProfiles: [connectedProfile] }
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

    const serialized = JSON.stringify({
      connectionProfiles: adapter.readConnectionProfiles(),
      scenes: adapter.readScenes(),
      sources: adapter.readSources()
    });

    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("host");
    // Only the opaque vault ref is stored for the connection.
    expect(serialized).toContain("vault://obs/connection_1");
  });
});
