import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  createInMemoryEventPublisher,
  type InMemoryEventPublisher,
  type ValidatedApiEventEnvelope
} from "../../events/index.js";
import {
  ObsConnectionProfileSchema,
  isObsDomainError,
  type ObsActionIntent,
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

/**
 * Slice 7 — THE SAFETY CORE: the confirm → dispatch action gate. These tests prove
 * the non-negotiable: no stream/scene-affecting action reaches OBS without an
 * explicit human confirmation, dispatch is the sole port-mutate caller, a failed
 * dispatch is recorded with a redacted message, and terminal intents are not
 * re-dispatchable.
 */
describe("createInMemoryObsServicesAdapter action gate (slice 7)", () => {
  // A monotonic id generator per kind so audit rows + intents have stable refs.
  const sequentialIds = (): {
    readonly actionIntentId: () => string;
    readonly logEntryId: () => string;
  } => {
    const counter = (prefix: string): (() => string) => {
      let next = 0;
      return () => {
        next += 1;
        return `${prefix}_${String(next)}`;
      };
    };

    return { actionIntentId: counter("action"), logEntryId: counter("log") };
  };

  /**
   * A connected adapter with a populated catalog snapshot (via refresh) and
   * deterministic ids — the standing setup for every gate test. The fake port's
   * recorded calls are reset-aware: we capture the call count after the read-only
   * refresh so a later assertion can isolate the dispatch's port mutate call.
   */
  const setupConnected = async (
    overrides: Partial<Parameters<typeof createInMemoryObsServicesAdapter>[0]> = {}
  ): Promise<{
    readonly adapter: ReturnType<typeof createInMemoryObsServicesAdapter>;
    readonly fakePort: FakeObsControlPort;
  }> => {
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: sequentialIds(),
      seed: { connectionProfiles: [connectedProfile] },
      ...overrides
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

    return { adapter, fakePort };
  };

  const requestSwitchScene = (
    adapter: ReturnType<typeof createInMemoryObsServicesAdapter>,
    origin: "human" | "ai-suggested" = "human"
  ): Promise<{ readonly actionIntentId: string }> =>
    adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin,
        requestedByRef: origin === "human" ? "operator_1" : "ai_assistant",
        targetSceneRef: "scene-lower"
      },
      requestId: `request_${origin}`
    });

  const confirm = (
    adapter: ReturnType<typeof createInMemoryObsServicesAdapter>,
    actionIntentId: string
  ): Promise<ObsActionIntent> =>
    adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Go to the lower third." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm"
    });

  const dispatch = (
    adapter: ReturnType<typeof createInMemoryObsServicesAdapter>,
    actionIntentId: string
  ): Promise<ObsActionIntent> =>
    adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId },
      requestId: "request_dispatch"
    });

  const portMutateCalls = (fakePort: FakeObsControlPort): readonly FakeObsOperation[] =>
    fakePort
      .calls()
      .map((call) => call.operation)
      .filter((operation) => PORT_MUTATE_OPERATIONS.includes(operation));

  it("request → confirm → dispatch (happy path): calls the matching port method exactly once, ends succeeded, audits every step", async () => {
    const { adapter, fakePort } = await setupConnected();

    const requested = await requestSwitchScene(adapter);
    const confirmed = await confirm(adapter, requested.actionIntentId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmation).toMatchObject({
      confirmed: true,
      confirmedByRef: "operator_1",
      reason: "Go to the lower third."
    });

    const dispatched = await dispatch(adapter, requested.actionIntentId);

    // The intent ends succeeded and still carries its confirmation.
    expect(dispatched.status).toBe("succeeded");
    expect(dispatched.confirmation?.confirmedByRef).toBe("operator_1");

    // The matching mutate method (setCurrentProgramScene for switch-scene) was
    // called EXACTLY once, and no other mutate method ran.
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
    const sceneCall = fakePort
      .calls()
      .find((call) => call.operation === "setCurrentProgramScene");
    expect(sceneCall?.args).toEqual({ obsSceneRef: "scene-lower" });
    // The fake actually applied the switch.
    expect(fakePort.currentProgramSceneRef()).toBe("scene-lower");

    // The append-only audit log carries the full lifecycle: requested, confirmed,
    // dispatched, succeeded — in order, with no redacted safeMessage on success.
    expect(adapter.readActionLog().map((entry) => entry.outcome)).toEqual([
      "requested",
      "confirmed",
      "dispatched",
      "succeeded"
    ]);
    expect(
      adapter.readActionLog().every((entry) => entry.safeMessage === undefined)
    ).toBe(true);
  });

  it("CRITICAL: dispatch WITHOUT a prior confirm is refused (NOT_CONFIRMED) and the port is NEVER called", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);

    await expectDomainErrorCode(
      dispatch(adapter, requested.actionIntentId),
      "NOT_CONFIRMED"
    );

    // The single most important assertion in the module: no mutate method ran.
    expectNoPortMutation(fakePort);
    expect(portMutateCalls(fakePort)).toEqual([]);

    // The intent is untouched at `requested`; only the request audit row exists.
    const stored = adapter
      .readActionIntents()
      .find((intent) => intent.actionIntentId === requested.actionIntentId);
    expect(stored?.status).toBe("requested");
    expect(adapter.readActionLog().map((entry) => entry.outcome)).toEqual([
      "requested"
    ]);
  });

  it("an ai-suggested intent cannot reach dispatch without a human confirm; only the human confirm path advances it", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter, "ai-suggested");

    // Straight to dispatch on the AI's behalf → refused, port untouched. AI can
    // never self-dispatch.
    await expectDomainErrorCode(
      dispatch(adapter, requested.actionIntentId),
      "NOT_CONFIRMED"
    );
    expectNoPortMutation(fakePort);

    // A HUMAN confirms the AI suggestion — the only path that advances it — then
    // dispatch succeeds. There is no auto-confirm: the AI intent moved only because
    // a human acted.
    const confirmed = await confirm(adapter, requested.actionIntentId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.origin).toBe("ai-suggested");
    expect(confirmed.confirmation?.confirmedByRef).toBe("operator_1");

    const dispatched = await dispatch(adapter, requested.actionIntentId);
    expect(dispatched.status).toBe("succeeded");
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
  });

  it("a confirmed dispatch that the port rejects ends failed with a REDACTED safeMessage (no secrets/URL) and is classified", async () => {
    const { adapter, fakePort } = await setupConnected();
    // Inject a port failure on the matching mutate method.
    fakePort.setFailure("setCurrentProgramScene", { code: "action-rejected" });

    const requested = await requestSwitchScene(adapter);
    await confirm(adapter, requested.actionIntentId);
    const failed = await dispatch(adapter, requested.actionIntentId);

    // The port WAS called (the attempt reached OBS) but the intent ends terminal
    // `failed` with a redacted failure message.
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
    expect(failed.status).toBe("failed");
    expect(failed.safeFailureMessage).toBe("OBS rejected the requested action.");

    // The redacted message carries no secret/URL/connection detail.
    const failMessage = failed.safeFailureMessage ?? "";
    expect(failMessage).not.toContain("vault://");
    expect(failMessage).not.toContain("password");
    expect(failMessage).not.toContain("://");

    // The audit log records dispatched then failed, and the failed row carries the
    // SAME redacted safeMessage (a classified, terminal failure).
    expect(adapter.readActionLog().map((entry) => entry.outcome)).toEqual([
      "requested",
      "confirmed",
      "dispatched",
      "failed"
    ]);
    const failedRow = adapter
      .readActionLog()
      .find((entry) => entry.outcome === "failed");
    expect(failedRow?.safeMessage).toBe("OBS rejected the requested action.");
    expect(failedRow?.reason).toContain("terminal");
  });

  it("a retryable (disconnected) port failure is classified but still recorded terminal failed (no auto-retry, no second port call)", async () => {
    const { adapter, fakePort } = await setupConnected();
    fakePort.setFailure("setCurrentProgramScene", { code: "disconnected" });

    const requested = await requestSwitchScene(adapter);
    await confirm(adapter, requested.actionIntentId);
    const failed = await dispatch(adapter, requested.actionIntentId);

    expect(failed.status).toBe("failed");
    expect(failed.safeFailureMessage).toBe("The OBS instance is not reachable.");
    // Classified retryable in the audit reason, but the intent is terminal — a
    // fresh confirmation (new intent) is required to retry; nothing auto-retries.
    const failedRow = adapter
      .readActionLog()
      .find((entry) => entry.outcome === "failed");
    expect(failedRow?.reason).toContain("retryable");

    // Re-dispatching the now-failed intent is rejected (its status is no longer
    // `confirmed`, so the NOT_CONFIRMED gate fires first) and never calls the port
    // again.
    await expectDomainErrorCode(
      dispatch(adapter, requested.actionIntentId),
      "NOT_CONFIRMED"
    );
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
  });

  it("a succeeded intent cannot be re-dispatched (no second port call)", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);
    await confirm(adapter, requested.actionIntentId);
    await dispatch(adapter, requested.actionIntentId);
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);

    // Second dispatch of the terminal `succeeded` intent → rejected by the
    // NOT_CONFIRMED gate (it is no longer `confirmed`); the port is not called a
    // second time. The pure transition map would also reject it, but the gate runs
    // first — re-dispatch of any non-confirmed intent is uniformly refused.
    await expectDomainErrorCode(
      dispatch(adapter, requested.actionIntentId),
      "NOT_CONFIRMED"
    );
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
  });

  it("a canceled intent cannot be confirmed or dispatched (terminal), and cancel never calls the port", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);

    const canceled = await adapter.commandService.cancelObsAction({
      actor: leader,
      input: { actionIntentId: requested.actionIntentId, reason: "Not needed." },
      requestId: "request_cancel"
    });
    expect(canceled.status).toBe("canceled");
    // Cancel writes an audit row but never touches the port.
    expectNoPortMutation(fakePort);
    expect(adapter.readActionLog().map((entry) => entry.outcome)).toEqual([
      "requested",
      "canceled"
    ]);

    // The terminal canceled intent can neither be confirmed nor dispatched.
    await expectDomainErrorCode(
      confirm(adapter, requested.actionIntentId),
      "VALIDATION_FAILED"
    );
    await expectDomainErrorCode(
      dispatch(adapter, requested.actionIntentId),
      "NOT_CONFIRMED"
    );
    expectNoPortMutation(fakePort);
  });

  it("can cancel a confirmed intent before dispatch (no port call)", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);
    await confirm(adapter, requested.actionIntentId);

    const canceled = await adapter.commandService.cancelObsAction({
      actor: leader,
      input: { actionIntentId: requested.actionIntentId, reason: "Stand down." },
      requestId: "request_cancel_confirmed"
    });

    expect(canceled.status).toBe("canceled");
    expectNoPortMutation(fakePort);
  });

  it("a confirmed start-stream dispatch calls startStream once and writes the coarse active stream state", async () => {
    const { adapter, fakePort } = await setupConnected();

    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "start-stream",
        origin: "human",
        requestedByRef: "operator_1"
      },
      requestId: "request_start_stream"
    });
    await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: requested.actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Service is starting." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm_stream"
    });

    const dispatched = await dispatch(adapter, requested.actionIntentId);
    expect(dispatched.status).toBe("succeeded");
    expect(portMutateCalls(fakePort)).toEqual(["startStream"]);

    // The durable coarse stream snapshot was written only after the confirmed
    // dispatch succeeded, stamped with the action ref + actor.
    const streamState = adapter
      .readStreamStates()
      .find((state) => state.connectionProfileId === "connection_1");
    expect(streamState?.streamStatus).toBe("active");
    expect(streamState?.lastActionIntentRef).toBe(requested.actionIntentId);
    expect(streamState?.lastTransitionActorId).toBe("leader_1");
  });

  it("confirm/dispatch/cancel are tenant-isolated: another tenant cannot touch this tenant's intent", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);

    // A different tenant's leader sees the intent as not-found for every gate op.
    await expectDomainErrorCode(
      adapter.commandService.confirmObsAction({
        actor: otherTenantLeader,
        input: {
          actionIntentId: requested.actionIntentId,
          confirmationIntent: { confirmed: true, reason: "Cross-tenant." },
          confirmedByRef: "intruder"
        },
        requestId: "request_cross_confirm"
      }),
      "ACTION_INTENT_NOT_FOUND"
    );

    // Confirm legitimately as the owning tenant, then prove cross-tenant dispatch
    // is still refused as not-found.
    await confirm(adapter, requested.actionIntentId);
    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: otherTenantLeader,
        input: { actionIntentId: requested.actionIntentId },
        requestId: "request_cross_dispatch"
      }),
      "ACTION_INTENT_NOT_FOUND"
    );
    await expectDomainErrorCode(
      adapter.commandService.cancelObsAction({
        actor: otherTenantLeader,
        input: { actionIntentId: requested.actionIntentId, reason: "Cross-tenant." },
        requestId: "request_cross_cancel"
      }),
      "ACTION_INTENT_NOT_FOUND"
    );

    // No cross-tenant op ever reached the port.
    expectNoPortMutation(fakePort);
  });

  it("a viewer cannot confirm or dispatch an action (AUTHORIZATION_FAILED), and the port stays untouched", async () => {
    const { adapter, fakePort } = await setupConnected();
    const requested = await requestSwitchScene(adapter);

    await expectDomainErrorCode(
      adapter.commandService.confirmObsAction({
        actor: viewer,
        input: {
          actionIntentId: requested.actionIntentId,
          confirmationIntent: { confirmed: true, reason: "Nope." },
          confirmedByRef: "viewer_1"
        },
        requestId: "request_viewer_confirm"
      }),
      "AUTHORIZATION_FAILED"
    );
    await confirm(adapter, requested.actionIntentId);
    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: viewer,
        input: { actionIntentId: requested.actionIntentId },
        requestId: "request_viewer_dispatch"
      }),
      "AUTHORIZATION_FAILED"
    );

    expectNoPortMutation(fakePort);
  });

  it("dispatching an unknown intent id is ACTION_INTENT_NOT_FOUND and never calls the port", async () => {
    const { adapter, fakePort } = await setupConnected();

    await expectDomainErrorCode(
      dispatch(adapter, "action_missing"),
      "ACTION_INTENT_NOT_FOUND"
    );
    expectNoPortMutation(fakePort);
  });
});

