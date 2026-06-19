import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { isObsDomainError } from "../../domain/obs/index.js";
import {
  createObsPersistenceSelection,
  migrateObsSqliteSchema,
  type ObsPersistenceSelection
} from "./composition.js";
import {
  createFakeObsControlPort,
  type FakeObsControlPort,
  type FakeObsOperation
} from "./fake-control-port.js";

/**
 * ADVERSARIAL safety suite for GUARANTEE 1 (human-confirm gate cannot be
 * bypassed) and GUARANTEE 3 (tenant isolation) on the OBS output surface,
 * exercised over a REAL on-disk node:sqlite database.
 *
 * The existing `sqlite-integration.test.ts` proves the happy path plus
 * "dispatch-before-confirm is refused". This suite goes further and actively
 * TRIES TO BREAK the gate: double-dispatch / replay, confirm-A-dispatch-B,
 * confirm/dispatch/cancel of a *foreign tenant's* intent (seeded with COLLIDING
 * ids in both tenants so a tenant filter is the only thing separating them),
 * re-confirm, confirm-after-dispatch, an ai-suggested intent shoved straight at
 * the port, and a direct raw-SQL attempt to forge a `dispatched` row past the
 * DDL CHECK. Every case asserts the OBS port mutate method was NEVER reached for
 * the illegitimate action.
 */
const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

const leaderA: AuthenticatedActor = {
  actorId: "leader_a",
  roles: ["worship_leader"],
  tenantId: TENANT_A
};

const leaderB: AuthenticatedActor = {
  actorId: "leader_b",
  roles: ["worship_leader"],
  tenantId: TENANT_B
};

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

interface OnDiskDb {
  readonly database: NodeSqliteDatabaseLike & { readonly close: () => void };
  readonly cleanup: () => void;
}

const openOnDiskDatabase = (): OnDiskDb => {
  if (nodeSqlite === undefined) {
    throw new Error("node:sqlite is unavailable.");
  }

  const dir = mkdtempSync(join(tmpdir(), "sanctuary-obs-safety-"));
  const database = new nodeSqlite.DatabaseSync(join(dir, "obs-safety.db"));

  return {
    database,
    cleanup: (): void => {
      database.close();
      rmSync(dir, { force: true, recursive: true });
    }
  };
};

const clock = (): string => "2026-06-18T12:00:00.000Z";

/**
 * Build the persistence-backed OBS services over an already-open DB. The same
 * fake port is shared so the test can assert the cumulative set of port mutate
 * calls across multiple operations.
 */
const buildServices = (
  database: NodeSqliteDatabaseLike,
  fakePort: FakeObsControlPort,
  ids: {
    readonly actionIntentId: () => string;
    readonly connectionProfileId: () => string;
  }
): ObsPersistenceSelection => {
  const seq = createSequentialIds();

  return createObsPersistenceSelection(
    { environment: "production" },
    {
      sql: {
        clock,
        controlPort: fakePort.port,
        executor: createSqliteExecutor({ database }),
        ids: {
          actionIntentId: ids.actionIntentId,
          connectionProfileId: ids.connectionProfileId,
          logEntryId: seq("log"),
          sceneId: seq("scene"),
          sceneItemId: seq("scene_item"),
          sourceId: seq("source")
        }
      }
    }
  );
};

/**
 * Seed a saved + refreshed connection and a single requested switch-scene intent
 * for the given actor, returning the deterministic ids used. Each connection /
 * action id is fixed so colliding-id cross-tenant scenarios are exact.
 */
const seedRequestedSwitchScene = async (
  selection: ObsPersistenceSelection,
  actor: AuthenticatedActor
): Promise<void> => {
  if (selection.mode !== "sql") {
    throw new Error("Expected the sql persistence selection.");
  }

  const { commandService } = selection.servicesAdapter;
  await commandService.saveObsConnectionProfile({
    actor,
    input: {
      connectionRef: "vault://obs/shared_connection",
      label: "Booth"
    },
    requestId: "request_save"
  });
  await commandService.refreshObsCatalog({
    actor,
    input: { connectionProfileId: "connection_shared" },
    requestId: "request_refresh"
  });
  await commandService.requestObsAction({
    actor,
    input: {
      connectionProfileId: "connection_shared",
      kind: "switch-scene",
      origin: "human",
      requestedByRef: "operator",
      targetSceneRef: "scene-lower"
    },
    requestId: "request_action"
  });
};

