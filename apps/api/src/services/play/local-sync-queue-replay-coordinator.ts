import {
  PlayLocalSyncQueueEntryPersistenceRecordSchema,
  PlayLocalSyncQueueReplayPolicySchema,
  decidePlayLocalSyncQueueReplay,
  type PlayLocalSyncQueueEntryPersistenceRecord,
  type PlayLocalSyncQueuePersistenceRepository,
  type PlayLocalSyncQueueReplayPolicy,
  type PlayLocalSyncQueueReplayPolicyInput,
  type PlayPersistenceReadOptions,
  type PlayPersistenceWriteOptions
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  AddPlayCueCommandSchema,
  ReorderPlaySectionsCommandSchema,
  SavePadLayerCommandSchema,
  SavePlayArrangementCommandSchema,
  SavePlaySectionCommandSchema,
  SaveTrackSetCommandSchema,
  SetPlaybackStateCommandSchema,
  UpdatePlayCueCommandSchema,
  UpdateTrackSetMembersCommandSchema,
  isPlayDomainError,
  type PlayCommandService
} from "../../domain/play/index.js";

/**
 * Play local sync queue replay coordinator for the API. A single pass reads the
 * pending entries, applies the pure replay decision (ordering, backoff, attempt
 * limits), and for each eligible entry marks it `in-flight`, maps the stored
 * operation to the matching `PlayCommandService` command, runs it, and records
 * the outcome:
 *
 * - success -> `markSynced`.
 * - retryable failure (transport-like) -> `markFailed` with a backoff
 *   `nextAttemptAt`, then `requeue` so a later pass retries it once the backoff
 *   elapses (respecting the attempt limit).
 * - terminal failure (a typed `PlayDomainError`: missing track set/arrangement/
 *   section/cue/pad/playback state, validation, authorization) -> `markFailed`
 *   with the redacted safe message and no requeue, leaving the edit for operator
 *   review.
 *
 * Entries that have exhausted their attempt budget are marked `failed` without
 * calling the command service. This is a single pass: no timer loop, no
 * transport of its own (the command service is injected, so it is unit-testable
 * with a fake), and no offline/online detection. The mapping requires the
 * actor's tenant to match the entry's tenant and reuses the entry's `requestId`
 * as the command idempotency key.
 */
export type PlayLocalSyncQueueReplayOperation =
  | "addPlayCue"
  | "reorderPlaySections"
  | "savePadLayer"
  | "savePlayArrangement"
  | "savePlaySection"
  | "saveTrackSet"
  | "setPlaybackState"
  | "updatePlayCue"
  | "updateTrackSetMembers";

export type PlayLocalSyncQueueReplayErrorClassification =
  | { readonly kind: "retryable"; readonly safeErrorMessage: string }
  | { readonly kind: "terminal"; readonly safeErrorMessage: string };

export type PlayLocalSyncQueueReplayErrorClassifier = (
  error: unknown,
  entry: PlayLocalSyncQueueEntryPersistenceRecord
) => PlayLocalSyncQueueReplayErrorClassification;

export interface PlayLocalSyncQueueReplayPassDependencies {
  readonly actor: AuthenticatedActor;
  readonly commandService: PlayCommandService;
  readonly errorClassifier?: PlayLocalSyncQueueReplayErrorClassifier;
  readonly now: string;
  readonly policy: PlayLocalSyncQueueReplayPolicyInput;
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
  readonly retryableSafeErrorMessage?: string;
}

export interface PlayLocalSyncQueueReplayPassResult {
  readonly exhausted: readonly string[];
  readonly failed: readonly string[];
  readonly requeued: readonly string[];
  readonly synced: readonly string[];
}

const DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE =
  "This edit could not be synced yet and will be retried automatically.";
const EXHAUSTED_SAFE_ERROR_MESSAGE = "Sync attempts were exhausted for this edit.";

/**
 * Default classifier: a typed `PlayDomainError` is a terminal condition (missing
 * track set/arrangement/section/cue/pad/playback state, validation,
 * authorization) whose already-redacted `safeMessage` is surfaced for review.
 * Everything else — transport errors, server faults, unknown failures — stays a
 * retryable failure that pauses this track set until the backoff elapses.
 */
const createDefaultErrorClassifier = (
  retryableSafeErrorMessage: string
): PlayLocalSyncQueueReplayErrorClassifier => (error) =>
  isPlayDomainError(error)
    ? { kind: "terminal", safeErrorMessage: error.safeMessage }
    : { kind: "retryable", safeErrorMessage: retryableSafeErrorMessage };

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

