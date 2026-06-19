import { describe, expect, it } from "vitest";
import type { ObsSqlExecutor, PlanningSqlRow } from "@sanctuary-os/db";
import {
  createObsCommandSqlRepository,
  createObsQuerySqlRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  isObsDomainError,
  type ObsDomainErrorCode
} from "../../domain/obs/index.js";
import {
  createPersistenceBackedObsServicesAdapter,
  type PersistenceBackedObsServiceIds
} from "./persistence.js";
import {
  createFakeObsControlPort,
  type FakeObsControlPort,
  type FakeObsOperation
} from "./fake-control-port.js";

const TENANT = "tenant_1";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: TENANT
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: TENANT
};

const TS = "2026-06-18T09:00:00.000Z";

/**
 * The set of port methods that mutate live OBS state. The confirm→dispatch gate
 * means only `dispatchObsAction`, only for a confirmed intent, may call any of
 * these. Tests assert these never appear in the fake's call log otherwise.
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

const portMutateCalls = (
  fakePort: FakeObsControlPort
): readonly FakeObsOperation[] =>
  fakePort
    .calls()
    .map((call) => call.operation)
    .filter((operation) => PORT_MUTATE_OPERATIONS.includes(operation));

const connectionProfileRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  connection_profile_id: "connection_1",
  connection_ref: "vault://obs/connection_1",
  connection_status: "connected",
  created_at: TS,
  label: "Sanctuary OBS",
  last_seen_at: null,
  obs_websocket_version: null,
  schema_version: "obs.v1",
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const sceneRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  connection_profile_id: "connection_1",
  display_name: "Lower Third",
  is_current_program_scene: 0,
  obs_scene_ref: "scene-lower",
  order_hint: 1,
  scene_id: "scene_row_1",
  snapshot_at: TS,
  tenant_id: TENANT,
  ...overrides
});

const actionIntentRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  action_intent_id: "action_1",
  affects_live_output: 1,
  confirmation_reason: null,
  confirmed: 0,
  confirmed_at: null,
  confirmed_by_ref: null,
  connection_profile_id: "connection_1",
  created_at: TS,
  desired_muted: null,
  desired_visible: null,
  kind: "switch-scene",
  origin: "human",
  requested_by_ref: "operator_1",
  safe_failure_message: null,
  status: "requested",
  target_scene_item_id: null,
  target_scene_ref: "scene-lower",
  target_source_ref: null,
  tenant_id: TENANT,
  updated_at: TS,
  ...overrides
});

const confirmedFields = {
  confirmation_reason: "Go to the lower third.",
  confirmed: 1,
  confirmed_at: TS,
  confirmed_by_ref: "operator_1"
} as const;

/**
 * A valid append-only audit row the recording executor echoes back from the
 * `RETURNING` clause of `obs.action_log.append`. The service ignores the returned
 * value (the append resolves void), so a single canonical row stands in for any
 * audited step; tests assert against the recorded INSERT parameters instead.
 */
const logRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  action_intent_ref: "action_1",
  actor_id: "leader_1",
  connection_profile_id: "connection_1",
  log_entry_id: "log_echo",
  occurred_at: TS,
  outcome: "requested",
  reason: "audited step",
  safe_message: null,
  tenant_id: TENANT,
  ...overrides
});

/** N copies of the canonical audit row-set, one per audited step in a flow. */
const logAppends = (count: number): readonly (readonly PlanningSqlRow[])[] =>
  Array.from({ length: count }, () => [logRow()]);

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

/**
 * Recording executor that consumes row-sets FIFO per statement name, so a
 * multi-step flow (e.g. set_status called for `dispatch` then `succeed`) can
 * return the correct intermediate row at each call. When a name's queue is
 * exhausted (or was never seeded) it returns no rows — matching a real "no match".
 */
const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>>
): {
  readonly executor: ObsSqlExecutor;
  readonly statements: RecordedStatement[];
} => {
  const statements: RecordedStatement[] = [];
  const queues = new Map<string, (readonly PlanningSqlRow[])[]>(
    Object.entries(rowsByName).map(([name, sets]) => [name, [...sets]])
  );
  const executor: ObsSqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });
      const queue = queues.get(statement.name);
      const rows = queue?.shift() ?? [];

      return Promise.resolve({ rows });
    }
  };

  return { executor, statements };
};

const single = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>> =>
  Object.fromEntries(
    Object.entries(rowsByName).map(([name, rows]) => [name, [rows]])
  );

