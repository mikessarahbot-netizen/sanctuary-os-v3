import { describe, expect, it } from "vitest";
import { parsePresenterDesktopSidecarConfig } from "./sidecar-config.js";

const validEnv: Readonly<Record<string, string>> = {
  SANCTUARY_OS_PRESENTER_ACTOR_ID: "actor_1",
  SANCTUARY_OS_PRESENTER_ACTOR_ROLES: "worship_leader, planner",
  SANCTUARY_OS_PRESENTER_AUTH_TOKEN: "token_secret",
  SANCTUARY_OS_PRESENTER_GRAPHQL_ENDPOINT: "https://api.example/graphql",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_BASE_SECONDS: "10",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_CAP_SECONDS: "60",
  SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_MULTIPLIER: "2",
  SANCTUARY_OS_PRESENTER_REPLAY_INTERVAL_MS: "30000",
  SANCTUARY_OS_PRESENTER_REPLAY_MAX_ATTEMPTS: "5",
  SANCTUARY_OS_PRESENTER_SQLITE_PATH: "/var/lib/sanctuary/presenter-queue.sqlite",
  SANCTUARY_OS_PRESENTER_TENANT_ID: "tenant_1"
};

describe("parsePresenterDesktopSidecarConfig", () => {
  it("parses a valid environment into a typed config", () => {
    expect(parsePresenterDesktopSidecarConfig(validEnv)).toEqual({
      actor: {
        actorId: "actor_1",
        roles: ["worship_leader", "planner"],
        tenantId: "tenant_1"
      },
      authToken: "token_secret",
      graphqlEndpoint: "https://api.example/graphql",
      intervalMs: 30000,
      policy: {
        backoffBaseSeconds: 10,
        backoffCapSeconds: 60,
        backoffMultiplier: 2,
        maxAttempts: 5
      },
      sqliteFilePath: "/var/lib/sanctuary/presenter-queue.sqlite"
    });
  });

  it("carries an optional request-id header override", () => {
    const config = parsePresenterDesktopSidecarConfig({
      ...validEnv,
      SANCTUARY_OS_PRESENTER_REQUEST_ID_HEADER: "idempotency-key"
    });

    expect(config.requestIdHeaderName).toBe("idempotency-key");
  });

  it("rejects an invalid endpoint URL", () => {
    expect(() =>
      parsePresenterDesktopSidecarConfig({
        ...validEnv,
        SANCTUARY_OS_PRESENTER_GRAPHQL_ENDPOINT: "not-a-url"
      })
    ).toThrow();
  });

  it("rejects an unknown actor role", () => {
    expect(() =>
      parsePresenterDesktopSidecarConfig({
        ...validEnv,
        SANCTUARY_OS_PRESENTER_ACTOR_ROLES: "wizard"
      })
    ).toThrow();
  });

  it("rejects a backoff cap below the base", () => {
    expect(() =>
      parsePresenterDesktopSidecarConfig({
        ...validEnv,
        SANCTUARY_OS_PRESENTER_REPLAY_BACKOFF_CAP_SECONDS: "5"
      })
    ).toThrow("backoff cap");
  });

  it("rejects a missing required variable", () => {
    const withoutToken = Object.fromEntries(
      Object.entries(validEnv).filter(
        ([key]) => key !== "SANCTUARY_OS_PRESENTER_AUTH_TOKEN"
      )
    );

    expect(() => parsePresenterDesktopSidecarConfig(withoutToken)).toThrow();
  });
});
