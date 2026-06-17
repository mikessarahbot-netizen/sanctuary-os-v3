import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  createChartsPersistenceSelection,
  migrateChartsSqliteSchema
} from "./composition.js";

const TENANT = "tenant_1";

const musician: AuthenticatedActor = {
  actorId: "musician_1",
  roles: ["musician"],
  tenantId: TENANT
};

interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

const wrapMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
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

describe("Charts persistence-backed service (node:sqlite integration)", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(
      true
    );
  });

  liveIt(
    "applies the Charts migration and round-trips a service CRUD flow",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => "2026-06-17T12:00:00.000Z";
        const steps = await migrateChartsSqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        expect(steps).toEqual([
          { migrationId: "202606170003_charts_initial_schema", outcome: "applied" }
        ]);

        const selection = createChartsPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              clock,
              executor: createSqliteExecutor({ database }),
              ids: {
                annotationId: () => "annotation_created",
                chartId: () => "chart_created"
              }
            }
          }
        );
        expect(selection.mode).toBe("sql");
        const { commandService, queryService } = selection.servicesAdapter;

        // save chart
        const saved = await commandService.saveChart({
          actor: musician,
          input: {
            chordProSource: "{title: Amazing Grace}\n[G]Amazing [C]grace",
            defaultKey: "G",
            songRef: "song_1",
            title: "Amazing Grace"
          },
          requestId: "request_save"
        });
        expect(saved).toMatchObject({
          chartId: "chart_created",
          songRef: "song_1",
          tenantId: TENANT,
          title: "Amazing Grace"
        });

        // get
        const fetched = await queryService.getChart({
          actor: musician,
          input: { chartId: "chart_created" },
          requestId: "request_get"
        });
        expect(fetched?.chordProSource).toBe("{title: Amazing Grace}\n[G]Amazing [C]grace");

        // set preference
        await commandService.setMusicianChartPreference({
          actor: musician,
          input: {
            capo: 2,
            chartId: "chart_created",
            chordsVisible: true,
            fontScale: 1.25,
            instrument: "guitar",
            musicianId: "musician_1",
            transposeSemitones: -2
          },
          requestId: "request_preference"
        });
        const preference = await queryService.getMusicianChartPreference({
          actor: musician,
          input: { chartId: "chart_created" },
          requestId: "request_get_preference"
        });
        expect(preference).toMatchObject({
          chartId: "chart_created",
          chordsVisible: true,
          instrument: "guitar",
          transposeSemitones: -2
        });

        // annotate
        const annotation = await commandService.addChartAnnotation({
          actor: musician,
          input: {
            chartId: "chart_created",
            color: "#ffaa00",
            kind: "highlight",
            lineIndex: 1,
            musicianId: "musician_1",
            sectionIndex: 0
          },
          requestId: "request_annotate"
        });
        expect(annotation).toMatchObject({
          annotationId: "annotation_created",
          chartId: "chart_created",
          kind: "highlight"
        });

        // list annotations
        const annotations = await queryService.listChartAnnotations({
          actor: musician,
          input: { chartId: "chart_created" },
          requestId: "request_list_annotations"
        });
        expect(annotations).toHaveLength(1);
        expect(annotations[0]?.color).toBe("#ffaa00");

        // update source
        const updated = await commandService.updateChartSource({
          actor: musician,
          input: { chartId: "chart_created", chordProSource: "{key: A}\n[A]Amazing" },
          requestId: "request_update_source"
        });
        expect(updated).toMatchObject({
          chartId: "chart_created",
          chordProSource: "{key: A}\n[A]Amazing",
          createdAt: "2026-06-17T12:00:00.000Z",
          defaultKey: "G",
          updatedAt: "2026-06-17T12:00:00.000Z"
        });

        // list charts reflects the round-trip
        const all = await queryService.listCharts({
          actor: musician,
          input: {},
          requestId: "request_list"
        });
        expect(all).toHaveLength(1);
        expect(all[0]?.chordProSource).toBe("{key: A}\n[A]Amazing");
      } finally {
        database.close();
      }
    }
  );

  liveIt("skips already-applied Charts migrations on a second run", async () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");

    try {
      const clock = (): string => "2026-06-17T12:00:00.000Z";
      const migrationDatabase = wrapMigrationDatabase(database);
      await migrateChartsSqliteSchema({ clock, database: migrationDatabase });

      await expect(
        migrateChartsSqliteSchema({ clock, database: migrationDatabase })
      ).resolves.toEqual([
        { migrationId: "202606170003_charts_initial_schema", outcome: "skipped" }
      ]);
    } finally {
      database.close();
    }
  });
});
