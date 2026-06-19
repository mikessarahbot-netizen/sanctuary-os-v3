import { describe, expect, it } from "vitest";
import {
  ObsInitialSchemaMigration,
  createObsCommandSqlRepository,
  createObsQuerySqlRepository,
  createSqliteExecutor,
  type ObsActionIntentPersistenceRecord,
  type ObsActionLogEntryPersistenceRecord,
  type ObsConnectionProfilePersistenceRecord,
  type ObsRecordingStatePersistenceRecord,
  type ObsSceneItemPersistenceRecord,
  type ObsScenePersistenceRecord,
  type ObsSourcePersistenceRecord,
  type ObsSqlExecutor,
  type ObsStreamStatePersistenceRecord,
  type PlanningSqlRow,
  type ReplaceObsCatalogSnapshotPersistenceInput
} from "./index.js";

const TENANT = "tenant_1";
const CONNECTION = "connection_1";

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId: TENANT }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId: TENANT },
  intent: "update"
} as const;

const connectionProfileRecord: ObsConnectionProfilePersistenceRecord = {
  connectionProfileId: CONNECTION,
  connectionRef: "vault_obs_handle_1",
  connectionStatus: "connected",
  createdAt: "2026-06-17T08:00:00.000Z",
  label: "Sanctuary Encoder",
  lastSeenAt: "2026-06-17T08:00:00.000Z",
  obsWebsocketVersion: "5.4.2",
  schemaVersion: "obs.v1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const sceneRecord: ObsScenePersistenceRecord = {
  connectionProfileId: CONNECTION,
  displayName: "Worship",
  isCurrentProgramScene: true,
  obsSceneRef: "scene_worship",
  orderHint: 0,
  sceneId: "scene_1",
  snapshotAt: "2026-06-17T08:00:00.000Z",
  tenantId: TENANT
};

const secondSceneRecord: ObsScenePersistenceRecord = {
  connectionProfileId: CONNECTION,
  displayName: "Lower Third",
  isCurrentProgramScene: false,
  obsSceneRef: "scene_lower_third",
  orderHint: 1,
  sceneId: "scene_2",
  snapshotAt: "2026-06-17T08:00:00.000Z",
  tenantId: TENANT
};

const sourceRecord: ObsSourcePersistenceRecord = {
  activeHint: true,
  connectionProfileId: CONNECTION,
  kindLabel: "browser_source",
  mutedHint: false,
  obsSourceRef: "source_cam",
  snapshotAt: "2026-06-17T08:00:00.000Z",
  sourceId: "source_1",
  tenantId: TENANT
};

const hintlessSourceRecord: ObsSourcePersistenceRecord = {
  connectionProfileId: CONNECTION,
  kindLabel: "image_source",
  obsSourceRef: "source_logo",
  snapshotAt: "2026-06-17T08:00:00.000Z",
  sourceId: "source_2",
  tenantId: TENANT
};

const sceneItemRecord: ObsSceneItemPersistenceRecord = {
  connectionProfileId: CONNECTION,
  obsSceneItemId: "7",
  orderHint: 0,
  sceneItemId: "scene_item_1",
  sceneRef: "scene_worship",
  snapshotAt: "2026-06-17T08:00:00.000Z",
  sourceRef: "source_cam",
  tenantId: TENANT,
  visibleHint: true
};

const streamStateRecord: ObsStreamStatePersistenceRecord = {
  connectionProfileId: CONNECTION,
  lastActionIntentRef: "intent_1",
  lastTransitionActorId: "actor_1",
  lastTransitionAt: "2026-06-17T08:10:00.000Z",
  streamStatus: "active",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:10:00.000Z"
};

const recordingStateRecord: ObsRecordingStatePersistenceRecord = {
  connectionProfileId: CONNECTION,
  lastTransitionActorId: "actor_1",
  lastTransitionAt: "2026-06-17T08:10:00.000Z",
  recordingStatus: "inactive",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:10:00.000Z"
};

