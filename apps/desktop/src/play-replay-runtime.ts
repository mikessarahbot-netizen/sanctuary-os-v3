import {
  summarizePlayLocalSyncQueue,
  type MigrationRunStep,
  type PlayLocalSyncQueueEntryMutationResult,
  type PlayLocalSyncQueuePersistenceRepository,
  type PlayLocalSyncQueueReplayPolicyInput,
  type PlayLocalSyncQueueStatusSummary,
  type PlayPersistenceReadOptions,
  type PlayPersistenceWriteOptions,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PlayReplayCommandExecutor } from "@sanctuary-os/api/play";
import { createPlayDesktopLocalSyncQueueStore } from "./play-local-sync-queue-store.js";
import {
  runPlayDesktopReplayPass,
  type PlayDesktopReplayErrorClassifier,
  type PlayDesktopReplayPassResult
} from "./play-replay-pass.js";
import {
  createPlayDesktopReplayScheduler,
  type PlayDesktopReplayIntervalScheduler,
  type PlayDesktopReplayScheduler
} from "./play-replay-scheduler.js";

/**
 * Single assembly factory for the desktop Play replay runtime.
 *
 * Given the injected adapters (SQLite client, clock, connectivity, interval,
 * authenticated actor, command service, replay policy), it migrates the local
 * store, binds a replay pass over the resulting repository, and wires the
 * scheduler. The Tauri shell only has to supply the concrete adapters; this
 * factory owns the composition. It runs no real timer and holds no transport.
 */
export interface PlayDesktopReplayRuntimeDependencies<THandle> {
  readonly actor: AuthenticatedActor;
  readonly clock: () => string;
  readonly commandService: PlayReplayCommandExecutor;
  readonly database: SqliteMigrationDatabaseClient;
  readonly errorClassifier?: PlayDesktopReplayErrorClassifier;
  readonly interval: PlayDesktopReplayIntervalScheduler<THandle>;
  readonly intervalMs: number;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PlayDesktopReplayPassResult) => void;
  readonly policy: PlayLocalSyncQueueReplayPolicyInput;
  readonly retryableSafeErrorMessage?: string;
}

export interface PlayDesktopReplayStatus {
  readonly lastResult?: PlayDesktopReplayPassResult;
  readonly summary: PlayLocalSyncQueueStatusSummary;
}

export interface PlayDesktopReplayRuntime {
  readonly getStatus: () => Promise<PlayDesktopReplayStatus>;
  readonly migrations: readonly MigrationRunStep[];
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
  readonly requeueEntry: (
    queueEntryId: string
  ) => Promise<PlayLocalSyncQueueEntryMutationResult>;
  readonly scheduler: PlayDesktopReplayScheduler<PlayDesktopReplayPassResult>;
}

export const createPlayDesktopReplayRuntime = async <THandle>(
  dependencies: PlayDesktopReplayRuntimeDependencies<THandle>
): Promise<PlayDesktopReplayRuntime> => {
  const store = await createPlayDesktopLocalSyncQueueStore({
    clock: dependencies.clock,
    database: dependencies.database
  });

  const runPass = (): Promise<PlayDesktopReplayPassResult> =>
    runPlayDesktopReplayPass({
      actor: dependencies.actor,
      commandService: dependencies.commandService,
      now: dependencies.clock(),
      policy: dependencies.policy,
      repository: store.repository,
      ...(dependencies.errorClassifier !== undefined
        ? { errorClassifier: dependencies.errorClassifier }
        : {}),
      ...(dependencies.retryableSafeErrorMessage !== undefined
        ? { retryableSafeErrorMessage: dependencies.retryableSafeErrorMessage }
        : {})
    });

  let lastResult: PlayDesktopReplayPassResult | undefined;
  const handleResult = (result: PlayDesktopReplayPassResult): void => {
    lastResult = result;
    dependencies.onResult?.(result);
  };

  const scheduler = createPlayDesktopReplayScheduler({
    interval: dependencies.interval,
    intervalMs: dependencies.intervalMs,
    isOnline: dependencies.isOnline,
    onResult: handleResult,
    runPass,
    ...(dependencies.onError !== undefined ? { onError: dependencies.onError } : {})
  });

  const readOptionsFor = (requestId: string): PlayPersistenceReadOptions => ({
    context: {
      actorId: dependencies.actor.actorId,
      requestId,
      tenantId: dependencies.actor.tenantId
    }
  });
  const writeOptionsFor = (requestId: string): PlayPersistenceWriteOptions => ({
    ...readOptionsFor(requestId),
    intent: "update"
  });

  const getStatus = async (): Promise<PlayDesktopReplayStatus> => {
    const counts = await store.repository.countByStatus({
      input: {},
      options: readOptionsFor(`play-status:${dependencies.clock()}`)
    });

    return {
      summary: summarizePlayLocalSyncQueue(counts),
      ...(lastResult !== undefined ? { lastResult } : {})
    };
  };

  const requeueEntry = async (
    queueEntryId: string
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const now = dependencies.clock();
    const entry = await store.repository.getById({
      input: { queueEntryId },
      options: readOptionsFor(`play-requeue-read:${now}`)
    });

    if (entry === null) {
      throw new Error(`Play queue entry ${queueEntryId} was not found.`);
    }

    return store.repository.requeue({
      input: {
        queueEntryId,
        transition: { from: entry.status, to: "pending", transitionedAt: now }
      },
      options: writeOptionsFor(`play-requeue:${now}`)
    });
  };

  return {
    getStatus,
    migrations: store.migrations,
    repository: store.repository,
    requeueEntry,
    scheduler
  };
};
