import type { PresenterFetchLike } from "./graphql-transport.js";
import {
  wrapNodeSqliteMigrationDatabase,
  type NodeSqliteDatabaseLike
} from "./node-sqlite-client.js";
import { parsePresenterDesktopSidecarConfig } from "./sidecar-config.js";
import { startPresenterDesktopSidecar, type PresenterDesktopSidecarHandle } from "./sidecar-entry.js";
import { createPresenterStatusHttpServer } from "./status-server.js";

/**
 * Env-driven start for the desktop Presenter replay sidecar.
 *
 * It parses the sidecar config from an injected environment record, opens a
 * `node:sqlite` database at the configured path, and starts the sidecar with
 * `globalThis.fetch`. The `node:sqlite` open and the connectivity check are
 * injectable so this stays loadable and testable without the engine; the thin
 * process `main` supplies `process.env` and the defaults.
 */
export interface PresenterDesktopSidecarEnvDependencies {
  readonly clock?: () => string;
  readonly createDatabase?: (path: string) => NodeSqliteDatabaseLike;
  readonly fetch?: PresenterFetchLike;
  readonly isOnline?: () => boolean;
}

const openNodeSqliteDatabase = async (path: string): Promise<NodeSqliteDatabaseLike> => {
  const sqliteModule = await import("node:sqlite");

  return new sqliteModule.DatabaseSync(path);
};

export const startPresenterDesktopSidecarFromEnv = async (
  env: Readonly<Record<string, string | undefined>>,
  dependencies: PresenterDesktopSidecarEnvDependencies = {}
): Promise<PresenterDesktopSidecarHandle> => {
  const config = parsePresenterDesktopSidecarConfig(env);
  const rawDatabase =
    dependencies.createDatabase !== undefined
      ? dependencies.createDatabase(config.sqliteFilePath)
      : await openNodeSqliteDatabase(config.sqliteFilePath);

  const handle = await startPresenterDesktopSidecar(config, {
    database: wrapNodeSqliteMigrationDatabase(rawDatabase),
    fetch: dependencies.fetch ?? globalThis.fetch,
    isOnline: dependencies.isOnline ?? ((): boolean => true),
    ...(dependencies.clock !== undefined ? { clock: dependencies.clock } : {})
  });

  const statusPortRaw = env.SANCTUARY_OS_PRESENTER_STATUS_PORT;

  if (statusPortRaw === undefined) {
    return handle;
  }

  const statusServer = createPresenterStatusHttpServer({
    cancelEntry: (queueEntryId) => handle.runtime.cancelEntry(queueEntryId),
    getStatus: () => handle.runtime.getStatus(),
    requeueEntry: (queueEntryId) => handle.runtime.requeueEntry(queueEntryId)
  });

  await new Promise<void>((resolve) => {
    statusServer.listen(Number.parseInt(statusPortRaw, 10), "127.0.0.1", () => {
      resolve();
    });
  });

  return {
    runtime: handle.runtime,
    stop: (): void => {
      statusServer.close();
      handle.stop();
    }
  };
};
