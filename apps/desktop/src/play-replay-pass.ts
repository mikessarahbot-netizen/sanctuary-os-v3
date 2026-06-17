import {
  PlayLocalSyncQueueReplayPolicySchema,
  decidePlayLocalSyncQueueReplay,
  type PlayLocalSyncQueueEntryPersistenceRecord,
  type PlayLocalSyncQueuePersistenceRepository,
  type PlayLocalSyncQueueReplayPolicy,
  type PlayLocalSyncQueueReplayPolicyInput,
  type PlayPersistenceReadOptions,
  type PlayPersistenceWriteOptions
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import {
  mapPlayLocalSyncQueueEntryToReplayCommand,
  type PlayLocalSyncQueueReplayCommand,
  type PlayReplayCommandExecutor
} from "@sanctuary-os/api/play";

/**
 * Single Play local sync queue replay pass for the desktop runtime.
 *
 * It reads the pending entries, applies the pure replay decision (ordering,
 * backoff, attempt limits), marks each eligible entry `in-flight`, maps it to a
 * Play command, calls the injected command service, and records the outcome.
 * Entries that have exhausted their attempt budget are marked `failed` without
 * calling the command service. This is a single pass with no timer loop, no
 * transport of its own (the command service is injected), and no offline/online
 * detection.
 *
 * A command-service error is routed through an injected classifier: a transient
 * error (transport-like) is a `retryable` failure that is marked `failed` with a
 * backoff `nextAttemptAt` and then requeued to `pending` so a later pass retries
 * it once the backoff elapses; a typed terminal error (a server-rejected domain
 * condition) is a `terminal` failure that is marked `failed` with no requeue,
 * leaving the edit for operator review. The default classifier treats every
 * error as `retryable`, which safely pauses that track set until the next pass.
 */
export type PlayDesktopReplayErrorClassification =
  | { readonly kind: "retryable"; readonly safeErrorMessage: string }
  | { readonly kind: "terminal"; readonly safeErrorMessage: string };

export type PlayDesktopReplayErrorClassifier = (
  error: unknown,
  entry: PlayLocalSyncQueueEntryPersistenceRecord
) => PlayDesktopReplayErrorClassification;

export interface PlayDesktopReplayPassDependencies {
  readonly actor: AuthenticatedActor;
  readonly commandService: PlayReplayCommandExecutor;
  readonly errorClassifier?: PlayDesktopReplayErrorClassifier;
  readonly now: string;
  readonly policy: PlayLocalSyncQueueReplayPolicyInput;
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
  readonly retryableSafeErrorMessage?: string;
}

export interface PlayDesktopReplayPassResult {
  readonly exhausted: readonly string[];
  readonly failed: readonly string[];
  readonly requeued: readonly string[];
  readonly synced: readonly string[];
}

const DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE =
  "This edit could not be synced yet and will be retried automatically.";
const EXHAUSTED_SAFE_ERROR_MESSAGE = "Sync attempts were exhausted for this edit.";

const computeBackoffSeconds = (
  policy: PlayLocalSyncQueueReplayPolicy,
  attemptCount: number
): number =>
  Math.min(
    policy.backoffCapSeconds,
    policy.backoffBaseSeconds * policy.backoffMultiplier ** (attemptCount - 1)
  );

const computeNextAttemptAt = (
  policy: PlayLocalSyncQueueReplayPolicy,
  attemptCount: number,
  now: string
): string =>
  new Date(Date.parse(now) + computeBackoffSeconds(policy, attemptCount) * 1000).toISOString();

const dispatchReplayCommand = async (
  commandService: PlayReplayCommandExecutor,
  mapped: PlayLocalSyncQueueReplayCommand
): Promise<void> => {
  switch (mapped.operation) {
    case "saveTrackSet":
      await commandService.saveTrackSet(mapped.command);
      return;
    case "updateTrackSetMembers":
      await commandService.updateTrackSetMembers(mapped.command);
      return;
    case "savePlayArrangement":
      await commandService.savePlayArrangement(mapped.command);
      return;
    case "savePlaySection":
      await commandService.savePlaySection(mapped.command);
      return;
    case "reorderPlaySections":
      await commandService.reorderPlaySections(mapped.command);
      return;
    case "addPlayCue":
      await commandService.addPlayCue(mapped.command);
      return;
    case "updatePlayCue":
      await commandService.updatePlayCue(mapped.command);
      return;
    case "savePadLayer":
      await commandService.savePadLayer(mapped.command);
      return;
    case "setPlaybackState":
      await commandService.setPlaybackState(mapped.command);
      return;
  }
};

export const runPlayDesktopReplayPass = async (
  dependencies: PlayDesktopReplayPassDependencies
): Promise<PlayDesktopReplayPassResult> => {
  const { actor, commandService, now, policy, repository } = dependencies;
  const retryableSafeErrorMessage =
    dependencies.retryableSafeErrorMessage ?? DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE;
  const errorClassifier: PlayDesktopReplayErrorClassifier =
    dependencies.errorClassifier ??
    ((): PlayDesktopReplayErrorClassification => ({
      kind: "retryable",
      safeErrorMessage: retryableSafeErrorMessage
    }));
  const parsedPolicy = PlayLocalSyncQueueReplayPolicySchema.parse(policy);

  const readOptions: PlayPersistenceReadOptions = {
    context: {
      actorId: actor.actorId,
      requestId: `play-replay-read:${now}`,
      tenantId: actor.tenantId
    }
  };
  const writeOptionsFor = (requestId: string): PlayPersistenceWriteOptions => ({
    context: { actorId: actor.actorId, requestId, tenantId: actor.tenantId },
    intent: "update"
  });

  const pending = await repository.listPending({ input: {}, options: readOptions });
  const decision = decidePlayLocalSyncQueueReplay(pending, { now, policy });

  const synced: string[] = [];
  const failed: string[] = [];
  const requeued: string[] = [];
  const exhausted: string[] = [];

  for (const entry of decision.exhausted) {
    const options = writeOptionsFor(entry.requestId);
    await repository.markInFlight({
      input: {
        queueEntryId: entry.queueEntryId,
        transition: { from: "pending", to: "in-flight", transitionedAt: now }
      },
      options
    });
    await repository.markFailed({
      input: {
        queueEntryId: entry.queueEntryId,
        safeErrorMessage: EXHAUSTED_SAFE_ERROR_MESSAGE,
        transition: { from: "in-flight", to: "failed", transitionedAt: now }
      },
      options
    });
    exhausted.push(entry.queueEntryId);
  }

  for (const entry of decision.eligible) {
    const options = writeOptionsFor(entry.requestId);
    const inFlight = await repository.markInFlight({
      input: {
        queueEntryId: entry.queueEntryId,
        transition: { from: "pending", to: "in-flight", transitionedAt: now }
      },
      options
    });

    try {
      const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);
      await dispatchReplayCommand(commandService, mapped);
      await repository.markSynced({
        input: {
          queueEntryId: entry.queueEntryId,
          transition: { from: "in-flight", to: "synced", transitionedAt: now }
        },
        options
      });
      synced.push(entry.queueEntryId);
    } catch (error) {
      const classification = errorClassifier(error, entry);

      if (classification.kind === "retryable") {
        await repository.markFailed({
          input: {
            nextAttemptAt: computeNextAttemptAt(parsedPolicy, inFlight.entry.attemptCount, now),
            queueEntryId: entry.queueEntryId,
            safeErrorMessage: classification.safeErrorMessage,
            transition: { from: "in-flight", to: "failed", transitionedAt: now }
          },
          options
        });
        await repository.requeue({
          input: {
            queueEntryId: entry.queueEntryId,
            transition: { from: "failed", to: "pending", transitionedAt: now }
          },
          options
        });
        requeued.push(entry.queueEntryId);
      } else {
        await repository.markFailed({
          input: {
            queueEntryId: entry.queueEntryId,
            safeErrorMessage: classification.safeErrorMessage,
            transition: { from: "in-flight", to: "failed", transitionedAt: now }
          },
          options
        });
        failed.push(entry.queueEntryId);
      }
    }
  }

  return { exhausted, failed, requeued, synced };
};
