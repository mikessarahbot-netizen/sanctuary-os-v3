/**
 * Desktop Play replay scheduler.
 *
 * Wraps a replay-pass runner with offline/online gating and an injected
 * interval, so the desktop runtime can drive periodic replay without the
 * scheduler holding any transport, timer, or connectivity implementation of its
 * own. Connectivity (`isOnline`), the interval (`schedule`/`cancel`), and the
 * pass runner are all injected, which keeps it fully testable with fakes.
 *
 * A scheduled tick never throws: per-tick errors are routed to the optional
 * `onError` callback. `runOnce` is the explicit single-shot entry point and
 * propagates errors to its caller.
 */
export interface PlayDesktopReplayIntervalScheduler<THandle> {
  readonly cancel: (handle: THandle) => void;
  readonly schedule: (callback: () => void, intervalMs: number) => THandle;
}

export interface PlayDesktopReplaySchedulerDependencies<TResult, THandle> {
  readonly interval: PlayDesktopReplayIntervalScheduler<THandle>;
  readonly intervalMs: number;
  readonly isOnline: () => boolean;
  readonly onError?: (error: unknown) => void;
  readonly onResult?: (result: TResult) => void;
  readonly runPass: () => Promise<TResult>;
}

export type PlayDesktopReplayRunOutcome<TResult> =
  | { readonly status: "skipped-offline" }
  | { readonly result: TResult; readonly status: "ran" };

export interface PlayDesktopReplayScheduler<TResult> {
  readonly runOnce: () => Promise<PlayDesktopReplayRunOutcome<TResult>>;
  readonly start: () => void;
  readonly stop: () => void;
}

export const createPlayDesktopReplayScheduler = <TResult, THandle>(
  dependencies: PlayDesktopReplaySchedulerDependencies<TResult, THandle>
): PlayDesktopReplayScheduler<TResult> => {
  let handle: THandle | undefined;

  const runOnce = async (): Promise<PlayDesktopReplayRunOutcome<TResult>> => {
    if (!dependencies.isOnline()) {
      return { status: "skipped-offline" };
    }

    const result = await dependencies.runPass();
    dependencies.onResult?.(result);

    return { result, status: "ran" };
  };

  const tick = (): void => {
    runOnce().catch((error: unknown) => {
      dependencies.onError?.(error);
    });
  };

  return {
    runOnce,
    start: (): void => {
      if (handle !== undefined) {
        return;
      }

      handle = dependencies.interval.schedule(tick, dependencies.intervalMs);
    },
    stop: (): void => {
      if (handle === undefined) {
        return;
      }

      dependencies.interval.cancel(handle);
      handle = undefined;
    }
  };
};
