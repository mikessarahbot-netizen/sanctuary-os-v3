import type { PresenterDesktopSidecarHandle } from "./sidecar-entry.js";
import { startPresenterDesktopSidecarFromEnv } from "./sidecar-runtime-env.js";

/**
 * Thin runnable entry for the desktop Presenter replay sidecar process.
 *
 * It starts the sidecar from `process.env` and installs `SIGINT`/`SIGTERM`
 * handlers that stop the scheduler (which lets the process exit cleanly once the
 * interval is cleared). This is the only non-unit-tested shell; the Tauri shell
 * spawns it as a sidecar in a later slice. It intentionally does not auto-run on
 * import, so it can be imported without side effects.
 */
export const runPresenterDesktopSidecarMain = async (): Promise<PresenterDesktopSidecarHandle> => {
  const handle = await startPresenterDesktopSidecarFromEnv(process.env);

  const stop = (): void => {
    handle.stop();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  return handle;
};
