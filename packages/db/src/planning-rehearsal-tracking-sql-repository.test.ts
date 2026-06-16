import { describe, expect, it } from "vitest";
import {
  createPlanningRehearsalTrackingSqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";
import type { TransactionHandle } from "./index.js";

const fixedNow = "2026-06-16T20:30:00.000Z";

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
  let nextAcknowledgementId = 1;
  let nextAuditId = 1;
  let nextVisibilityId = 1;

  return createPlanningRehearsalTrackingSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
      },
      rehearsalAcknowledgementId: () => {
        const acknowledgementId = `ack_${String(nextAcknowledgementId)}`;
        nextAcknowledgementId += 1;
        return acknowledgementId;
      },
      rehearsalAssetVisibilityId: () => {
        const visibilityId = `visibility_${String(nextVisibilityId)}`;
        nextVisibilityId += 1;
        return visibilityId;
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

describe("Planning rehearsal tracking SQL repository", () => {
  it("sets rehearsal asset visibility with tenant, ownership, audit, and role scope", async () => {
    const executor = createRecordingExecutor([
      [
        {
          asset_id: "asset_1",
          asset_type: "chart",
          is_visible: true,
          rehearsal_asset_visibility_id: "visibility_1",
          service_id: "service_1",
          service_item_id: "item_1",
          tenant_id: "tenant_1",
          title: "Lead Sheet",
          updated_at: "2026-06-21T15:10:00.000Z",
          visible_to_role_ids: ["role_band"]
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.setRehearsalAssetVisibility({
        input: {
          assetId: "asset_1",
          assetType: "chart",
          isVisible: true,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Lead Sheet",
          updatedAt: "2026-06-21T15:10:00.000Z",
          visibleToRoleIds: ["role_band"]
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_visibility_set",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).resolves.toEqual({
      assetId: "asset_1",
      assetType: "chart",
      isVisible: true,
      rehearsalAssetVisibilityId: "visibility_1",
      serviceId: "service_1",
      serviceItemId: "item_1",
      tenantId: "tenant_1",
      title: "Lead Sheet",
      updatedAt: "2026-06-21T15:10:00.000Z",
      visibleToRoleIds: ["role_band"]
    });

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);
    expect(executor.statements).toHaveLength(2);

    const upsert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(upsert, "UPDATE planning_rehearsal_asset_visibility");
    expectSqlContains(upsert, "INSERT INTO planning_rehearsal_asset_visibility");
    expectSqlContains(upsert, "WHERE tenant_id = $1");
    expectSqlContains(upsert, "AND service_id = $3");
    expectSqlContains(upsert, "FROM planning_service_items service_item");
    expectSqlContains(upsert, "AND service_item.service_item_id = $4");
    expectSqlOmits(upsert, ["media_payload", "media_bytes", "contact", "email", "phone"]);
    expectParameters(upsert, [
      "tenant_1",
      "visibility_1",
      "service_1",
      "item_1",
      "asset_1",
      "chart",
      "Lead Sheet",
      true,
      ["role_band"],
      "2026-06-21T15:10:00.000Z"
    ]);

    expect(auditInsert.transaction).toEqual({ transactionId: "tx_1" });
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_visibility_set",
      "setRehearsalAssetVisibility",
      "update",
      "visibility_1",
      null,
      fixedNow
    ]);
  });

  it("lists rehearsal asset visibility by tenant, service, and optional item", async () => {
    const executor = createRecordingExecutor([
      [
        {
          asset_id: "asset_1",
          asset_type: "document",
          is_visible: false,
          rehearsal_asset_visibility_id: "visibility_1",
          service_id: "service_1",
          service_item_id: "item_1",
          tenant_id: "tenant_1",
          title: "Cue Notes",
          updated_at: "2026-06-21T15:10:00.000Z",
          visible_to_role_ids: ["role_planner"]
        }
      ]
    ]);
    const repository = createRepository(executor);
    const transaction = { transactionId: "read_tx" };

    await expect(
      repository.listRehearsalAssetVisibility({
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        options: {
          context: {
            requestId: "request_visibility_list",
            tenantId: "tenant_1"
          },
          transaction
        }
      })
    ).resolves.toEqual([
      {
        assetId: "asset_1",
        assetType: "document",
        isVisible: false,
        rehearsalAssetVisibilityId: "visibility_1",
        serviceId: "service_1",
        serviceItemId: "item_1",
        tenantId: "tenant_1",
        title: "Cue Notes",
        updatedAt: "2026-06-21T15:10:00.000Z",
        visibleToRoleIds: ["role_planner"]
      }
    ]);

    const statement = statementAt(executor, 0);
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "FROM planning_rehearsal_asset_visibility");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectSqlContains(statement, "AND ($3::text IS NULL OR service_item_id = $3)");
    expectSqlOmits(statement, ["media_payload", "contact", "email", "phone"]);
    expectParameters(statement, ["tenant_1", "service_1", "item_1"]);
  });

  it("records rehearsal acknowledgements with assignment ownership and audit metadata", async () => {
    const suppliedTransaction = { transactionId: "ack_tx" };
    const executor = createRecordingExecutor([
      [
        {
          acknowledged_at: "2026-06-21T15:20:00.000Z",
          asset_id: "asset_1",
          assignment_id: "assignment_1",
          notes: "Bridge needs one more pass.",
          person_id: "person_1",
          readiness_signal: "needs-practice",
          rehearsal_acknowledgement_id: "ack_1",
          service_id: "service_1",
          service_item_id: "item_1",
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.recordRehearsalAcknowledgement({
        input: {
          acknowledgedAt: "2026-06-21T15:20:00.000Z",
          assetId: "asset_1",
          assignmentId: "assignment_1",
          notes: "Bridge needs one more pass.",
          personId: "person_1",
          readinessSignal: "needs-practice",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_ack_record",
            tenantId: "tenant_1"
          },
          intent: "create",
          transaction: suppliedTransaction
        }
      })
    ).resolves.toEqual({
      acknowledgedAt: "2026-06-21T15:20:00.000Z",
      assetId: "asset_1",
      assignmentId: "assignment_1",
      notes: "Bridge needs one more pass.",
      personId: "person_1",
      readinessSignal: "needs-practice",
      rehearsalAcknowledgementId: "ack_1",
      serviceId: "service_1",
      serviceItemId: "item_1",
      tenantId: "tenant_1"
    });

    expect(executor.transactions).toEqual([]);
    expect(executor.statements).toHaveLength(2);

    const insert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(insert.transaction).toEqual(suppliedTransaction);
    expectSqlContains(insert, "INSERT INTO planning_rehearsal_acknowledgements");
    expectSqlContains(insert, "FROM planning_services service");
    expectSqlContains(insert, "FROM planning_service_items service_item");
    expectSqlContains(insert, "FROM planning_assignments assignment");
    expectSqlContains(insert, "AND assignment.assignment_id = $5");
    expectSqlContains(insert, "AND assignment.person_id = $6");
    expectSqlOmits(insert, ["contact", "email", "phone", "media_payload"]);
    expectParameters(insert, [
      "tenant_1",
      "ack_1",
      "service_1",
      "item_1",
      "assignment_1",
      "person_1",
      "asset_1",
      "needs-practice",
      "2026-06-21T15:20:00.000Z",
      "Bridge needs one more pass."
    ]);

    expect(auditInsert.transaction).toEqual(suppliedTransaction);
    expectParameters(auditInsert, [
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_ack_record",
      "recordRehearsalAcknowledgement",
      "create",
      "ack_1",
      null,
      fixedNow
    ]);
  });

  it("lists rehearsal acknowledgements with optional item, assignment, person, and asset filters", async () => {
    const executor = createRecordingExecutor([
      [
        {
          acknowledged_at: "2026-06-21T15:20:00.000Z",
          asset_id: "asset_1",
          assignment_id: "assignment_1",
          notes: null,
          person_id: "person_1",
          readiness_signal: "ready",
          rehearsal_acknowledgement_id: "ack_1",
          service_id: "service_1",
          service_item_id: "item_1",
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listRehearsalAcknowledgements({
        input: {
          assetId: "asset_1",
          assignmentId: "assignment_1",
          personId: "person_1",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        options: {
          context: {
            requestId: "request_ack_list",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        acknowledgedAt: "2026-06-21T15:20:00.000Z",
        assetId: "asset_1",
        assignmentId: "assignment_1",
        personId: "person_1",
        readinessSignal: "ready",
        rehearsalAcknowledgementId: "ack_1",
        serviceId: "service_1",
        serviceItemId: "item_1",
        tenantId: "tenant_1"
      }
    ]);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM planning_rehearsal_acknowledgements");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectSqlContains(statement, "AND ($3::text IS NULL OR service_item_id = $3)");
    expectSqlContains(statement, "AND ($4::text IS NULL OR assignment_id = $4)");
    expectSqlContains(statement, "AND ($5::text IS NULL OR person_id = $5)");
    expectSqlContains(statement, "AND ($6::text IS NULL OR asset_id = $6)");
    expectSqlOmits(statement, ["contact", "email", "phone", "media_payload"]);
    expectParameters(statement, [
      "tenant_1",
      "service_1",
      "item_1",
      "assignment_1",
      "person_1",
      "asset_1"
    ]);
  });

  it("rejects malformed rehearsal tracking rows before returning records", async () => {
    const executor = createRecordingExecutor([
      [
        {
          acknowledged_at: "2026-06-21T15:20:00.000Z",
          asset_id: "asset_1",
          assignment_id: "assignment_1",
          person_id: "person_1",
          readiness_signal: "maybe",
          rehearsal_acknowledgement_id: "ack_1",
          service_id: "service_1",
          service_item_id: "item_1",
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listRehearsalAcknowledgements({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_ack_invalid",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
  });
});
