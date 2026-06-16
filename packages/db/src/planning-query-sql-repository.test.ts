import { describe, expect, it } from "vitest";
import {
  createPlanningServiceQuerySqlRepository,
  type PlanningSqlExecutor,
  type PlanningSqlQueryResult,
  type PlanningSqlStatement,
  type PlanningSqlValue
} from "./index.js";

interface RecordingSqlExecutor extends Pick<PlanningSqlExecutor, "query"> {
  readonly statements: readonly PlanningSqlStatement[];
}

const createRecordingExecutor = (
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

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    }
  };
};

const createRepository = (executor: RecordingSqlExecutor) =>
  createPlanningServiceQuerySqlRepository({ executor });

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

describe("Planning SQL query repository", () => {
  it("lists services with tenant and filter parameters", async () => {
    const executor = createRecordingExecutor([
      [
        {
          service_id: "service_1",
          service_type_id: "sunday",
          starts_at: "2026-06-21T14:00:00.000Z",
          status: "scheduled",
          tenant_id: "tenant_1",
          title: "Sunday Service"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServices({
        input: {
          filter: {
            serviceTypeId: "sunday",
            startsAtOrAfter: "2026-06-01T00:00:00.000Z",
            startsBefore: "2026-07-01T00:00:00.000Z",
            status: "scheduled"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_services",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        serviceId: "service_1",
        serviceTypeId: "sunday",
        startsAt: "2026-06-21T14:00:00.000Z",
        status: "scheduled",
        tenantId: "tenant_1",
        title: "Sunday Service"
      }
    ]);

    const statement = statementAt(executor, 0);
    expect(statement.name).toBe("planning.services.list");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND ($2::text IS NULL OR service_type_id = $2)");
    expectSqlContains(statement, "AND ($3::text IS NULL OR status = $3)");
    expectParameters(statement, [
      "tenant_1",
      "sunday",
      "scheduled",
      "2026-06-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z"
    ]);
  });

  it("returns null when a tenant-scoped service lookup has no row", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createRepository(executor);
    const transaction = { transactionId: "query_tx" };

    await expect(
      repository.getService({
        input: {
          serviceId: "service_missing"
        },
        options: {
          context: {
            requestId: "request_get",
            tenantId: "tenant_1"
          },
          transaction
        }
      })
    ).resolves.toBeNull();

    const statement = statementAt(executor, 0);
    expect(statement.transaction).toEqual(transaction);
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectParameters(statement, ["tenant_1", "service_missing"]);
  });

  it("lists service templates by tenant and service type", async () => {
    const executor = createRecordingExecutor([
      [
        {
          description: "Default flow.",
          service_template_id: "template_sunday",
          service_type_id: "sunday",
          tenant_id: "tenant_1",
          title: "Sunday Template"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServiceTemplates({
        input: {
          serviceTypeId: "sunday"
        },
        options: {
          context: {
            requestId: "request_templates",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([
      {
        description: "Default flow.",
        serviceTemplateId: "template_sunday",
        serviceTypeId: "sunday",
        tenantId: "tenant_1",
        title: "Sunday Template"
      }
    ]);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM planning_service_templates");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_type_id = $2");
    expectParameters(statement, ["tenant_1", "sunday"]);
  });

  it("lists song library items without contact or secret fields", async () => {
    const executor = createRecordingExecutor([
      [
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
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listSongLibrary({
        input: {
          searchInput: {
            includeBannedOrPaused: false,
            key: "G",
            limit: 10,
            query: "open"
          }
        },
        options: {
          context: {
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
        tempoBpm: 76,
        tenantId: "tenant_1",
        title: "Open The Gates",
        usageCount: 6
      }
    ]);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM planning_song_library_items");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "title ILIKE $2 OR artist ILIKE $2");
    expectSqlContains(statement, "$3 = ANY(available_keys)");
    expect(statement.sql).not.toContain("email");
    expect(statement.sql).not.toContain("phone");
    expect(statement.sql).not.toContain("token");
    expectParameters(statement, ["tenant_1", "%open%", "G", false, 10]);
  });

  it("lists assignments without volunteer contact data", async () => {
    const executor = createRecordingExecutor([
      [
        {
          assignment_id: "assignment_1",
          person_id: "person_1",
          role_id: "role_vocal",
          service_id: "service_1",
          status: "confirmed",
          tenant_id: "tenant_1"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServiceAssignments({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
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

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM planning_assignments");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expect(statement.sql).not.toContain("email");
    expect(statement.sql).not.toContain("phone");
    expectParameters(statement, ["tenant_1", "service_1"]);
  });

  it("gets readiness rows by tenant and service and validates json shapes", async () => {
    const executor = createRecordingExecutor([
      [
        {
          band: "needs-attention",
          checks: [
            {
              code: "roles",
              label: "Required roles assigned",
              maxScore: 25,
              score: 15
            }
          ],
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
      repository.getServiceReadiness({
        input: {
          serviceId: "service_1"
        },
        options: {
          context: {
            requestId: "request_readiness",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual({
      band: "needs-attention",
      checks: [
        {
          code: "roles",
          label: "Required roles assigned",
          maxScore: 25,
          score: 15
        }
      ],
      readinessScore: 65,
      recommendedActions: ["Assign missing roles."],
      risks: ["Missing vocalist."],
      serviceId: "service_1",
      strengths: ["Songs selected."],
      tenantId: "tenant_1"
    });

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM planning_readiness_results");
    expectSqlContains(statement, "WHERE tenant_id = $1");
    expectSqlContains(statement, "AND service_id = $2");
    expectParameters(statement, ["tenant_1", "service_1"]);
  });

  it("rejects malformed rows before returning records", async () => {
    const executor = createRecordingExecutor([
      [
        {
          service_id: "service_1",
          service_type_id: "sunday",
          status: "ready",
          tenant_id: "tenant_1",
          title: "Invalid Status"
        }
      ]
    ]);
    const repository = createRepository(executor);

    await expect(
      repository.listServices({
        input: {},
        options: {
          context: {
            requestId: "request_invalid_row",
            tenantId: "tenant_1"
          }
        }
      })
    ).rejects.toThrow();
  });
});
