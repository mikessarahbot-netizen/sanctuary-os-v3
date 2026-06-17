import type { SqliteMigrationDatabaseClient } from "@sanctuary-os/db";
import type { PresenterFetchLike } from "./graphql-transport.js";
import type { PresenterDesktopReplayPassResult } from "./replay-pass.js";
import type { PresenterDesktopReplayRuntime } from "./replay-runtime.js";
import { createPresenterDesktopRuntimeBootstrap } from "./runtime-bootstrap.js";
import type { PresenterDesktopSidecarConfig } from "./sidecar-config.js";

/**
 * Sidecar entry for the desktop Presenter replay runtime.
 *
 * Given a parsed sidecar config and the injected process primitives (the
 * `node:sqlite` migration client, `fetch`, and a connectivity check), it runs
 * the runtime bootstrap, starts the replay scheduler, and returns a handle with
 * the runtime and a `stop` that cancels the scheduler. The thin process `main`
 * that reads `process.env`, opens the SQLite file, and supplies `globalThis.fetch`
 * stays out of this module so the wiring remains unit-testable.
 */
export interface PresenterDesktopSidecarDependencies {
  readonly clock?: () => string;
  readonly database: SqliteMigrationDatabaseClient;
  readonly fetch: PresenterFetchLike;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PresenterDesktopReplayPassResult) => void;
}

export interface PresenterDesktopSidecarHandle {
  readonly runtime: PresenterDesktopReplayRuntime;
  readonly stop: () => void;
}

export const startPresenterDesktopSidecar = async (
  config: PresenterDesktopSidecarConfig,
  dependencies: PresenterDesktopSidecarDependencies
): Promise<PresenterDesktopSidecarHandle> => {
  const runtime = await createPresenterDesktopRuntimeBootstrap({
    actor: config.actor,
    authToken: () => config.authToken,
    database: dependencies.database,
    endpoint: config.graphqlEndpoint,
    fetch: dependencies.fetch,
    intervalMs: config.intervalMs,
    isOnline: dependencies.isOnline,
    policy: config.policy,
    ...(config.requestIdHeaderName !== undefined
      ? { requestIdHeaderName: config.requestIdHeaderName }
      : {}),
    ...(dependencies.clock !== undefined ? { clock: dependencies.clock } : {}),
    ...(dependencies.onError !== undefined ? { onError: dependencies.onError } : {}),
    ...(dependencies.onResult !== undefined ? { onResult: dependencies.onResult } : {})
  });

  runtime.scheduler.start();

  return {
    runtime,
    stop: (): void => {
      runtime.scheduler.stop();
    }
  };
};
