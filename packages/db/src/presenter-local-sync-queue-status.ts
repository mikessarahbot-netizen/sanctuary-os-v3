import type { PresenterLocalSyncQueueStatusCounts } from "./presenter-repository-contracts.js";

/**
 * Operator-facing summary of the Presenter local sync queue, derived from the
 * per-status counts. Pure: it adds no I/O and is what a desktop sidecar reports
 * to surface queue health (total, in-flight, synced, and needs-attention).
 */
export interface PresenterLocalSyncQueueStatusSummary {
  readonly cancelled: number;
  readonly needsAttention: number;
  readonly pending: number;
  readonly synced: number;
  readonly total: number;
}

export const summarizePresenterLocalSyncQueue = (
  counts: PresenterLocalSyncQueueStatusCounts
): PresenterLocalSyncQueueStatusSummary => ({
  cancelled: counts.cancelled,
  needsAttention: counts.conflict + counts.failed,
  pending: counts.queued + counts.replaying,
  synced: counts.synced,
  total:
    counts.queued +
    counts.replaying +
    counts.synced +
    counts.conflict +
    counts.failed +
    counts.cancelled
});
