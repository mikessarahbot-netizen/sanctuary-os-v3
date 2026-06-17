import {
  ChartsLocalSyncQueueEntryPersistenceRecordSchema,
  ChartsLocalSyncQueueReplayPolicySchema,
  decideChartsLocalSyncQueueReplay,
  type ChartsLocalSyncQueueEntryPersistenceRecord,
  type ChartsLocalSyncQueuePersistenceRepository,
  type ChartsLocalSyncQueueReplayPolicy,
  type ChartsLocalSyncQueueReplayPolicyInput,
  type ChartsPersistenceReadOptions,
  type ChartsPersistenceWriteOptions
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  AddChartAnnotationCommandSchema,
  RemoveChartAnnotationCommandSchema,
  SaveChartArrangementCommandSchema,
  SaveChartCommandSchema,
  SetMusicianChartPreferenceCommandSchema,
  UpdateChartAnnotationCommandSchema,
  UpdateChartSourceCommandSchema,
  isChartsDomainError,
  type ChartsCommandService
} from "../../domain/charts/index.js";

/**
 * Charts local sync queue replay coordinator for the API. A single pass reads
 * the pending entries, applies the pure replay decision (ordering, backoff,
 * attempt limits), and for each eligible entry marks it `in-flight`, maps the
 * stored operation to the matching `ChartsCommandService` command, runs it, and
 * records the outcome:
 *
 * - success -> `markSynced`.
 * - retryable failure (transport-like) -> `markFailed` with a backoff
 *   `nextAttemptAt`, then `requeue` so a later pass retries it once the backoff
 *   elapses (respecting the attempt limit).
 * - terminal failure (a typed `ChartsDomainError`: missing chart/annotation,
 *   validation, authorization) -> `markFailed` with the redacted safe message and
 *   no requeue, leaving the edit for operator review.
 *
 * Entries that have exhausted their attempt budget are marked `failed` without
 * calling the command service. This is a single pass: no timer loop, no
 * transport of its own (the command service is injected, so it is unit-testable
 * with a fake), and no offline/online detection. The mapping requires the
 * actor's tenant to match the entry's tenant and reuses the entry's `requestId`
 * as the command idempotency key.
 */
export type ChartsLocalSyncQueueReplayOperation =
  | "addChartAnnotation"
  | "removeChartAnnotation"
  | "saveChart"
  | "saveChartArrangement"
  | "setMusicianChartPreference"
  | "updateChartAnnotation"
  | "updateChartSource";

export type ChartsLocalSyncQueueReplayErrorClassification =
  | { readonly kind: "retryable"; readonly safeErrorMessage: string }
  | { readonly kind: "terminal"; readonly safeErrorMessage: string };

export type ChartsLocalSyncQueueReplayErrorClassifier = (
  error: unknown,
  entry: ChartsLocalSyncQueueEntryPersistenceRecord
) => ChartsLocalSyncQueueReplayErrorClassification;

export interface ChartsLocalSyncQueueReplayPassDependencies {
  readonly actor: AuthenticatedActor;
  readonly commandService: ChartsCommandService;
  readonly errorClassifier?: ChartsLocalSyncQueueReplayErrorClassifier;
  readonly now: string;
  readonly policy: ChartsLocalSyncQueueReplayPolicyInput;
  readonly repository: ChartsLocalSyncQueuePersistenceRepository;
  readonly retryableSafeErrorMessage?: string;
}

export interface ChartsLocalSyncQueueReplayPassResult {
  readonly exhausted: readonly string[];
  readonly failed: readonly string[];
  readonly requeued: readonly string[];
  readonly synced: readonly string[];
}

const DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE =
  "This edit could not be synced yet and will be retried automatically.";
const EXHAUSTED_SAFE_ERROR_MESSAGE = "Sync attempts were exhausted for this edit.";

/**
 * Default classifier: a typed `ChartsDomainError` is a terminal condition
 * (missing chart/arrangement/annotation/preference, validation, authorization)
 * whose already-redacted `safeMessage` is surfaced for review. Everything else —
 * transport errors, server faults, unknown failures — stays a retryable failure
 * that pauses this chart until the backoff elapses.
 */
const createDefaultErrorClassifier = (
  retryableSafeErrorMessage: string
): ChartsLocalSyncQueueReplayErrorClassifier => (error) =>
  isChartsDomainError(error)
    ? { kind: "terminal", safeErrorMessage: error.safeMessage }
    : { kind: "retryable", safeErrorMessage: retryableSafeErrorMessage };

const computeBackoffSeconds = (
  policy: ChartsLocalSyncQueueReplayPolicy,
  attemptCount: number
): number =>
  Math.min(
    policy.backoffCapSeconds,
    policy.backoffBaseSeconds * policy.backoffMultiplier ** (attemptCount - 1)
  );

const computeNextAttemptAt = (
  policy: ChartsLocalSyncQueueReplayPolicy,
  attemptCount: number,
  now: string
): string =>
  new Date(Date.parse(now) + computeBackoffSeconds(policy, attemptCount) * 1000).toISOString();

