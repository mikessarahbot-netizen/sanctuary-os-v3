import {
  summarizePresenterLocalSyncQueue,
  type MigrationRunStep,
  type PresenterLocalSyncQueueEntryMutationResult,
  type PresenterLocalSyncQueuePersistenceRepository,
  type PresenterLocalSyncQueuePersistenceRuntimeConfigInput,
  type PresenterLocalSyncQueueReplayPolicyInput,
  type PresenterLocalSyncQueueStatusSummary,
  type PresenterPersistenceReadOptions,
  type PresenterPersistenceWriteOptions,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PresenterReplayCommandExecutor } from "@sanctuary-os/api/presenter";
import { createPresenterDesktopLocalSyncQueueStore } from "./local-sync-queue-store.js";
import {
  runPresenterDesktopReplayPass,
  type PresenterDesktopReplayErrorClassifier,
  type PresenterDesktopReplayPassResult
} from "./replay-pass.js";
import {
  createPresenterDesktopReplayScheduler,
  type PresenterDesktopReplayIntervalScheduler,
  type PresenterDesktopReplayScheduler
} from "./replay-scheduler.js";

/**
 * Single assembly factory for the desktop Presenter replay runtime.
 *
 * Given the injected adapters (SQLite client, clock, connectivity, interval,
 * authenticated actor, command service, replay policy), it migrates the local
 * store, binds a replay pass over the resulting repository, and wires the
 * scheduler. The Tauri shell only has to supply the concrete adapters; this
 * factory owns the composition. It runs no real timer and holds no transport.
 */
export interface PresenterDesktopReplayRuntimeDependencies<THandle> {
  readonly actor: AuthenticatedActor;
  readonly clock: () => string;
  readonly commandService: PresenterReplayCommandExecutor;
  readonly config?: PresenterLocalSyncQueuePersistenceRuntimeConfigInput;
  readonly database: SqliteMigrationDatabaseClient;
  readonly errorClassifier?: PresenterDesktopReplayErrorClassifier;
  readonly interval: PresenterDesktopReplayIntervalScheduler<THandle>;
  readonly intervalMs: number;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: PresenterDesktopReplayPassResult) => void;
  readonly policy: PresenterLocalSyncQueueReplayPolicyInput;
  readonly safeErrorMessage?: string;
}

export interface PresenterDesktopReplayStatus {
  readonly lastResult?: PresenterDesktopReplayPassResult;
  readonly summary: PresenterLocalSyncQueueStatusSummary;
}

export interface PresenterDesktopReplayRuntime {
  readonly cancelEntry: (
    queueEntryId: string
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly getStatus: () => Promise<PresenterDesktopReplayStatus>;
  readonly migrations: readonly MigrationRunStep[];
  readonly repository: PresenterLocalSyncQueuePersistenceRepository;
  readonly requeueEntry: (
    queueEntryId: string
  ) => Promise<PresenterLocalSyncQueueEntryMutationResult>;
  readonly scheduler: PresenterDesktopReplayScheduler<PresenterDesktopReplayPassResult>;
}

export const createPresenterDesktopReplayRuntime = async <THandle>(
  dependencies: PresenterDesktopReplayRuntimeDependencies<THandle>
): Promise<PresenterDesktopReplayRuntime> => {
  const store = await createPresenterDesktopLocalSyncQueueStore({
    clock: dependencies.clock,
    database: dependencies.database,
    ...(dependencies.config !== undefined ? { config: dependencies.config } : {})
  });

  const runPass = (): Promise<PresenterDesktopReplayPassResult> =>
    runPresenterDesktopReplayPass({
      actor: dependencies.actor,
      commandService: dependencies.commandService,
      now: dependencies.clock(),
      policy: dependencies.policy,
      repository: store.repository,
      ...(dependencies.errorClassifier !== undefined
        ? { errorClassifier: dependencies.errorClassifier }
        : {}),
      ...(dependencies.safeErrorMessage !== undefined
        ? { safeErrorMessage: dependencies.safeErrorMessage }
        : {})
    });

  let lastResult: PresenterDesktopReplayPassResult | undefined;
  const handleResult = (result: PresenterDesktopReplayPassResult): void => {
    lastResult = result;
    dependencies.onResult?.(result);
  };

  const scheduler = createPresenterDesktopReplayScheduler({
    interval: dependencies.interval,
    intervalMs: dependencies.intervalMs,
    isOnline: dependencies.isOnline,
    onResult: handleResult,
    runPass,
    ...(dependencies.onError !== undefined ? { onError: dependencies.onError } : {})
  });

  const readOptionsFor = (requestId: string): PresenterPersistenceReadOptions => ({
    context: {
      actorId: dependencies.actor.actorId,
      requestId,
      tenantId: dependencies.actor.tenantId
    }
  });
  const writeOptionsFor = (requestId: string): PresenterPersistenceWriteOptions => ({
    ...readOptionsFor(requestId),
    intent: "update"
  });

  const getStatus = async (): Promise<PresenterDesktopReplayStatus> => {
    const counts = await store.repository.countByStatus({
      input: {},
      options: readOptionsFor(`presenter-status:${dependencies.clock()}`)
    });

    return {
      summary: summarizePresenterLocalSyncQueue(counts),
      ...(lastResult !== undefined ? { lastResult } : {})
    };
  };

  const transitionEntry = async (
    queueEntryId: string,
    to: "queued" | "cancelled",
    requestPrefix: string
  ): Promise<PresenterLocalSyncQueueEntryMutationResult> => {
    const now = dependencies.clock();
    const entry = await store.repository.getById({
      input: { queueEntryId },
      options: readOptionsFor(`${requestPrefix}-read:${now}`)
    });

    if (entry === null) {
      throw new Error(`Presenter queue entry ${queueEntryId} was not found.`);
    }

    const operation = {
      input: {
        queueEntryId,
        transition: { from: entry.status, to, transitionedAt: now }
      },
      options: writeOptionsFor(`${requestPrefix}:${now}`)
    };

    return to === "queued"
      ? store.repository.requeue(operation)
      : store.repository.cancel(operation);
  };

  return {
    cancelEntry: (queueEntryId) =>
      transitionEntry(queueEntryId, "cancelled", "presenter-cancel"),
    getStatus,
    migrations: store.migrations,
    repository: store.repository,
    requeueEntry: (queueEntryId) =>
      transitionEntry(queueEntryId, "queued", "presenter-requeue"),
    scheduler
  };
};