describe("createInMemoryObsServicesAdapter durable event emission (slice 9)", () => {
  const sequentialIds = (): {
    readonly actionIntentId: () => string;
    readonly logEntryId: () => string;
  } => {
    const counter = (prefix: string): (() => string) => {
      let next = 0;
      return () => {
        next += 1;
        return `${prefix}_${String(next)}`;
      };
    };

    return { actionIntentId: counter("action"), logEntryId: counter("log") };
  };

  /**
   * A connected adapter with an injected in-memory event publisher and a fake port
   * primed with a catalog. Each test runs its own `refresh` (which seeds the
   * snapshot and emits the four connection-scoped events), then `clear()`s the
   * publisher when it only cares about a later dispatch's emissions.
   */
  const setupWithPublisher = (): {
    readonly adapter: ReturnType<typeof createInMemoryObsServicesAdapter>;
    readonly eventPublisher: InMemoryEventPublisher;
    readonly fakePort: FakeObsControlPort;
  } => {
    const eventPublisher = createInMemoryEventPublisher();
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      eventPublisher,
      ids: sequentialIds(),
      seed: { connectionProfiles: [connectedProfile] }
    });

    return { adapter, eventPublisher, fakePort };
  };

  const refresh = (
    adapter: ReturnType<typeof createInMemoryObsServicesAdapter>
  ): Promise<unknown> =>
    adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });

  const summarize = (
    events: readonly ValidatedApiEventEnvelope[]
  ): readonly {
    readonly aggregateId: string;
    readonly eventType: string;
    readonly tenantId: string;
  }[] =>
    events.map((event) => ({
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      tenantId: event.tenantId
    }));

  it("refreshObsCatalog emits the four connection-scoped OBS state events after the durable snapshot commit", async () => {
    const { adapter, eventPublisher } = setupWithPublisher();

    await refresh(adapter);

    // All four connection-scoped events fire, in order, aggregate = connection id,
    // tenant-scoped — only after the snapshot/stream/recording/connection commits.
    expect(summarize(eventPublisher.readPublishedEvents())).toEqual([
      {
        aggregateId: "connection_1",
        eventType: "obs.connectionStatusChanged",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "connection_1",
        eventType: "obs.streamStateChanged",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "connection_1",
        eventType: "obs.recordingStateChanged",
        tenantId: "tenant_1"
      },
      {
        aggregateId: "connection_1",
        eventType: "obs.sceneChanged",
        tenantId: "tenant_1"
      }
    ]);

    // The scene event carries the resolved coarse program-scene ref (the single
    // isCurrentProgramScene from the reconciled snapshot) and nothing else risky.
    const sceneEvent = eventPublisher
      .readPublishedEvents()
      .find((event) => event.eventType === "obs.sceneChanged");
    expect(sceneEvent?.payload).toEqual({
      connectionProfileId: "connection_1",
      programSceneRef: "scene-main",
      tenantId: "tenant_1",
      updatedAt: timestamp
    });

    // The connection event reports the coarse connected status — no host/port/etc.
    const connectionEvent = eventPublisher
      .readPublishedEvents()
      .find((event) => event.eventType === "obs.connectionStatusChanged");
    expect(connectionEvent?.payload).toEqual({
      connectionProfileId: "connection_1",
      connectionStatus: "connected",
      tenantId: "tenant_1",
      updatedAt: timestamp
    });
  });

  it("a failed refresh (disconnected port) commits no snapshot and emits nothing", async () => {
    const eventPublisher = createInMemoryEventPublisher();
    // Default port is a disconnected fake → the read fails → OBS_DISCONNECTED.
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      eventPublisher,
      ids: sequentialIds(),
      seed: { connectionProfiles: [connectedProfile] }
    });

    await expectDomainErrorCode(refresh(adapter), "OBS_DISCONNECTED");

    // The pre-commit failure means no durable state changed, so no event is emitted.
    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });

  it("a successful switch-scene dispatch emits obs.actionStatusChanged(succeeded) scoped to the action intent, and no stream event", async () => {
    const { adapter, eventPublisher } = setupWithPublisher();
    await refresh(adapter);
    eventPublisher.clear();

    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_switch"
    });

    // requestObsAction is a pre-dispatch step: it must emit NOTHING.
    expect(eventPublisher.readPublishedEvents()).toEqual([]);

    await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: requested.actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Go to the lower third." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm"
    });

    // confirmObsAction is also a pre-dispatch step: still NOTHING emitted.
    expect(eventPublisher.readPublishedEvents()).toEqual([]);

    await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: requested.actionIntentId },
      requestId: "request_dispatch"
    });

    // Only on the successful dispatch: a single action-status event, scoped to the
    // ACTION INTENT id (not the connection) — a scene toggle re-snapshots no stream
    // state, so no obs.streamStateChanged rides along.
    const emitted = eventPublisher.readPublishedEvents();
    expect(emitted.map((event) => event.eventType)).toEqual([
      "obs.actionStatusChanged"
    ]);
    expect(emitted[0]?.aggregateId).toBe(requested.actionIntentId);
    expect(emitted[0]?.payload).toEqual({
      actionIntentId: requested.actionIntentId,
      connectionProfileId: "connection_1",
      kind: "switch-scene",
      origin: "human",
      status: "succeeded",
      tenantId: "tenant_1",
      updatedAt: timestamp
    });
  });

  it("a successful start-stream dispatch emits obs.actionStatusChanged(succeeded) AND obs.streamStateChanged for the durable stream transition", async () => {
    const { adapter, eventPublisher } = setupWithPublisher();
    await refresh(adapter);
    eventPublisher.clear();

    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "start-stream",
        origin: "human",
        requestedByRef: "operator_1"
      },
      requestId: "request_start_stream"
    });
    await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: requested.actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Service is starting." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm_stream"
    });
    await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: requested.actionIntentId },
      requestId: "request_dispatch_stream"
    });

    const emitted = eventPublisher.readPublishedEvents();
    // Action-status first (action-intent scoped), then the durable stream change
    // (connection scoped) — both only after the confirmed dispatch succeeded.
    expect(
      emitted.map((event) => ({
        aggregateId: event.aggregateId,
        eventType: event.eventType
      }))
    ).toEqual([
      { aggregateId: requested.actionIntentId, eventType: "obs.actionStatusChanged" },
      { aggregateId: "connection_1", eventType: "obs.streamStateChanged" }
    ]);

    const streamEvent = emitted.find(
      (event) => event.eventType === "obs.streamStateChanged"
    );
    expect(streamEvent?.payload).toEqual({
      connectionProfileId: "connection_1",
      lastActionIntentRef: requested.actionIntentId,
      lastTransitionAt: timestamp,
      streamStatus: "active",
      tenantId: "tenant_1",
      updatedAt: timestamp
    });
  });

  it("CRITICAL: a dispatch refused pre-commit (NOT_CONFIRMED) emits NOTHING — no event rides an un-dispatched action", async () => {
    const { adapter, eventPublisher } = setupWithPublisher();
    await refresh(adapter);
    eventPublisher.clear();

    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_switch"
    });
    // requestObsAction emitted nothing.
    expect(eventPublisher.readPublishedEvents()).toEqual([]);

    // Dispatch WITHOUT a confirm is refused by the gate before the port/commit.
    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: leader,
        input: { actionIntentId: requested.actionIntentId },
        requestId: "request_dispatch_unconfirmed"
      }),
      "NOT_CONFIRMED"
    );

    // No durable dispatch happened, so no event was emitted.
    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });

  it("a port-failed dispatch emits a single obs.actionStatusChanged(failed) whose payload is secret-free (no message field)", async () => {
    const { adapter, eventPublisher, fakePort } = setupWithPublisher();
    await refresh(adapter);
    eventPublisher.clear();
    fakePort.setFailure("setCurrentProgramScene", { code: "action-rejected" });

    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "switch-scene",
        origin: "human",
        requestedByRef: "operator_1",
        targetSceneRef: "scene-lower"
      },
      requestId: "request_switch"
    });
    await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: requested.actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Go to the lower third." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm"
    });
    const failed = await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: requested.actionIntentId },
      requestId: "request_dispatch_failing"
    });
    expect(failed.status).toBe("failed");
    // The intent itself carries the redacted failure message...
    expect(failed.safeFailureMessage).toBe("OBS rejected the requested action.");

    const emitted = eventPublisher.readPublishedEvents();
    expect(emitted.map((event) => event.eventType)).toEqual([
      "obs.actionStatusChanged"
    ]);
    // ...but the EVENT payload is status + ids + kind/origin only — it has no
    // message/safeFailureMessage field at all, so the redaction can never leak onto
    // the event union.
    expect(emitted[0]?.payload).toEqual({
      actionIntentId: requested.actionIntentId,
      connectionProfileId: "connection_1",
      kind: "switch-scene",
      origin: "human",
      status: "failed",
      tenantId: "tenant_1",
      updatedAt: timestamp
    });
    expect(emitted[0]?.payload).not.toHaveProperty("safeFailureMessage");
  });

  it("emits nothing when no event publisher is injected (emission is opt-in)", async () => {
    // Same successful dispatch flow, but no publisher — the publishObsEvents reducer
    // no-ops, so the adapter behaves exactly as before slice 9.
    const fakePort = connectedFakePort();
    const adapter = createInMemoryObsServicesAdapter({
      clock: () => timestamp,
      controlPort: fakePort.port,
      ids: sequentialIds(),
      seed: { connectionProfiles: [connectedProfile] }
    });
    await adapter.commandService.refreshObsCatalog({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_refresh"
    });
    const requested = await adapter.commandService.requestObsAction({
      actor: leader,
      input: {
        connectionProfileId: "connection_1",
        kind: "start-stream",
        origin: "human",
        requestedByRef: "operator_1"
      },
      requestId: "request_start_stream"
    });
    await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: requested.actionIntentId,
        confirmationIntent: { confirmed: true, reason: "Service is starting." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm_stream"
    });

    // No throw, normal success path — the absence of a publisher is invisible.
    await expect(
      adapter.commandService.dispatchObsAction({
        actor: leader,
        input: { actionIntentId: requested.actionIntentId },
        requestId: "request_dispatch_stream"
      })
    ).resolves.toMatchObject({ status: "succeeded" });
  });
});
