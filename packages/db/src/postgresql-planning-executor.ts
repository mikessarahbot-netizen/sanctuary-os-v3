import { z } from "zod";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlStatement,
  PlanningSqlValue
} from "./planning-command-sql-repository.js";
import type { TransactionHandle } from "./transactions.js";

const PostgreSqlTransactionClientSymbol = Symbol(
  "sanctuary-os.postgresql-planning-transaction-client"
);

const PostgreSqlPlanningQueryResultSchema = z
  .object({
    rows: z.array(z.record(z.unknown()))
  })
  .passthrough();

export interface PostgreSqlPlanningQueryConfig {
  readonly name?: string;
  readonly text: string;
  readonly values: readonly PlanningSqlValue[];
}

export interface PostgreSqlPlanningQueryClient {
  readonly query: (config: PostgreSqlPlanningQueryConfig) => Promise<unknown>;
}

export interface PostgreSqlPlanningTransactionClient
  extends PostgreSqlPlanningQueryClient {
  readonly release: () => void;
}

export interface PostgreSqlPlanningTransactionPool {
  readonly connect: () => Promise<PostgreSqlPlanningTransactionClient>;
}

export interface PostgreSqlPlanningExecutorDependencies {
  readonly queryClient: PostgreSqlPlanningQueryClient;
  readonly transactionId?: () => string;
  readonly transactionPool?: PostgreSqlPlanningTransactionPool;
}

interface PostgreSqlPlanningTransactionHandle extends TransactionHandle {
  readonly [PostgreSqlTransactionClientSymbol]: PostgreSqlPlanningQueryClient;
}

const createQueryConfig = (
  statement: PlanningSqlStatement
): PostgreSqlPlanningQueryConfig => ({
  ...(statement.name.length > 0 ? { name: statement.name } : {}),
  text: statement.sql,
  values: statement.parameters
});

const parseQueryResult = (rawResult: unknown): PlanningSqlQueryResult => {
  const result = PostgreSqlPlanningQueryResultSchema.parse(rawResult);

  return {
    rows: result.rows
  };
};

const getTransactionClient = (
  transaction: TransactionHandle | undefined
): PostgreSqlPlanningQueryClient | undefined => {
  if (transaction === undefined) {
    return undefined;
  }

  const handle = transaction as TransactionHandle &
    Partial<
      Record<
        typeof PostgreSqlTransactionClientSymbol,
        PostgreSqlPlanningQueryClient
      >
    >;

  return handle[PostgreSqlTransactionClientSymbol];
};

const createTransactionHandle = (
  transactionId: string,
  client: PostgreSqlPlanningQueryClient
): PostgreSqlPlanningTransactionHandle => ({
  [PostgreSqlTransactionClientSymbol]: client,
  transactionId
});

const runTransactionCommand = async (
  client: PostgreSqlPlanningQueryClient,
  text: "BEGIN" | "COMMIT" | "ROLLBACK"
): Promise<void> => {
  await client.query({
    name: `planning.transaction.${text.toLowerCase()}`,
    text,
    values: []
  });
};

export const createPostgreSqlPlanningExecutor = (
  dependencies: PostgreSqlPlanningExecutorDependencies
): PlanningSqlExecutor => ({
  query: async (
    statement: PlanningSqlStatement
  ): Promise<PlanningSqlQueryResult> => {
    const client = getTransactionClient(statement.transaction) ?? dependencies.queryClient;

    try {
      const result = await client.query(createQueryConfig(statement));

      return parseQueryResult(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Planning PostgreSQL query returned an invalid result for ${statement.name}.`
        );
      }

      throw new Error(`Planning PostgreSQL query failed for ${statement.name}.`);
    }
  },
  runInTransaction: async <Result>(
    operation: (transaction: TransactionHandle) => Promise<Result>
  ): Promise<Result> => {
    if (dependencies.transactionPool === undefined) {
      throw new Error(
        "Planning PostgreSQL transaction pool is required for transaction mode."
      );
    }

    const client = await dependencies.transactionPool.connect();
    const transaction = createTransactionHandle(
      dependencies.transactionId?.() ?? "planning_postgresql_transaction",
      client
    );

    try {
      await runTransactionCommand(client, "BEGIN");
      const result = await operation(transaction);
      await runTransactionCommand(client, "COMMIT");

      return result;
    } catch (error) {
      await runTransactionCommand(client, "ROLLBACK").catch((): void => undefined);

      throw error;
    } finally {
      client.release();
    }
  }
});
