import { runPresenterDesktopSidecarMain } from "./sidecar-main.js";

/**
 * Runnable bundle entry for the desktop Presenter replay sidecar.
 *
 * This is the esbuild bundle entry (built to `dist/presenter-sidecar.mjs`) that
 * the Tauri shell spawns as a Node process. It is the only module that runs on
 * load — it is never imported by the library barrel — so importing the package
 * stays side-effect free.
 */
void runPresenterDesktopSidecarMain().catch((error: unknown) => {
  process.stderr.write(
    `Presenter desktop sidecar failed to start: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exitCode = 1;
});
