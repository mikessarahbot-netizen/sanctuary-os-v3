import { describe, expect, it } from "vitest";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlStatement,
  PostgreSqlPlanningQueryConfig,
  PostgreSqlPlanningTransactionClient
} from "@sanctuary-os/db";
import {
  PlanningPersistenceSelectionConfigSchema,
  PlanningPersistenceRuntimeConfigSchema,
  createPlanningPersistenceSelectionFromRuntimeConfig,
  createPlanningPersistenceSelection,
  createPlanningSqlPersistenceDependenciesFromPostgreSqlRuntime,
  parsePlanningPersistenceRuntimeConfig,
  resolvePlanningPersistenceMode
} from "./composition.js";

interface RecordingSqlExecutor extends PlanningSqlExecutor {
  readonly statements: readonly PlanningSqlStatement[];
}

const createRecordingSqlExecutor = (
  resultSets: readonly (readonly PlanningSqlQueryResult["rows"][number][])[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const queuedResults = [...resultSets];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);

      if (statement.name === "planning.audit.insert") {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    },
    runInTransaction: async <Result>(
      operation: Parameters<PlanningSqlExecutor["runInTransaction"]>[0]
    ): Promise<Result> => {
      const transaction = { transactionId: "composition_tx" };
      return operation(transaction) as Promise<Result>;
    }
  };
};

const createSqlDependencies = (executor: PlanningSqlExecutor) => ({
  clock: () => "2026-06-16T22:00:00.000Z",
  executor,
  ids: {
    assignmentId: () => "assignment_sql_1",
    auditLogId: () => "audit_sql_1",
    ccliUsageLogId: () => "ccli_sql_1",
    rehearsalAcknowledgementId: () => "ack_sql_1",
    rehearsalAssetVisibilityId: () => "visibility_sql_1",
    serviceId: () => "service_sql_1",
    serviceItemId: () => "item_sql_1"
  }
});

interface RecordingPostgreSqlClient extends PostgreSqlPlanningTransactionClient {
  readonly queries: readonly PostgreSqlPlanningQueryConfig[];
}

const createRecordingPostgreSqlClient = (
  results: readonly unknown[] = []
): RecordingPostgreSqlClient => {
  const queries: PostgreSqlPlanningQueryConfig[] = [];
  const queuedResults = [...results];

  return {
    get queries(): readonly PostgreSqlPlanningQueryConfig[] {
      return queries;
    },
    query: (config): Promise<unknown> => {
      queries.push(config);

      return Promise.resolve(queuedResults.shift() ?? { rows: [] });
    },
    release: (): void => undefined
  };
};

