import { describe, expect, it } from "vitest";
import type {
  PresenterLocalSyncQueueEntryPersistenceRecord,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PresenterFetchLike } from "./graphql-transport.js";
import { createPresenterDesktopRuntimeBootstrap } from "./runtime-bootstrap.js";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const now = "2026-06-17T06:00:00.000Z";
const tenantId = "tenant_1";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId
};

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const queuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: now,
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_1", title: "Sunday Gathering" }
  },
  presentationId: "presentation_1",
  queuedAt: now,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt: now
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
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
});

const createSuccessFetch = (): PresenterFetchLike =>
  (): Promise<{ json: () => Promise<unknown>; ok: boolean; status: number }> =>
    Promise.resolve({
      json: () =>
        Promise.resolve({ data: { updatePresentation: { presentationId: "presentation_1" } } }),
      ok: true,
      status: 200
    });

describe("createPresenterDesktopRuntimeBootstrap", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("migrates, enqueues, and replays an edit end to end", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const runtime = await createPresenterDesktopRuntimeBootstrap({
        actor,
        authToken: () => "token_1",
        clock: () => now,
        database: wrapMigrationClient(database),
        endpoint: "https://api.example/graphql",
        fetch: createSuccessFetch(),
        intervalMs: 30_000,
        isOnline: () => true,
        policy
      });

      expect(runtime.migrations.map((step) => step.outcome)).toContain("applied");

      const writeOptions = {
        context: { actorId: "actor_1", requestId: "request_1", tenantId },
        intent: "update"
      } as const;

      await runtime.repository.enqueue({
        input: { entry: queuedEntry },
        options: writeOptions
      });

      const outcome = await runtime.scheduler.runOnce();

      expect(outcome.status).toBe("ran");
      if (outcome.status === "ran") {
        expect(outcome.result.synced).toEqual(["queue_entry_1"]);
      }

      await expect(
        runtime.repository.getById({
          input: { queueEntryId: "queue_entry_1" },
          options: {
            context: { actorId: "actor_1", requestId: "request_read", tenantId }
          }
        })
      ).resolves.toMatchObject({ status: "synced" });
    } finally {
      database.close();
    }
  });

  liveIt("skips replay while offline", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const runtime = await createPresenterDesktopRuntimeBootstrap({
        actor,
        authToken: () => "token_1",
        clock: () => now,
        database: wrapMigrationClient(database),
        endpoint: "https://api.example/graphql",
        fetch: createSuccessFetch(),
        intervalMs: 30_000,
        isOnline: () => false,
        policy
      });

      await expect(runtime.scheduler.runOnce()).resolves.toEqual({
        status: "skipped-offline"
      });
    } finally {
      database.close();
    }
  });
});
