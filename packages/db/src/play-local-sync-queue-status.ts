import type { PlayLocalSyncQueueStatusCounts } from "./play-local-sync-queue-repository-contracts.js";

/**
 * Operator-facing summary of the Play local sync queue, derived from the
 * per-status counts. Pure: it adds no I/O and is what an offline-first client
 * reports to surface queue health (total, in-flight, synced, and the
 * needs-attention edits that have failed and are awaiting another attempt).
 */
export interface PlayLocalSyncQueueStatusSummary {
  readonly inFlight: number;
  readonly needsAttention: number;
  readonly pending: number;
  readonly synced: number;
  readonly total: number;
}

export const summarizePlayLocalSyncQueue = (
  counts: PlayLocalSyncQueueStatusCounts
): PlayLocalSyncQueueStatusSummary => ({
  inFlight: counts.inFlight,
  needsAttention: counts.failed,
  pending: counts.pending,
  synced: counts.synced,
  total: counts.failed + counts.inFlight + counts.pending + counts.synced
});
