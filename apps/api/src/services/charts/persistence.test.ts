import { describe, expect, it } from "vitest";
import type { ChartsSqlExecutor, PlanningSqlRow } from "@sanctuary-os/db";
import {
  createChartsCommandSqlRepository,
  createChartsQuerySqlRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  isChartsDomainError,
  type ChartsDomainErrorCode
} from "../../domain/charts/index.js";
import { createPersistenceBackedChartsServicesAdapter } from "./persistence.js";

const TENANT = "tenant_1";

const musician: AuthenticatedActor = {
  actorId: "musician_1",
  roles: ["musician"],
  tenantId: TENANT
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: TENANT
};

const chartRow: PlanningSqlRow = {
  arrangement_ref: null,
  chart_id: "chart_1",
  chord_pro_source: "[G]Hello",
  created_at: "2026-06-17T08:00:00.000Z",
  default_key: "G",
  schema_version: "charts.v1",
  song_id: "song_1",
  tenant_id: TENANT,
  title: "Hello",
  updated_at: "2026-06-17T08:00:00.000Z"
};

const annotationRow: PlanningSqlRow = {
  annotation_id: "annotation_1",
  chart_id: "chart_1",
  color: null,
  created_at: "2026-06-17T08:00:00.000Z",
  kind: "highlight",
  line_index: 0,
  musician_id: "musician_1",
  note: null,
  section_index: 0,
  tenant_id: TENANT,
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

const createAdapter = (
  rowsByName: Readonly<Record<string, readonly PlanningSqlRow[]>>,
  options: {
    readonly annotationId?: () => string;
    readonly chartId?: () => string;
    readonly clock?: () => string;
  } = {}
): {
  readonly adapter: ReturnType<typeof createPersistenceBackedChartsServicesAdapter>;
  readonly statements: RecordedStatement[];
} => {
  const { executor, statements } = createRecordingExecutor(rowsByName);
  const clock = options.clock ?? ((): string => "2026-06-17T09:00:00.000Z");
  const adapter = createPersistenceBackedChartsServicesAdapter({
    clock,
    commandRepository: createChartsCommandSqlRepository({ clock, executor }),
    ids: {
      ...(options.annotationId !== undefined ? { annotationId: options.annotationId } : {}),
      ...(options.chartId !== undefined ? { chartId: options.chartId } : {})
    },
    queryRepository: createChartsQuerySqlRepository({ executor })
  });

  return { adapter, statements };
};

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: ChartsDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isChartsDomainError(error)).toBe(true);
  if (isChartsDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

describe("createPersistenceBackedChartsServicesAdapter (recording executor)", () => {
  it("maps a persistence chart row to a domain record on getChart", async () => {
    const { adapter, statements } = createAdapter({ "charts.get": [chartRow] });

    const chart = await adapter.queryService.getChart({
      actor: musician,
      input: { chartId: "chart_1" },
      requestId: "request_get"
    });

    expect(chart).toMatchObject({
      chartId: "chart_1",
      chordProSource: "[G]Hello",
      defaultKey: "G",
      songRef: "song_1",
      tenantId: TENANT,
      title: "Hello"
    });
    // The persistence-only schemaVersion field is dropped from the domain record.
    expect(chart === null || "schemaVersion" in chart).toBe(false);
    expect(statements[0]?.name).toBe("charts.get");
    expect(statements[0]?.parameters).toEqual([TENANT, "chart_1"]);
  });

  it("returns null for a cross-tenant getChart without leaking the row", async () => {
    const { adapter } = createAdapter({ "charts.get": [chartRow] });

    await expect(
      adapter.queryService.getChart({
        actor: otherTenantLeader,
        input: { chartId: "chart_1" },
        requestId: "request_cross_tenant"
      })
    ).resolves.toBeNull();
  });

  it("derives the persistence schemaVersion and tenant when saving a chart", async () => {
    const { adapter, statements } = createAdapter(
      {},
      { chartId: () => "chart_created" }
    );

    const chart = await adapter.commandService.saveChart({
      actor: musician,
      input: {
        chordProSource: "[G]New",
        defaultKey: "G",
        songRef: "song_created",
        title: "New Chart"
      },
      requestId: "request_save"
    });

    expect(chart).toMatchObject({
      chartId: "chart_created",
      songRef: "song_created",
      tenantId: TENANT,
      title: "New Chart"
    });
    const upsert = statements.find((statement) => statement.name === "charts.upsert");
    expect(upsert?.parameters).toEqual([
      TENANT,
      "chart_created",
      "song_created",
      null,
      "G",
      "[G]New",
      "New Chart",
      "charts.v1",
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T09:00:00.000Z"
    ]);
  });

  it("requires the chart to exist before updating its source", async () => {
    const { adapter } = createAdapter({ "charts.get": [] });

    await expectDomainErrorCode(
      adapter.commandService.updateChartSource({
        actor: musician,
        input: { chartId: "chart_missing", chordProSource: "[A]Edited" },
        requestId: "request_missing"
      }),
      "CHART_NOT_FOUND"
    );
  });

  it("maps the RETURNING row from updateChartSource back to a domain record", async () => {
    const { adapter, statements } = createAdapter({
      "charts.get": [chartRow],
      "charts.update_source": [
        {
          ...chartRow,
          chord_pro_source: "[C]New",
          default_key: "C",
          updated_at: "2026-06-17T10:00:00.000Z"
        }
      ]
    });

    const chart = await adapter.commandService.updateChartSource({
      actor: musician,
      input: { chartId: "chart_1", chordProSource: "[C]New", defaultKey: "C" },
      requestId: "request_update"
    });

    expect(chart).toMatchObject({ chordProSource: "[C]New", defaultKey: "C" });
    expect(
      statements.some((statement) => statement.name === "charts.update_source")
    ).toBe(true);
  });

  it("scopes the preference lookup to the acting musician and maps the result", async () => {
    const { adapter, statements } = createAdapter({
      "charts.preferences.get": [
        {
          capo: 2,
          chart_id: "chart_1",
          chords_visible: 1,
          font_scale: 1.25,
          instrument: "guitar",
          musician_id: "musician_1",
          tenant_id: TENANT,
          transpose_semitones: -2,
          updated_at: "2026-06-17T08:00:00.000Z"
        }
      ]
    });

    const preference = await adapter.queryService.getMusicianChartPreference({
      actor: musician,
      input: { chartId: "chart_1" },
      requestId: "request_preference"
    });

    expect(preference).toMatchObject({
      chartId: "chart_1",
      chordsVisible: true,
      transposeSemitones: -2
    });
    expect(statements[0]?.parameters).toEqual([TENANT, "chart_1", "musician_1"]);
  });

  it("rejects setting another musician's preference with AUTHORIZATION_FAILED", async () => {
    const { adapter } = createAdapter({ "charts.get": [chartRow] });

    await expectDomainErrorCode(
      adapter.commandService.setMusicianChartPreference({
        actor: musician,
        input: {
          capo: 0,
          chartId: "chart_1",
          chordsVisible: true,
          fontScale: 1,
          instrument: "guitar",
          musicianId: "musician_2",
          transposeSemitones: 0
        },
        requestId: "request_foreign_preference"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("requires an owned annotation before updating it", async () => {
    const { adapter } = createAdapter({
      "charts.get": [chartRow],
      "charts.annotations.list": []
    });

    await expectDomainErrorCode(
      adapter.commandService.updateChartAnnotation({
        actor: musician,
        input: {
          annotationId: "annotation_missing",
          chartId: "chart_1",
          kind: "highlight",
          lineIndex: 0,
          musicianId: "musician_1",
          sectionIndex: 0
        },
        requestId: "request_update_missing"
      }),
      "ANNOTATION_NOT_FOUND"
    );
  });

  it("throws ANNOTATION_NOT_FOUND when removing an annotation the musician does not own", async () => {
    const { adapter } = createAdapter({ "charts.annotations.list": [] });

    await expectDomainErrorCode(
      adapter.commandService.removeChartAnnotation({
        actor: musician,
        input: {
          annotationId: "annotation_missing",
          chartId: "chart_1",
          confirmationIntent: { confirmed: true, reason: "cleanup" },
          musicianId: "musician_1"
        },
        requestId: "request_remove_missing"
      }),
      "ANNOTATION_NOT_FOUND"
    );
  });

  it("lists only the acting musician's annotations and maps them", async () => {
    const { adapter, statements } = createAdapter({
      "charts.annotations.list": [annotationRow]
    });

    const annotations = await adapter.queryService.listChartAnnotations({
      actor: musician,
      input: { chartId: "chart_1" },
      requestId: "request_list_annotations"
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      annotationId: "annotation_1",
      kind: "highlight",
      musicianId: "musician_1"
    });
    expect(statements[0]?.parameters).toEqual([TENANT, "chart_1", "musician_1", "musician_1"]);
  });

  it("rejects viewer mutations in the service layer", async () => {
    const { adapter } = createAdapter({ "charts.get": [chartRow] });

    await expectDomainErrorCode(
      adapter.commandService.updateChartSource({
        actor: viewer,
        input: { chartId: "chart_1", chordProSource: "[A]Edited" },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });
});
