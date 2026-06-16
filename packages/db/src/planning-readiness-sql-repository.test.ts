import { describe, expect, it } from "vitest";
import {
  createPlanningReadinessSqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue,
  type TransactionHandle
} from "./index.js";

const fixedNow = "2026-06-16T21:15:00.000Z";

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
  it("loads readiness input with tenant-scoped service, assignment, rehearsal, and CCLI signals", async () => {
    const transaction = { transactionId: "readiness_read_tx" };
    const executor = createRecordingExecutor([
      [
        {
          assignments: [
            {
              assignmentId: "assignment_1",
              roleId: "role_leader",
              status: "confirmed"
            }
          ],
          ccli_statuses: [
            {
              serviceItemId: "item_1",
              status: "current"
            }
          ],
          known_blockers: [],
          rehearsal_acknowledgements: [
            {
              assignmentId: "assignment_1",
              assetId: "asset_1",
              personId: "person_1",
              readinessSignal: "ready",
              serviceItemId: "item_1"
            }
          ],
          required_roles: [
            {
              displayName: "role_leader",
              roleId: "role_leader"
            }
          ],
          service_id: "service_1",
          service_items: [
            {
              durationMinutes: 5,
              hasAttachedSong: true,
              hasChart: true,
              hasCurrentCcliLog: true,
              hasVisibleRehearsalAsset: true,
              requiresCcliLog: true,
              requiresRehearsalAcknowledgement: true,
              serviceItemId: "item_1",
              title: "Opening Song"
            }
          ],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.loadReadinessInput({
        requestId: "request_readiness_load",
        serviceId: "service_1",
        tenantId: "tenant_1",
        transaction
      })
    ).resolves.toEqual({
      assignments: [
        {
          assignmentId: "assignment_1",
          roleId: "role_leader",
          status: "confirmed"
        }
      ],
      ccliStatuses: [
        {
          serviceItemId: "item_1",
          status: "current"
        }
      ],
      knownBlockers: [],
      rehearsalAcknowledgements: [
        {
          assignmentId: "assignment_1",
          assetId: "asset_1",
          personId: "person_1",
          readinessSignal: "ready",
          serviceItemId: "item_1"
        }
      ],
      requiredRoles: [
        {
          displayName: "role_leader",
          roleId: "role_leader"
        }
      ],
      serviceId: "service_1",
      serviceItems: [
        {
          durationMinutes: 5,
          hasAttachedSong: true,
          hasChart: true,
          hasCurrentCcliLog: true,
          hasVisibleRehearsalAsset: true,
          requiresCcliLog: true,
          requiresRehearsalAcknowledgement: true,
          serviceItemId: "item_1",
          title: "Opening Song"
        }
      ],
      tenantId: "tenant_1"
    });

    const statement = statementAt(executor, 0);
    expect(statement.name).toBe("planning.readiness_input.load");
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "WITH scoped_service AS");
    expectSqlContains(statement, "FROM planning_services");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectSqlContains(statement, "FROM planning_service_items service_item");
    expectSqlContains(statement, "FROM planning_assignments assignment");
    expectSqlContains(statement, "FROM planning_rehearsal_asset_visibility visibility");
    expectSqlContains(statement, "FROM planning_rehearsal_acknowledgements acknowledgement");
    expectSqlContains(statement, "FROM planning_ccli_usage_logs usage_log");
    expectSqlContains(statement, "jsonb_strip_nulls");
    expectSqlOmits(statement, [
      "contact",
      "email",
      "phone",
      "media_payload",
      "media_bytes",
      "token",
      "password"
    ]);
    expectParameters(statement, ["tenant_1", "service_1"]);
  });

  it("saves readiness results with service ownership, audit metadata, and a new transaction", async () => {
    const checks = [
      {
        code: "required-roles",
        label: "Required roles assigned",
        maxScore: 25,
        score: 25
      }
    ];
    const executor = createRecordingExecutor([
      [
        {
          band: "ready",
          checks,
          readiness_score: 95,
          recommended_actions: ["Keep plan current."],
          risks: [],
          service_id: "service_1",
          strengths: ["Assignments confirmed."],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.saveReadinessResult({
        actorId: "actor_1",
        intent: "update",
        requestId: "request_readiness_save",
        result: {
          band: "ready",
          checks,
          readinessScore: 95,
          recommendedActions: ["Keep plan current."],
          risks: [],
          serviceId: "service_1",
          strengths: ["Assignments confirmed."],
          tenantId: "tenant_1"
        },
        serviceId: "service_1",
        tenantId: "tenant_1"
      })
    ).resolves.toBeUndefined();

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements).toHaveLength(2);

    const upsert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(upsert.transaction).toEqual({ transactionId: "tx_1" });
    expectSqlContains(upsert, "INSERT INTO planning_readiness_results");
    expectSqlContains(upsert, "WHERE EXISTS");
    expectSqlContains(upsert, "FROM planning_services service");
    expectSqlContains(upsert, "WHERE service.tenant_id = $1");
    expectSqlContains(upsert, "AND service.service_id = $2");
    expectSqlContains(upsert, "ON CONFLICT (tenant_id, service_id)");
    expectSqlOmits(upsert, ["contact", "email", "phone", "token", "password"]);
    expectParameters(upsert, [
      "tenant_1",
      "service_1",
      95,
      "ready",
      checks,
      [],
      ["Assignments confirmed."],
      ["Keep plan current."],
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_readiness_save",
      "saveReadinessResult",
      "update",
      "service_1",
      null,
      fixedNow
    ]);
  });

  it("honors supplied transactions and defaults save intent to update", async () => {
    const transaction = { transactionId: "readiness_write_tx" };
    const executor = createRecordingExecutor([
      [
        {
          band: "needs-attention",
          checks: [
            {
              code: "service-items",
              label: "Service items ordered and timed",
              maxScore: 10,
              score: 5
            }
          ],
          readiness_score: 55,
          recommended_actions: ["Add timings."],
          risks: ["Missing timings."],
          service_id: "service_1",
          strengths: [],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.saveReadinessResult({
        actorId: "actor_1",
        requestId: "request_readiness_supplied_tx",
        result: {
          band: "needs-attention",
          checks: [
            {
              code: "service-items",
              label: "Service items ordered and timed",
              maxScore: 10,
              score: 5
            }
          ],
          readinessScore: 55,
          recommendedActions: ["Add timings."],
          risks: ["Missing timings."],
          serviceId: "service_1",
          strengths: [],
          tenantId: "tenant_1"
        },
        serviceId: "service_1",
        tenantId: "tenant_1",
        transaction
      })
    ).resolves.toBeUndefined();

    expect(executor.transactions).toEqual([]);
    expect(statementAt(executor, 0).transaction).toEqual(transaction);
    expect(statementAt(executor, 1).transaction).toEqual(transaction);
    expect(statementAt(executor, 1).parameters[5]).toBe("update");
  });

  it("rejects mismatched readiness result scope before writing", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createRepository(executor);

    await expect(
      repository.saveReadinessResult({
        actorId: "actor_1",
        requestId: "request_readiness_mismatch",
        result: {
          band: "blocked",
          checks: [],
          readinessScore: 0,
          recommendedActions: [],
          risks: [],
          serviceId: "other_service",
          strengths: [],
          tenantId: "tenant_1"
        },
        serviceId: "service_1",
        tenantId: "tenant_1"
      })
    ).rejects.toThrow();

    expect(executor.statements).toEqual([]);
  });

  it("rejects malformed readiness input rows before returning records", async () => {
    const executor = createRecordingExecutor([
      [
        {
          assignments: [],
          ccli_statuses: [
            {
              serviceItemId: "item_1",
              status: "stale"
            }
          ],
          known_blockers: [],
          rehearsal_acknowledgements: [],
          required_roles: [],
          service_id: "service_1",
          service_items: [],
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.loadReadinessInput({
        requestId: "request_bad_readiness_input",
        serviceId: "service_1",
        tenantId: "tenant_1"
      })
    ).rejects.toThrow();
  });
});
