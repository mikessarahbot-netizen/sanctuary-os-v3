import { describe, expect, it } from "vitest";
import {
  createPlanningCcliUsageSqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";
import type { TransactionHandle } from "./index.js";

const fixedNow = "2026-06-16T20:00:00.000Z";

interface RecordingSqlExecutor extends PlanningSqlExecutor {
  readonly statements: readonly PlanningSqlStatement[];
  readonly transactions: readonly TransactionHandle[];
}

const createRecordingExecutor = (
  resultSets: readonly (readonly PlanningSqlQueryResult["rows"][number][])[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const transactions: TransactionHandle[] = [];
  const queuedResults = [...resultSets];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    get transactions(): readonly TransactionHandle[] {
      return transactions;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);

      if (statement.name === "planning.audit.insert") {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    },
    runInTransaction: async <Result>(
      operation: (transaction: TransactionHandle) => Promise<Result>
    ): Promise<Result> => {
      const transaction = { transactionId: `tx_${String(transactions.length + 1)}` };
      transactions.push(transaction);

      return operation(transaction);
    }
  };
};

const createRepository = (executor: RecordingSqlExecutor) => {
  let nextAuditId = 1;
  let nextUsageLogId = 1;

  return createPlanningCcliUsageSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
      },
      ccliUsageLogId: () => {
        const ccliUsageLogId = `ccli_log_${String(nextUsageLogId)}`;
        nextUsageLogId += 1;
        return ccliUsageLogId;
      }
    }
  });
};

const statementAt = (
  executor: RecordingSqlExecutor,
  index: number
): PlanningSqlStatement => {
  const statement = executor.statements[index];
  expect(statement).toBeDefined();

  if (statement === undefined) {
    throw new Error(`Expected SQL statement at index ${String(index)}.`);
  }

  return statement;
};

const expectSqlContains = (statement: PlanningSqlStatement, expected: string): void => {
  expect(statement.sql.toLowerCase()).toContain(expected.toLowerCase());
};

const expectParameters = (
  statement: PlanningSqlStatement,
  expected: readonly PlanningSqlValue[]
): void => {
  expect(statement.parameters).toEqual(expected);
};

describe("Planning CCLI usage SQL repository", () => {
  it("records tenant-scoped CCLI usage with pending status and audit metadata", async () => {
    const executor = createRecordingExecutor([
      [
        {
          ccli_song_number: "123456",
          ccli_usage_log_id: "ccli_log_1",
          notes: "Used during opener.",
          reporting_status: "pending",
          service_id: "service_1",
          service_item_id: "item_1",
          song_id: "song_1",
          tenant_id: "tenant_1",
          title: "Open The Gates",
          usage_type: "service",
          used_at: "2026-06-21T14:00:00.000Z"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.recordCcliUsage({
        input: {
          ccliSongNumber: "123456",
          notes: "Used during opener.",
          serviceId: "service_1",
          serviceItemId: "item_1",
          songId: "song_1",
          title: "Open The Gates",
          usageType: "service",
          usedAt: "2026-06-21T14:00:00.000Z"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_ccli_record",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      ccliSongNumber: "123456",
      ccliUsageLogId: "ccli_log_1",
      notes: "Used during opener.",
      reportingStatus: "pending",
      serviceId: "service_1",
      serviceItemId: "item_1",
      songId: "song_1",
      tenantId: "tenant_1",
      title: "Open The Gates",
      usageType: "service",
      usedAt: "2026-06-21T14:00:00.000Z"
    });

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements).toHaveLength(2);

    const insert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(insert, "INSERT INTO planning_ccli_usage_logs");
    expectSqlContains(insert, "WHERE service.tenant_id = $1");
    expectSqlContains(insert, "AND service.service_id = $3");
    expectSqlContains(insert, "FROM planning_service_items service_item");
    expectSqlContains(insert, "AND service_item.service_item_id = $4");
    expect(insert.sql).not.toContain("credential");
    expect(insert.sql).not.toContain("token");
    expect(insert.sql).not.toContain("password");
    expectParameters(insert, [
      "tenant_1",
      "ccli_log_1",
      "service_1",
      "item_1",
      "song_1",
      "Open The Gates",
      "123456",
      "service",
      "pending",
      "2026-06-21T14:00:00.000Z",
      "Used during opener.",
      fixedNow,
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectSqlContains(auditInsert, "INSERT INTO planning_audit_log");
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_ccli_record",
      "recordCcliUsage",
      "create",
      "ccli_log_1",
      null,
      fixedNow
    ]);
  });

  it("uses supplied transactions instead of opening an independent one", async () => {
    const suppliedTransaction = { transactionId: "ccli_tx" };
    const executor = createRecordingExecutor([
      [
        {
          ccli_usage_log_id: "ccli_log_1",
          reporting_status: "pending",
          service_id: "service_1",
          song_id: "song_1",
          tenant_id: "tenant_1",
          title: "Open The Gates",
          usage_type: "rehearsal",
          used_at: "2026-06-21T14:00:00.000Z"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await repository.recordCcliUsage({
      input: {
        serviceId: "service_1",
        songId: "song_1",
        title: "Open The Gates",
        usageType: "rehearsal",
        usedAt: "2026-06-21T14:00:00.000Z"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_ccli_tx",
          tenantId: "tenant_1"
        },
        intent: "create",
        transaction: suppliedTransaction
      }
    });

    expect(executor.transactions).toEqual([]);
    expect(statementAt(executor, 0).transaction).toEqual(suppliedTransaction);
    expect(statementAt(executor, 1).transaction).toEqual(suppliedTransaction);
  });

  it("lists usage logs by tenant, service, and optional reporting status", async () => {
    const executor = createRecordingExecutor([
      [
        {
          ccli_song_number: "123456",
          ccli_usage_log_id: "ccli_log_1",
          notes: null,
          reporting_status: "pending",
          service_id: "service_1",
          service_item_id: null,
          song_id: "song_1",
          tenant_id: "tenant_1",
          title: "Open The Gates",
          usage_type: "livestream",
          used_at: "2026-06-21T14:00:00.000Z"
        }
      ]
    ]);
    const repository = createRepository(executor);
    const transaction = { transactionId: "read_tx" };

    await expect(
      repository.listCcliUsageLogs({
        input: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_ccli_list",
            tenantId: "tenant_1"
          },
          transaction
        }
      })
    ).resolves.toEqual([
      {
        ccliSongNumber: "123456",
        ccliUsageLogId: "ccli_log_1",
        reportingStatus: "pending",
        serviceId: "service_1",
        songId: "song_1",
        tenantId: "tenant_1",
        title: "Open The Gates",
        usageType: "livestream",
        usedAt: "2026-06-21T14:00:00.000Z"
      }
    ]);

    const statement = statementAt(executor, 0);
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "FROM planning_ccli_usage_logs");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectSqlContains(statement, "AND ($3::text IS NULL OR reporting_status = $3)");
    expect(statement.sql).not.toContain("credential");
    expect(statement.sql).not.toContain("token");
    expect(statement.sql).not.toContain("password");
    expectParameters(statement, ["tenant_1", "service_1", "pending"]);
  });

  it("rejects malformed CCLI usage rows before returning records", async () => {
    const executor = createRecordingExecutor([
      [
        {
          ccli_usage_log_id: "ccli_log_1",
          reporting_status: "queued",
          service_id: "service_1",
          song_id: "song_1",
          tenant_id: "tenant_1",
          title: "Open The Gates",
          usage_type: "service",
          used_at: "2026-06-21T14:00:00.000Z"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listCcliUsageLogs({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_ccli_invalid",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
  });
});
