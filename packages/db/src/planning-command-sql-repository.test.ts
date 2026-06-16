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

type QueuedSqlResult =
  | PlanningSqlQueryResult["rows"][number]
  | readonly PlanningSqlQueryResult["rows"][number][];

const createRecordingExecutor = (
  resultRows: readonly QueuedSqlResult[]
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

      return Promise.resolve({
        rows: row === undefined ? [] : Array.isArray(row) ? row : [row]
      });
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
  let nextAssignmentId = 1;
  let nextAuditId = 1;
  let nextServiceId = 1;
  let nextServiceItemId = 1;

  return createPlanningServiceCommandSqlRepository({
    clock: () => fixedNow,
    executor,
    ids: {
      assignmentId: () => {
        const assignmentId = `assignment_${String(nextAssignmentId)}`;
        nextAssignmentId += 1;
        return assignmentId;
      },
      auditLogId: () => {
        const auditLogId = `audit_${String(nextAuditId)}`;
        nextAuditId += 1;
        return auditLogId;
      },
      serviceId: () => {
        const serviceId = `service_${String(nextServiceId)}`;
        nextServiceId += 1;
        return serviceId;
      },
      serviceItemId: () => {
        const serviceItemId = `service_item_${String(nextServiceItemId)}`;
        nextServiceItemId += 1;
        return serviceItemId;
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

  it("adds service items under a tenant-scoped service and audits the item", async () => {
    const executor = createRecordingExecutor([
      {
        duration_minutes: 5,
        notes: "Opening worship",
        service_id: "service_1",
        service_item_id: "service_item_1",
        song_id: "song_1",
        sort_order: 2,
        tenant_id: "tenant_1",
        title: "Holy Forever",
        type: "song"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.addServiceItem({
        input: {
          durationMinutes: 5,
          notes: "Opening worship",
          serviceId: "service_1",
          songId: "song_1",
          title: "Holy Forever",
          type: "song"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_add_item",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      durationMinutes: 5,
      notes: "Opening worship",
      serviceId: "service_1",
      serviceItemId: "service_item_1",
      songId: "song_1",
      sortOrder: 2,
      tenantId: "tenant_1",
      title: "Holy Forever",
      type: "song"
    });

    expect(executor.transactions).toEqual([{ transactionId: "tx_1" }]);

    const insert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(insert, "INSERT INTO planning_service_items");
    expectSqlContains(insert, "FROM planning_services service");
    expectSqlContains(insert, "WHERE service.tenant_id = $1");
    expectSqlContains(insert, "AND service.service_id = $3");
    expectSqlContains(insert, "MAX(existing.sort_order) + 1");
    expectParameters(insert, [
      "tenant_1",
      "service_item_1",
      "service_1",
      "song_1",
      "Holy Forever",
      "song",
      5,
      "Opening worship",
      fixedNow,
      fixedNow
    ]);

    expect(auditInsert.parameters).toEqual([
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_add_item",
      "addServiceItem",
      "create",
      "service_item_1",
      null,
      fixedNow
    ]);
  });

  it("updates service items with service and tenant predicates using supplied transactions", async () => {
    const suppliedTransaction = { transactionId: "item_tx" };
    const executor = createRecordingExecutor([
      {
        duration_minutes: 4,
        notes: null,
        service_id: "service_1",
        service_item_id: "service_item_1",
        song_id: "song_2",
        sort_order: 1,
        tenant_id: "tenant_1",
        title: "Updated Song",
        type: "song"
      }
    ]);
    const repository = createRepository(executor);

    await repository.updateServiceItem({
      input: {
        durationMinutes: 4,
        serviceId: "service_1",
        serviceItemId: "service_item_1",
        songId: "song_2",
        title: "Updated Song"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_update_item",
          tenantId: "tenant_1"
        },
        intent: "update",
        transaction: suppliedTransaction
      }
    });

    expect(executor.transactions).toEqual([]);

    const update = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(update.transaction).toEqual(suppliedTransaction);
    expectSqlContains(update, "UPDATE planning_service_items");
    expectSqlContains(update, "WHERE tenant_id = $1");
    expectSqlContains(update, "AND service_id = $2");
    expectSqlContains(update, "AND service_item_id = $3");
    expectParameters(update, [
      "tenant_1",
      "service_1",
      "service_item_1",
      "song_2",
      "Updated Song",
      null,
      4,
      null,
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual(suppliedTransaction);
    expect(auditInsert.parameters[4]).toBe("updateServiceItem");
    expect(auditInsert.parameters[6]).toBe("service_item_1");
  });

  it("reorders service items atomically with tenant-scoped completeness checks", async () => {
    const executor = createRecordingExecutor([
      [
        {
          duration_minutes: null,
          notes: null,
          service_id: "service_1",
          service_item_id: "service_item_2",
          song_id: null,
          sort_order: 0,
          tenant_id: "tenant_1",
          title: "Welcome",
          type: "other"
        },
        {
          duration_minutes: 5,
          notes: "Second",
          service_id: "service_1",
          service_item_id: "service_item_1",
          song_id: "song_1",
          sort_order: 1,
          tenant_id: "tenant_1",
          title: "Song",
          type: "song"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.reorderServiceItems({
        input: {
          orderedServiceItemIds: ["service_item_2", "service_item_1"],
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_reorder",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).resolves.toEqual([
      {
        serviceId: "service_1",
        serviceItemId: "service_item_2",
        sortOrder: 0,
        tenantId: "tenant_1",
        title: "Welcome",
        type: "other"
      },
      {
        durationMinutes: 5,
        notes: "Second",
        serviceId: "service_1",
        serviceItemId: "service_item_1",
        songId: "song_1",
        sortOrder: 1,
        tenantId: "tenant_1",
        title: "Song",
        type: "song"
      }
    ]);

    const reorder = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(reorder, "WITH requested AS");
    expectSqlContains(reorder, "FROM unnest($3::text[]) WITH ORDINALITY");
    expectSqlContains(reorder, "WHERE item.tenant_id = $1");
    expectSqlContains(reorder, "AND item.service_id = $2");
    expectSqlContains(reorder, "COUNT(*) FROM existing");
    expectParameters(reorder, [
      "tenant_1",
      "service_1",
      ["service_item_2", "service_item_1"],
      fixedNow
    ]);

    expect(auditInsert.parameters[4]).toBe("reorderServiceItems");
    expect(auditInsert.parameters[6]).toBe("service_1");
  });

  it("rejects incomplete reorder results before writing audit metadata", async () => {
    const executor = createRecordingExecutor([
      {
        duration_minutes: null,
        notes: null,
        service_id: "service_1",
        service_item_id: "service_item_1",
        song_id: null,
        sort_order: 0,
        tenant_id: "tenant_1",
        title: "Only Item",
        type: "other"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.reorderServiceItems({
        input: {
          orderedServiceItemIds: ["service_item_1", "service_item_cross_tenant"],
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_bad_reorder",
            tenantId: "tenant_1"
          },
          intent: "update"
        }
      })
    ).rejects.toThrow("Planning service item reorder returned incomplete item order.");

    expect(executor.statements).toHaveLength(1);
  });

  it("assigns volunteers through tenant-scoped service inserts and audits assignment refs", async () => {
    const executor = createRecordingExecutor([
      {
        assignment_id: "assignment_1",
        person_id: "person_1",
        role_id: "role_worship_leader",
        service_id: "service_1",
        status: "pending",
        tenant_id: "tenant_1"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.assignVolunteer({
        input: {
          personId: "person_1",
          roleId: "role_worship_leader",
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_assign",
            tenantId: "tenant_1"
          },
          intent: "create"
        }
      })
    ).resolves.toEqual({
      assignmentId: "assignment_1",
      personId: "person_1",
      roleId: "role_worship_leader",
      serviceId: "service_1",
      status: "pending",
      tenantId: "tenant_1"
    });

    const insert = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expectSqlContains(insert, "INSERT INTO planning_assignments");
    expectSqlContains(insert, "FROM planning_services service");
    expectSqlContains(insert, "WHERE service.tenant_id = $1");
    expectSqlContains(insert, "AND service.service_id = $3");
    expectParameters(insert, [
      "tenant_1",
      "assignment_1",
      "service_1",
      "person_1",
      "role_worship_leader",
      "pending",
      fixedNow,
      fixedNow
    ]);

    expect(auditInsert.parameters[4]).toBe("assignVolunteer");
    expect(auditInsert.parameters[6]).toBe("assignment_1");
  });

  it("updates assignment status atomically with service, assignment, and tenant predicates", async () => {
    const suppliedTransaction = { transactionId: "assignment_tx" };
    const executor = createRecordingExecutor([
      {
        assignment_id: "assignment_1",
        person_id: "person_1",
        role_id: "role_vocal",
        service_id: "service_1",
        status: "confirmed",
        tenant_id: "tenant_1"
      }
    ]);
    const repository = createRepository(executor);

    await repository.updateAssignmentStatus({
      input: {
        assignmentId: "assignment_1",
        serviceId: "service_1",
        status: "confirmed"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_status",
          tenantId: "tenant_1"
        },
        intent: "update",
        transaction: suppliedTransaction
      }
    });

    expect(executor.transactions).toEqual([]);

    const update = statementAt(executor, 0);
    const auditInsert = statementAt(executor, 1);

    expect(update.transaction).toEqual(suppliedTransaction);
    expectSqlContains(update, "UPDATE planning_assignments");
    expectSqlContains(update, "WHERE tenant_id = $1");
    expectSqlContains(update, "AND service_id = $2");
    expectSqlContains(update, "AND assignment_id = $3");
    expectParameters(update, [
      "tenant_1",
      "service_1",
      "assignment_1",
      "confirmed",
      fixedNow
    ]);

    expect(auditInsert.transaction).toEqual(suppliedTransaction);
    expect(auditInsert.parameters[4]).toBe("updateAssignmentStatus");
    expect(auditInsert.parameters[6]).toBe("assignment_1");
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
