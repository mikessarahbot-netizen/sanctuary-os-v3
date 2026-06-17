import { describe, expect, it } from "vitest";
import {
  createPlayDesktopReplayScheduler,
  type PlayDesktopReplayIntervalScheduler
} from "./play-replay-scheduler.js";

interface FakeInterval {
  readonly cancelled: readonly string[];
  readonly interval: PlayDesktopReplayIntervalScheduler<string>;
  readonly scheduled: readonly { readonly callback: () => void; readonly intervalMs: number }[];
}

const createFakeInterval = (): FakeInterval => {
  const scheduled: { callback: () => void; intervalMs: number }[] = [];
  const cancelled: string[] = [];
  let nextHandle = 0;

  return {
    get cancelled(): readonly string[] {
      return cancelled;
    },
    interval: {
      cancel: (handle: string): void => {
        cancelled.push(handle);
      },
      schedule: (callback: () => void, intervalMs: number): string => {
        scheduled.push({ callback, intervalMs });
        nextHandle += 1;

        return `handle-${String(nextHandle)}`;
      }
    },
    get scheduled(): readonly { readonly callback: () => void; readonly intervalMs: number }[] {
      return scheduled;
    }
  };
};

const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("createPlayDesktopReplayScheduler", () => {
  it("skips the pass while offline", async () => {
    let ran = 0;
    const scheduler = createPlayDesktopReplayScheduler({
      interval: createFakeInterval().interval,
      intervalMs: 1000,
      isOnline: () => false,
      runPass: () => {
        ran += 1;

        return Promise.resolve("result");
      }
    });

    await expect(scheduler.runOnce()).resolves.toEqual({ status: "skipped-offline" });
    expect(ran).toBe(0);
  });

  it("runs the pass while online and reports the result", async () => {
    const results: string[] = [];
    const scheduler = createPlayDesktopReplayScheduler({
      interval: createFakeInterval().interval,
      intervalMs: 1000,
      isOnline: () => true,
      onResult: (result: string) => {
        results.push(result);
      },
      runPass: () => Promise.resolve("synced")
    });

    await expect(scheduler.runOnce()).resolves.toEqual({ result: "synced", status: "ran" });
    expect(results).toEqual(["synced"]);
  });

  it("schedules a tick on start and drives the pass through it", async () => {
    const fake = createFakeInterval();
    let ran = 0;
    const scheduler = createPlayDesktopReplayScheduler({
      interval: fake.interval,
      intervalMs: 5000,
      isOnline: () => true,
      runPass: () => {
        ran += 1;

        return Promise.resolve("ok");
      }
    });

    scheduler.start();

    expect(fake.scheduled).toHaveLength(1);
    expect(fake.scheduled[0]?.intervalMs).toBe(5000);

    fake.scheduled[0]?.callback();
    await flushMicrotasks();

    expect(ran).toBe(1);
  });

  it("is idempotent on start and cancels the handle on stop", () => {
    const fake = createFakeInterval();
    const scheduler = createPlayDesktopReplayScheduler({
      interval: fake.interval,
      intervalMs: 1000,
      isOnline: () => true,
      runPass: () => Promise.resolve("ok")
    });

    scheduler.start();
    scheduler.start();
    expect(fake.scheduled).toHaveLength(1);

    scheduler.stop();
    expect(fake.cancelled).toEqual(["handle-1"]);

    // A second stop is a no-op.
    scheduler.stop();
    expect(fake.cancelled).toEqual(["handle-1"]);
  });

  it("contains a per-tick error and routes it to onError", async () => {
    const fake = createFakeInterval();
    const errors: unknown[] = [];
    const scheduler = createPlayDesktopReplayScheduler({
      interval: fake.interval,
      intervalMs: 1000,
      isOnline: () => true,
      onError: (error: unknown) => {
        errors.push(error);
      },
      runPass: () => Promise.reject(new Error("pass failed"))
    });

    scheduler.start();

    expect(() => fake.scheduled[0]?.callback()).not.toThrow();
    await flushMicrotasks();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});