const requestedIntentRecord: ObsActionIntentPersistenceRecord = {
  actionIntentId: "intent_1",
  affectsLiveOutput: true,
  connectionProfileId: CONNECTION,
  createdAt: "2026-06-17T08:00:00.000Z",
  kind: "start-stream",
  origin: "human",
  requestedByRef: "actor_1",
  status: "requested",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const confirmedIntentRecord: ObsActionIntentPersistenceRecord = {
  ...requestedIntentRecord,
  confirmation: {
    confirmed: true,
    confirmedAt: "2026-06-17T08:05:00.000Z",
    confirmedByRef: "actor_1",
    reason: "Service is starting; go live."
  },
  status: "confirmed",
  updatedAt: "2026-06-17T08:05:00.000Z"
};

const toggleVisibilityIntentRecord: ObsActionIntentPersistenceRecord = {
  actionIntentId: "intent_2",
  affectsLiveOutput: true,
  connectionProfileId: CONNECTION,
  createdAt: "2026-06-17T08:00:00.000Z",
  desiredVisible: true,
  kind: "toggle-source-visibility",
  origin: "human",
  requestedByRef: "actor_1",
  status: "requested",
  targetSceneItemId: "7",
  targetSourceRef: "source_cam",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const logEntryRecord: ObsActionLogEntryPersistenceRecord = {
  actionIntentRef: "intent_1",
  actorId: "actor_1",
  connectionProfileId: CONNECTION,
  logEntryId: "log_1",
  occurredAt: "2026-06-17T08:05:00.000Z",
  outcome: "confirmed",
  reason: "Service is starting; go live.",
  tenantId: TENANT
};

const connectionProfileRow: PlanningSqlRow = {
  connection_profile_id: CONNECTION,
  connection_ref: "vault_obs_handle_1",
  connection_status: "connected",
  created_at: "2026-06-17T08:00:00.000Z",
  label: "Sanctuary Encoder",
  last_seen_at: "2026-06-17T08:00:00.000Z",
  obs_websocket_version: "5.4.2",
  schema_version: "obs.v1",
  tenant_id: TENANT,
  updated_at: "2026-06-17T08:00:00.000Z"
};

const confirmedIntentRow: PlanningSqlRow = {
  action_intent_id: "intent_1",
  affects_live_output: 1,
  confirmation_reason: "Service is starting; go live.",
  confirmed: 1,
  confirmed_at: "2026-06-17T08:05:00.000Z",
  confirmed_by_ref: "actor_1",
  connection_profile_id: CONNECTION,
  created_at: "2026-06-17T08:00:00.000Z",
  desired_muted: null,
  desired_visible: null,
  kind: "start-stream",
  origin: "human",
  requested_by_ref: "actor_1",
  safe_failure_message: null,
  status: "confirmed",
  target_scene_item_id: null,
  target_scene_ref: null,
  target_source_ref: null,
  tenant_id: TENANT,
  updated_at: "2026-06-17T08:05:00.000Z"
};

const sourceRow: PlanningSqlRow = {
  active_hint: 1,
  connection_profile_id: CONNECTION,
  kind_label: "browser_source",
  muted_hint: 0,
  obs_source_ref: "source_cam",
  snapshot_at: "2026-06-17T08:00:00.000Z",
  source_id: "source_1",
  tenant_id: TENANT
};

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): { readonly executor: ObsSqlExecutor; readonly statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const executor: ObsSqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });

      return Promise.resolve({ rows: rowsByName[statement.name] ?? [] });
    }
  };

  return { executor, statements };
};

