import type { SqliteBindValue, SqliteMigrationDatabaseClient } from "@sanctuary-os/db";

/**
 * Structural view of the `node:sqlite` `DatabaseSync` surface the desktop
 * runtime uses. Declaring it structurally (rather than importing `node:sqlite`)
 * keeps this module loadable on any Node version and lets callers pass a real
 * `DatabaseSync` directly. `better-sqlite3`'s `Database` is compatible too.
 */
export interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (
    ...parameters: readonly SqliteBindValue[]
  ) => { readonly changes: number | bigint; readonly lastInsertRowid: number | bigint };
}

export interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

/**
 * Adapt a `node:sqlite`/`better-sqlite3` database to the synchronous
 * `SqliteMigrationDatabaseClient` the migration runner and replay store expect.
 */
export const wrapNodeSqliteMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
});
