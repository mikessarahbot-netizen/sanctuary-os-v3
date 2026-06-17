import {
  decidePresenterLocalSyncQueueReplay,
  type PresenterLocalSyncConflictDetailPersistence,
  type PresenterLocalSyncQueueEntryPersistenceRecord,
  type PresenterLocalSyncQueuePersistenceRepository,
  type PresenterLocalSyncQueueReplayPolicyInput,
  type PresenterPersistenceReadOptions,
  type PresenterPersistenceWriteOptions
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import {
  mapPresenterLocalSyncQueueEntryToReplayCommand,
  type PresenterLocalSyncQueueReplayCommand,
  type PresenterReplayCommandExecutor
} from "@sanctuary-os/api/presenter";

/**
 * Single Presenter local sync queue replay pass for the desktop runtime.
 *
 * It reads the ready entries, applies the pure replay decision (ordering,
 * backoff, attempt limits), marks each eligible entry `replaying`, maps it to a
 * Presenter command, calls the injected command service, and marks the outcome
 * `synced` or `failed`. Entries that have exhausted their attempt budget are
 * marked `failed`. This is a single pass with no timer loop, no transport of its
 * own (the command service is injected), and no offline/online detection.
 *
 * A command-service error is routed through an injected classifier: a genuine
 * conflict (stale revision, validation, authorization, tenant mismatch) is
 * recorded as `conflict` with details for operator review, while a transient
 * error stays a retryable `failed`. The default classifier treats every error
 * as `failed`, which safely stops that presentation.
 */
export type PresenterDesktopReplayErrorClassification =
  | {
      readonly conflict: PresenterLocalSyncConflictDetailPersistence;
      readonly kind: "conflict";
    }
  | { readonly kind: "failed"; readonly safeErrorMessage: string };

export type PresenterDesktopReplayErrorClassifier = (
  error: unknown,
  entry: PresenterLocalSyncQueueEntryPersistenceRecord
) => PresenterDesktopReplayErrorClassification;

export interface PresenterDesktopReplayPassDependencies {
  readonly actor: AuthenticatedActor;
  readonly commandService: PresenterReplayCommandExecutor;
  readonly errorClassifier?: PresenterDesktopReplayErrorClassifier;
  readonly now: string;
  readonly policy: PresenterLocalSyncQueueReplayPolicyInput;
  readonly repository: PresenterLocalSyncQueuePersistenceRepository;
  readonly safeErrorMessage?: string;
}

export interface PresenterDesktopReplayPassResult {
  readonly conflicted: readonly string[];
  readonly exhausted: readonly string[];
  readonly failed: readonly string[];
  readonly synced: readonly string[];
}

const executeReplayCommand = async (
  commandService: PresenterReplayCommandExecutor,
  mapped: PresenterLocalSyncQueueReplayCommand
): Promise<void> => {
  switch (mapped.operation) {
    case "updatePresentation":
      await commandService.updatePresentation(mapped.command);
      return;
    case "addSlide":
      await commandService.addSlide(mapped.command);
      return;
    case "updateSlide":
      await commandService.updateSlide(mapped.command);
      return;
    case "reorderSlides":
      await commandService.reorderSlides(mapped.command);
      return;
    case "applyPresenterTheme":
      await commandService.applyPresenterTheme(mapped.command);
      return;
    case "setOutputTarget":
      await commandService.setOutputTarget(mapped.command);
      return;
  }
};

export const runPresenterDesktopReplayPass = async (
  dependencies: PresenterDesktopReplayPassDependencies
): Promise<PresenterDesktopReplayPassResult> => {
  const { actor, commandService, now, policy, repository } = dependencies;
  const safeErrorMessage =
    dependencies.safeErrorMessage ??
    "This edit could not be synced yet and will need another attempt.";
  const errorClassifier: PresenterDesktopReplayErrorClassifier =
    dependencies.errorClassifier ?? (() => ({ kind: "failed", safeErrorMessage }));

  const writeOptionsFor = (requestId: string): PresenterPersistenceWriteOptions => ({
    context: { actorId: actor.actorId, requestId, tenantId: actor.tenantId },
    intent: "update"
  });
  const readOptions: PresenterPersistenceReadOptions = {
    context: {
      actorId: actor.actorId,
      requestId: `presenter-replay-read:${now}`,
      tenantId: actor.tenantId
    }
  };

  const ready = await repository.listReadyForReplay({ input: {}, options: readOptions });
  const decision = decidePresenterLocalSyncQueueReplay(ready, { now, policy });

  const synced: string[] = [];
  const failed: string[] = [];
  const conflicted: string[] = [];
  const exhausted: string[] = [];

  for (const entry of decision.exhausted) {
    await repository.markFailed({
      input: {
        queueEntryId: entry.queueEntryId,
        safeErrorMessage: "Sync attempts were exhausted for this edit.",
        transition: { from: "queued", to: "failed", transitionedAt: now }
      },
      options: writeOptionsFor(entry.requestId)
    });
    exhausted.push(entry.queueEntryId);
  }

  for (const entry of decision.eligible) {
    const options = writeOptionsFor(entry.requestId);

    await repository.markReplaying({
      input: {
        queueEntryId: entry.queueEntryId,
        transition: { from: "queued", to: "replaying", transitionedAt: now }
      },
      options
    });

    try {
      const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(entry, actor);
      await executeReplayCommand(commandService, mapped);
      await repository.markSynced({
        input: {
          queueEntryId: entry.queueEntryId,
          transition: { from: "replaying", to: "synced", transitionedAt: now }
        },
        options
      });
      synced.push(entry.queueEntryId);
    } catch (error) {
      const classification = errorClassifier(error, entry);

      if (classification.kind === "conflict") {
        await repository.markConflict({
          input: {
            conflict: classification.conflict,
            queueEntryId: entry.queueEntryId,
            transition: { from: "replaying", to: "conflict", transitionedAt: now }
          },
          options
        });
        conflicted.push(entry.queueEntryId);
      } else {
        await repository.markFailed({
          input: {
            queueEntryId: entry.queueEntryId,
            safeErrorMessage: classification.safeErrorMessage,
            transition: { from: "replaying", to: "failed", transitionedAt: now }
          },
          options
        });
        failed.push(entry.queueEntryId);
      }
    }
  }

  return { conflicted, exhausted, failed, synced };
};
