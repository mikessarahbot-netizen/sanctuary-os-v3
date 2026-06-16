import { describe, expect, it } from "vitest";
import {
  createPlanningServiceQuerySqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";
import type { TransactionHandle } from "./index.js";

interface RecordingSqlExecutor extends PlanningSqlExecutor {
  readonly statements: readonly PlanningSqlStatement[];
}

const createRecordingExecutor = (
  resultRows: readonly (
    | PlanningSqlQueryResult["rows"][number]
    | readonly PlanningSqlQueryResult["rows"][number][]
  )[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const rowsByQuery = [...resultRows];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);
      const rowOrRows = rowsByQuery.shift();

      if (rowOrRows === undefined) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({
        rows: Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
      });
    },
    runInTransaction: async <Result>(
      operation: (transaction: TransactionHandle) => Promise<Result>
    ): Promise<Result> => operation({ transactionId: "unexpected_read_tx" })
  };
};

const createRepository = (executor: PlanningSqlExecutor) =>
  createPlanningServiceQuerySqlRepository({ executor });

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

describe("Planning SQL query repository slice", () => {
  it("lists services with tenant predicates and parameterized filters", async () => {
    const suppliedTransaction = { transactionId: "read_tx" };
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "type_sunday",
        starts_at: "2026-06-21T14:00:00.000Z",
        status: "scheduled",
        tenant_id: "tenant_1",
        title: "Sunday Worship"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServices({
        input: {
          filter: {
            serviceTypeId: "type_sunday",
            startsAtOrAfter: "2026-06-20T00:00:00.000Z",
            startsBefore: "2026-06-22T00:00:00.000Z",
            status: "scheduled"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_services",
            tenantId: "tenant_1"
          },
          transaction: suppliedTransaction
        }
      })
    ).resolves.toEqual([
      {
        serviceId: "service_1",
        serviceTypeId: "type_sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        status: "scheduled",
        tenantId: "tenant_1",
        title: "Sunday Worship"
      }
    ]);

    const query = statementAt(executor, 0);

    expect(query.name).toBe("planning.services.list");
    expect(query.transaction).toEqual(suppliedTransaction);
    expectSqlContains(query, "FROM planning_services");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "service_type_id = $2");
    expectSqlContains(query, "status = $3");
    expectSqlContains(query, "starts_at >= $4");
    expectSqlContains(query, "starts_at < $5");
    expectParameters(query, [
      "tenant_1",
      "type_sunday",
      "scheduled",
      "2026-06-20T00:00:00.000Z",
      "2026-06-22T00:00:00.000Z"
    ]);
  });

  it("returns null for tenant-local service misses", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createRepository(executor);

    await expect(
      repository.getService({
        input: {
          serviceId: "service_missing"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_service",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toBeNull();

    const query = statementAt(executor, 0);

    expectSqlContains(query, "FROM planning_services");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "AND service_id = $2");
    expectParameters(query, ["tenant_1", "service_missing"]);
  });

  it("lists tenant-scoped templates by service type", async () => {
    const executor = createRecordingExecutor([
      {
        description: "Default Sunday flow.",
        service_template_id: "template_sunday",
        service_type_id: "type_sunday",
        tenant_id: "tenant_1",
        title: "Sunday Worship Template"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServiceTemplates({
        input: {
          serviceTypeId: "type_sunday"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_templates",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        description: "Default Sunday flow.",
        serviceTemplateId: "template_sunday",
        serviceTypeId: "type_sunday",
        tenantId: "tenant_1",
        title: "Sunday Worship Template"
      }
    ]);

    const query = statementAt(executor, 0);

    expectSqlContains(query, "FROM planning_service_templates");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "AND service_type_id = $2");
    expectParameters(query, ["tenant_1", "type_sunday"]);
  });

  it("lists song library rows without returning contact or secret fields", async () => {
    const executor = createRecordingExecutor([
      {
        artist: "Sanctuary Collective",
        available_keys: ["G", "A"],
        ccli_reporting_allowed: true,
        ccli_song_number: "123456",
        default_key: "G",
        energy: "medium",
        has_arrangements: true,
        has_charts: true,
        is_banned_or_paused: false,
        last_used_at: "2026-06-07T14:00:00.000Z",
        song_id: "song_1",
        tempo_bpm: 76,
        tenant_id: "tenant_1",
        title: "Open The Gates",
        usage_count: 6
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listSongLibrary({
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            key: "G",
            limit: 5,
            query: "open"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_songs",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        artist: "Sanctuary Collective",
        availableKeys: ["G", "A"],
        ccliReportingAllowed: true,
        ccliSongNumber: "123456",
        defaultKey: "G",
        energy: "medium",
        hasArrangements: true,
        hasCharts: true,
        isBannedOrPaused: false,
        lastUsedAt: "2026-06-07T14:00:00.000Z",
        songId: "song_1",
        tenantId: "tenant_1",
        tempoBpm: 76,
        title: "Open The Gates",
        usageCount: 6
      }
    ]);

    const query = statementAt(executor, 0);

    expectSqlContains(query, "FROM planning_song_library_items");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "is_banned_or_paused = FALSE");
    expectSqlContains(query, "(title ILIKE $2 OR artist ILIKE $3)");
    expectSqlContains(query, "available_keys ? $4");
    expectSqlContains(query, "LIMIT $5");
    expect(query.sql).not.toContain("email");
    expect(query.sql).not.toContain("phone");
    expect(query.sql).not.toContain("secret");
    expectParameters(query, ["tenant_1", "%open%", "%open%", "G", 5]);
  });

  it("can include paused songs when explicitly requested", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createRepository(executor);

    await repository.listSongLibrary({
      input: {
        searchInput: {
          includeBannedOrPaused: true,
          query: "paused"
        }
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_paused_songs",
          tenantId: "tenant_1"
        }
      }
    });

    const query = statementAt(executor, 0);

    expect(query.sql).not.toContain("is_banned_or_paused = FALSE");
    expectParameters(query, ["tenant_1", "%paused%", "%paused%"]);
  });

  it("lists assignments by tenant and service without volunteer contact fields", async () => {
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

    await expect(
      repository.listServiceAssignments({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_assignments",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        assignmentId: "assignment_1",
        personId: "person_1",
        roleId: "role_vocal",
        serviceId: "service_1",
        status: "confirmed",
        tenantId: "tenant_1"
      }
    ]);

    const query = statementAt(executor, 0);

    expectSqlContains(query, "FROM planning_assignments");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "AND service_id = $2");
    expect(query.sql).not.toContain("email");
    expect(query.sql).not.toContain("phone");
    expectParameters(query, ["tenant_1", "service_1"]);
  });

  it("returns null for missing readiness results and validates returned rows", async () => {
    const executor = createRecordingExecutor([
      [],
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
        readiness_score: 100,
        recommended_actions: [],
        risks: [],
        service_id: "service_1",
        strengths: ["Required roles assigned is complete."],
        tenant_id: "tenant_1"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.getServiceReadiness({
        input: {
          serviceId: "service_missing"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_missing_readiness",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toBeNull();

    await expect(
      repository.getServiceReadiness({
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
    ).resolves.toEqual({
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
    });

    const query = statementAt(executor, 1);

    expectSqlContains(query, "FROM planning_readiness_results");
    expectSqlContains(query, "WHERE tenant_id = $1");
    expectSqlContains(query, "AND service_id = $2");
    expectParameters(query, ["tenant_1", "service_1"]);
  });

  it("validates read operation input and returned SQL rows at the adapter boundary", async () => {
    const executor = createRecordingExecutor([
      {
        service_id: "service_1",
        service_type_id: "type_sunday",
        status: "ready",
        tenant_id: "tenant_1",
        title: "Invalid Service"
      }
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServices({
        input: {
          filter: {
            startsAtOrAfter: "not-a-date"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_invalid_input",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
    expect(executor.statements).toHaveLength(0);

    await expect(
      repository.listServices({
        input: {},
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_invalid_row",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
    expect(executor.statements).toHaveLength(1);
  });
});
