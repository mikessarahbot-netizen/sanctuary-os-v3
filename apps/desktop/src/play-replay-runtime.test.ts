import { describe, expect, it } from "vitest";
import type {
  PlayLocalSyncQueueEntryPersistenceRecord,
  SqliteBindValue,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PlayReplayCommandExecutor } from "@sanctuary-os/api/play";
import { createPlayDesktopReplayRuntime } from "./play-replay-runtime.js";
import type { PlayDesktopReplayIntervalScheduler } from "./play-replay-scheduler.js";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const tenantId = "tenant_runtime_1";

const actor: AuthenticatedActor = {
  actorId: "musician_runtime_1",
  roles: ["musician"],
  tenantId
};

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const noopInterval: PlayDesktopReplayIntervalScheduler<string> = {
  cancel: () => undefined,
  schedule: () => "handle-1"
};

const wrapMigrationClient = (
  database: InstanceType<NonNullable<typeof nodeSqlite>["DatabaseSync"]>
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters: readonly SqliteBindValue[]): readonly Record<string, unknown>[] =>
        statement.all(...parameters),
      run: (...parameters: readonly SqliteBindValue[]) => {
        const result = statement.run(...parameters);

        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        };
      }
    };
  }
});

interface FakeCommandService {
  readonly calls: readonly string[];
  readonly service: PlayReplayCommandExecutor;
}

const createFakeCommandService = (): FakeCommandService => {
  const calls: string[] = [];
  const handle = (operation: string): Promise<unknown> => {
    calls.push(operation);

    return Promise.resolve();
  };

  return {
    get calls(): readonly string[] {
      return calls;
    },
    service: {
      addPlayCue: () => handle("addPlayCue"),
      reorderPlaySections: () => handle("reorderPlaySections"),
      savePadLayer: () => handle("savePadLayer"),
      savePlayArrangement: () => handle("savePlayArrangement"),
      savePlaySection: () => handle("savePlaySection"),
      saveTrackSet: () => handle("saveTrackSet"),
      setPlaybackState: () => handle("setPlaybackState"),
      updatePlayCue: () => handle("updatePlayCue"),
      updateTrackSetMembers: () => handle("updateTrackSetMembers")
    } satisfies PlayReplayCommandExecutor
  };
};

const queuedEntry: PlayLocalSyncQueueEntryPersistenceRecord = {
  actorId: "musician_runtime_1",
  attemptCount: 0,
  createdAt: "2026-06-17T07:00:00.000Z",
  operation: {
    operation: "setPlaybackState",
    payload: {
      clickEnabled: true,
      positionBeats: 0,
      tenantId,
      trackSetId: "track_set_runtime_1",
      transportStatus: "stopped",
      updatedAt: "2026-06-17T07:00:00.000Z"
    }
  },
  queuedAt: "2026-06-17T07:00:00.000Z",
  queueEntryId: "queue_entry_runtime_1",
  requestId: "request_runtime_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "pending",
  tenantId,
  trackSetId: "track_set_runtime_1",
  updatedAt: "2026-06-17T07:00:00.000Z"
};

describe("createPlayDesktopReplayRuntime", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("migrates, skips while offline, and syncs an entry while online", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");
    let online = false;
    const commandService = createFakeCommandService();

    try {
      const runtime = await createPlayDesktopReplayRuntime({
        actor,
        clock: () => "2026-06-17T07:05:00.000Z",
        commandService: commandService.service,
        database: wrapMigrationClient(database),
        interval: noopInterval,
        intervalMs: 1000,
        isOnline: () => online,
        policy
      });

      expect(runtime.migrations.map((step) => step.outcome)).toContain("applied");

      await runtime.repository.enqueue({
        input: { entry: queuedEntry },
        options: {
          context: { actorId: actor.actorId, requestId: "request_write", tenantId },
          intent: "update"
        }
      });

      // Offline: the scheduled pass skips and the command service is untouched.
      await expect(runtime.scheduler.runOnce()).resolves.toEqual({ status: "skipped-offline" });
      expect(commandService.calls).toEqual([]);

      // Online: the pass replays the entry and marks it synced.
      online = true;
      const outcome = await runtime.scheduler.runOnce();
      expect(outcome.status).toBe("ran");
      if (outcome.status === "ran") {
        expect(outcome.result.synced).toEqual(["queue_entry_runtime_1"]);
      }
      expect(commandService.calls).toEqual(["setPlaybackState"]);

      const stored = await runtime.repository.getById({
        input: { queueEntryId: "queue_entry_runtime_1" },
        options: { context: { actorId: actor.actorId, requestId: "request_read", tenantId } }
      });
      expect(stored?.status).toBe("synced");

      const status = await runtime.getStatus();
      expect(status.summary).toEqual({
        inFlight: 0,
        needsAttention: 0,
        pending: 0,
        synced: 1,
        total: 1
      });
      expect(status.lastResult?.synced).toEqual(["queue_entry_runtime_1"]);
    } finally {
      database.close();
    }
  });

  liveIt("requeues a failed entry through requeueEntry", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const runtime = await createPlayDesktopReplayRuntime({
        actor,
        clock: () => "2026-06-17T07:10:00.000Z",
        commandService: createFakeCommandService().service,
        database: wrapMigrationClient(database),
        interval: noopInterval,
        intervalMs: 1000,
        isOnline: () => true,
        policy
      });

      const writeOptions = {
        context: { actorId: actor.actorId, requestId: "request_write", tenantId },
        intent: "update"
      } as const;

      await runtime.repository.enqueue({ input: { entry: queuedEntry }, options: writeOptions });
      await runtime.repository.markInFlight({
        input: {
          queueEntryId: "queue_entry_runtime_1",
          transition: { from: "pending", to: "in-flight", transitionedAt: "2026-06-17T07:08:00.000Z" }
        },
        options: writeOptions
      });
      await runtime.repository.markFailed({
        input: {
          queueEntryId: "queue_entry_runtime_1",
          safeErrorMessage: "Server rejected this edit; review it.",
          transition: { from: "in-flight", to: "failed", transitionedAt: "2026-06-17T07:09:00.000Z" }
        },
        options: writeOptions
      });

      const requeued = await runtime.requeueEntry("queue_entry_runtime_1");
      expect(requeued.entry.status).toBe("pending");
    } finally {
      database.close();
    }
  });
});
