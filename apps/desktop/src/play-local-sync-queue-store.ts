import {
  PlayLocalSyncQueueMigration,
  createPlayLocalSyncQueueSqlRepository,
  createSqliteExecutor,
  createSqliteMigrationRunner,
  type MigrationRunStep,
  type PlayLocalSyncQueuePersistenceRepository,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";

/**
 * Desktop-local composition root for the Play local sync queue store.
 *
 * Given an injected migration-capable SQLite client (satisfiable by
 * `node:sqlite` or `better-sqlite3`) and a clock, it migrates the local store
 * and returns the Play local sync queue repository backed by the shared SQLite
 * executor. The migration client also satisfies the executor's query client, so
 * a single injected client backs both.
 *
 * This is composition only: it runs no replay loop, opens no window, and issues
 * no Tauri command. The desktop replay loop consumes the returned repository.
 */
export interface PlayDesktopLocalSyncQueueStoreDependencies {
  readonly clock: () => string;
  readonly database: SqliteMigrationDatabaseClient;
}

export interface PlayDesktopLocalSyncQueueStore {
  readonly migrations: readonly MigrationRunStep[];
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
}

export const createPlayDesktopLocalSyncQueueStore = async (
  dependencies: PlayDesktopLocalSyncQueueStoreDependencies
): Promise<PlayDesktopLocalSyncQueueStore> => {
  const runner = createSqliteMigrationRunner({
    clock: dependencies.clock,
    database: dependencies.database
  });
  const migrations = await runner.applyPending([PlayLocalSyncQueueMigration]);
  const repository = createPlayLocalSyncQueueSqlRepository({
    executor: createSqliteExecutor({ database: dependencies.database })
  });

  return {
    migrations,
    repository
  };
};
