import { describe, expect, it } from "vitest";
import { summarizeChartsLocalSyncQueue } from "./index.js";

describe("summarizeChartsLocalSyncQueue", () => {
  it("derives total, pending, in-flight, synced, and needs-attention from the counts", () => {
    expect(
      summarizeChartsLocalSyncQueue({
        failed: 3,
        inFlight: 2,
        pending: 4,
        synced: 6
      })
    ).toEqual({
      inFlight: 2,
      needsAttention: 3,
      pending: 4,
      synced: 6,
      total: 15
    });
  });

  it("summarizes an empty queue as all zeroes", () => {
    expect(
      summarizeChartsLocalSyncQueue({
        failed: 0,
        inFlight: 0,
        pending: 0,
        synced: 0
      })
    ).toEqual({
      inFlight: 0,
      needsAttention: 0,
      pending: 0,
      synced: 0,
      total: 0
    });
  });
});