const executeReplayCommand = async (
  commandService: PlayCommandService,
  actor: AuthenticatedActor,
  entry: PlayLocalSyncQueueEntryPersistenceRecord
): Promise<PlayLocalSyncQueueReplayOperation> => {
  const parsedEntry = PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(entry);

  if (actor.tenantId !== parsedEntry.tenantId) {
    throw new Error("Play local sync queue replay actor tenant must match the queue entry tenant.");
  }

  const request = { actor, requestId: parsedEntry.requestId };
  const operation = parsedEntry.operation;

  switch (operation.operation) {
    case "saveTrackSet": {
      const command = SaveTrackSetCommandSchema.parse({
        ...request,
        input: {
          defaultKey: operation.payload.defaultKey,
          songRef: operation.payload.songRef,
          tempoBpm: operation.payload.tempoBpm,
          trackRefs: operation.payload.trackRefs,
          trackSetId: operation.payload.trackSetId,
          ...(operation.payload.arrangementRef !== undefined
            ? { arrangementRef: operation.payload.arrangementRef }
            : {}),
          ...(operation.payload.serviceRef !== undefined
            ? { serviceRef: operation.payload.serviceRef }
            : {}),
          ...(operation.payload.title !== undefined ? { title: operation.payload.title } : {})
        }
      });
      await commandService.saveTrackSet(command);

      return "saveTrackSet";
    }
    case "updateTrackSetMembers": {
      const command = UpdateTrackSetMembersCommandSchema.parse({
        ...request,
        input: {
          trackRefs: operation.payload.trackRefs,
          trackSetId: operation.payload.trackSetId
        }
      });
      await commandService.updateTrackSetMembers(command);

      return "updateTrackSetMembers";
    }
    case "savePlayArrangement": {
      const command = SavePlayArrangementCommandSchema.parse({
        ...request,
        input: {
          arrangementRef: operation.payload.arrangementRef,
          defaultKey: operation.payload.defaultKey,
          label: operation.payload.label,
          sectionOrder: operation.payload.sectionOrder,
          songRef: operation.payload.songRef,
          tempoBpm: operation.payload.tempoBpm,
          ...(operation.payload.loopSectionRef !== undefined
            ? { loopSectionRef: operation.payload.loopSectionRef }
            : {})
        }
      });
      await commandService.savePlayArrangement(command);

      return "savePlayArrangement";
    }
    case "savePlaySection": {
      const command = SavePlaySectionCommandSchema.parse({
        ...request,
        input: {
          arrangementRef: operation.payload.arrangementRef,
          clickEnabledDefault: operation.payload.clickEnabledDefault,
          kind: operation.payload.kind,
          lengthBars: operation.payload.lengthBars,
          sectionId: operation.payload.sectionId,
          ...(operation.payload.label !== undefined ? { label: operation.payload.label } : {}),
          ...(operation.payload.padLayerRef !== undefined
            ? { padLayerRef: operation.payload.padLayerRef }
            : {})
        }
      });
      await commandService.savePlaySection(command);

      return "savePlaySection";
    }
    case "reorderPlaySections": {
      const command = ReorderPlaySectionsCommandSchema.parse({
        ...request,
        input: {
          arrangementRef: operation.payload.arrangementRef,
          orderedSectionIds: operation.payload.orderedSectionIds
        }
      });
      await commandService.reorderPlaySections(command);

      return "reorderPlaySections";
    }
    case "addPlayCue": {
      const command = AddPlayCueCommandSchema.parse({
        ...request,
        input: {
          action: operation.payload.action,
          fireMode: operation.payload.fireMode,
          label: operation.payload.label,
          markerOffsetBeats: operation.payload.markerOffsetBeats,
          sectionId: operation.payload.sectionId,
          trackSetId: operation.payload.trackSetId,
          ...(operation.payload.padLayerRef !== undefined
            ? { padLayerRef: operation.payload.padLayerRef }
            : {}),
          ...(operation.payload.targetSectionRef !== undefined
            ? { targetSectionRef: operation.payload.targetSectionRef }
            : {})
        }
      });
      await commandService.addPlayCue(command);

      return "addPlayCue";
    }
    case "updatePlayCue": {
      const command = UpdatePlayCueCommandSchema.parse({
        ...request,
        input: {
          action: operation.payload.action,
          cueId: operation.payload.cueId,
          fireMode: operation.payload.fireMode,
          label: operation.payload.label,
          markerOffsetBeats: operation.payload.markerOffsetBeats,
          sectionId: operation.payload.sectionId,
          trackSetId: operation.payload.trackSetId,
          ...(operation.payload.padLayerRef !== undefined
            ? { padLayerRef: operation.payload.padLayerRef }
            : {}),
          ...(operation.payload.targetSectionRef !== undefined
            ? { targetSectionRef: operation.payload.targetSectionRef }
            : {})
        }
      });
      await commandService.updatePlayCue(command);

      return "updatePlayCue";
    }
    case "savePadLayer": {
      const command = SavePadLayerCommandSchema.parse({
        ...request,
        input: {
          gain: operation.payload.gain,
          key: operation.payload.key,
          loop: operation.payload.loop,
          padLayerRef: operation.payload.padLayerRef,
          padMediaRef: operation.payload.padMediaRef,
          ...(operation.payload.label !== undefined ? { label: operation.payload.label } : {}),
          ...(operation.payload.sectionScopeRef !== undefined
            ? { sectionScopeRef: operation.payload.sectionScopeRef }
            : {}),
          ...(operation.payload.songRef !== undefined ? { songRef: operation.payload.songRef } : {})
        }
      });
      await commandService.savePadLayer(command);

      return "savePadLayer";
    }
    case "setPlaybackState": {
      const command = SetPlaybackStateCommandSchema.parse({
        ...request,
        input: {
          clickEnabled: operation.payload.clickEnabled,
          positionBeats: operation.payload.positionBeats,
          transportStatus: operation.payload.transportStatus,
          trackSetId: operation.payload.trackSetId,
          ...(operation.payload.activePadLayerRef !== undefined
            ? { activePadLayerRef: operation.payload.activePadLayerRef }
            : {}),
          ...(operation.payload.activeSectionRef !== undefined
            ? { activeSectionRef: operation.payload.activeSectionRef }
            : {})
        }
      });
      await commandService.setPlaybackState(command);

      return "setPlaybackState";
    }
  }
};

export const runPlayLocalSyncQueueReplayPass = async (
  dependencies: PlayLocalSyncQueueReplayPassDependencies
): Promise<PlayLocalSyncQueueReplayPassResult> => {
  const { actor, commandService, now, policy, repository } = dependencies;
  const retryableSafeErrorMessage =
    dependencies.retryableSafeErrorMessage ?? DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE;
  const errorClassifier =
    dependencies.errorClassifier ?? createDefaultErrorClassifier(retryableSafeErrorMessage);
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
      await executeReplayCommand(commandService, actor, entry);
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