describe("Planning persistence composition", () => {
  it("defaults development and test environments to in-memory persistence", () => {
    expect(resolvePlanningPersistenceMode()).toBe("in-memory");
    expect(resolvePlanningPersistenceMode({ environment: "development" })).toBe(
      "in-memory"
    );
    expect(resolvePlanningPersistenceMode({ environment: "test" })).toBe("in-memory");
  });

  it("defaults production to SQL and requires explicit SQL dependencies", () => {
    expect(resolvePlanningPersistenceMode({ environment: "production" })).toBe("sql");

    expect(() =>
      createPlanningPersistenceSelection({ environment: "production" })
    ).toThrow("Planning SQL persistence dependencies are required for sql mode.");
  });

  it("keeps selection config strict and free of secret-bearing fields", () => {
    expect(
      PlanningPersistenceSelectionConfigSchema.parse({
        environment: "production",
        mode: "in-memory"
      })
    ).toEqual({
      environment: "production",
      mode: "in-memory"
    });

    expect(() =>
      PlanningPersistenceSelectionConfigSchema.parse({
        databaseUrl: "postgres://user:password@example.invalid/db",
        environment: "production"
      })
    ).toThrow();
  });

  it("parses runtime config with database URL environment variable names only", () => {
    expect(parsePlanningPersistenceRuntimeConfig({})).toEqual({
      database: {
        connectionName: "planning-primary",
        runtime: "postgresql",
        urlEnvVar: "SANCTUARY_OS_DATABASE_URL"
      },
      environment: "development"
    });

    expect(
      PlanningPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "planning-primary",
          runtime: "postgresql",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production",
        mode: "sql"
      })
    ).toEqual({
      database: {
        connectionName: "planning-primary",
        runtime: "postgresql",
        urlEnvVar: "DATABASE_URL"
      },
      environment: "production",
      mode: "sql"
    });

    expect(() =>
      PlanningPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "planning-primary",
          runtime: "postgresql",
          url: "postgres://user:password@example.invalid/db",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      })
    ).toThrow();
    expect(() =>
      PlanningPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "planning-primary",
          runtime: "postgresql",
          urlEnvVar: "postgres://user:password@example.invalid/db"
        },
        environment: "production"
      })
    ).toThrow();
    expect(() =>
      PlanningPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "planning-primary",
          runtime: "sqlite",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      })
    ).toThrow("Planning SQL persistence requires PostgreSQL runtime.");
  });

  it("builds in-memory repositories and preserves operation recording behavior", async () => {
    const selection = createPlanningPersistenceSelection(
      { environment: "test" },
      {
        inMemorySeeds: {
          query: {
            services: [
              {
                serviceId: "service_1",
                serviceTypeId: "sunday",
                status: "scheduled",
                tenantId: "tenant_1",
                title: "Sunday Worship"
              }
            ]
          },
          readiness: {
            readinessRecords: [
              {
                band: "ready",
                checks: [
                  {
                    code: "required-roles",
                    label: "Required roles assigned",
                    maxScore: 25,
                    score: 25
                  }
                ],
                readinessScore: 100,
                recommendedActions: [],
                risks: [],
                serviceId: "service_1",
                strengths: ["Required roles assigned is complete."],
                tenantId: "tenant_1"
              }
            ]
          }
        }
      }
    );

    expect(selection.mode).toBe("in-memory");

    if (selection.mode !== "in-memory") {
      throw new Error("Expected in-memory planning persistence selection.");
    }

    await expect(
      selection.queryRepository.listServices({
        input: {},
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_list",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toHaveLength(1);

    await expect(
      selection.readinessRepository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_readiness",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toMatchObject({
      readinessScore: 100,
      serviceId: "service_1",
      tenantId: "tenant_1"
    });

    expect(selection.inMemoryAdapters.query.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listServices",
        requestId: "request_list",
        tenantId: "tenant_1"
      }
    ]);
    expect(selection.inMemoryAdapters.readiness.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "getServiceReadiness",
        requestId: "request_readiness",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("builds SQL-backed repository adapters from injected executor dependencies", async () => {
    const executor = createRecordingSqlExecutor([
      [
        {
          service_id: "service_sql_1",
          service_type_id: "sunday",
          starts_at: null,
          status: "draft",
          tenant_id: "tenant_1",
          title: "SQL Service"
        }
      ]
    ]);
    const selection = createPlanningPersistenceSelection(
      {
        environment: "production"
      },
      {
        sql: createSqlDependencies(executor)
      }
    );

    expect(selection.mode).toBe("sql");

    await expect(
      selection.queryRepository.getService({
        input: {
          serviceId: "service_sql_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_sql_get",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual({
      serviceId: "service_sql_1",
      serviceTypeId: "sunday",
      status: "draft",
      tenantId: "tenant_1",
      title: "SQL Service"
    });

    expect(executor.statements).toHaveLength(1);
    expect(executor.statements[0]?.name).toBe("planning.services.get");
    expect(executor.statements[0]?.parameters).toEqual([
      "tenant_1",
      "service_sql_1"
    ]);
  });

  it("allows explicit in-memory mode in production without SQL dependencies", () => {
    const selection = createPlanningPersistenceSelection({
      environment: "production",
      mode: "in-memory"
    });

    expect(selection.mode).toBe("in-memory");
  });

  it("creates SQL dependencies from PostgreSQL runtime bindings without reading secrets", async () => {
    const queryClient = createRecordingPostgreSqlClient([
      {
        rows: [
          {
            service_id: "service_runtime_1",
            service_type_id: "sunday",
            starts_at: null,
            status: "scheduled",
            tenant_id: "tenant_1",
            title: "Runtime Service"
          }
        ]
      }
    ]);
    const transactionClient = createRecordingPostgreSqlClient();
    const sql = createPlanningSqlPersistenceDependenciesFromPostgreSqlRuntime(
      {
        database: {
          connectionName: "planning-primary",
          runtime: "postgresql",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      },
      {
        ...createSqlDependencies(createRecordingSqlExecutor([])),
        queryClient,
        transactionId: () => "runtime_tx_1",
        transactionPool: {
          connect: () => Promise.resolve(transactionClient)
        }
      }
    );

    await expect(
      sql.executor.query({
        name: "planning.services.get",
        parameters: ["tenant_1", "service_runtime_1"],
        sql: "SELECT * FROM planning_services WHERE tenant_id = $1 AND service_id = $2"
      })
    ).resolves.toEqual({
      rows: [
        {
          service_id: "service_runtime_1",
          service_type_id: "sunday",
          starts_at: null,
          status: "scheduled",
          tenant_id: "tenant_1",
          title: "Runtime Service"
        }
      ]
    });
    expect(queryClient.queries).toEqual([
      {
        name: "planning.services.get",
        text: "SELECT * FROM planning_services WHERE tenant_id = $1 AND service_id = $2",
        values: ["tenant_1", "service_runtime_1"]
      }
    ]);
  });

  it("builds production SQL selection from runtime config and PostgreSQL bindings", async () => {
    const queryClient = createRecordingPostgreSqlClient([
      {
        rows: [
          {
            service_id: "service_runtime_2",
            service_type_id: "sunday",
            starts_at: null,
            status: "draft",
            tenant_id: "tenant_1",
            title: "Runtime SQL Service"
          }
        ]
      }
    ]);
    const selection = createPlanningPersistenceSelectionFromRuntimeConfig(
      {
        database: {
          connectionName: "planning-primary",
          runtime: "postgresql",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      },
      {
        postgreSql: {
          ...createSqlDependencies(createRecordingSqlExecutor([])),
          queryClient,
          transactionPool: {
            connect: () => Promise.resolve(createRecordingPostgreSqlClient())
          }
        }
      }
    );

    expect(selection.mode).toBe("sql");
    await expect(
      selection.queryRepository.getService({
        input: {
          serviceId: "service_runtime_2"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_runtime_get",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toMatchObject({
      serviceId: "service_runtime_2",
      tenantId: "tenant_1",
      title: "Runtime SQL Service"
    });
  });

  it("fails safely when runtime SQL mode lacks PostgreSQL bindings", () => {
    expect(() =>
      createPlanningPersistenceSelectionFromRuntimeConfig({
        environment: "production"
      })
    ).toThrow(
      "Planning PostgreSQL runtime dependencies are required for SQL persistence."
    );
  });
});
