import { describe, expect, it } from "vitest";
import type {
  PlanningSqlExecutor,
  PlanningSqlQueryResult,
  PlanningSqlStatement,
  PostgreSqlPlanningQueryConfig,
  PostgreSqlPlanningTransactionClient,
  PresenterPresentationPersistenceRecord,
  PresenterThemePersistenceRecord
} from "@sanctuary-os/db";
import {
  PresenterPersistenceRuntimeConfigSchema,
  PresenterPersistenceSelectionConfigSchema,
  createPresenterPersistenceSelection,
  createPresenterPersistenceSelectionFromRuntimeConfig,
  createPresenterSqlPersistenceDependenciesFromPostgreSqlRuntime,
  parsePresenterPersistenceRuntimeConfig,
  resolvePresenterPersistenceMode
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

      if (statement.name === "presenter.audit.insert") {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    },
    runInTransaction: async <Result>(
      operation: Parameters<PlanningSqlExecutor["runInTransaction"]>[0]
    ): Promise<Result> => {
      const transaction = { transactionId: "presenter_composition_tx" };
      return operation(transaction) as Promise<Result>;
    }
  };
};

const createSqlDependencies = (executor: PlanningSqlExecutor) => ({
  clock: () => "2026-06-17T02:00:00.000Z",
  executor,
  ids: {
    auditLogId: () => "presenter_audit_sql_1"
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

const theme: PresenterThemePersistenceRecord = {
  colors: {
    background: "#000000",
    lowerThirdBackground: "#101010",
    lowerThirdText: "#ffffff",
    text: "#ffffff"
  },
  lowerThird: {
    maxLines: 2,
    placement: "bottom-center"
  },
  name: "Default",
  spacing: {
    blockGap: 24,
    slidePadding: 64
  },
  tenantId: "tenant_1",
  themeId: "theme_1",
  typography: {
    baseFontSize: 42,
    bodyFontFamily: "Inter",
    headingFontFamily: "Inter",
    lineHeight: 1.2
  }
};

const presentation: PresenterPresentationPersistenceRecord = {
  createdAt: "2026-06-17T01:00:00.000Z",
  mediaCues: [],
  presentationId: "presentation_1",
  serviceId: "service_1",
  slides: [
    {
      blocks: [
        {
          alignment: "center",
          blockId: "block_1",
          kind: "text",
          text: "Welcome",
          textStyle: "heading"
        }
      ],
      layout: "title",
      order: 0,
      presentationId: "presentation_1",
      slideId: "slide_1",
      tenantId: "tenant_1",
      title: "Welcome"
    }
  ],
  tenantId: "tenant_1",
  theme,
  title: "Sunday Worship",
  updatedAt: "2026-06-17T01:05:00.000Z"
};

const sqlPresentationRow = {
  created_at: presentation.createdAt,
  media_cues: presentation.mediaCues,
  presentation_id: presentation.presentationId,
  service_id: presentation.serviceId,
  slides: presentation.slides,
  tenant_id: presentation.tenantId,
  theme,
  title: presentation.title,
  updated_at: presentation.updatedAt
};

describe("Presenter persistence composition", () => {
  it("defaults development and test environments to in-memory persistence", () => {
    expect(resolvePresenterPersistenceMode()).toBe("in-memory");
    expect(resolvePresenterPersistenceMode({ environment: "development" })).toBe(
      "in-memory"
    );
    expect(resolvePresenterPersistenceMode({ environment: "test" })).toBe(
      "in-memory"
    );
  });

  it("defaults production to SQL and requires explicit SQL dependencies", () => {
    expect(resolvePresenterPersistenceMode({ environment: "production" })).toBe(
      "sql"
    );

    expect(() =>
      createPresenterPersistenceSelection({ environment: "production" })
    ).toThrow("Presenter SQL persistence dependencies are required for sql mode.");
  });

  it("keeps selection config strict and free of secret-bearing fields", () => {
    expect(
      PresenterPersistenceSelectionConfigSchema.parse({
        environment: "production",
        mode: "in-memory"
      })
    ).toEqual({
      environment: "production",
      mode: "in-memory"
    });

    expect(() =>
      PresenterPersistenceSelectionConfigSchema.parse({
        databaseUrl: "postgres://user:password@example.invalid/db",
        environment: "production"
      })
    ).toThrow();
  });

  it("parses runtime config with database URL environment variable names only", () => {
    expect(parsePresenterPersistenceRuntimeConfig({})).toEqual({
      database: {
        connectionName: "presenter-primary",
        runtime: "postgresql",
        urlEnvVar: "SANCTUARY_OS_DATABASE_URL"
      },
      environment: "development"
    });

    expect(
      PresenterPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "presenter-primary",
          runtime: "postgresql",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production",
        mode: "sql"
      })
    ).toEqual({
      database: {
        connectionName: "presenter-primary",
        runtime: "postgresql",
        urlEnvVar: "DATABASE_URL"
      },
      environment: "production",
      mode: "sql"
    });

    expect(() =>
      PresenterPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "presenter-primary",
          runtime: "postgresql",
          url: "postgres://user:password@example.invalid/db",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      })
    ).toThrow();
    expect(() =>
      PresenterPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "presenter-primary",
          runtime: "postgresql",
          urlEnvVar: "postgres://user:password@example.invalid/db"
        },
        environment: "production"
      })
    ).toThrow();
    expect(() =>
      PresenterPersistenceRuntimeConfigSchema.parse({
        database: {
          connectionName: "presenter-primary",
          runtime: "sqlite",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      })
    ).toThrow("Presenter SQL persistence requires PostgreSQL runtime.");
  });

  it("builds in-memory repositories and preserves operation recording behavior", async () => {
    const selection = createPresenterPersistenceSelection(
      { environment: "test" },
      {
        inMemorySeeds: {
          repository: {
            presentations: [presentation]
          }
        }
      }
    );

    expect(selection.mode).toBe("in-memory");

    if (selection.mode !== "in-memory") {
      throw new Error("Expected in-memory presenter persistence selection.");
    }

    await expect(
      selection.queryRepository.listPresentations({
        input: {
          filter: {
            serviceId: "service_1"
          }
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_presenter_list",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual([presentation]);

    expect(selection.inMemoryAdapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listPresentations",
        requestId: "request_presenter_list",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("builds SQL-backed repository adapters from injected executor dependencies", async () => {
    const executor = createRecordingSqlExecutor([[sqlPresentationRow]]);
    const selection = createPresenterPersistenceSelection(
      {
        environment: "production"
      },
      {
        sql: createSqlDependencies(executor)
      }
    );

    expect(selection.mode).toBe("sql");

    await expect(
      selection.queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_presenter_sql_get",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual(presentation);

    expect(executor.statements).toHaveLength(1);
    expect(executor.statements[0]?.name).toBe("presenter.presentations.get");
    expect(executor.statements[0]?.parameters).toEqual([
      "tenant_1",
      "presentation_1"
    ]);
  });

  it("allows explicit in-memory mode in production without SQL dependencies", () => {
    const selection = createPresenterPersistenceSelection({
      environment: "production",
      mode: "in-memory"
    });

    expect(selection.mode).toBe("in-memory");
  });

  it("creates SQL dependencies from PostgreSQL runtime bindings without reading secrets", async () => {
    const queryClient = createRecordingPostgreSqlClient([
      {
        rows: [sqlPresentationRow]
      }
    ]);
    const transactionClient = createRecordingPostgreSqlClient();
    const sql = createPresenterSqlPersistenceDependenciesFromPostgreSqlRuntime(
      {
        database: {
          connectionName: "presenter-primary",
          runtime: "postgresql",
          urlEnvVar: "DATABASE_URL"
        },
        environment: "production"
      },
      {
        ...createSqlDependencies(createRecordingSqlExecutor([])),
        queryClient,
        transactionId: () => "presenter_runtime_tx_1",
        transactionPool: {
          connect: () => Promise.resolve(transactionClient)
        }
      }
    );

    await expect(
      sql.executor.query({
        name: "presenter.presentations.get",
        parameters: ["tenant_1", "presentation_1"],
        sql: "SELECT * FROM presenter_presentations WHERE tenant_id = $1 AND presentation_id = $2"
      })
    ).resolves.toEqual({
      rows: [sqlPresentationRow]
    });
    expect(queryClient.queries).toEqual([
      {
        name: "presenter.presentations.get",
        text: "SELECT * FROM presenter_presentations WHERE tenant_id = $1 AND presentation_id = $2",
        values: ["tenant_1", "presentation_1"]
      }
    ]);
  });

  it("builds production SQL selection from runtime config and PostgreSQL bindings", async () => {
    const queryClient = createRecordingPostgreSqlClient([
      {
        rows: [sqlPresentationRow]
      }
    ]);
    const selection = createPresenterPersistenceSelectionFromRuntimeConfig(
      {
        database: {
          connectionName: "presenter-primary",
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
      selection.queryRepository.getPresentation({
        input: {
          presentationId: "presentation_1"
        },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_presenter_runtime_get",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toEqual(presentation);
  });

  it("fails safely when runtime SQL mode lacks PostgreSQL bindings", () => {
    expect(() =>
      createPresenterPersistenceSelectionFromRuntimeConfig({
        environment: "production"
      })
    ).toThrow(
      "Presenter PostgreSQL runtime dependencies are required for SQL persistence."
    );
  });
});
