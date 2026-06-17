import { describe, expect, it } from "vitest";
import type {
  PresenterLocalSyncQueueEntryPersistenceRecord,
  SqliteBindValue,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PresenterCommandService } from "@sanctuary-os/api/presenter";
import { createPresenterDesktopReplayRuntime } from "./replay-runtime.js";
import type { PresenterDesktopReplayIntervalScheduler } from "./replay-scheduler.js";

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
  actorId: "actor_runtime_1",
  roles: ["worship_leader"],
  tenantId
};

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const noopInterval: PresenterDesktopReplayIntervalScheduler<string> = {
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
  readonly service: PresenterCommandService;
}

const createFakeCommandService = (): FakeCommandService => {
  const calls: string[] = [];
  const handle = (operation: string): Promise<never> => {
    calls.push(operation);

    return Promise.resolve() as Promise<never>;
  };

  return {
    get calls(): readonly string[] {
      return calls;
    },
    service: {
      addSlide: () => handle("addSlide"),
      applyPresenterTheme: () => handle("applyPresenterTheme"),
      createPresentationFromService: () => handle("createPresentationFromService"),
      removeSlide: () => handle("removeSlide"),
      reorderSlides: () => handle("reorderSlides"),
      setOutputTarget: () => handle("setOutputTarget"),
      updatePresentation: () => handle("updatePresentation"),
      updateSlide: () => handle("updateSlide")
    } satisfies PresenterCommandService
  };
};

const queuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_runtime_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: "2026-06-17T07:00:00.000Z",
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_runtime_1", title: "Runtime Gathering" }
  },
  presentationId: "presentation_runtime_1",
  queuedAt: "2026-06-17T07:00:00.000Z",
  queueEntryId: "queue_entry_runtime_1",
  requestId: "request_runtime_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt: "2026-06-17T07:00:00.000Z"
};

describe("createPresenterDesktopReplayRuntime", () => {
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
      const runtime = await createPresenterDesktopReplayRuntime({
        actor,
        clock: () => "2026-06-17T07:05:00.000Z",
        commandService: commandService.service,
        database: wrapMigrationClient(database),
        interval: noopInterval,
        intervalMs: 1000,
        isOnline: () => online,
        policy
      });

      expect(runtime.migrations).toEqual([
        { migrationId: "202606170002_presenter_local_sync_queue", outcome: "applied" }
      ]);

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
      expect(commandService.calls).toEqual(["updatePresentation"]);

      const stored = await runtime.repository.getById({
        input: { queueEntryId: "queue_entry_runtime_1" },
        options: { context: { actorId: actor.actorId, requestId: "request_read", tenantId } }
      });
      expect(stored?.status).toBe("synced");

      const status = await runtime.getStatus();
      expect(status.summary).toEqual({
        cancelled: 0,
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
});
