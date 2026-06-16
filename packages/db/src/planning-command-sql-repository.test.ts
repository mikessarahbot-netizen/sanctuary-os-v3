import { describe, expect, it } from "vitest";
import {
  createPlanningServiceCommandSqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";
import type { TransactionHandle } from "./index.js";

const fixedNow = "2026-06-16T19:30:00.000Z";

interface RecordingSqlExecutor extends PlanningSqlExecutor {
  readonly statements: readonly PlanningSqlStatement[];
  readonly transactions: readonly TransactionHandle[];
}

const createRecordingExecutor = (
  resultRows: readonly PlanningSqlQueryResult["rows"][number][]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const transactions: TransactionHandle[] = [];
  const rowsByQuery = [...resultRows];

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

      const row = rowsByQuery.shift();

      return Promise.resolve({ rows: row === undefined ? [] : [row] });
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

const createRepository = (executor: PlanningSqlExecutor) => {
  let nextAuditId = 1;
  let nextServiceId = 1;

  return createPlanningServiceCommandSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
      },
      serviceId: () => {
        const serviceId = `service_${String(nextServiceId)}`;
        nextServiceId += 1;
        return serviceId;
      }
    }
  });
};

const expectSqlContains = (statement: PlanningSqlStatement, expected: string): void => {
  expect(statement.sql.toLowerCase()).toContain(expected.toLowerCase());
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

const expectParameters = (
  statement: PlanningSqlStatement,
  expected: readonly PlanningSqlValue[]
): void => {
  expect(statement.parameters).toEqual(expected);
};

describe("Planning SQL command repository slice", () => {
  it("creates tenant-scoped services and writes audit metadata in one transaction", async () => {
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "sunday",
        starts_at: "2026-06-21T14:00:00.000Z",
        status: "draft",
        tenant_id: "tenant_1",
        title: "Sunday Service"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.createService({
        input: {
          serviceTypeId: "sunday",
          startsAt: "2026-06-21T14:00:00.000Z",
          title: "Sunday Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_create",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      serviceId: "service_1",
      serviceTypeId: "sunday",
      startsAt: "2026-06-21T14:00:00.000Z",
      status: "draft",
      tenantId: "tenant_1",
      title: "Sunday Service"
    });

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements).toHaveLength(2);

    const serviceInsert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(serviceInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectSqlContains(serviceInsert, "INSERT INTO planning_services");
    expectSqlContains(serviceInsert, "RETURNING tenant_id");
    expectParameters(serviceInsert, [
      "tenant_1",
      "service_1",
      "sunday",
      "Sunday Service",
      "draft",
      "2026-06-21T14:00:00.000Z",
      fixedNow,
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectSqlContains(auditInsert, "INSERT INTO planning_audit_log");
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_create",
      "createService",
      "create",
      "service_1",
      null,
      fixedNow
    ]);
  });

  it("duplicates services from tenant-scoped templates", async () => {
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "sunday",
        starts_at: null,
        status: "draft",
        tenant_id: "tenant_1",
        title: "Template Copy"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.duplicateServiceFromTemplate({
        input: {
          serviceTemplateId: "template_sunday",
          title: "Template Copy"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_duplicate",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      serviceId: "service_1",
      serviceTypeId: "sunday",
      status: "draft",
      tenantId: "tenant_1",
      title: "Template Copy"
    });

    const duplicateInsert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(duplicateInsert, "FROM planning_service_templates template");
    expectSqlContains(duplicateInsert, "WHERE template.tenant_id = $1");
    expectSqlContains(duplicateInsert, "AND template.service_template_id = $3");
    expectParameters(duplicateInsert, [
      "tenant_1",
      "service_1",
      "template_sunday",
      "Template Copy",
      null,
      "draft",
      fixedNow,
      fixedNow
    ]);
    expect(auditInsert.parameters[4]).toBe("duplicateServiceFromTemplate");
  });

  it("updates services with tenant predicates and confirmation audit reason", async () => {
    const suppliedTransaction = { transactionId: "service_tx" };
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "sunday",
        starts_at: "2026-06-21T14:00:00.000Z",
        status: "published",
        tenant_id: "tenant_1",
        title: "Published Service"
      }
    ]);
    const repository = createRepository(executor);

    await repository.updateService({
      input: {
        confirmationIntent: {
          confirmed: true,
          reason: "Planner confirmed publishing the service."
        },
        serviceId: "service_1",
        status: "published",
        title: "Published Service"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_update",
          tenantId: "tenant_1"
        },
        intent: "destructive-confirmed",
        transaction: suppliedTransaction
      }
    });

    expect(executor.transactions).toEqual([]);
    expect(executor.statements).toHaveLength(2);

    const update = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(update.transaction).toEqual(suppliedTransaction);
    expectSqlContains(update, "UPDATE planning_services");
    expectSqlContains(update, "WHERE tenant_id = $1");
    expectSqlContains(update, "AND service_id = $2");
    expectParameters(update, [
      "tenant_1",
      "service_1",
      null,
      "Published Service",
      "published",
      null,
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual(suppliedTransaction);
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_update",
      "updateService",
      "destructive-confirmed",
      "service_1",
      "Planner confirmed publishing the service.",
      fixedNow
    ]);
  });

  it("rejects destructive service status updates without confirmation intent", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createRepository(executor);

    await expect(
      repository.updateService({
        input: {
          serviceId: "service_1",
          status: "canceled"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_cancel",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).rejects.toThrow("Planning service status change requires confirmation intent.");

    expect(executor.statements).toEqual([]);
  });

  it("validates returned SQL rows before exposing repository records", async () => {
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "sunday",
        status: "ready",
        tenant_id: "tenant_1",
        title: "Invalid Service"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.createService({
        input: {
          serviceTypeId: "sunday",
          title: "Invalid Service"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_invalid_row",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).rejects.toThrow();

    expect(executor.statements).toHaveLength(1);
  });
});
