import { z } from "zod";
import {
  PlayLocalSyncQueueEntryPersistenceRecordSchema,
  type PlayLocalSyncQueueEntryPersistenceRecord
} from "./play-local-sync-queue-repository-contracts.js";

/**
 * Pure replay scheduling decision for the Play local sync queue. It layers
 * exponential backoff and an attempt-limit budget on top of the queue's pending
 * entries so a replay coordinator can re-issue offline edits when connectivity
 * returns.
 *
 * This is decision logic only: it never calls the API, opens a connection, or
 * runs a timer. A retried entry carries the attempt history written by the
 * previous `markInFlight` (`attemptCount` + `lastAttemptedAt`); the backoff is
 * computed from that timestamp, exactly like the Presenter replay decision. The
 * Play coordinator consumes the result to drive the actual replay pass.
 */

export const PlayLocalSyncQueueReplayPolicySchema = z
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

export type PlayLocalSyncQueueReplayPolicy = z.infer<
  typeof PlayLocalSyncQueueReplayPolicySchema
>;
export type PlayLocalSyncQueueReplayPolicyInput = z.input<
  typeof PlayLocalSyncQueueReplayPolicySchema
>;

const ReplayDecisionOptionsSchema = z
  .object({
    now: z.string().datetime(),
    policy: PlayLocalSyncQueueReplayPolicySchema,
    trackSetId: z.string().min(1).optional()
  })
  .strict();

export type PlayLocalSyncQueueReplayDecisionOptionsInput = {
  readonly now: string;
  readonly policy: PlayLocalSyncQueueReplayPolicyInput;
  readonly trackSetId?: string;
};

export interface PlayLocalSyncQueueReplayWaitingEntry {
  readonly entry: PlayLocalSyncQueueEntryPersistenceRecord;
  readonly nextEligibleAt: string;
}

export interface PlayLocalSyncQueueReplayDecision {
  readonly eligible: readonly PlayLocalSyncQueueEntryPersistenceRecord[];
  readonly exhausted: readonly PlayLocalSyncQueueEntryPersistenceRecord[];
  readonly waiting: readonly PlayLocalSyncQueueReplayWaitingEntry[];
}

const computeBackoffSeconds = (
  policy: PlayLocalSyncQueueReplayPolicy,
  attemptCount: number
): number =>
  Math.min(
    policy.backoffCapSeconds,
    policy.backoffBaseSeconds * policy.backoffMultiplier ** (attemptCount - 1)
  );

/**
 * Arrangement, section, reorder, and pad saves carry no `trackSetId`, so entries
 * without one are grouped under a stable per-tenant fallback key. The track-set
 * key keeps the queue draining one entry at a time per track set, so a retried
 * edit never races a later edit to the same track set.
 */
const trackSetReplayKey = (entry: PlayLocalSyncQueueEntryPersistenceRecord): string =>
  `${entry.tenantId}:${entry.trackSetId ?? " no-track-set"}`;

const compareEntriesForReplay = (
  left: PlayLocalSyncQueueEntryPersistenceRecord,
  right: PlayLocalSyncQueueEntryPersistenceRecord
): number =>
  left.tenantId.localeCompare(right.tenantId) ||
  trackSetReplayKey(left).localeCompare(trackSetReplayKey(right)) ||
  left.queuedAt.localeCompare(right.queuedAt) ||
  left.queueEntryId.localeCompare(right.queueEntryId);

export const decidePlayLocalSyncQueueReplay = (
  rawEntries: readonly unknown[],
  rawOptions: PlayLocalSyncQueueReplayDecisionOptionsInput
): PlayLocalSyncQueueReplayDecision => {
  const options = ReplayDecisionOptionsSchema.parse(rawOptions);
  const nowMs = Date.parse(options.now);
  const pending = z
    .array(PlayLocalSyncQueueEntryPersistenceRecordSchema)
    .parse(rawEntries)
    .filter(
      (entry) =>
        entry.status === "pending" &&
        (options.trackSetId === undefined || entry.trackSetId === options.trackSetId)
    )
    .sort(compareEntriesForReplay);

  const decidedTrackSetKeys = new Set<string>();
  const eligible: PlayLocalSyncQueueEntryPersistenceRecord[] = [];
  const exhausted: PlayLocalSyncQueueEntryPersistenceRecord[] = [];
  const waiting: PlayLocalSyncQueueReplayWaitingEntry[] = [];

  for (const entry of pending) {
    const trackSetKey = trackSetReplayKey(entry);

    // Replay one entry at a time per track set: only the earliest-queued entry is
    // decided; later entries for the same track set wait their turn.
    if (decidedTrackSetKeys.has(trackSetKey)) {
      continue;
    }

    decidedTrackSetKeys.add(trackSetKey);

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
