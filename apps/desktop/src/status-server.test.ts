import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { PresenterDesktopReplayStatus } from "./replay-runtime.js";
import {
  createPresenterStatusHttpServer,
  handlePresenterStatusHttpInvocation
} from "./status-server.js";

const status: PresenterDesktopReplayStatus = {
  lastResult: { conflicted: [], exhausted: [], failed: [], synced: ["queue_entry_1"] },
  summary: { cancelled: 0, needsAttention: 1, pending: 2, synced: 3, total: 6 }
};

const getStatus = (): Promise<PresenterDesktopReplayStatus> => Promise.resolve(status);

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
    const server = createPresenterStatusHttpServer({ getStatus });
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