const createAdapter = (
  rowsByName: Readonly<Record<string, readonly (readonly PlanningSqlRow[])[]>>,
  options: {
    readonly clock?: () => string;
    readonly controlPort?: FakeObsControlPort;
    readonly ids?: Partial<PersistenceBackedObsServiceIds>;
  } = {}
): {
  readonly adapter: ReturnType<typeof createPersistenceBackedObsServicesAdapter>;
  readonly statements: RecordedStatement[];
} => {
  const { executor, statements } = createRecordingExecutor(rowsByName);
  const clock = options.clock ?? ((): string => TS);
  const adapter = createPersistenceBackedObsServicesAdapter({
    clock,
    commandRepository: createObsCommandSqlRepository({ clock, executor }),
    queryRepository: createObsQuerySqlRepository({ executor }),
    ...(options.controlPort !== undefined
      ? { controlPort: options.controlPort.port }
      : {}),
    ...(options.ids !== undefined ? { ids: options.ids } : {})
  });

  return { adapter, statements };
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

describe("createPersistenceBackedObsServicesAdapter (recording executor)", () => {
  it("maps a persistence connection-profile row to a branded domain record", async () => {
    const { adapter, statements } = createAdapter(
      single({ "obs.connection_profiles.get": [connectionProfileRow()] })
    );

    const profile = await adapter.queryService.getObsConnectionProfile({
      actor: leader,
      input: { connectionProfileId: "connection_1" },
      requestId: "request_get"
    });

    expect(profile).toMatchObject({
      connectionProfileId: "connection_1",
      connectionRef: "vault://obs/connection_1",
      connectionStatus: "connected",
      label: "Sanctuary OBS",
      tenantId: TENANT
    });
    // The persistence-only schemaVersion field is dropped from the domain record.
    expect(profile === null || "schemaVersion" in profile).toBe(false);
    expect(statements[0]?.name).toBe("obs.connection_profiles.get");
    expect(statements[0]?.parameters).toEqual([TENANT, "connection_1"]);
  });

  it("returns null for a cross-tenant getObsConnectionProfile without leaking the row", async () => {
    const { adapter } = createAdapter(
      single({ "obs.connection_profiles.get": [connectionProfileRow()] })
    );

    await expect(
      adapter.queryService.getObsConnectionProfile({
        actor: otherTenantLeader,
        input: { connectionProfileId: "connection_1" },
        requestId: "request_cross_tenant"
      })
    ).resolves.toBeNull();
  });

  it("derives the persistence schemaVersion and tenant when saving a connection profile", async () => {
    const { adapter, statements } = createAdapter(single({}), {
      ids: { connectionProfileId: () => "connection_created" }
    });

    const profile = await adapter.commandService.saveObsConnectionProfile({
      actor: leader,
      input: { connectionRef: "vault://obs/abc", label: "Booth OBS" },
      requestId: "request_save"
    });

    expect(profile).toMatchObject({
      connectionProfileId: "connection_created",
      connectionRef: "vault://obs/abc",
      connectionStatus: "unknown",
      label: "Booth OBS",
      tenantId: TENANT
    });
    const upsert = statements.find(
      (statement) => statement.name === "obs.connection_profiles.upsert"
    );
    // schema_version (obs.v1) is the 8th positional parameter; never a secret.
    expect(upsert?.parameters).toEqual([
      TENANT,
      "connection_created",
      "Booth OBS",
      "vault://obs/abc",
      "unknown",
      null,
      null,
      "obs.v1",
      TS,
      TS
    ]);
  });

  it("throws CONNECTION_PROFILE_NOT_FOUND when removing an unknown profile", async () => {
    const { adapter } = createAdapter(
      single({ "obs.connection_profiles.get": [] })
    );

    await expectDomainErrorCode(
      adapter.commandService.removeObsConnectionProfile({
        actor: leader,
        input: {
          confirmationIntent: { confirmed: true, reason: "Decommissioned" },
          connectionProfileId: "connection_missing"
        },
        requestId: "request_remove_missing"
      }),
      "CONNECTION_PROFILE_NOT_FOUND"
    );
  });

  it("rejects viewer mutations in the service layer", async () => {
    const { adapter } = createAdapter(single({}));

    await expectDomainErrorCode(
      adapter.commandService.saveObsConnectionProfile({
        actor: viewer,
        input: { connectionRef: "vault://obs/x", label: "Should Fail" },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("throws ACTION_INTENT_NOT_FOUND when confirming an unknown intent", async () => {
    const { adapter } = createAdapter(
      single({ "obs.action_intents.get": [] })
    );

    await expectDomainErrorCode(
      adapter.commandService.confirmObsAction({
        actor: leader,
        input: {
          actionIntentId: "action_missing",
          confirmationIntent: { confirmed: true, reason: "Go" },
          confirmedByRef: "operator_1"
        },
        requestId: "request_confirm_missing"
      }),
      "ACTION_INTENT_NOT_FOUND"
    );
  });

  it("CRITICAL: dispatch WITHOUT a prior confirm is refused (NOT_CONFIRMED) and the port is NEVER called", async () => {
    const fakePort = createFakeObsControlPort({
      currentProgramSceneRef: "scene-main",
      scenes: [
        { displayName: "Main", obsSceneRef: "scene-main" },
        { displayName: "Lower Third", obsSceneRef: "scene-lower" }
      ],
      streamStatus: "inactive"
    });
    // The intent is loaded at status=requested (unconfirmed).
    const { adapter, statements } = createAdapter(
      single({ "obs.action_intents.get": [actionIntentRow()] }),
      { controlPort: fakePort }
    );

    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: leader,
        input: { actionIntentId: "action_1" },
        requestId: "request_dispatch_unconfirmed"
      }),
      "NOT_CONFIRMED"
    );

    // The single most important assertion in the module: NO port call of any kind
    // ran — the gate refused before reaching the obs-websocket seam.
    expect(fakePort.calls()).toEqual([]);
    expect(portMutateCalls(fakePort)).toEqual([]);
    // No status-update write was issued either: the intent stays at `requested`.
    expect(
      statements.some(
        (statement) => statement.name === "obs.action_intents.set_status"
      )
    ).toBe(false);
  });

  it("an ai-suggested intent is also refused at dispatch without a human confirm; the port stays untouched", async () => {
    const fakePort = createFakeObsControlPort({
      currentProgramSceneRef: "scene-main",
      scenes: [{ displayName: "Main", obsSceneRef: "scene-main" }],
      streamStatus: "inactive"
    });
    const { adapter } = createAdapter(
      single({
        "obs.action_intents.get": [
          actionIntentRow({ action_intent_id: "action_ai", origin: "ai-suggested" })
        ]
      }),
      { controlPort: fakePort }
    );

    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: leader,
        input: { actionIntentId: "action_ai" },
        requestId: "request_dispatch_ai"
      }),
      "NOT_CONFIRMED"
    );
    expect(fakePort.calls()).toEqual([]);
  });

  it("confirmObsAction runs the gate and persists the confirmation + audit, without touching the port", async () => {
    const fakePort = createFakeObsControlPort({
      scenes: [{ displayName: "Lower Third", obsSceneRef: "scene-lower" }],
      streamStatus: "inactive"
    });
    const { adapter, statements } = createAdapter(
      {
        "obs.action_intents.get": [[actionIntentRow()]],
        "obs.action_intents.set_status": [
          [actionIntentRow({ status: "confirmed", ...confirmedFields })]
        ],
        "obs.action_log.append": logAppends(1)
      },
      { controlPort: fakePort, ids: { logEntryId: () => "log_confirm" } }
    );

    const confirmed = await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: "action_1",
        confirmationIntent: { confirmed: true, reason: "Go to the lower third." },
        confirmedByRef: "operator_1"
      },
      requestId: "request_confirm"
    });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmation).toMatchObject({
      confirmed: true,
      confirmedByRef: "operator_1",
      reason: "Go to the lower third."
    });
    // Confirmation is recorded and audited, but the port is never contacted.
    expect(fakePort.calls()).toEqual([]);
    const setStatus = statements.find(
      (statement) => statement.name === "obs.action_intents.set_status"
    );
    expect(setStatus?.parameters[0]).toBe("confirmed");
    const audit = statements.find(
      (statement) => statement.name === "obs.action_log.append"
    );
    expect(audit?.parameters).toContain("confirmed");
  });

  it("dispatch of a confirmed switch-scene calls the matching port method exactly once, ends succeeded, and audits", async () => {
    const fakePort = createFakeObsControlPort({
      currentProgramSceneRef: "scene-main",
      scenes: [
        { displayName: "Main", obsSceneRef: "scene-main" },
        { displayName: "Lower Third", obsSceneRef: "scene-lower" }
      ],
      streamStatus: "inactive"
    });
    const confirmedIntent = actionIntentRow({ status: "confirmed", ...confirmedFields });
    const { adapter, statements } = createAdapter(
      {
        // dispatch loads the intent (confirmed) once, then the connection profile.
        "obs.action_intents.get": [[confirmedIntent]],
        "obs.connection_profiles.get": [[connectionProfileRow()]],
        // listObsSceneItems for the bridge's scene-ref resolution (switch-scene
        // does not need it, but the service loads it anyway) → empty.
        "obs.scene_items.list": [[]],
        // set_status is called for `dispatch` then `succeed`.
        "obs.action_intents.set_status": [
          [actionIntentRow({ status: "dispatched", ...confirmedFields })],
          [actionIntentRow({ status: "succeeded", ...confirmedFields })]
        ],
        "obs.action_log.append": logAppends(2)
      },
      { controlPort: fakePort, ids: { logEntryId: () => "log_dispatch" } }
    );

    const dispatched = await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: "action_1" },
      requestId: "request_dispatch"
    });

    expect(dispatched.status).toBe("succeeded");
    // The matching mutate method (setCurrentProgramScene) ran EXACTLY once.
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
    const sceneCall = fakePort
      .calls()
      .find((call) => call.operation === "setCurrentProgramScene");
    expect(sceneCall?.args).toEqual({ obsSceneRef: "scene-lower" });
    expect(sceneCall?.connectionRef).toBe("vault://obs/connection_1");
    // The audit log was written for dispatched then succeeded.
    const auditOutcomes = statements
      .filter((statement) => statement.name === "obs.action_log.append")
      .map((statement) => statement.parameters[6]);
    expect(auditOutcomes).toEqual(["dispatched", "succeeded"]);
  });

  it("a confirmed dispatch the port rejects ends terminal failed with a REDACTED safeMessage and audits failed", async () => {
    const fakePort = createFakeObsControlPort({
      currentProgramSceneRef: "scene-main",
      scenes: [
        { displayName: "Main", obsSceneRef: "scene-main" },
        { displayName: "Lower Third", obsSceneRef: "scene-lower" }
      ],
      streamStatus: "inactive"
    });
    fakePort.setFailure("setCurrentProgramScene", { code: "action-rejected" });
    const confirmedIntent = actionIntentRow({ status: "confirmed", ...confirmedFields });
    const { adapter, statements } = createAdapter(
      {
        "obs.action_intents.get": [[confirmedIntent]],
        "obs.connection_profiles.get": [[connectionProfileRow()]],
        "obs.scene_items.list": [[]],
        "obs.action_intents.set_status": [
          // dispatch transition
          [actionIntentRow({ status: "dispatched", ...confirmedFields })],
          // failed write
          [
            actionIntentRow({
              safe_failure_message: "OBS rejected the requested action.",
              status: "failed",
              ...confirmedFields
            })
          ]
        ],
        "obs.action_log.append": logAppends(2)
      },
      { controlPort: fakePort, ids: { logEntryId: () => "log_fail" } }
    );

    const failed = await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: "action_1" },
      requestId: "request_dispatch_fail"
    });

    // The port WAS called (the attempt reached OBS) but the intent ends `failed`.
    expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
    expect(failed.status).toBe("failed");
    expect(failed.safeFailureMessage).toBe("OBS rejected the requested action.");
    // The redacted message carries no secret/URL/connection detail.
    const message = failed.safeFailureMessage ?? "";
    expect(message).not.toContain("vault://");
    expect(message).not.toContain("://");
    // The audit log records dispatched then failed; the failed row carries the
    // redacted safeMessage (8th positional parameter).
    const failAudit = statements
      .filter((statement) => statement.name === "obs.action_log.append")
      .map((statement) => statement.parameters[6]);
    expect(failAudit).toEqual(["dispatched", "failed"]);
    const failRow = statements
      .filter((statement) => statement.name === "obs.action_log.append")
      .find((statement) => statement.parameters[6] === "failed");
    expect(failRow?.parameters[7]).toBe("OBS rejected the requested action.");
  });

  it("requestObsAction runs the pure eligibility check and rejects a disconnected snapshot without touching the port", async () => {
    const fakePort = createFakeObsControlPort({ streamStatus: "inactive" });
    const { adapter } = createAdapter(
      {
        // A disconnected profile blocks every action at request time.
        "obs.connection_profiles.get": [
          [connectionProfileRow({ connection_status: "disconnected" })]
        ],
        "obs.scenes.list": [[sceneRow()]],
        "obs.sources.list": [[]],
        "obs.scene_items.list": [[]],
        "obs.stream_state.get": [[]],
        "obs.recording_state.get": [[]]
      },
      { controlPort: fakePort, ids: { actionIntentId: () => "action_req" } }
    );

    await expectDomainErrorCode(
      adapter.commandService.requestObsAction({
        actor: leader,
        input: {
          connectionProfileId: "connection_1",
          kind: "switch-scene",
          origin: "human",
          requestedByRef: "operator_1",
          targetSceneRef: "scene-lower"
        },
        requestId: "request_action_disconnected"
      }),
      "OBS_DISCONNECTED"
    );
    // Eligibility is pure: the port is never consulted on a request.
    expect(fakePort.calls()).toEqual([]);
  });
});
