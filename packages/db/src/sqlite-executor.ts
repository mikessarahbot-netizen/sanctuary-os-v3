import type {
  PlanningSqlExecutor,
  PlanningSqlRow,
  PlanningSqlStatement,
  PlanningSqlValue
} from "./planning-command-sql-repository.js";

/**
 * Values a SQLite engine can bind to a positional `?` parameter. This is the
 * common subset supported by both `node:sqlite` (`DatabaseSync`) and
 * `better-sqlite3`, so either can back the injected client.
 */
export type SqliteBindValue = string | number | bigint | null | Uint8Array;

export interface SqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

export interface SqlitePreparedStatement {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => SqliteRunResult;
}

/**
 * Minimal SQLite database surface the executor depends on. Both
 * `node:sqlite`'s `DatabaseSync` and `better-sqlite3`'s `Database` provide a
 * compatible `prepare` once wrapped, so the concrete engine is injected by the
 * caller and never imported here — keeping `@sanctuary-os/db` free of a native
 * SQLite dependency, exactly as the PostgreSQL executor injects its `pg` client.
 */
export interface SqliteDatabaseClient {
  readonly prepare: (sql: string) => SqlitePreparedStatement;
}

export interface SqliteExecutorDependencies {
  readonly database: SqliteDatabaseClient;
}

/**
 * The local sync queue adapter only issues single statements, so the executor
 * exposes just the `query` half of {@link PlanningSqlExecutor}. Every queue
 * mutation uses `RETURNING`, so reads and writes both come back as rows.
 */
export type SqliteQueryExecutor = Pick<PlanningSqlExecutor, "query">;

const normalizeBindValue = (value: PlanningSqlValue): SqliteBindValue => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  throw new Error("SQLite executor does not support array-bound parameters.");
};

const normalizeRowValue = (value: unknown): unknown =>
  typeof value === "bigint" ? Number(value) : value;

const normalizeRow = (row: Record<string, unknown>): PlanningSqlRow =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeRowValue(value)])
  );

const statementReturnsRows = (sql: string): boolean => {
  const normalized = sql.trim().toUpperCase();

  return normalized.startsWith("SELECT") || /\bRETURNING\b/u.test(normalized);
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createSqliteExecutor = (
  dependencies: SqliteExecutorDependencies
): SqliteQueryExecutor => ({
  // The injected SQLite engine is synchronous; results are wrapped in promises
  // so the executor satisfies the async `PlanningSqlExecutor.query` boundary.
  query: (statement: PlanningSqlStatement) => {
    try {
      const parameters = statement.parameters.map(normalizeBindValue);
      const prepared = dependencies.database.prepare(statement.sql);

      if (statementReturnsRows(statement.sql)) {
        return Promise.resolve({ rows: prepared.all(...parameters).map(normalizeRow) });
      }

      prepared.run(...parameters);

      return Promise.resolve({ rows: [] });
    } catch (error) {
      return Promise.reject(
        new Error(
          `SQLite query failed for ${statement.name}: ${describeError(error)}`,
          error instanceof Error ? { cause: error } : undefined
        )
      );
    }
  }
});
