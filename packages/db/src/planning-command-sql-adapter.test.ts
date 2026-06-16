import { describe, expect, it } from "vitest";
import {
  createPlanningSqlCommandRepository,
  PlanningSqlCommandAdapterError,
  type PlanningSqlExecutor,
  type PlanningSqlQueryRequest,
  type PlanningSqlQueryResult
} from "./planning-command-sql-adapter.js";
import type { TransactionHandle } from "./transactions.js";

const fixedNow = new Date("2026-06-16T19:30:00.000Z");

interface RecordedSqlQuery {
  readonly parameters: readonly unknown[];
  readonly sql: string;
  readonly transaction?: TransactionHandle;
}

interface FakeSqlExecutor extends PlanningSqlExecutor {
  readonly readQueries: () => readonly RecordedSqlQuery[];
}

const createFakeExecutor = (
  results: readonly PlanningSqlQueryResult[]
): FakeSqlExecutor => {
  const queries: RecordedSqlQuery[] = [];
  let nextResultIndex = 0;

  return {
    query: (request: PlanningSqlQueryRequest): Promise<PlanningSqlQueryResult> => {
      queries.push({
        parameters: request.parameters,
        sql: request.sql,
        ...(request.transaction !== undefined ? { transaction: request.transaction } : {})
      });

      const result = results[nextResultIndex];
      nextResultIndex += 1;

      return Promise.resolve(result ?? { rows: [] });
    },
    readQueries: () => queries
  };
};

const createIdGenerator = () => {
  let nextAuditNumber = 1;
  let nextServiceNumber = 1;

  return {
    nextAuditLogId: (): string => {
      const auditLogId = `audit_${String(nextAuditNumber)}`;
      nextAuditNumber += 1;

      return auditLogId;
    },
    nextServiceId: (): string => {
      const serviceId = `service_${String(nextServiceNumber)}`;
      nextServiceNumber += 1;

      return serviceId;
    }
  };
};

const sqlContains = (sql: string, expected: string): boolean =>
  sql.toLowerCase().includes(expected.toLowerCase());

