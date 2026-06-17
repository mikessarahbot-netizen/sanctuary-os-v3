import { z } from "zod";
import {
  listPresenterLocalSyncQueueEntriesReadyForReplay,
  type PresenterLocalSyncQueueEntryPersistenceRecord
} from "./presenter-repository-contracts.js";

/**
 * Pure replay scheduling decision for the Presenter local sync queue. It layers
 * exponential backoff and an attempt-limit budget on top of the existing
 * `listPresenterLocalSyncQueueEntriesReadyForReplay` ordering/blocking helper.
 *
 * This is decision logic only: it never calls the API, opens a connection, or
 * runs a timer. A desktop replay scheduler consumes the result to drive the
 * actual replay loop in a later slice.
 */

export const PresenterLocalSyncQueueReplayPolicySchema = z
  .object({
    backoffBaseSeconds: z.number().positive(),
    backoffCapSeconds: z.number().positive(),
    backoffMultiplier: z.number().min(1),
    maxAttempts: z.number().int().positive()
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.backoffCapSeconds < policy.backoffBaseSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay backoff cap must be greater than or equal to the base delay.",
        path: ["backoffCapSeconds"]
      });
    }
  });

export type PresenterLocalSyncQueueReplayPolicy = z.infer<
  typeof PresenterLocalSyncQueueReplayPolicySchema
>;
export type PresenterLocalSyncQueueReplayPolicyInput = z.input<
  typeof PresenterLocalSyncQueueReplayPolicySchema
>;

const ReplayDecisionOptionsSchema = z
  .object({
    now: z.string().datetime(),
    policy: PresenterLocalSyncQueueReplayPolicySchema,
    presentationId: z.string().min(1).optional()
  })
  .strict();

export type PresenterLocalSyncQueueReplayDecisionOptionsInput = {
  readonly now: string;
  readonly policy: PresenterLocalSyncQueueReplayPolicyInput;
  readonly presentationId?: string;
};

export interface PresenterLocalSyncQueueReplayWaitingEntry {
  readonly entry: PresenterLocalSyncQueueEntryPersistenceRecord;
  readonly nextEligibleAt: string;
}

export interface PresenterLocalSyncQueueReplayDecision {
  readonly eligible: readonly PresenterLocalSyncQueueEntryPersistenceRecord[];
  readonly exhausted: readonly PresenterLocalSyncQueueEntryPersistenceRecord[];
  readonly waiting: readonly PresenterLocalSyncQueueReplayWaitingEntry[];
}

const computeBackoffSeconds = (
  policy: PresenterLocalSyncQueueReplayPolicy,
  attemptCount: number
): number =>
  Math.min(
    policy.backoffCapSeconds,
    policy.backoffBaseSeconds * policy.backoffMultiplier ** (attemptCount - 1)
  );

export const decidePresenterLocalSyncQueueReplay = (
  rawEntries: readonly unknown[],
  rawOptions: PresenterLocalSyncQueueReplayDecisionOptionsInput
): PresenterLocalSyncQueueReplayDecision => {
  const options = ReplayDecisionOptionsSchema.parse(rawOptions);
  const nowMs = Date.parse(options.now);
  const ready = listPresenterLocalSyncQueueEntriesReadyForReplay(
    rawEntries,
    options.presentationId === undefined ? {} : { presentationId: options.presentationId }
  );

  const decidedPresentationKeys = new Set<string>();
  const eligible: PresenterLocalSyncQueueEntryPersistenceRecord[] = [];
  const exhausted: PresenterLocalSyncQueueEntryPersistenceRecord[] = [];
  const waiting: PresenterLocalSyncQueueReplayWaitingEntry[] = [];

  for (const entry of ready) {
    const presentationKey = `${entry.tenantId}:${entry.presentationId}`;

    // Replay one entry at a time per presentation: only the earliest-queued
    // entry is decided; later entries for the same presentation wait their turn.
    if (decidedPresentationKeys.has(presentationKey)) {
      continue;
    }

    decidedPresentationKeys.add(presentationKey);

    if (entry.attemptCount >= options.policy.maxAttempts) {
      exhausted.push(entry);
      continue;
    }

    if (entry.attemptCount === 0 || entry.lastAttemptedAt === undefined) {
      eligible.push(entry);
      continue;
    }

    const nextEligibleMs =
      Date.parse(entry.lastAttemptedAt) +
      computeBackoffSeconds(options.policy, entry.attemptCount) * 1000;

    if (nextEligibleMs <= nowMs) {
      eligible.push(entry);
    } else {
      waiting.push({ entry, nextEligibleAt: new Date(nextEligibleMs).toISOString() });
    }
  }

  return { eligible, exhausted, waiting };
};