const executeReplayCommand = async (
  commandService: ChartsCommandService,
  actor: AuthenticatedActor,
  entry: ChartsLocalSyncQueueEntryPersistenceRecord
): Promise<ChartsLocalSyncQueueReplayOperation> => {
  const parsedEntry = ChartsLocalSyncQueueEntryPersistenceRecordSchema.parse(entry);

  if (actor.tenantId !== parsedEntry.tenantId) {
    throw new Error("Charts local sync queue replay actor tenant must match the queue entry tenant.");
  }

  const request = { actor, requestId: parsedEntry.requestId };
  const operation = parsedEntry.operation;

  switch (operation.operation) {
    case "saveChart": {
      const command = SaveChartCommandSchema.parse({
        ...request,
        input: {
          chartId: operation.payload.chartId,
          chordProSource: operation.payload.chordProSource,
          defaultKey: operation.payload.defaultKey,
          songRef: operation.payload.songRef,
          ...(operation.payload.arrangementRef !== undefined
            ? { arrangementRef: operation.payload.arrangementRef }
            : {}),
          ...(operation.payload.title !== undefined ? { title: operation.payload.title } : {})
        }
      });
      await commandService.saveChart(command);

      return "saveChart";
    }
    case "updateChartSource": {
      const command = UpdateChartSourceCommandSchema.parse({
        ...request,
        input: {
          chartId: operation.payload.chartId,
          chordProSource: operation.payload.chordProSource,
          ...(operation.payload.defaultKey !== undefined
            ? { defaultKey: operation.payload.defaultKey }
            : {})
        }
      });
      await commandService.updateChartSource(command);

      return "updateChartSource";
    }
    case "saveChartArrangement": {
      const command = SaveChartArrangementCommandSchema.parse({
        ...request,
        input: {
          arrangementRef: operation.payload.arrangementRef,
          capo: operation.payload.capo,
          defaultKey: operation.payload.defaultKey,
          label: operation.payload.label,
          sectionOrder: operation.payload.sectionOrder,
          songRef: operation.payload.songRef
        }
      });
      await commandService.saveChartArrangement(command);

      return "saveChartArrangement";
    }
    case "setMusicianChartPreference": {
      const command = SetMusicianChartPreferenceCommandSchema.parse({
        ...request,
        input: {
          capo: operation.payload.capo,
          chartId: operation.payload.chartId,
          chordsVisible: operation.payload.chordsVisible,
          fontScale: operation.payload.fontScale,
          instrument: operation.payload.instrument,
          musicianId: operation.payload.musicianId,
          transposeSemitones: operation.payload.transposeSemitones
        }
      });
      await commandService.setMusicianChartPreference(command);

      return "setMusicianChartPreference";
    }
    case "addChartAnnotation": {
      const command = AddChartAnnotationCommandSchema.parse({
        ...request,
        input: {
          chartId: operation.payload.chartId,
          kind: operation.payload.kind,
          lineIndex: operation.payload.lineIndex,
          musicianId: operation.payload.musicianId,
          sectionIndex: operation.payload.sectionIndex,
          ...(operation.payload.color !== undefined ? { color: operation.payload.color } : {}),
          ...(operation.payload.note !== undefined ? { note: operation.payload.note } : {})
        }
      });
      await commandService.addChartAnnotation(command);

      return "addChartAnnotation";
    }
    case "updateChartAnnotation": {
      const command = UpdateChartAnnotationCommandSchema.parse({
        ...request,
        input: {
          annotationId: operation.payload.annotationId,
          chartId: operation.payload.chartId,
          kind: operation.payload.kind,
          lineIndex: operation.payload.lineIndex,
          musicianId: operation.payload.musicianId,
          sectionIndex: operation.payload.sectionIndex,
          ...(operation.payload.color !== undefined ? { color: operation.payload.color } : {}),
          ...(operation.payload.note !== undefined ? { note: operation.payload.note } : {})
        }
      });
      await commandService.updateChartAnnotation(command);

      return "updateChartAnnotation";
    }
    case "removeChartAnnotation": {
      const command = RemoveChartAnnotationCommandSchema.parse({
        ...request,
        input: {
          annotationId: operation.payload.annotationId,
          chartId: operation.payload.chartId,
          confirmationIntent: {
            confirmed: true,
            reason: "Replaying a confirmed offline chart annotation removal."
          },
          musicianId: operation.payload.musicianId
        }
      });
      await commandService.removeChartAnnotation(command);

      return "removeChartAnnotation";
    }
  }
};

export const runChartsLocalSyncQueueReplayPass = async (
  dependencies: ChartsLocalSyncQueueReplayPassDependencies
): Promise<ChartsLocalSyncQueueReplayPassResult> => {
  const { actor, commandService, now, policy, repository } = dependencies;
  const retryableSafeErrorMessage =
    dependencies.retryableSafeErrorMessage ?? DEFAULT_RETRYABLE_SAFE_ERROR_MESSAGE;
  const errorClassifier =
    dependencies.errorClassifier ?? createDefaultErrorClassifier(retryableSafeErrorMessage);
  const parsedPolicy = ChartsLocalSyncQueueReplayPolicySchema.parse(policy);

  const readOptions: ChartsPersistenceReadOptions = {
    context: {
      actorId: actor.actorId,
      requestId: `charts-replay-read:${now}`,
      tenantId: actor.tenantId
    }
  };
  const writeOptionsFor = (requestId: string): ChartsPersistenceWriteOptions => ({
    context: { actorId: actor.actorId, requestId, tenantId: actor.tenantId },
    intent: "update"
  });

  const pending = await repository.listPending({ input: {}, options: readOptions });
  const decision = decideChartsLocalSyncQueueReplay(pending, { now, policy });

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
