import type {
  PlayLocalSyncQueueReplayPolicyInput,
  SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import { createPlayFetchGraphqlTransport, type PlayFetchLike } from "./play-graphql-transport.js";
import { createPlayNetworkReplayCommandExecutor } from "./play-network-command-service.js";
import {
  createPlayReplayErrorClassifier,
  type PlayReplayErrorClassifierOptions
} from "./play-replay-error-classifier.js";
import type { PlayDesktopReplayPassResult } from "./play-replay-pass.js";
import type { PlayDesktopReplayIntervalScheduler } from "./play-replay-scheduler.js";
import {
  createPlayDesktopReplayRuntime,
  type PlayDesktopReplayRuntime
} from "./play-replay-runtime.js";

/**
 * Node bootstrap for the desktop Play replay runtime.
 *
 * Per ADR 0005 the runtime runs in a Node context using `node:sqlite`, so the
 * caller injects a synchronous `SqliteMigrationDatabaseClient` (the Tauri shell
 * spawns this as a sidecar). This factory builds the concrete adapters — the
 * fetch GraphQL transport, the network replay executor, the error classifier,
 * and a Node interval scheduler — then delegates to
 * `createPlayDesktopReplayRuntime`, which migrates the store and wires the replay
 * pass + scheduler. The `fetch`, auth-token provider, and connectivity check stay
 * injected so the bootstrap holds no live transport of its own.
 */
export interface PlayDesktopRuntimeBootstrapDependencies {
  readonly actor: AuthenticatedActor;
  readonly authToken: () => string | Promise<string>;
  readonly clock?: () => string;
  readonly database: SqliteMigrationDatabaseClient;
  readonly endpoint: string;
  readonly errorClassifier?: PlayReplayErrorClassifierOptions;
  readonly fetch: PlayFetchLike;
  readonly intervalMs: number;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PlayDesktopReplayPassResult) => void;
  readonly policy: PlayLocalSyncQueueReplayPolicyInput;
  readonly requestIdHeaderName?: string;
  readonly retryableSafeErrorMessage?: string;
}

const createNodeIntervalScheduler = (): PlayDesktopReplayIntervalScheduler<
  ReturnType<typeof setInterval>
> => ({
  cancel: (handle): void => {
    clearInterval(handle);
  },
  schedule: (callback, intervalMs): ReturnType<typeof setInterval> =>
    setInterval(callback, intervalMs)
});

export const createPlayDesktopRuntimeBootstrap = (
  dependencies: PlayDesktopRuntimeBootstrapDependencies
): Promise<PlayDesktopReplayRuntime> => {
  const transport = createPlayFetchGraphqlTransport({
    endpoint: dependencies.endpoint,
    fetch: dependencies.fetch
  });
  const commandService = createPlayNetworkReplayCommandExecutor({
    authToken: dependencies.authToken,
    transport,
    ...(dependencies.requestIdHeaderName !== undefined
      ? { requestIdHeaderName: dependencies.requestIdHeaderName }
      : {})
  });
  const errorClassifier = createPlayReplayErrorClassifier(dependencies.errorClassifier ?? {});

  return createPlayDesktopReplayRuntime({
    actor: dependencies.actor,
    clock: dependencies.clock ?? ((): string => new Date().toISOString()),
    commandService,
    database: dependencies.database,
    errorClassifier,
    interval: createNodeIntervalScheduler(),
    intervalMs: dependencies.intervalMs,
    isOnline: dependencies.isOnline,
    policy: dependencies.policy,
    ...(dependencies.onError !== undefined ? { onError: dependencies.onError } : {}),
    ...(dependencies.onResult !== undefined ? { onResult: dependencies.onResult } : {}),
    ...(dependencies.retryableSafeErrorMessage !== undefined
      ? { retryableSafeErrorMessage: dependencies.retryableSafeErrorMessage }
      : {})
  });
};
