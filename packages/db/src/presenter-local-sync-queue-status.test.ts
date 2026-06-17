import { describe, expect, it } from "vitest";
import { summarizePresenterLocalSyncQueue } from "./index.js";

describe("summarizePresenterLocalSyncQueue", () => {
  it("derives total, pending, synced, and needs-attention from the counts", () => {
    expect(
      summarizePresenterLocalSyncQueue({
        cancelled: 1,
        conflict: 2,
        failed: 3,
        queued: 4,
        replaying: 5,
        synced: 6
      })
    ).toEqual({
      cancelled: 1,
      needsAttention: 5,
      pending: 9,
      synced: 6,
      total: 21
    });
  });

  it("summarizes an empty queue as all zeroes", () => {
    expect(
      summarizePresenterLocalSyncQueue({
        cancelled: 0,
        conflict: 0,
        failed: 0,
        queued: 0,
        replaying: 0,
        synced: 0
      })
    ).toEqual({
      cancelled: 0,
      needsAttention: 0,
      pending: 0,
      synced: 0,
      total: 0
    });
  });
});
