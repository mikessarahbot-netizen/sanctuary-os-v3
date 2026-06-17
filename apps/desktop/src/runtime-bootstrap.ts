import type {
  PresenterLocalSyncQueuePersistenceRuntimeConfigInput,
  PresenterLocalSyncQueueReplayPolicyInput,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import { createPresenterFetchGraphqlTransport, type PresenterFetchLike } from "./graphql-transport.js";
import { createPresenterNetworkReplayCommandExecutor } from "./network-command-service.js";
import {
  createPresenterReplayErrorClassifier,
  type PresenterReplayErrorClassifierOptions
} from "./replay-error-classifier.js";
import type { PresenterDesktopReplayPassResult } from "./replay-pass.js";
import type { PresenterDesktopReplayIntervalScheduler } from "./replay-scheduler.js";
import {
  createPresenterDesktopReplayRuntime,
  type PresenterDesktopReplayRuntime
} from "./replay-runtime.js";

/**
 * Node bootstrap for the desktop Presenter replay runtime.
 *
 * Per ADR 0005 the runtime runs in a Node context using `node:sqlite`, so the
 * caller injects a synchronous `SqliteMigrationDatabaseClient` (the Tauri shell
 * spawns this as a sidecar). This factory builds the concrete adapters — the
 * fetch GraphQL transport, the network replay executor, the error classifier,
 * and a Node interval scheduler — then delegates to
 * `createPresenterDesktopReplayRuntime`, which migrates the store and wires the
 * replay pass + scheduler. The `fetch`, auth-token provider, and connectivity
 * check stay injected so the bootstrap holds no live transport of its own.
 */
export interface PresenterDesktopRuntimeBootstrapDependencies {
  readonly actor: AuthenticatedActor;
  readonly authToken: () => string | Promise<string>;
  readonly clock?: () => string;
  readonly config?: PresenterLocalSyncQueuePersistenceRuntimeConfigInput;
  readonly database: SqliteMigrationDatabaseClient;
  readonly endpoint: string;
  readonly errorClassifier?: PresenterReplayErrorClassifierOptions;
  readonly fetch: PresenterFetchLike;
  readonly intervalMs: number;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PresenterDesktopReplayPassResult) => void;
  readonly policy: PresenterLocalSyncQueueReplayPolicyInput;
  readonly requestIdHeaderName?: string;
  readonly safeErrorMessage?: string;
}

const createNodeIntervalScheduler = (): PresenterDesktopReplayIntervalScheduler<
  ReturnType<typeof setInterval>
> => ({
  cancel: (handle): void => {
    clearInterval(handle);
  },
  schedule: (callback, intervalMs): ReturnType<typeof setInterval> =>
    setInterval(callback, intervalMs)
});

export const createPresenterDesktopRuntimeBootstrap = (
  dependencies: PresenterDesktopRuntimeBootstrapDependencies
): Promise<PresenterDesktopReplayRuntime> => {
  const transport = createPresenterFetchGraphqlTransport({
    endpoint: dependencies.endpoint,
    fetch: dependencies.fetch
  });
  const commandService = createPresenterNetworkReplayCommandExecutor({
    authToken: dependencies.authToken,
    transport,
    ...(dependencies.requestIdHeaderName !== undefined
      ? { requestIdHeaderName: dependencies.requestIdHeaderName }
      : {})
  });
  const errorClassifier = createPresenterReplayErrorClassifier(
    dependencies.errorClassifier ?? {}
  );

  return createPresenterDesktopReplayRuntime({
    actor: dependencies.actor,
    clock: dependencies.clock ?? ((): string => new Date().toISOString()),
    commandService,
    database: dependencies.database,
    errorClassifier,
    interval: createNodeIntervalScheduler(),
    intervalMs: dependencies.intervalMs,
    isOnline: dependencies.isOnline,
    policy: dependencies.policy,
    ...(dependencies.config !== undefined ? { config: dependencies.config } : {}),
    ...(dependencies.onError !== undefined ? { onError: dependencies.onError } : {}),
    ...(dependencies.onResult !== undefined ? { onResult: dependencies.onResult } : {}),
    ...(dependencies.safeErrorMessage !== undefined
      ? { safeErrorMessage: dependencies.safeErrorMessage }
      : {})
  });
};
