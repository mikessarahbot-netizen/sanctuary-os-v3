import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { isObsDomainError } from "../../domain/obs/index.js";
import { createObsPersistenceSelection, migrateObsSqliteSchema } from "./composition.js";
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

const OBS_MIGRATION_ID = "202606170008_obs_initial_schema";

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

/**
 * Independent monotonic id generators per prefix, so distinct rows (e.g. two
 * scenes in one catalog snapshot) get distinct primary keys rather than colliding.
 */
const createSequentialIds = (): ((prefix: string) => () => string) => {
  const counters = new Map<string, number>();

  return (prefix: string) => (): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${String(next)}`;
  };
};

interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

const wrapMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
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

describe("OBS persistence-backed service (node:sqlite integration)", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(
      nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function"
    ).toBe(true);
  });

  liveIt(
    "applies the OBS migration and round-trips request → confirm → dispatch with the gate holding over real SQLite",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-18T12:00:00.000Z";
        const steps = await migrateObsSqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        expect(steps).toEqual([{ migrationId: OBS_MIGRATION_ID, outcome: "applied" }]);

        const fakePort = connectedFakePort();
        const seq = createSequentialIds();
        const selection = createObsPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              controlPort: fakePort.port,
              executor: createSqliteExecutor({ database }),
              ids: {
                actionIntentId: () => "action_created",
                connectionProfileId: () => "connection_created",
                logEntryId: seq("log"),
                sceneId: seq("scene"),
                sceneItemId: seq("scene_item"),
                sourceId: seq("source")
              }
            }
          }
        );
        expect(selection.mode).toBe("sql");
        const { commandService, queryService } = selection.servicesAdapter;

        // save a connection profile — opaque connectionRef only, no secret.
        const saved = await commandService.saveObsConnectionProfile({
          actor: leader,
          input: {
            connectionRef: "vault://obs/connection_created",
            label: "Sanctuary OBS"
          },
          requestId: "request_save_connection"
        });
        expect(saved).toMatchObject({
          connectionProfileId: "connection_created",
          connectionRef: "vault://obs/connection_created",
          connectionStatus: "unknown",
          label: "Sanctuary OBS",
          tenantId: TENANT
        });

        // refresh the catalog from the fake port (read-only) — mirrors OBS, no mutate.
        const snapshot = await commandService.refreshObsCatalog({
          actor: leader,
          input: { connectionProfileId: "connection_created" },
          requestId: "request_refresh"
        });
        expect(snapshot.connectionProfile.connectionStatus).toBe("connected");
        expect(snapshot.scenes.map((scene) => scene.obsSceneRef).sort()).toEqual([
          "scene-lower",
          "scene-main"
        ]);
        expect(snapshot.streamState.streamStatus).toBe("inactive");
        // refresh reads OBS; it never mutates OBS state.
        expect(portMutateCalls(fakePort)).toEqual([]);

        const scenes = await queryService.listObsScenes({
          actor: leader,
          input: { connectionProfileId: "connection_created" },
          requestId: "request_scenes"
        });
        expect(scenes).toHaveLength(2);

        // request a switch-scene (no port contact, eligibility passes)
        const requested = await commandService.requestObsAction({
          actor: leader,
          input: {
            connectionProfileId: "connection_created",
            kind: "switch-scene",
            origin: "human",
            requestedByRef: "operator_1",
            targetSceneRef: "scene-lower"
          },
          requestId: "request_action"
        });
        expect(requested).toMatchObject({
          actionIntentId: "action_created",
          status: "requested"
        });
        expect(requested.confirmation).toBeUndefined();
        expect(portMutateCalls(fakePort)).toEqual([]);

        // CRITICAL: dispatch before confirm is refused over real SQLite, port untouched.
        const dispatchEarly = await commandService
          .dispatchObsAction({
            actor: leader,
            input: { actionIntentId: "action_created" },
            requestId: "request_dispatch_early"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expect(isObsDomainError(dispatchEarly)).toBe(true);
        if (isObsDomainError(dispatchEarly)) {
          expect(dispatchEarly.code).toBe("NOT_CONFIRMED");
        }
        expect(portMutateCalls(fakePort)).toEqual([]);

        // confirm (the human gate) — persists the confirmation, still no port call.
        const confirmed = await commandService.confirmObsAction({
          actor: leader,
          input: {
            actionIntentId: "action_created",
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
        expect(portMutateCalls(fakePort)).toEqual([]);

        // dispatch — the ONE moment OBS state changes; calls the matching port
        // mutate method exactly once and ends succeeded.
        const dispatched = await commandService.dispatchObsAction({
          actor: leader,
          input: { actionIntentId: "action_created" },
          requestId: "request_dispatch"
        });
        expect(dispatched.status).toBe("succeeded");
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
        const sceneCall = fakePort
          .calls()
          .find((call) => call.operation === "setCurrentProgramScene");
        expect(sceneCall?.args).toEqual({ obsSceneRef: "scene-lower" });
        // the fake actually applied the switch.
        expect(fakePort.currentProgramSceneRef()).toBe("scene-lower");

        // the persisted intent reflects the terminal succeeded status.
        const intents = await queryService.listObsActionIntents({
          actor: leader,
          input: {},
          requestId: "request_intents"
        });
        expect(intents).toHaveLength(1);
        expect(intents[0]).toMatchObject({
          actionIntentId: "action_created",
          status: "succeeded"
        });

        // the append-only audit log carries the full lifecycle in order.
        const log = await queryService.listObsActionLog({
          actor: leader,
          input: { connectionProfileId: "connection_created" },
          requestId: "request_log"
        });
        expect(log.map((entry) => entry.outcome)).toEqual([
          "requested",
          "confirmed",
          "dispatched",
          "succeeded"
        ]);
        // success path carries no redacted safeMessage anywhere.
        expect(log.every((entry) => entry.safeMessage === undefined)).toBe(true);

        // tenant isolation: a foreign tenant sees nothing.
        await expect(
          queryService.getObsConnectionProfile({
            actor: otherTenantLeader,
            input: { connectionProfileId: "connection_created" },
            requestId: "request_cross_tenant"
          })
        ).resolves.toBeNull();
        await expect(
          queryService.listObsActionIntents({
            actor: otherTenantLeader,
            input: {},
            requestId: "request_cross_tenant_intents"
          })
        ).resolves.toEqual([]);
      } finally {
        database.close();
      }
    }
  );

  liveIt(
    "a confirmed start-stream dispatch writes the coarse stream-state transition over real SQLite",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-18T12:00:00.000Z";
        await migrateObsSqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        const fakePort = connectedFakePort();
        const seq = createSequentialIds();
        const selection = createObsPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              controlPort: fakePort.port,
              executor: createSqliteExecutor({ database }),
              ids: {
                actionIntentId: () => "action_stream",
                connectionProfileId: () => "connection_stream",
                logEntryId: seq("log"),
                sceneId: seq("scene"),
                sceneItemId: seq("scene_item"),
                sourceId: seq("source")
              }
            }
          }
        );
        const { commandService, queryService } = selection.servicesAdapter;

        await commandService.saveObsConnectionProfile({
          actor: leader,
          input: { connectionRef: "vault://obs/connection_stream", label: "Booth" },
          requestId: "request_save"
        });
        await commandService.refreshObsCatalog({
          actor: leader,
          input: { connectionProfileId: "connection_stream" },
          requestId: "request_refresh"
        });

        await commandService.requestObsAction({
          actor: leader,
          input: {
            connectionProfileId: "connection_stream",
            kind: "start-stream",
            origin: "human",
            requestedByRef: "operator_1"
          },
          requestId: "request_action"
        });
        await commandService.confirmObsAction({
          actor: leader,
          input: {
            actionIntentId: "action_stream",
            confirmationIntent: { confirmed: true, reason: "Service is starting." },
            confirmedByRef: "operator_1"
          },
          requestId: "request_confirm"
        });
        const dispatched = await commandService.dispatchObsAction({
          actor: leader,
          input: { actionIntentId: "action_stream" },
          requestId: "request_dispatch"
        });

        expect(dispatched.status).toBe("succeeded");
        expect(portMutateCalls(fakePort)).toEqual(["startStream"]);

        // The durable coarse stream snapshot moved to active only after the
        // confirmed dispatch succeeded, stamped with the actor + intent ref.
        const streamState = await queryService.getObsStreamState({
          actor: leader,
          input: { connectionProfileId: "connection_stream" },
          requestId: "request_stream_state"
        });
        expect(streamState).toMatchObject({
          lastActionIntentRef: "action_stream",
          lastTransitionActorId: "leader_1",
          streamStatus: "active"
        });
      } finally {
        database.close();
      }
    }
  );

  liveIt("skips already-applied OBS migrations on a second run", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const clock = (): string => "2026-06-18T12:00:00.000Z";
      const migrationDatabase = wrapMigrationDatabase(database);
      await migrateObsSqliteSchema({ clock, database: migrationDatabase });

      await expect(
        migrateObsSqliteSchema({ clock, database: migrationDatabase })
      ).resolves.toEqual([{ migrationId: OBS_MIGRATION_ID, outcome: "skipped" }]);
    } finally {
      database.close();
    }
  });
});