const confirm = (
  selection: Extract<ObsPersistenceSelection, { mode: "sql" }>,
  actor: AuthenticatedActor,
  reason: string
): Promise<unknown> =>
  selection.servicesAdapter.commandService.confirmObsAction({
    actor,
    input: {
      actionIntentId: "action_shared",
      confirmationIntent: { confirmed: true, reason },
      confirmedByRef: "operator"
    },
    requestId: "request_confirm"
  });

const dispatch = (
  selection: Extract<ObsPersistenceSelection, { mode: "sql" }>,
  actor: AuthenticatedActor,
  requestId: string
): Promise<unknown> =>
  selection.servicesAdapter.commandService.dispatchObsAction({
    actor,
    input: { actionIntentId: "action_shared" },
    requestId
  });

const expectObsErrorCode = (error: unknown, code: string): void => {
  expect(isObsDomainError(error)).toBe(true);
  if (isObsDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

describe("OBS dispatch-gate adversarial safety (real on-disk node:sqlite)", () => {
  liveIt(
    "refuses a SECOND dispatch (replay) after a single confirm — port is mutated exactly once",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });
        const fakePort = connectedFakePort();
        const selection = buildServices(database, fakePort, {
          actionIntentId: () => "action_shared",
          connectionProfileId: () => "connection_shared"
        });
        if (selection.mode !== "sql") {
          throw new Error("Expected the sql persistence selection.");
        }

        await seedRequestedSwitchScene(selection, leaderA);
        await confirm(selection, leaderA, "Go to lower third.");

        const first = await dispatch(selection, leaderA, "request_dispatch_1");
        expect(first).toMatchObject({ status: "succeeded" });
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);

        // Replay the exact same dispatch command. The intent is now `succeeded`,
        // so the gate (status !== "confirmed") must refuse it and the port must
        // NOT be hit a second time.
        const replay = await dispatch(selection, leaderA, "request_dispatch_2").then(
          () => undefined,
          (error: unknown) => error
        );
        expectObsErrorCode(replay, "NOT_CONFIRMED");
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "confirming intent A does NOT authorize dispatching a different intent B",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });
        const fakePort = connectedFakePort();
        const actionIds = ["action_A", "action_B"];
        let actionCursor = 0;
        const selection = buildServices(database, fakePort, {
          actionIntentId: () => actionIds[actionCursor++] ?? "action_overflow",
          connectionProfileId: () => "connection_shared"
        });
        if (selection.mode !== "sql") {
          throw new Error("Expected the sql persistence selection.");
        }

        const { commandService } = selection.servicesAdapter;
        await commandService.saveObsConnectionProfile({
          actor: leaderA,
          input: { connectionRef: "vault://obs/conn", label: "Booth" },
          requestId: "request_save"
        });
        await commandService.refreshObsCatalog({
          actor: leaderA,
          input: { connectionProfileId: "connection_shared" },
          requestId: "request_refresh"
        });

        // Two distinct requested intents: A and B.
        await commandService.requestObsAction({
          actor: leaderA,
          input: {
            connectionProfileId: "connection_shared",
            kind: "switch-scene",
            origin: "human",
            requestedByRef: "operator",
            targetSceneRef: "scene-lower"
          },
          requestId: "request_a"
        });
        await commandService.requestObsAction({
          actor: leaderA,
          input: {
            connectionProfileId: "connection_shared",
            kind: "switch-scene",
            origin: "human",
            requestedByRef: "operator",
            targetSceneRef: "scene-main"
          },
          requestId: "request_b"
        });

        // Confirm ONLY A.
        await commandService.confirmObsAction({
          actor: leaderA,
          input: {
            actionIntentId: "action_A",
            confirmationIntent: { confirmed: true, reason: "Approve A only." },
            confirmedByRef: "operator"
          },
          requestId: "request_confirm_a"
        });

        // Dispatching B (never confirmed) must be refused; port untouched.
        const dispatchB = await commandService
          .dispatchObsAction({
            actor: leaderA,
            input: { actionIntentId: "action_B" },
            requestId: "request_dispatch_b"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expectObsErrorCode(dispatchB, "NOT_CONFIRMED");
        expect(portMutateCalls(fakePort)).toEqual([]);

        // A is still dispatchable (sanity: the confirm bound to A, not nothing).
        const dispatchA = await commandService.dispatchObsAction({
          actor: leaderA,
          input: { actionIntentId: "action_A" },
          requestId: "request_dispatch_a"
        });
        expect(dispatchA).toMatchObject({ status: "succeeded" });
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "a foreign tenant cannot confirm, dispatch, or cancel another tenant's intent — even with COLLIDING ids — and the port is never reached",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });

        // Tenant A and tenant B each get a connection + action with the SAME
        // deterministic ids. The ONLY thing separating their rows is tenant_id.
        const fakePort = connectedFakePort();
        const selection = buildServices(database, fakePort, {
          actionIntentId: () => "action_shared",
          connectionProfileId: () => "connection_shared"
        });
        if (selection.mode !== "sql") {
          throw new Error("Expected the sql persistence selection.");
        }
        const { commandService, queryService } = selection.servicesAdapter;

        await seedRequestedSwitchScene(selection, leaderA);
        await seedRequestedSwitchScene(selection, leaderB);

        // Tenant A confirms ITS OWN intent (legitimate).
        await commandService.confirmObsAction({
          actor: leaderA,
          input: {
            actionIntentId: "action_shared",
            confirmationIntent: { confirmed: true, reason: "A approves." },
            confirmedByRef: "operator"
          },
          requestId: "request_confirm_a"
        });

        // Tenant B attempts to DISPATCH the id it shares with A. B's own row is
        // still merely `requested`, so this must refuse with NOT_CONFIRMED and
        // must NOT touch the port nor reach into A's confirmed row.
        const bDispatch = await commandService
          .dispatchObsAction({
            actor: leaderB,
            input: { actionIntentId: "action_shared" },
            requestId: "request_b_dispatch"
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        expectObsErrorCode(bDispatch, "NOT_CONFIRMED");
        expect(portMutateCalls(fakePort)).toEqual([]);

        // Tenant B attempts to CANCEL the id (would be a cross-tenant mutation of
        // A's row if isolation were broken). B's own requested row is cancelable,
        // so this SUCCEEDS but only against B's row — A's confirmed row is intact.
        await commandService.cancelObsAction({
          actor: leaderB,
          input: { actionIntentId: "action_shared", reason: "B cancels its own." },
          requestId: "request_b_cancel"
        });

        // A's intent must still be `confirmed` (untouched by B's cancel).
        const aIntents = await queryService.listObsActionIntents({
          actor: leaderA,
          input: {},
          requestId: "request_a_intents"
        });
        expect(aIntents).toHaveLength(1);
        expect(aIntents[0]).toMatchObject({
          actionIntentId: "action_shared",
          status: "confirmed"
        });

        // B's intent is the one that got canceled.
        const bIntents = await queryService.listObsActionIntents({
          actor: leaderB,
          input: {},
          requestId: "request_b_intents"
        });
        expect(bIntents).toHaveLength(1);
        expect(bIntents[0]).toMatchObject({
          actionIntentId: "action_shared",
          status: "canceled"
        });

        // A dispatches its OWN confirmed intent: the port fires exactly once and
        // the durable program scene moved — proving B's interference changed nothing.
        const aDispatch = await commandService.dispatchObsAction({
          actor: leaderA,
          input: { actionIntentId: "action_shared" },
          requestId: "request_a_dispatch"
        });
        expect(aDispatch).toMatchObject({ status: "succeeded" });
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "rejects re-confirming an already-confirmed intent and confirming after dispatch",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });
        const fakePort = connectedFakePort();
        const selection = buildServices(database, fakePort, {
          actionIntentId: () => "action_shared",
          connectionProfileId: () => "connection_shared"
        });
        if (selection.mode !== "sql") {
          throw new Error("Expected the sql persistence selection.");
        }

        await seedRequestedSwitchScene(selection, leaderA);
        await confirm(selection, leaderA, "First confirm.");

        // Re-confirm the same intent → rejected (already confirmed / illegal).
        const reConfirm = await confirm(selection, leaderA, "Second confirm.").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isObsDomainError(reConfirm)).toBe(true);
        expect(portMutateCalls(fakePort)).toEqual([]);

        // Dispatch (legitimate) → succeeded.
        await dispatch(selection, leaderA, "request_dispatch");
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);

        // Confirm AFTER dispatch (terminal succeeded) → rejected.
        const lateConfirm = await confirm(selection, leaderA, "Too late.").then(
          () => undefined,
          (error: unknown) => error
        );
        expect(isObsDomainError(lateConfirm)).toBe(true);
        // Still only one port mutate from the single legitimate dispatch.
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "an ai-suggested intent cannot be dispatched without a human confirm, and only a human confirm unlocks the port",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });
        const fakePort = connectedFakePort();
        const selection = buildServices(database, fakePort, {
          actionIntentId: () => "action_shared",
          connectionProfileId: () => "connection_shared"
        });
        if (selection.mode !== "sql") {
          throw new Error("Expected the sql persistence selection.");
        }
        const { commandService } = selection.servicesAdapter;

        await commandService.saveObsConnectionProfile({
          actor: leaderA,
          input: { connectionRef: "vault://obs/conn", label: "Booth" },
          requestId: "request_save"
        });
        await commandService.refreshObsCatalog({
          actor: leaderA,
          input: { connectionProfileId: "connection_shared" },
          requestId: "request_refresh"
        });

        // An AI-ORIGIN requested intent (the kind an AI suggestion produces).
        const suggested = await commandService.requestObsAction({
          actor: leaderA,
          input: {
            connectionProfileId: "connection_shared",
            kind: "switch-scene",
            origin: "ai-suggested",
            requestedByRef: "ai_assistant",
            targetSceneRef: "scene-lower"
          },
          requestId: "request_ai"
        });
        expect(suggested).toMatchObject({ origin: "ai-suggested", status: "requested" });

        // The AI artifact shoved straight at dispatch → NOT_CONFIRMED, port untouched.
        const aiDispatch = await dispatch(selection, leaderA, "request_ai_dispatch").then(
          () => undefined,
          (error: unknown) => error
        );
        expectObsErrorCode(aiDispatch, "NOT_CONFIRMED");
        expect(portMutateCalls(fakePort)).toEqual([]);

        // A HUMAN confirms the ai-suggested intent — the only legitimate path.
        const confirmed = await confirm(selection, leaderA, "Operator approves the AI nudge.");
        expect(confirmed).toMatchObject({ status: "confirmed" });

        const dispatched = await dispatch(selection, leaderA, "request_ai_dispatch_ok");
        expect(dispatched).toMatchObject({ status: "succeeded" });
        expect(portMutateCalls(fakePort)).toEqual(["setCurrentProgramScene"]);
      } finally {
        cleanup();
      }
    }
  );

  liveIt(
    "the DDL CHECK is the last line of defense: a raw INSERT forging status='dispatched' with confirmed=0 is rejected by the database",
    async () => {
      const { database, cleanup } = openOnDiskDatabase();

      try {
        await migrateObsSqliteSchema({ clock, database: wrapMigrationDatabase(database) });

        // Bypass every service/state-machine guard and go straight at the table,
        // attempting to plant a `dispatched` row that no human ever confirmed.
        const forgeDispatchedWithoutConfirmation = (): void => {
          database
            .prepare(
              `INSERT INTO obs_action_intents (
                 tenant_id, action_intent_id, connection_profile_id, kind,
                 target_scene_ref, affects_live_output, status, origin,
                 confirmed, requested_by_ref, created_at, updated_at
               ) VALUES (?, ?, ?, 'switch-scene', 'scene-lower', 1, 'dispatched', 'human', 0, ?, ?, ?)`
            )
            .run(
              TENANT_A,
              "forged_intent",
              "connection_forged",
              "operator",
              clock(),
              clock()
            );
        };
        expect(forgeDispatchedWithoutConfirmation).toThrow();

        // And a row claiming confirmed=1 but with NULL confirmation columns is
        // likewise rejected — "confirmed" must carry the audit trail.
        const forgeConfirmedWithoutAudit = (): void => {
          database
            .prepare(
              `INSERT INTO obs_action_intents (
                 tenant_id, action_intent_id, connection_profile_id, kind,
                 target_scene_ref, affects_live_output, status, origin,
                 confirmed, requested_by_ref, created_at, updated_at
               ) VALUES (?, ?, ?, 'switch-scene', 'scene-lower', 1, 'confirmed', 'human', 1, ?, ?, ?)`
            )
            .run(
              TENANT_A,
              "forged_intent_2",
              "connection_forged",
              "operator",
              clock(),
              clock()
            );
        };
        expect(forgeConfirmedWithoutAudit).toThrow();

        // No forged row landed.
        const rows = database
          .prepare("SELECT action_intent_id FROM obs_action_intents")
          .all();
        expect(rows).toEqual([]);
      } finally {
        cleanup();
      }
    }
  );
});
