import {
  createPostgreSqlPlanningExecutor,
  type PostgreSqlPlanningExecutorDependencies
} from "./postgresql-planning-executor.js";
import type {
  PlanningSqlExecutor,
  PlanningSqlStatement
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

/**
 * Rewrite a single operator-adapter SQL statement's positional placeholders from
 * the SQLite `?` dialect to the PostgreSQL `$N` dialect (sequential, 1-based).
 *
 * INVARIANT: the four operator modules' SQL repositories (`charts` / `play` /
 * `community` / `obs`) emit `?` ONLY as positional bind placeholders — never inside
 * a SQL string literal (verified across every `sql:` template in those adapters), so
 * a global replace is correct. The DB executors validate parameter arity, so the
 * rewritten placeholder count always matches `statement.parameters.length`.
 *
 * This rewrites ONLY the runtime `statement.sql` string; the adapters' source `?`
 * SQL is left untouched, so the SQLite path (which REQUIRES `?`) is unaffected.
 */
export const translatePositionalPlaceholdersToPostgres = (sql: string): string => {
  // Fresh 1-based counter per statement: each `?` becomes `$1`, `$2`, ... in order.
  let nextPlaceholderIndex = 0;

  return sql.replace(/\?/g, () => {
    nextPlaceholderIndex += 1;

    return `$${nextPlaceholderIndex.toString(10)}`;
  });
};

const translateStatement = (statement: PlanningSqlStatement): PlanningSqlStatement => ({
  ...statement,
  sql: translatePositionalPlaceholdersToPostgres(statement.sql)
});

/**
 * Build a PostgreSQL executor for the four operator modules (`charts` / `play` /
 * `community` / `obs`).
 *
 * These adapters consume the executor through `Pick<PlanningSqlExecutor, "query">`
 * (e.g. `ChartsSqlExecutor`) and build their SQL with SQLite-style `?` placeholders.
 * PostgreSQL needs `$N`, so this wraps `createPostgreSqlPlanningExecutor` and
 * rewrites each statement's `?` -> `$N` (see
 * `translatePositionalPlaceholdersToPostgres`) before delegating. The DDL is
 * ANSI/PostgreSQL-compatible as written, so no schema rewrite is involved here.
 *
 * The return type is the full `PlanningSqlExecutor` (same as the underlying planning
 * executor): `query` is what the four modules consume, and `runInTransaction` is
 * preserved for callers that drive a transaction pool.
 */
export const createPostgreSqlOperatorExecutor = (
  dependencies: PostgreSqlPlanningExecutorDependencies
): PlanningSqlExecutor => {
  const planningExecutor = createPostgreSqlPlanningExecutor(dependencies);

  return {
    query: (statement: PlanningSqlStatement) =>
      planningExecutor.query(translateStatement(statement)),
    runInTransaction: <Result>(
      operation: (transaction: TransactionHandle) => Promise<Result>
    ): Promise<Result> => planningExecutor.runInTransaction(operation)
  };
};
