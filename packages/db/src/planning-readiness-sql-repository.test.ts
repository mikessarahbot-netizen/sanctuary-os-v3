import { describe, expect, it } from "vitest";
import {
  createPlanningReadinessSqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";
import type { TransactionHandle } from "./index.js";

const fixedNow = "2026-06-16T21:00:00.000Z";

const readinessChecks = [
  {
    code: "required-roles",
    label: "Required roles assigned",
    maxScore: 25,
    score: 15
  }
];

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

  return createPlanningReadinessSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
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

const expectSqlOmits = (
  statement: PlanningSqlStatement,
  forbidden: readonly string[]
): void => {
  forbidden.forEach((value) => {
    expect(statement.sql.toLowerCase()).not.toContain(value.toLowerCase());
  });
};

const expectParameters = (
  statement: PlanningSqlStatement,
  expected: readonly PlanningSqlValue[]
): void => {
  expect(statement.parameters).toEqual(expected);
};

describe("Planning readiness SQL repository", () => {
  it("saves readiness results with tenant scope, service ownership, JSON fields, and audit metadata", async () => {
    const executor = createRecordingExecutor([
      [
        {
          band: "needs-attention",
          checks: readinessChecks,
          readiness_score: 65,
          recommended_actions: ["Assign missing roles."],
          risks: ["Missing vocalist."],
          service_id: "service_1",
          strengths: ["Songs selected."],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.saveServiceReadiness({
        input: {
          band: "needs-attention",
          checks: readinessChecks,
          readinessScore: 65,
          recommendedActions: ["Assign missing roles."],
          risks: ["Missing vocalist."],
          serviceId: "service_1",
          strengths: ["Songs selected."],
          tenantId: "tenant_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_readiness_save",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).resolves.toEqual({
      band: "needs-attention",
      checks: readinessChecks,
      readinessScore: 65,
      recommendedActions: ["Assign missing roles."],
      risks: ["Missing vocalist."],
      serviceId: "service_1",
      strengths: ["Songs selected."],
      tenantId: "tenant_1"
    });

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements).toHaveLength(2);

    const save = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(save, "INSERT INTO planning_readiness_results");
    expectSqlContains(save, "$5::jsonb");
    expectSqlContains(save, "ON CONFLICT (tenant_id, service_id)");
    expectSqlContains(save, "FROM planning_services service");
    expectSqlContains(save, "WHERE service.tenant_id = $1");
    expectSqlContains(save, "AND service.service_id = $2");
    expectSqlOmits(save, ["contact", "email", "phone", "prompt", "secret"]);
    expectParameters(save, [
      "tenant_1",
      "service_1",
      65,
      "needs-attention",
      JSON.stringify(readinessChecks),
      JSON.stringify(["Missing vocalist."]),
      JSON.stringify(["Songs selected."]),
      JSON.stringify(["Assign missing roles."]),
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_readiness_save",
      "saveServiceReadiness",
      "update",
      "service_1",
      null,
      fixedNow
    ]);
  });

  it("uses supplied transactions for readiness save operations", async () => {
    const suppliedTransaction = { transactionId: "readiness_tx" };
    const executor = createRecordingExecutor([
      [
        {
          band: "ready",
          checks: readinessChecks,
          readiness_score: 100,
          recommended_actions: [],
          risks: [],
          service_id: "service_1",
          strengths: ["Required roles assigned is complete."],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await repository.saveServiceReadiness({
      input: {
        band: "ready",
        checks: readinessChecks,
        readinessScore: 100,
        recommendedActions: [],
        risks: [],
        serviceId: "service_1",
        strengths: ["Required roles assigned is complete."],
        tenantId: "tenant_1"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_readiness_tx",
          tenantId: "tenant_1"
        },
        intent: "update",
        transaction: suppliedTransaction
      }
    });

    expect(executor.transactions).toEqual([]);
    expect(statementAt(executor, 0).transaction).toEqual(suppliedTransaction);
    expect(statementAt(executor, 1).transaction).toEqual(suppliedTransaction);
  });

  it("gets readiness rows by tenant and service with transaction propagation", async () => {
    const executor = createRecordingExecutor([
      [
        {
          band: "blocked",
          checks: readinessChecks,
          readiness_score: 30,
          recommended_actions: ["Review known blockers."],
          risks: ["One or more volunteers have declined."],
          service_id: "service_1",
          strengths: [],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);
    const transaction = { transactionId: "read_tx" };

    await expect(
      repository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_readiness_get",
            tenantId: "tenant_1"
          },
          transaction
        }
      })
    ).resolves.toEqual({
      band: "blocked",
      checks: readinessChecks,
      readinessScore: 30,
      recommendedActions: ["Review known blockers."],
      risks: ["One or more volunteers have declined."],
      serviceId: "service_1",
      strengths: [],
      tenantId: "tenant_1"
    });

    const statement = statementAt(executor, 0);
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "FROM planning_readiness_results");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectSqlOmits(statement, ["contact", "email", "phone", "prompt", "secret"]);
    expectParameters(statement, ["tenant_1", "service_1"]);
  });

  it("returns null when readiness lookup has no tenant-scoped row", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createRepository(executor);

    await expect(
      repository.getServiceReadiness({
        input: {
          serviceId: "service_missing"
        },
        options: {
          context: {
            requestId: "request_readiness_missing",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toBeNull();
  });

  it("rejects tenant mismatches and malformed readiness rows before returning records", async () => {
    const tenantMismatchExecutor = createRecordingExecutor([]);
    const tenantMismatchRepository = createRepository(tenantMismatchExecutor);

    await expect(
      tenantMismatchRepository.saveServiceReadiness({
        input: {
          band: "ready",
          checks: readinessChecks,
          readinessScore: 100,
          recommendedActions: [],
          risks: [],
          serviceId: "service_1",
          strengths: ["Ready."],
          tenantId: "tenant_2"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_readiness_mismatch",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).rejects.toThrow("Planning readiness result tenant mismatch.");
    expect(tenantMismatchExecutor.statements).toEqual([]);

    const malformedRowExecutor = createRecordingExecutor([
      [
        {
          band: "almost-ready",
          checks: readinessChecks,
          readiness_score: 65,
          recommended_actions: [],
          risks: [],
          service_id: "service_1",
          strengths: [],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const malformedRowRepository = createRepository(malformedRowExecutor);

    await expect(
      malformedRowRepository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_readiness_invalid_row",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
  });
});
