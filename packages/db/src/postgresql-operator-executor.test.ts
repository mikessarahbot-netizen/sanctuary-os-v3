import { describe, expect, it } from "vitest";
import type {
  PlanningSqlStatement,
  PostgreSqlPlanningQueryClient,
  PostgreSqlPlanningQueryConfig
} from "./index.js";
import {
  createPostgreSqlOperatorExecutor,
  translatePositionalPlaceholdersToPostgres
} from "./index.js";

interface RecordingPostgreSqlClient extends PostgreSqlPlanningQueryClient {
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
    }
  };
};

describe("translatePositionalPlaceholdersToPostgres", () => {
  it("rewrites a single placeholder to $1", () => {
    expect(
      translatePositionalPlaceholdersToPostgres(
        "SELECT 1 FROM charts WHERE chart_id = ?"
      )
    ).toBe("SELECT 1 FROM charts WHERE chart_id = $1");
  });

  it("rewrites multiple placeholders to sequential 1-based $N", () => {
    expect(
      translatePositionalPlaceholdersToPostgres(
        "SELECT * FROM charts WHERE tenant_id = ? AND (? IS NULL OR song_id = ?)"
      )
    ).toBe(
      "SELECT * FROM charts WHERE tenant_id = $1 AND ($2 IS NULL OR song_id = $3)"
    );
  });

  it("leaves placeholder-free SQL unchanged", () => {
    expect(
      translatePositionalPlaceholdersToPostgres(
        "SELECT chart_id FROM charts ORDER BY chart_id"
      )
    ).toBe("SELECT chart_id FROM charts ORDER BY chart_id");
  });

  it("restarts the counter per call so each statement is numbered from $1", () => {
    const first = translatePositionalPlaceholdersToPostgres(
      "INSERT INTO charts (a, b) VALUES (?, ?)"
    );
    const second = translatePositionalPlaceholdersToPostgres(
      "DELETE FROM charts WHERE chart_id = ?"
    );

    expect(first).toBe("INSERT INTO charts (a, b) VALUES ($1, $2)");
    expect(second).toBe("DELETE FROM charts WHERE chart_id = $1");
  });
});

describe("createPostgreSqlOperatorExecutor", () => {
  it("forwards the translated text and the original values to the query client", async () => {
    const client = createRecordingPostgreSqlClient([
      { rows: [{ chart_id: "chart_1", tenant_id: "tenant_1" }] }
    ]);
    const executor = createPostgreSqlOperatorExecutor({ queryClient: client });

    await expect(
      executor.query({
        name: "charts.get",
        parameters: ["tenant_1", "chart_1"],
        sql: "SELECT chart_id, tenant_id FROM charts WHERE tenant_id = ? AND chart_id = ? LIMIT 1"
      })
    ).resolves.toEqual({
      rows: [{ chart_id: "chart_1", tenant_id: "tenant_1" }]
    });

    expect(client.queries).toEqual([
      {
        name: "charts.get",
        text: "SELECT chart_id, tenant_id FROM charts WHERE tenant_id = $1 AND chart_id = $2 LIMIT 1",
        values: ["tenant_1", "chart_1"]
      }
    ]);
  });

  it("does not mutate the source statement, so the SQLite ? SQL is left intact", async () => {
    const client = createRecordingPostgreSqlClient();
    const executor = createPostgreSqlOperatorExecutor({ queryClient: client });
    const sqliteSql =
      "SELECT chart_id FROM charts WHERE tenant_id = ? AND song_id = ? ORDER BY chart_id";
    const statement: PlanningSqlStatement = {
      name: "charts.list_for_song",
      parameters: ["tenant_1", "song_1"],
      sql: sqliteSql
    };

    await executor.query(statement);

    // The caller's statement (the SQLite ? dialect the adapters depend on) is
    // untouched; only the forwarded PostgreSQL `text` carries the $N rewrite.
    expect(statement.sql).toBe(sqliteSql);
    expect(client.queries[0]?.text).toBe(
      "SELECT chart_id FROM charts WHERE tenant_id = $1 AND song_id = $2 ORDER BY chart_id"
    );
  });
});
