import {
  parsePresenterLocalSyncQueuePersistenceRuntimeConfig,
  type PresenterLocalSyncQueuePersistenceRuntimeConfig,
  type PresenterLocalSyncQueuePersistenceRuntimeConfigInput
} from "@sanctuary-os/db";

export * from "./local-sync-queue-store.js";
export * from "./replay-pass.js";
export * from "./replay-runtime.js";
export * from "./replay-scheduler.js";

/**
 * Entry point for the Sanctuary OS desktop app workspace.
 *
 * This is intentionally a minimal scaffold. The real Tauri shell, the local
 * sync queue composition root, and the replay loop arrive in later slices; this
 * proves the workspace builds, is covered by the monorepo lint/typecheck/test
 * gates, and can consume the shared persistence building blocks from
 * `@sanctuary-os/db`.
 */
export const DESKTOP_APP_NAME = "sanctuary-os-desktop";

export interface PresenterDesktopLocalSyncRuntimeDescription {
  readonly appName: string;
  readonly persistence: PresenterLocalSyncQueuePersistenceRuntimeConfig;
}

/**
 * Resolve the desktop app's local sync queue persistence runtime description
 * from an optional raw config, defaulting to the SQLite local-store runtime.
 */
export const describePresenterDesktopLocalSyncRuntime = (
  rawConfig: PresenterLocalSyncQueuePersistenceRuntimeConfigInput = {}
): PresenterDesktopLocalSyncRuntimeDescription => ({
  appName: DESKTOP_APP_NAME,
  persistence: parsePresenterLocalSyncQueuePersistenceRuntimeConfig(rawConfig)
});
