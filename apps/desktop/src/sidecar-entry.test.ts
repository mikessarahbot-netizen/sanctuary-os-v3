import { describe, expect, it } from "vitest";
import type { PresenterLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import type { PresenterFetchLike } from "./graphql-transport.js";
import { wrapNodeSqliteMigrationDatabase } from "./node-sqlite-client.js";
import { startPresenterDesktopSidecar } from "./sidecar-entry.js";
import type { PresenterDesktopSidecarConfig } from "./sidecar-config.js";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const now = "2026-06-17T07:00:00.000Z";
const tenantId = "tenant_1";

const config: PresenterDesktopSidecarConfig = {
  actor: { actorId: "actor_1", roles: ["worship_leader"], tenantId },
  authToken: "token_1",
  graphqlEndpoint: "https://api.example/graphql",
  intervalMs: 30_000,
  policy: {
    backoffBaseSeconds: 10,
    backoffCapSeconds: 60,
    backoffMultiplier: 2,
    maxAttempts: 3
  },
  sqliteFilePath: ":memory:"
};

const queuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: now,
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_1", title: "Sunday" }
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

const successFetch: PresenterFetchLike = () =>
  Promise.resolve({
    json: () =>
      Promise.resolve({ data: { updatePresentation: { presentationId: "presentation_1" } } }),
    ok: true,
    status: 200
  });

describe("startPresenterDesktopSidecar", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    if (nodeSqlite === undefined) {
      expect(nodeSqlite).toBeUndefined();
      return;
    }

    expect(typeof nodeSqlite.DatabaseSync).toBe("function");
  });

  liveIt("starts the runtime, replays a queued edit, and stops cleanly", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");
    const handle = await startPresenterDesktopSidecar(config, {
      clock: () => now,
      database: wrapNodeSqliteMigrationDatabase(database),
      fetch: successFetch,
      isOnline: () => true
    });

    try {
      await handle.runtime.repository.enqueue({
        input: { entry: queuedEntry },
        options: {
          context: { actorId: "actor_1", requestId: "request_1", tenantId },
          intent: "update"
        }
      });

      const outcome = await handle.runtime.scheduler.runOnce();

      expect(outcome.status).toBe("ran");
      if (outcome.status === "ran") {
        expect(outcome.result.synced).toEqual(["queue_entry_1"]);
      }
    } finally {
      handle.stop();
      database.close();
    }
  });
});
