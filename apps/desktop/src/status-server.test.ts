import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { PresenterDesktopReplayStatus } from "./replay-runtime.js";
import {
  createPresenterStatusHttpServer,
  handlePresenterActionHttpInvocation,
  handlePresenterStatusHttpInvocation,
  type PresenterActionDependencies
} from "./status-server.js";

const status: PresenterDesktopReplayStatus = {
  lastResult: { conflicted: [], exhausted: [], failed: [], synced: ["queue_entry_1"] },
  summary: { cancelled: 0, needsAttention: 1, pending: 2, synced: 3, total: 6 }
};

const getStatus = (): Promise<PresenterDesktopReplayStatus> => Promise.resolve(status);

const createRecordingActions = (): PresenterActionDependencies & {
  readonly calls: readonly string[];
} => {
  const calls: string[] = [];

  return {
    cancelEntry: (queueEntryId) => {
      calls.push(`cancel:${queueEntryId}`);
      return Promise.resolve(undefined);
    },
    get calls() {
      return calls;
    },
    requeueEntry: (queueEntryId) => {
      calls.push(`requeue:${queueEntryId}`);
      return Promise.resolve(undefined);
    }
  };
};

const noopActions: PresenterActionDependencies = {
  cancelEntry: () => Promise.resolve(undefined),
  requeueEntry: () => Promise.resolve(undefined)
};

describe("handlePresenterStatusHttpInvocation", () => {
  it("serves the status as JSON on GET", async () => {
    const result = await handlePresenterStatusHttpInvocation(
      getStatus,
      { method: "GET", path: "/status" },
      { path: "/status" }
    );

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(result.body)).toEqual(status);
  });

  it("returns 404 for a non-matching path", async () => {
    const result = await handlePresenterStatusHttpInvocation(
      getStatus,
      { method: "GET", path: "/other" },
      { path: "/status" }
    );

    expect(result.status).toBe(404);
  });

  it("returns 405 for a non-GET method", async () => {
    const result = await handlePresenterStatusHttpInvocation(
      getStatus,
      { method: "POST", path: "/status" },
      { path: "/status" }
    );

    expect(result.status).toBe(405);
  });
});

describe("handlePresenterActionHttpInvocation", () => {
  it("requeues an entry on POST", async () => {
    const actions = createRecordingActions();
    const result = await handlePresenterActionHttpInvocation(
      actions,
      { method: "POST", path: "/actions", rawBody: JSON.stringify({ action: "requeue", queueEntryId: "queue_1" }) },
      { path: "/actions" }
    );

    expect(result.status).toBe(200);
    expect(actions.calls).toEqual(["requeue:queue_1"]);
  });

  it("cancels an entry on POST", async () => {
    const actions = createRecordingActions();
    await handlePresenterActionHttpInvocation(
      actions,
      { method: "POST", path: "/actions", rawBody: JSON.stringify({ action: "cancel", queueEntryId: "queue_2" }) },
      { path: "/actions" }
    );

    expect(actions.calls).toEqual(["cancel:queue_2"]);
  });

  it("returns 400 for a malformed body", async () => {
    const result = await handlePresenterActionHttpInvocation(
      noopActions,
      { method: "POST", path: "/actions", rawBody: "{ not json" },
      { path: "/actions" }
    );

    expect(result.status).toBe(400);
  });

  it("returns 405 for a non-POST method", async () => {
    const result = await handlePresenterActionHttpInvocation(
      noopActions,
      { method: "GET", path: "/actions", rawBody: "" },
      { path: "/actions" }
    );

    expect(result.status).toBe(405);
  });

  it("returns 409 when the action cannot be applied", async () => {
    const result = await handlePresenterActionHttpInvocation(
      {
        cancelEntry: () => Promise.reject(new Error("invalid transition")),
        requeueEntry: () => Promise.reject(new Error("invalid transition"))
      },
      { method: "POST", path: "/actions", rawBody: JSON.stringify({ action: "requeue", queueEntryId: "queue_3" }) },
      { path: "/actions" }
    );

    expect(result.status).toBe(409);
  });
});

describe("createPresenterStatusHttpServer", () => {
  const servers: import("node:http").Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          })
      )
    );
  });

  it("serves the status summary over HTTP", async () => {
    const server = createPresenterStatusHttpServer({ ...noopActions, getStatus });
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${String(address.port)}/status`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(status);
  });
});
