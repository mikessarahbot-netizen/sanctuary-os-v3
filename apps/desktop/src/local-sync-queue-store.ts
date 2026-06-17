import {
  PresenterLocalSyncQueueMigration,
  createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig,
  createSqliteMigrationRunner,
  type MigrationRunStep,
  type PresenterLocalSyncQueuePersistenceRepository,
  type PresenterLocalSyncQueuePersistenceRuntimeConfigInput,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";

/**
 * Desktop-local composition root for the Presenter local sync queue store.
 *
 * Given an injected migration-capable SQLite client (satisfiable by
 * `node:sqlite` or `better-sqlite3`) and a clock, it migrates the local store
 * and returns the local sync queue repository selected from the shared
 * persistence composition. The migration client's `prepare` also satisfies the
 * selection's query client, so a single injected client backs both.
 *
 * This is composition only: it runs no replay loop, opens no window, and issues
 * no Tauri command. The desktop replay loop consumes the returned repository in
 * a later slice.
 */
export interface PresenterDesktopLocalSyncQueueStoreDependencies {
  readonly clock: () => string;
  readonly config?: PresenterLocalSyncQueuePersistenceRuntimeConfigInput;
  readonly database: SqliteMigrationDatabaseClient;
}

export interface PresenterDesktopLocalSyncQueueStore {
  readonly migrations: readonly MigrationRunStep[];
  readonly repository: PresenterLocalSyncQueuePersistenceRepository;
}

export const createPresenterDesktopLocalSyncQueueStore = async (
  dependencies: PresenterDesktopLocalSyncQueueStoreDependencies
): Promise<PresenterDesktopLocalSyncQueueStore> => {
  const runner = createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  });
  const migrations = await runner.applyPending([PresenterLocalSyncQueueMigration]);
  const selection = createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig(
    dependencies.config ?? {},
    { sqlite: { database: dependencies.database } }
  );

  return {
    migrations,
    repository: selection.repository
  };
};
