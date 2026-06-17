import type { SqliteMigrationDatabaseClient } from "@sanctuary-os/db";
import type { PlayFetchLike } from "./play-graphql-transport.js";
import type { PlayDesktopReplayPassResult } from "./play-replay-pass.js";
import type { PlayDesktopReplayRuntime } from "./play-replay-runtime.js";
import { createPlayDesktopRuntimeBootstrap } from "./play-runtime-bootstrap.js";
import type { PlayDesktopSidecarConfig } from "./play-sidecar-config.js";

/**
 * Sidecar entry for the desktop Play replay runtime.
 *
 * Given a parsed sidecar config and the injected process primitives (the
 * `node:sqlite` migration client, `fetch`, and a connectivity check), it runs
 * the runtime bootstrap, starts the replay scheduler, and returns a handle with
 * the runtime and a `stop` that cancels the scheduler. The thin process `main`
 * that reads `process.env`, opens the SQLite file, and supplies `globalThis.fetch`
 * stays out of this module so the wiring remains unit-testable.
 */
export interface PlayDesktopSidecarDependencies {
  readonly clock?: () => string;
  readonly database: SqliteMigrationDatabaseClient;
  readonly fetch: PlayFetchLike;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PlayDesktopReplayPassResult) => void;
}

export interface PlayDesktopSidecarHandle {
  readonly runtime: PlayDesktopReplayRuntime;
  readonly stop: () => void;
}

export const startPlayDesktopSidecar = async (
  config: PlayDesktopSidecarConfig,
  dependencies: PlayDesktopSidecarDependencies
): Promise<PlayDesktopSidecarHandle> => {
  const runtime = await createPlayDesktopRuntimeBootstrap({
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