describe("Planning SQL command repository adapter", () => {
  it("creates tenant-scoped services and writes audit metadata in the supplied transaction", async () => {
    const transaction = { transactionId: "tx_service_create" };
    const executor = createFakeExecutor([
      {
        rows: [
          {
            service_id: "service_1",
            service_type_id: "sunday",
            starts_at: "2026-06-21T14:00:00.000Z",
            status: "draft",
            tenant_id: "tenant_1",
            title: "Sunday Service"
          }
        ]
      },
      { rows: [] }
    ]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator()
    });

    const service = await repository.createService({
      input: {
        serviceTypeId: "sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        title: "Sunday Service"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_1",
          tenantId: "tenant_1"
        },
        intent: "create",
        transaction
      }
    });

    expect(service).toEqual({
      serviceId: "service_1",
      serviceTypeId: "sunday",
      startsAt: "2026-06-21T14:00:00.000Z",
      status: "draft",
      tenantId: "tenant_1",
      title: "Sunday Service"
    });

    const queries = executor.readQueries();
    expect(queries).toHaveLength(2);
    expect(sqlContains(queries[0]?.sql ?? "", "INSERT INTO planning_services")).toBe(true);
    expect(queries[0]?.parameters).toEqual([
      "tenant_1",
      "service_1",
      "sunday",
      "Sunday Service",
      "draft",
      "2026-06-21T14:00:00.000Z",
      fixedNow.toISOString(),
      fixedNow.toISOString()
    ]);
    expect(queries[0]?.transaction).toEqual(transaction);
    expect(sqlContains(queries[1]?.sql ?? "", "INSERT INTO planning_audit_log")).toBe(true);
    expect(queries[1]?.parameters).toEqual([
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_1",
      "createService",
      "create",
      "service_1",
      null,
      fixedNow.toISOString()
    ]);
    expect(queries[1]?.transaction).toEqual(transaction);
  });

  it("duplicates a service from a tenant-scoped template lookup", async () => {
    const transaction = { transactionId: "tx_template_duplicate" };
    const executor = createFakeExecutor([
      {
        rows: [
          {
            service_type_id: "sunday"
          }
        ]
      },
      {
        rows: [
          {
            service_id: "service_1",
            service_type_id: "sunday",
            starts_at: null,
            status: "draft",
            tenant_id: "tenant_1",
            title: "Copied Sunday"
          }
        ]
      },
      { rows: [] }
    ]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator()
    });

    await expect(
      repository.duplicateServiceFromTemplate({
        input: {
          serviceTemplateId: "template_sunday",
          title: "Copied Sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_template",
            tenantId: "tenant_1"
          },
          intent: "create",
          transaction
        }
      })
    ).resolves.toEqual({
      serviceId: "service_1",
      serviceTypeId: "sunday",
      status: "draft",
      tenantId: "tenant_1",
      title: "Copied Sunday"
    });

    const queries = executor.readQueries();
    expect(sqlContains(queries[0]?.sql ?? "", "FROM planning_service_templates")).toBe(
      true
    );
    expect(sqlContains(queries[0]?.sql ?? "", "WHERE tenant_id = $1")).toBe(true);
    expect(sqlContains(queries[0]?.sql ?? "", "AND service_template_id = $2")).toBe(
      true
    );
    expect(queries[0]?.parameters).toEqual(["tenant_1", "template_sunday"]);
    expect(queries[1]?.parameters).toEqual([
      "tenant_1",
      "service_1",
      "sunday",
      "Copied Sunday",
      "draft",
      null,
      fixedNow.toISOString(),
      fixedNow.toISOString()
    ]);
    expect(queries[2]?.parameters).toContain("duplicateServiceFromTemplate");
  });

  it("updates services with tenant predicates and confirmation audit reason", async () => {
    const transaction = { transactionId: "tx_service_update" };
    const executor = createFakeExecutor([
      {
        rows: [
          {
            service_id: "service_1",
            service_type_id: "sunday",
            starts_at: "2026-06-21T14:00:00.000Z",
            status: "published",
            tenant_id: "tenant_1",
            title: "Published Sunday"
          }
        ]
      },
      { rows: [] }
    ]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator()
    });

    const service = await repository.updateService({
      input: {
        confirmationIntent: {
          confirmed: true,
          reason: "Worship leader approved publishing."
        },
        serviceId: "service_1",
        status: "published",
        title: "Published Sunday"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_publish",
          tenantId: "tenant_1"
        },
        intent: "destructive-confirmed",
        transaction
      }
    });

    expect(service.status).toBe("published");

    const queries = executor.readQueries();
    expect(sqlContains(queries[0]?.sql ?? "", "UPDATE planning_services")).toBe(true);
    expect(sqlContains(queries[0]?.sql ?? "", "WHERE tenant_id = $1")).toBe(true);
    expect(sqlContains(queries[0]?.sql ?? "", "AND service_id = $2")).toBe(true);
    expect(queries[0]?.parameters).toEqual([
      "tenant_1",
      "service_1",
      fixedNow.toISOString(),
      "published",
      "Published Sunday"
    ]);
    expect(queries[0]?.transaction).toEqual(transaction);
    expect(queries[1]?.parameters).toEqual([
      "tenant_1",
      "audit_1",
      "actor_1",
      "request_publish",
      "updateService",
      "destructive-confirmed",
      "service_1",
      "Worship leader approved publishing.",
      fixedNow.toISOString()
    ]);
  });

  it("rejects destructive service status changes without confirmation intent", async () => {
    const executor = createFakeExecutor([]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator()
    });

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
    ).rejects.toMatchObject({
      code: "confirmation-required"
    });
    expect(executor.readQueries()).toHaveLength(0);
  });

  it("uses the configured transaction boundary when no transaction is supplied", async () => {
    const boundaryTransaction = { transactionId: "tx_boundary" };
    const executor = createFakeExecutor([
      {
        rows: [
          {
            service_id: "service_1",
            service_type_id: "sunday",
            starts_at: null,
            status: "draft",
            tenant_id: "tenant_1",
            title: "Sunday Service"
          }
        ]
      },
      { rows: [] }
    ]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator(),
      transactionBoundary: {
        runInTransaction: (operation) => operation(boundaryTransaction)
      }
    });

    await repository.createService({
      input: {
        serviceTypeId: "sunday",
        title: "Sunday Service"
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_1",
          tenantId: "tenant_1"
        },
        intent: "create"
      }
    });

    expect(executor.readQueries().map((query) => query.transaction)).toEqual([
      boundaryTransaction,
      boundaryTransaction
    ]);
  });

  it("normalizes malformed operation input into a stable adapter error", async () => {
    const executor = createFakeExecutor([]);
    const repository = createPlanningSqlCommandRepository({
      clock: () => fixedNow,
      executor,
      idGenerator: createIdGenerator()
    });

    await expect(repository.createService({} as never)).rejects.toBeInstanceOf(
      PlanningSqlCommandAdapterError
    );
    await expect(repository.createService({} as never)).rejects.toMatchObject({
      code: "validation-failed"
    });
    expect(executor.readQueries()).toHaveLength(0);
  });
});
