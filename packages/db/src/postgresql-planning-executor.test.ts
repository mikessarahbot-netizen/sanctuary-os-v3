import { describe, expect, it } from "vitest";
import type {
  PlanningSqlStatement,
  PostgreSqlPlanningQueryClient,
  PostgreSqlPlanningQueryConfig,
  PostgreSqlPlanningTransactionClient
} from "./index.js";
import { createPostgreSqlPlanningExecutor } from "./index.js";

interface RecordingPostgreSqlClient extends PostgreSqlPlanningTransactionClient {
  readonly queries: readonly PostgreSqlPlanningQueryConfig[];
  readonly released: boolean;
}

const createRecordingPostgreSqlClient = (
  results: readonly unknown[] = []
): RecordingPostgreSqlClient => {
  const queries: PostgreSqlPlanningQueryConfig[] = [];
  const queuedResults = [...results];
  let released = false;

  return {
    get queries(): readonly PostgreSqlPlanningQueryConfig[] {
      return queries;
    },
    get released(): boolean {
      return released;
    },
    query: (config): Promise<unknown> => {
      queries.push(config);

      return Promise.resolve(queuedResults.shift() ?? { rows: [] });
    },
    release: (): void => {
      released = true;
    }
  };
};

const createStatement = (
  overrides: Partial<PlanningSqlStatement> = {}
): PlanningSqlStatement => ({
  name: "planning.services.get",
  parameters: ["tenant_1", "service_1"],
  sql: "SELECT * FROM planning_services WHERE tenant_id = $1 AND service_id = $2",
  ...overrides
});

describe("createPostgreSqlPlanningExecutor", () => {
  it("forwards Planning SQL statements to a PostgreSQL-compatible client", async () => {
    const client = createRecordingPostgreSqlClient([
      {
        rows: [
          {
            service_id: "service_1",
            tenant_id: "tenant_1"
          }
        ]
      }
    ]);
    const executor = createPostgreSqlPlanningExecutor({
      queryClient: client
    });

    await expect(executor.query(createStatement())).resolves.toEqual({
      rows: [
        {
          service_id: "service_1",
          tenant_id: "tenant_1"
        }
      ]
    });

    expect(client.queries).toEqual([
      {
        name: "planning.services.get",
        text: "SELECT * FROM planning_services WHERE tenant_id = $1 AND service_id = $2",
        values: ["tenant_1", "service_1"]
      }
    ]);
  });

  it("normalizes PostgreSQL timestamp rows to repository-safe ISO strings", async () => {
    const client = createRecordingPostgreSqlClient([
      {
        rows: [
          {
            starts_at: new Date("2026-06-17T12:00:00.000Z"),
            service_id: "service_1",
            tenant_id: "tenant_1"
          }
        ]
      }
    ]);
    const executor = createPostgreSqlPlanningExecutor({
      queryClient: client
    });

    await expect(executor.query(createStatement())).resolves.toEqual({
      rows: [
        {
          starts_at: "2026-06-17T12:00:00.000Z",
          service_id: "service_1",
          tenant_id: "tenant_1"
        }
      ]
    });
  });

  it("uses transaction-scoped PostgreSQL clients for statements inside transactions", async () => {
    const queryClient = createRecordingPostgreSqlClient();
    const transactionClient = createRecordingPostgreSqlClient([
      { rows: [] },
      {
        rows: [
          {
            service_id: "service_2",
            tenant_id: "tenant_1"
          }
        ]
      },
      { rows: [] }
    ]);
    const executor = createPostgreSqlPlanningExecutor({
      queryClient,
      transactionId: () => "tx_1",
      transactionPool: {
        connect: () => Promise.resolve(transactionClient)
      }
    });

    const result = await executor.runInTransaction((transaction) =>
      executor.query(createStatement({ transaction }))
    );

    expect(result.rows).toEqual([
      {
        service_id: "service_2",
        tenant_id: "tenant_1"
      }
    ]);
    expect(queryClient.queries).toEqual([]);
    expect(transactionClient.queries.map((query) => query.text)).toEqual([
      "BEGIN",
      "SELECT * FROM planning_services WHERE tenant_id = $1 AND service_id = $2",
      "COMMIT"
    ]);
    expect(transactionClient.released).toBe(true);
  });

  it("rolls back and releases the transaction client when an operation fails", async () => {
    const transactionClient = createRecordingPostgreSqlClient([{ rows: [] }]);
    const executor = createPostgreSqlPlanningExecutor({
      queryClient: createRecordingPostgreSqlClient(),
      transactionPool: {
        connect: () => Promise.resolve(transactionClient)
      }
    });

    await expect(
      executor.runInTransaction(
        (): Promise<void> => Promise.reject(new Error("domain failure"))
      )
    ).rejects.toThrow("domain failure");

    expect(transactionClient.queries.map((query) => query.text)).toEqual([
      "BEGIN",
      "ROLLBACK"
    ]);
    expect(transactionClient.released).toBe(true);
  });

  it("normalizes PostgreSQL client failures without leaking raw error details", async () => {
    const client: PostgreSqlPlanningQueryClient = {
      query: (): Promise<unknown> =>
        Promise.reject(
          new Error("password=secret postgres://user:secret@example.invalid/db")
        )
    };
    const executor = createPostgreSqlPlanningExecutor({
      queryClient: client
    });

    await expect(executor.query(createStatement())).rejects.toThrow(
      "Planning PostgreSQL query failed for planning.services.get."
    );
  });

  it("fails safely when transaction mode is requested without a transaction pool", async () => {
    const executor = createPostgreSqlPlanningExecutor({
      queryClient: createRecordingPostgreSqlClient()
    });

    await expect(
      executor.runInTransaction((): Promise<string> => Promise.resolve("unreachable"))
    ).rejects.toThrow(
      "Planning PostgreSQL transaction pool is required for transaction mode."
    );
  });
});
