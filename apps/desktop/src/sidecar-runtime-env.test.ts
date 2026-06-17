import { describe, expect, it } from "vitest";
import type { PresenterLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import type { PresenterFetchLike } from "./graphql-transport.js";
import { startPresenterDesktopSidecarFromEnv } from "./sidecar-runtime-env.js";

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const now = "2026-06-17T09:00:00.000Z";
const tenantId = "tenant_1";

const env: Readonly<Record<string, string>> = {
  SANCTUARY_OS_PRESENTER_ACTOR_ID: "actor_1",
  SANCTUARY_OS_PRESENTER_ACTOR_ROLES: "worship_leader",
  SANCTUARY_OS_PRESENTER_AUTH_TOKEN: "token_1",
  SANCTUARY_OS_PRESENTER_GRAPHQL_ENDPOINT: "https://api.example/graphql",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_BASE_SECONDS: "10",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_CAP_SECONDS: "60",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_MULTIPLIER: "2",
  SANCTUARY_OS_PRESENTER_REPLAY_INTERVAL_MS: "30000",
  SANCTUARY_OS_PRESENTER_REPLAY_MAX_ATTEMPTS: "3",
  SANCTUARY_OS_PRESENTER_SQLITE_PATH: ":memory:",
  SANCTUARY_OS_PRESENTER_TENANT_ID: tenantId
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

describe("startPresenterDesktopSidecarFromEnv", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("parses env, opens SQLite, and replays a queued edit", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const databaseSync = nodeSqlite;
    const handle = await startPresenterDesktopSidecarFromEnv(env, {
      clock: () => now,
      createDatabase: (path) => new databaseSync.DatabaseSync(path),
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
    }
  });
});
