import { describe, expect, it } from "vitest";
import {
  ChartsInitialSchemaMigration,
  createChartsCommandSqlRepository,
  createChartsQuerySqlRepository,
  createSqliteExecutor,
  type ChartsSqlExecutor,
  type PlanningSqlRow
} from "./index.js";

const TENANT = "tenant_1";

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId: TENANT }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId: TENANT },
  intent: "update"
} as const;

const chartRecord = {
  chartId: "chart_1",
  chordProSource: "[G]Hello",
  createdAt: "2026-06-17T08:00:00.000Z",
  defaultKey: "G",
  schemaVersion: "charts.v1",
  songRef: "song_1",
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const preferenceRecord = {
  capo: 2,
  chartId: "chart_1",
  chordsVisible: true,
  fontScale: 1.25,
  instrument: "guitar",
  musicianId: "musician_1",
  tenantId: TENANT,
  transposeSemitones: -2,
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const annotationRecord = {
  annotationId: "annotation_1",
  chartId: "chart_1",
  createdAt: "2026-06-17T08:00:00.000Z",
  kind: "note",
  lineIndex: 0,
  musicianId: "musician_1",
  note: "watch the tempo",
  sectionIndex: 0,
  tenantId: TENANT,
  updatedAt: "2026-06-17T08:00:00.000Z"
} as const;

const chartRow: PlanningSqlRow = {
  arrangement_ref: null,
  chart_id: "chart_1",
  chord_pro_source: "[G]Hello",
  created_at: "2026-06-17T08:00:00.000Z",
  default_key: "G",
  schema_version: "charts.v1",
  song_id: "song_1",
  tenant_id: TENANT,
  title: null,
  updated_at: "2026-06-17T08:00:00.000Z"
};

interface RecordedStatement {
  readonly name: string;
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

const createRecordingExecutor = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>
): { readonly executor: ChartsSqlExecutor; readonly statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const executor: ChartsSqlExecutor = {
    query: (statement) => {
      statements.push({
        name: statement.name,
        parameters: statement.parameters,
        sql: statement.sql
      });

      return Promise.resolve({ rows: rowsByName[statement.name] ?? [] });
    }
  };

  return { executor, statements };
};

describe("Charts SQL repository (recording executor)", () => {
  it("scopes getChart by tenant and maps the row to a contract record", async () => {
    const { executor, statements } = createRecordingExecutor({ "charts.get": [chartRow] });
    const repository = createChartsQuerySqlRepository({ executor });

    const chart = await repository.getChart({
      input: { chartId: "chart_1" },
      options: readOptions
    });

    expect(chart?.chartId).toBe("chart_1");
    expect(chart?.tenantId).toBe(TENANT);
    const [statement] = statements;
    expect(statement?.sql).toContain("WHERE tenant_id = ? AND chart_id = ?");
    expect(statement?.parameters).toEqual([TENANT, "chart_1"]);
  });

  it("returns null when getChart matches no row", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createChartsQuerySqlRepository({ executor });

    expect(
      await repository.getChart({ input: { chartId: "missing" }, options: readOptions })
    ).toBeNull();
  });

  it("passes the song filter to listCharts, repeating it for the null guard", async () => {
    const { executor, statements } = createRecordingExecutor({ "charts.list": [chartRow] });
    const repository = createChartsQuerySqlRepository({ executor });

    const charts = await repository.listCharts({
      input: { filter: { songRef: "song_1" } },
      options: readOptions
    });

    expect(charts).toHaveLength(1);
    expect(statements[0]?.parameters).toEqual([TENANT, "song_1", "song_1"]);
  });

  it("lists every tenant chart when unfiltered", async () => {
    const { executor, statements } = createRecordingExecutor({ "charts.list": [] });
    const repository = createChartsQuerySqlRepository({ executor });

    await repository.listCharts({ input: {}, options: readOptions });

    expect(statements[0]?.parameters).toEqual([TENANT, null, null]);
  });

  it("upserts a chart with tenant-scoped parameters and echoes the record", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createChartsCommandSqlRepository({
      clock: () => "2026-06-17T09:00:00.000Z",
      executor
    });

    const saved = await repository.saveChart({ input: chartRecord, options: writeOptions });

    expect(saved).toEqual(chartRecord);
    expect(statements[0]?.name).toBe("charts.upsert");
    expect(statements[0]?.sql).toContain("ON CONFLICT (tenant_id, chart_id) DO UPDATE");
    expect(statements[0]?.parameters[0]).toBe(TENANT);
  });

  it("rejects a chart whose tenant differs from the operation tenant", async () => {
    const { executor } = createRecordingExecutor({});
    const repository = createChartsCommandSqlRepository({ clock: () => "t", executor });

    await expect(
      repository.saveChart({
        input: { ...chartRecord, tenantId: "tenant_other" },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
  });

  it("updates the chart source with the clock and maps the RETURNING row", async () => {
    const updatedRow: PlanningSqlRow = {
      ...chartRow,
      chord_pro_source: "[C]New",
      default_key: "C",
      updated_at: "2026-06-17T10:00:00.000Z"
    };
    const { executor, statements } = createRecordingExecutor({
      "charts.update_source": [updatedRow]
    });
    const repository = createChartsCommandSqlRepository({
      clock: () => "2026-06-17T10:00:00.000Z",
      executor
    });

    const chart = await repository.updateChartSource({
      input: { chartId: "chart_1", chordProSource: "[C]New", defaultKey: "C" },
      options: writeOptions
    });

    expect(chart.chordProSource).toBe("[C]New");
    expect(chart.defaultKey).toBe("C");
    const [statement] = statements;
    expect(statement?.sql).toContain("RETURNING");
    expect(statement?.parameters).toEqual([
      "[C]New",
      "C",
      "2026-06-17T10:00:00.000Z",
      TENANT,
      "chart_1"
    ]);
  });

  it("deletes an annotation scoped by tenant, chart, and musician", async () => {
    const { executor, statements } = createRecordingExecutor({});
    const repository = createChartsCommandSqlRepository({ clock: () => "t", executor });

    await repository.removeChartAnnotation({
      input: { annotationId: "annotation_1", chartId: "chart_1", musicianId: "musician_1" },
      options: writeOptions
    });

    const [statement] = statements;
    expect(statement?.sql).toContain("DELETE FROM chart_annotations");
    expect(statement?.parameters).toEqual([TENANT, "annotation_1", "chart_1", "musician_1"]);
  });
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

describe("Charts SQL repository smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("persists and reads charts, preferences, and annotations via node:sqlite", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      database.exec(ChartsInitialSchemaMigration.upSql);
      const executor = createSqliteExecutor({ database });
      const query = createChartsQuerySqlRepository({ executor });
      const command = createChartsCommandSqlRepository({
        clock: () => "2026-06-17T12:00:00.000Z",
        executor
      });

      await command.saveChart({ input: chartRecord, options: writeOptions });
      const fetched = await query.getChart({ input: { chartId: "chart_1" }, options: readOptions });
      expect(fetched?.chordProSource).toBe("[G]Hello");

      await command.setMusicianChartPreference({ input: preferenceRecord, options: writeOptions });
      const preference = await query.getMusicianChartPreference({
        input: { chartId: "chart_1", musicianId: "musician_1" },
        options: readOptions
      });
      expect(preference?.chordsVisible).toBe(true);
      expect(preference?.transposeSemitones).toBe(-2);

      await command.addChartAnnotation({ input: annotationRecord, options: writeOptions });
      const annotations = await query.listChartAnnotations({
        input: { chartId: "chart_1" },
        options: readOptions
      });
      expect(annotations).toHaveLength(1);
      expect(annotations[0]?.kind).toBe("note");

      const updated = await command.updateChartSource({
        input: { chartId: "chart_1", chordProSource: "[C]New" },
        options: writeOptions
      });
      expect(updated.chordProSource).toBe("[C]New");
      expect(updated.defaultKey).toBe("G");
      expect(updated.updatedAt).toBe("2026-06-17T12:00:00.000Z");

      const all = await query.listCharts({ input: {}, options: readOptions });
      expect(all).toHaveLength(1);
    } finally {
      database.close();
    }
  });
});