describe("OBS SQL repository (recording executor)", () => {
  it("scopes getObsConnectionProfile by tenant and maps the row, exposing only an opaque ref", async () => {
    const { executor, statements } = createRecordingExecutor({
      "obs.connection_profiles.get": [connectionProfileRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const profile = await repository.getObsConnectionProfile({
      input: { connectionProfileId: CONNECTION },
      options: readOptions
    });

    expect(profile?.connectionProfileId).toBe(CONNECTION);
    expect(profile?.tenantId).toBe(TENANT);
    expect(profile?.connectionRef).toBe("vault_obs_handle_1");
    expect(profile?.connectionStatus).toBe("connected");
    const [statement] = statements;
    expect(statement?.sql).toContain(
      "WHERE tenant_id = ? AND connection_profile_id = ?"
    );
    expect(statement?.parameters).toEqual([TENANT, CONNECTION]);
  });

  it("returns null when getObsConnectionProfile matches no row", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createObsQuerySqlRepository({ executor });

    expect(
      await repository.getObsConnectionProfile({
        input: { connectionProfileId: "missing" },
        options: readOptions
      })
    ).toBeNull();
  });

  it("never exposes a host/port/password/token column on a connection profile mapping", async () => {
    const { executor } = createRecordingExecutor({
      "obs.connection_profiles.get": [connectionProfileRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const profile = await repository.getObsConnectionProfile({
      input: { connectionProfileId: CONNECTION },
      options: readOptions
    });

    const keys = Object.keys(profile ?? {});
    expect(keys).not.toContain("host");
    expect(keys).not.toContain("port");
    expect(keys).not.toContain("password");
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("streamKey");
    expect(keys).toContain("connectionRef");
  });

  it("decodes 0/1 hint columns into booleans and omits null hints on a source", async () => {
    const { executor } = createRecordingExecutor({
      "obs.sources.get": [sourceRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const source = await repository.getObsSource({
      input: { sourceId: "source_1" },
      options: readOptions
    });

    expect(source?.activeHint).toBe(true);
    expect(source?.mutedHint).toBe(false);

    const { executor: hintlessExecutor } = createRecordingExecutor({
      "obs.sources.get": [
        { ...sourceRow, active_hint: null, muted_hint: null, source_id: "source_2" }
      ]
    });
    const hintlessRepository = createObsQuerySqlRepository({ executor: hintlessExecutor });
    const hintless = await hintlessRepository.getObsSource({
      input: { sourceId: "source_2" },
      options: readOptions
    });

    expect(hintless?.activeHint).toBeUndefined();
    expect(hintless?.mutedHint).toBeUndefined();
  });

  it("rebuilds the flattened confirmation columns into the confirmation object when confirmed", async () => {
    const { executor } = createRecordingExecutor({
      "obs.action_intents.get": [confirmedIntentRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const intent = await repository.getObsActionIntent({
      input: { actionIntentId: "intent_1" },
      options: readOptions
    });

    expect(intent?.status).toBe("confirmed");
    expect(intent?.confirmation).toEqual(confirmedIntentRecord.confirmation);
    expect(intent?.affectsLiveOutput).toBe(true);
  });

  it("leaves confirmation undefined when the action intent row is unconfirmed", async () => {
    const requestedRow: PlanningSqlRow = {
      ...confirmedIntentRow,
      confirmation_reason: null,
      confirmed: 0,
      confirmed_at: null,
      confirmed_by_ref: null,
      status: "requested",
      updated_at: "2026-06-17T08:00:00.000Z"
    };
    const { executor } = createRecordingExecutor({
      "obs.action_intents.get": [requestedRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const intent = await repository.getObsActionIntent({
      input: { actionIntentId: "intent_1" },
      options: readOptions
    });

    expect(intent?.status).toBe("requested");
    expect(intent?.confirmation).toBeUndefined();
  });

  it("passes the connection and status filters to listObsActionIntents, repeating each for the null guard", async () => {
    const { executor, statements } = createRecordingExecutor({
      "obs.action_intents.list": [confirmedIntentRow]
    });
    const repository = createObsQuerySqlRepository({ executor });

    const intents = await repository.listObsActionIntents({
      input: { filter: { connectionProfileId: CONNECTION, status: "confirmed" } },
      options: readOptions
    });

    expect(intents).toHaveLength(1);
    expect(statements[0]?.parameters).toEqual([
      TENANT,
      CONNECTION,
      CONNECTION,
      "confirmed",
      "confirmed"
    ]);
  });

  it("lists every tenant action intent when unfiltered", async () => {
    const { executor, statements } = createRecordingExecutor({
      "obs.action_intents.list": []
    });
    const repository = createObsQuerySqlRepository({ executor });

    await repository.listObsActionIntents({ input: {}, options: readOptions });

    expect(statements[0]?.parameters).toEqual([TENANT, null, null, null, null]);
  });

  it("scopes listObsSceneItems by tenant + connection, with an optional scene filter", async () => {
    const { executor, statements } = createRecordingExecutor({
      "obs.scene_items.list": []
    });
    const repository = createObsQuerySqlRepository({ executor });

    await repository.listObsSceneItems({
      input: { connectionProfileId: CONNECTION, sceneRef: "scene_worship" },
      options: readOptions
    });

    const [statement] = statements;
    expect(statement?.sql).toContain("WHERE tenant_id = ?");
    expect(statement?.sql).toContain("connection_profile_id = ?");
    expect(statement?.sql).toContain("(? IS NULL OR scene_ref = ?)");
    expect(statement?.parameters).toEqual([
      TENANT,
      CONNECTION,
      "scene_worship",
      "scene_worship"
    ]);
  });

  it("upserts a connection profile with tenant-scoped parameters and an opaque ref only", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({
      clock: () => "2026-06-17T09:00:00.000Z",
      executor
    });

    const saved = await repository.upsertObsConnectionProfile({
      input: connectionProfileRecord,
      options: writeOptions
    });

    expect(saved).toEqual(connectionProfileRecord);
    const [statement] = statements;
    expect(statement?.name).toBe("obs.connection_profiles.upsert");
    expect(statement?.sql).toContain(
      "ON CONFLICT (tenant_id, connection_profile_id) DO UPDATE"
    );
    expect(statement?.parameters[0]).toBe(TENANT);
    // The opaque vault ref is persisted; no host/port/password is ever in params.
    const serialized = JSON.stringify(statement?.parameters);
    expect(serialized).toContain("vault_obs_handle_1");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toMatch(/wss?:\/\//u);
    expect(serialized).not.toMatch(/:\d{4,5}\b/u);
  });

  it("rejects a connection profile whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.upsertObsConnectionProfile({
        input: { ...connectionProfileRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("rejects an action intent whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.saveObsActionIntent({
        input: { ...requestedIntentRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("encodes the program-scene flag as 0/1 when upserting a scene", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await repository.upsertObsScene({ input: sceneRecord, options: writeOptions });

    const [statement] = statements;
    expect(statement?.name).toBe("obs.scenes.upsert");
    // tenant_id, scene_id, connection_profile_id, obs_scene_ref, display_name,
    // is_current_program_scene
    expect(statement?.parameters[5]).toBe(1);
  });

  it("encodes optional source hints as 0/1 and nullable hints as null", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await repository.upsertObsSource({ input: sourceRecord, options: writeOptions });
    await repository.upsertObsSource({
      input: hintlessSourceRecord,
      options: writeOptions
    });

    // muted_hint at index 5, active_hint at index 6.
    expect(statements[0]?.parameters[5]).toBe(0);
    expect(statements[0]?.parameters[6]).toBe(1);
    expect(statements[1]?.parameters[5]).toBeNull();
    expect(statements[1]?.parameters[6]).toBeNull();
  });

  it("serializes the confirmation columns when saving a confirmed action intent", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveObsActionIntent({
      input: confirmedIntentRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.name).toBe("obs.action_intents.upsert");
    // affects_live_output at index 9, confirmed flag at index 12.
    expect(statement?.parameters[9]).toBe(1);
    expect(statement?.parameters[12]).toBe(1);
    expect(statement?.parameters[13]).toBe("actor_1");
    expect(statement?.parameters[14]).toBe("Service is starting; go live.");
    expect(statement?.parameters[15]).toBe("2026-06-17T08:05:00.000Z");
  });

  it("writes a requested action intent with confirmed=0 and null confirmation columns", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await repository.saveObsActionIntent({
      input: requestedIntentRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.parameters[12]).toBe(0);
    expect(statement?.parameters[13]).toBeNull();
    expect(statement?.parameters[14]).toBeNull();
    expect(statement?.parameters[15]).toBeNull();
  });

  it("advances an action intent status with the confirmation gate via RETURNING", async () => {
    const dispatchedRow: PlanningSqlRow = {
      ...confirmedIntentRow,
      status: "dispatched",
      updated_at: "2026-06-17T08:06:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "obs.action_intents.set_status": [dispatchedRow]
    });
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    const intent = await repository.setObsActionIntentStatus({
      input: {
        actionIntentId: "intent_1",
        confirmation: confirmedIntentRecord.confirmation,
        status: "dispatched",
        updatedAt: "2026-06-17T08:06:00.000Z"
      },
      options: writeOptions
    });

    expect(intent.status).toBe("dispatched");
    expect(intent.confirmation).toEqual(confirmedIntentRecord.confirmation);
    const [statement] = statements;
    expect(statement?.sql).toContain("RETURNING");
    expect(statement?.parameters).toEqual([
      "dispatched",
      null,
      "2026-06-17T08:06:00.000Z",
      1,
      "actor_1",
      "Service is starting; go live.",
      "2026-06-17T08:05:00.000Z",
      TENANT,
      "intent_1"
    ]);
  });

  it("upserts coarse stream state scoped one-per-connection", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await repository.setObsStreamState({
      input: streamStateRecord,
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.name).toBe("obs.stream_state.upsert");
    expect(statement?.sql).toContain(
      "ON CONFLICT (tenant_id, connection_profile_id) DO UPDATE"
    );
    expect(statement?.parameters).toEqual([
      TENANT,
      CONNECTION,
      "active",
      "2026-06-17T08:10:00.000Z",
      "actor_1",
      "intent_1",
      "2026-06-17T08:10:00.000Z"
    ]);
  });

  it("appends an action log entry via INSERT ... RETURNING and maps the row back", async () => {
    const logRow: PlanningSqlRow = {
      action_intent_ref: "intent_1",
      actor_id: "actor_1",
      connection_profile_id: CONNECTION,
      log_entry_id: "log_1",
      occurred_at: "2026-06-17T08:05:00.000Z",
      outcome: "confirmed",
      reason: "Service is starting; go live.",
      safe_message: null,
      tenant_id: TENANT
    };
    const { executor, statements } = createRecordingExecutor({
      "obs.action_log.append": [logRow]
    });
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    const entry = await repository.appendObsActionLogEntry({
      input: logEntryRecord,
      options: writeOptions
    });

    expect(entry.outcome).toBe("confirmed");
    expect(entry.safeMessage).toBeUndefined();
    const [statement] = statements;
    expect(statement?.name).toBe("obs.action_log.append");
    expect(statement?.sql).toContain("INSERT INTO obs_action_log_entries");
    expect(statement?.sql).toContain("RETURNING");
    expect(statement?.parameters[0]).toBe(TENANT);
  });

  it("replaces a catalog snapshot by deleting then re-inserting, all tenant-scoped", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    const snapshot: ReplaceObsCatalogSnapshotPersistenceInput = {
      connectionProfileId: CONNECTION,
      sceneItems: [sceneItemRecord],
      scenes: [sceneRecord, secondSceneRecord],
      sources: [sourceRecord]
    };

    await repository.replaceObsCatalogSnapshot({
      input: snapshot,
      options: writeOptions
    });

    // Three deletes (scene_items, sources, scenes), then 2 scene + 1 source + 1
    // scene-item inserts.
    const deletes = statements.filter((statement) => statement.sql.startsWith("DELETE"));
    expect(deletes).toHaveLength(3);
    expect(deletes.every((statement) => statement.parameters[0] === TENANT)).toBe(true);
    expect(
      deletes.every((statement) => statement.parameters[1] === CONNECTION)
    ).toBe(true);
    expect(
      statements.filter((statement) => statement.name === "obs.scenes.upsert")
    ).toHaveLength(2);
    expect(
      statements.filter((statement) => statement.name === "obs.sources.upsert")
    ).toHaveLength(1);
    expect(
      statements.filter((statement) => statement.name === "obs.scene_items.upsert")
    ).toHaveLength(1);
  });

  it("rejects a catalog snapshot scene whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createObsCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.replaceObsCatalogSnapshot({
        input: {
          connectionProfileId: CONNECTION,
          sceneItems: [],
          scenes: [{ ...sceneRecord, tenantId: "tenant_other" }],
          sources: []
        },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

describe("OBS SQL repository smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(
      nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function"
    ).toBe(true);
  });

  liveIt("persists and reads the OBS control graph via node:sqlite", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(ObsInitialSchemaMigration.upSql);
      const executor = createSqliteExecutor({ database });
      const query = createObsQuerySqlRepository({ executor });
      const command = createObsCommandSqlRepository({
        clock: () => "2026-06-17T12:00:00.000Z",
        executor
      });

      // Connection profile round-trip (opaque ref only).
      await command.upsertObsConnectionProfile({
        input: connectionProfileRecord,
        options: writeOptions
      });
      const profile = await query.getObsConnectionProfile({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(profile?.label).toBe("Sanctuary Encoder");
      expect(profile?.connectionRef).toBe("vault_obs_handle_1");

      // Replace the catalog snapshot (scenes + sources + scene-items).
      await command.replaceObsCatalogSnapshot({
        input: {
          connectionProfileId: CONNECTION,
          sceneItems: [sceneItemRecord],
          scenes: [sceneRecord, secondSceneRecord],
          sources: [sourceRecord, hintlessSourceRecord]
        },
        options: writeOptions
      });
      const scenes = await query.listObsScenes({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(scenes).toHaveLength(2);
      expect(scenes.filter((scene) => scene.isCurrentProgramScene)).toHaveLength(1);
      const sources = await query.listObsSources({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(sources).toHaveLength(2);
      expect(
        sources.find((source) => source.obsSourceRef === "source_logo")?.mutedHint
      ).toBeUndefined();
      const sceneItems = await query.listObsSceneItems({
        input: { connectionProfileId: CONNECTION, sceneRef: "scene_worship" },
        options: readOptions
      });
      expect(sceneItems).toHaveLength(1);
      expect(sceneItems[0]?.visibleHint).toBe(true);

      // A second replace proves delete-then-insert keeps only the new set.
      await command.replaceObsCatalogSnapshot({
        input: {
          connectionProfileId: CONNECTION,
          sceneItems: [],
          scenes: [sceneRecord],
          sources: []
        },
        options: writeOptions
      });
      const replacedScenes = await query.listObsScenes({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(replacedScenes).toHaveLength(1);
      expect(
        await query.listObsSources({
          input: { connectionProfileId: CONNECTION },
          options: readOptions
        })
      ).toHaveLength(0);

      // Coarse stream state (one per connection).
      await command.setObsStreamState({
        input: { ...streamStateRecord, streamStatus: "inactive" },
        options: writeOptions
      });
      await command.setObsRecordingState({
        input: recordingStateRecord,
        options: writeOptions
      });
      const streamState = await query.getObsStreamState({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(streamState?.streamStatus).toBe("inactive");

      // Save a requested intent → confirm it → dispatch it (the confirm gate).
      await command.saveObsActionIntent({
        input: requestedIntentRecord,
        options: writeOptions
      });
      const requested = await query.getObsActionIntent({
        input: { actionIntentId: "intent_1" },
        options: readOptions
      });
      expect(requested?.status).toBe("requested");
      expect(requested?.confirmation).toBeUndefined();

      const confirmed = await command.setObsActionIntentStatus({
        input: {
          actionIntentId: "intent_1",
          confirmation: confirmedIntentRecord.confirmation,
          status: "confirmed",
          updatedAt: "2026-06-17T08:05:00.000Z"
        },
        options: writeOptions
      });
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.confirmation?.confirmedByRef).toBe("actor_1");

      const dispatched = await command.setObsActionIntentStatus({
        input: {
          actionIntentId: "intent_1",
          confirmation: confirmedIntentRecord.confirmation,
          status: "dispatched",
          updatedAt: "2026-06-17T08:06:00.000Z"
        },
        options: writeOptions
      });
      expect(dispatched.status).toBe("dispatched");
      // The confirmation round-trips intact through the gated transition.
      expect(dispatched.confirmation?.reason).toBe("Service is starting; go live.");

      // The confirm-before-dispatch DDL gate: a direct dispatch write WITHOUT a
      // confirmation is rejected by the SQLite CHECK constraint. We save a fresh
      // requested intent, then attempt to flip it straight to dispatched with
      // confirmed still 0 — the underlying executor must reject it.
      await command.saveObsActionIntent({
        input: { ...toggleVisibilityIntentRecord, actionIntentId: "intent_3" },
        options: writeOptions
      });
      await expect(
        executor.query({
          name: "obs.action_intents.illegal_dispatch",
          parameters: ["dispatched", TENANT, "intent_3"],
          sql: `
UPDATE obs_action_intents
SET status = ?
WHERE tenant_id = ? AND action_intent_id = ?
`.trim()
        })
      ).rejects.toThrow();
      // The intent is untouched: still requested, still unconfirmed.
      const stillRequested = await query.getObsActionIntent({
        input: { actionIntentId: "intent_3" },
        options: readOptions
      });
      expect(stillRequested?.status).toBe("requested");
      expect(stillRequested?.confirmation).toBeUndefined();

      // Append a log entry, then read it back through the list round-trip.
      await command.appendObsActionLogEntry({
        input: logEntryRecord,
        options: writeOptions
      });
      const log = await query.listObsActionLog({
        input: { connectionProfileId: CONNECTION },
        options: readOptions
      });
      expect(log).toHaveLength(1);
      expect(log[0]?.outcome).toBe("confirmed");
      expect(log[0]?.actionIntentRef).toBe("intent_1");

      // Intent list round-trip: intent_1 (dispatched) + intent_3 (requested).
      const intents = await query.listObsActionIntents({
        input: { filter: { connectionProfileId: CONNECTION } },
        options: readOptions
      });
      expect(intents).toHaveLength(2);
      expect(new Set(intents.map((intent) => intent.status))).toEqual(
        new Set(["dispatched", "requested"])
      );
    } finally {
      database.close();
    }
  });
});
