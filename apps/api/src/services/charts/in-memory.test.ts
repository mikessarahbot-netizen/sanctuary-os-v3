import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  ChartAnnotationSchema,
  ChartSchema,
  isChartsDomainError,
  type Chart,
  type ChartAnnotation,
  type ChartsDomainErrorCode
} from "../../domain/charts/index.js";
import { createChartsGraphqlResolvers } from "../../graphql/charts.js";
import { createInMemoryChartsServicesAdapter } from "./in-memory.js";

const musician: AuthenticatedActor = {
  actorId: "musician_1",
  roles: ["musician"],
  tenantId: "tenant_1"
};

const otherMusician: AuthenticatedActor = {
  actorId: "musician_2",
  roles: ["musician"],
  tenantId: "tenant_1"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const chart: Chart = ChartSchema.parse({
  chartId: "chart_1",
  chordProSource: "{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace",
  createdAt: timestamp,
  defaultKey: "G",
  songRef: "song_1",
  tenantId: "tenant_1",
  title: "Amazing Grace",
  updatedAt: timestamp
});

const annotation: ChartAnnotation = ChartAnnotationSchema.parse({
  annotationId: "annotation_1",
  chartId: "chart_1",
  createdAt: timestamp,
  kind: "highlight",
  lineIndex: 0,
  musicianId: "musician_1",
  sectionIndex: 0,
  tenantId: "tenant_1",
  updatedAt: timestamp
});

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

describe("createInMemoryChartsServicesAdapter", () => {
  it("creates charts with deterministic IDs and tenant scope", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      clock: () => timestamp,
      ids: {
        chartId: () => "chart_created"
      }
    });

    await expect(
      adapter.commandService.saveChart({
        actor: musician,
        input: {
          chordProSource: "{title: New}\n[G]New",
          defaultKey: "G",
          songRef: "song_created",
          title: "New Chart"
        },
        requestId: "request_create"
      })
    ).resolves.toMatchObject({
      chartId: "chart_created",
      songRef: "song_created",
      tenantId: "tenant_1",
      title: "New Chart"
    });

    expect(adapter.readCharts()).toHaveLength(1);
  });

  it("keeps reads tenant-scoped and returns null for cross-tenant chart lookups", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

    await expect(
      adapter.queryService.getChart({
        actor: otherTenantLeader,
        input: { chartId: "chart_1" },
        requestId: "request_other"
      })
    ).resolves.toBeNull();

    await expect(
      adapter.queryService.listCharts({
        actor: otherTenantLeader,
        input: {},
        requestId: "request_other"
      })
    ).resolves.toEqual([]);
  });

  it("rejects cross-tenant chart source updates with AUTHORIZATION_FAILED", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

    await expectDomainErrorCode(
      adapter.commandService.updateChartSource({
        actor: otherTenantLeader,
        input: {
          chartId: "chart_1",
          chordProSource: "[A]Edited"
        },
        requestId: "request_cross_tenant"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("throws CHART_NOT_FOUND when updating a chart source for an unknown chart", async () => {
    const adapter = createInMemoryChartsServicesAdapter();

    await expectDomainErrorCode(
      adapter.commandService.updateChartSource({
        actor: musician,
        input: {
          chartId: "chart_missing",
          chordProSource: "[A]Edited"
        },
        requestId: "request_missing"
      }),
      "CHART_NOT_FOUND"
    );
  });

  it("updates the chart source and default key in place", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      clock: () => "2026-06-21T15:00:00.000Z",
      seed: { charts: [chart] }
    });

    await expect(
      adapter.commandService.updateChartSource({
        actor: musician,
        input: {
          chartId: "chart_1",
          chordProSource: "{key: A}\n[A]Amazing [D]grace",
          defaultKey: "A"
        },
        requestId: "request_update_source"
      })
    ).resolves.toMatchObject({
      chartId: "chart_1",
      chordProSource: "{key: A}\n[A]Amazing [D]grace",
      createdAt: timestamp,
      defaultKey: "A",
      updatedAt: "2026-06-21T15:00:00.000Z"
    });
  });

  it("rejects viewer mutations in the service layer", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

    await expect(
      adapter.queryService.getChart({
        actor: viewer,
        input: { chartId: "chart_1" },
        requestId: "request_viewer_read"
      })
    ).resolves.toEqual(chart);

    await expectDomainErrorCode(
      adapter.commandService.updateChartSource({
        actor: viewer,
        input: {
          chartId: "chart_1",
          chordProSource: "[A]Edited"
        },
        requestId: "request_viewer_write"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("round-trips arrangements scoped to the song and tenant", async () => {
    const adapter = createInMemoryChartsServicesAdapter();

    await adapter.commandService.saveChartArrangement({
      actor: musician,
      input: {
        arrangementRef: "arrangement_1",
        capo: 2,
        defaultKey: "G",
        label: "Acoustic",
        sectionOrder: ["intro", "verse", "chorus"],
        songRef: "song_1"
      },
      requestId: "request_arrangement"
    });

    await expect(
      adapter.queryService.listChartArrangements({
        actor: musician,
        input: { songRef: "song_1" },
        requestId: "request_list_arrangements"
      })
    ).resolves.toMatchObject([
      {
        arrangementRef: "arrangement_1",
        capo: 2,
        label: "Acoustic",
        songRef: "song_1",
        tenantId: "tenant_1"
      }
    ]);

    await expect(
      adapter.queryService.listChartArrangements({
        actor: otherTenantLeader,
        input: { songRef: "song_1" },
        requestId: "request_other_arrangements"
      })
    ).resolves.toEqual([]);
  });

  it("round-trips a per-musician chart preference scoped to the owner", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      clock: () => timestamp,
      seed: { charts: [chart] }
    });

    await adapter.commandService.setMusicianChartPreference({
      actor: musician,
      input: {
        capo: 0,
        chartId: "chart_1",
        chordsVisible: true,
        fontScale: 1.25,
        instrument: "guitar",
        musicianId: "musician_1",
        transposeSemitones: -2
      },
      requestId: "request_preference"
    });

    await expect(
      adapter.queryService.getMusicianChartPreference({
        actor: musician,
        input: { chartId: "chart_1" },
        requestId: "request_get_preference"
      })
    ).resolves.toMatchObject({
      chartId: "chart_1",
      fontScale: 1.25,
      instrument: "guitar",
      musicianId: "musician_1",
      transposeSemitones: -2
    });

    await expect(
      adapter.queryService.getMusicianChartPreference({
        actor: otherMusician,
        input: { chartId: "chart_1" },
        requestId: "request_other_preference"
      })
    ).resolves.toBeNull();
  });

  it("prevents a musician from writing another musician's preference", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

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

  it("adds, updates, and removes per-musician annotations", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      clock: () => timestamp,
      ids: {
        annotationId: () => "annotation_created"
      },
      seed: { charts: [chart] }
    });

    await expect(
      adapter.commandService.addChartAnnotation({
        actor: musician,
        input: {
          chartId: "chart_1",
          color: "#ffaa00",
          kind: "highlight",
          lineIndex: 1,
          musicianId: "musician_1",
          sectionIndex: 0
        },
        requestId: "request_add_annotation"
      })
    ).resolves.toMatchObject({
      annotationId: "annotation_created",
      chartId: "chart_1",
      color: "#ffaa00",
      kind: "highlight",
      musicianId: "musician_1"
    });

    await expect(
      adapter.commandService.updateChartAnnotation({
        actor: musician,
        input: {
          annotationId: "annotation_created",
          chartId: "chart_1",
          kind: "note",
          lineIndex: 1,
          musicianId: "musician_1",
          note: "Hold this chord",
          sectionIndex: 0
        },
        requestId: "request_update_annotation"
      })
    ).resolves.toMatchObject({
      annotationId: "annotation_created",
      kind: "note",
      note: "Hold this chord"
    });

    await expect(
      adapter.commandService.removeChartAnnotation({
        actor: musician,
        input: {
          annotationId: "annotation_created",
          chartId: "chart_1",
          confirmationIntent: {
            confirmed: true,
            reason: "No longer needed"
          },
          musicianId: "musician_1"
        },
        requestId: "request_remove_annotation"
      })
    ).resolves.toBeUndefined();

    await expect(
      adapter.queryService.listChartAnnotations({
        actor: musician,
        input: { chartId: "chart_1" },
        requestId: "request_list_annotations"
      })
    ).resolves.toEqual([]);
  });

  it("rejects note annotations without note text via the validation contract", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

    await expect(
      adapter.commandService.addChartAnnotation({
        actor: musician,
        input: {
          chartId: "chart_1",
          kind: "note",
          lineIndex: 0,
          musicianId: "musician_1",
          sectionIndex: 0
        },
        requestId: "request_invalid_annotation"
      })
    ).rejects.toThrow("Chart note annotations require note text.");
  });

  it("keeps another musician's annotations isolated on read", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { annotations: [annotation], charts: [chart] }
    });

    await expect(
      adapter.queryService.listChartAnnotations({
        actor: musician,
        input: { chartId: "chart_1" },
        requestId: "request_owner_annotations"
      })
    ).resolves.toHaveLength(1);

    await expect(
      adapter.queryService.listChartAnnotations({
        actor: otherMusician,
        input: { chartId: "chart_1" },
        requestId: "request_foreign_annotations"
      })
    ).resolves.toEqual([]);
  });

  it("throws ANNOTATION_NOT_FOUND when removing an unknown annotation", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      seed: { charts: [chart] }
    });

    await expectDomainErrorCode(
      adapter.commandService.removeChartAnnotation({
        actor: musician,
        input: {
          annotationId: "annotation_missing",
          chartId: "chart_1",
          confirmationIntent: {
            confirmed: true,
            reason: "Cleanup"
          },
          musicianId: "musician_1"
        },
        requestId: "request_remove_missing"
      }),
      "ANNOTATION_NOT_FOUND"
    );
  });

  it("supports Charts GraphQL resolver composition through in-memory services", async () => {
    const adapter = createInMemoryChartsServicesAdapter({
      clock: () => timestamp,
      seed: { charts: [chart] }
    });
    const resolvers = createChartsGraphqlResolvers({
      chartsCommandService: adapter.commandService,
      chartsQueryService: adapter.queryService
    });

    await expect(
      resolvers.Query.chartsForSong(
        undefined,
        { songRef: "song_1" },
        { actor: musician, requestId: "request_graphql_query" }
      )
    ).resolves.toMatchObject([{ chartId: "chart_1", songRef: "song_1" }]);

    await expect(
      resolvers.Mutation.updateChartSource(
        undefined,
        {
          input: {
            chartId: "chart_1",
            chordProSource: "[A]Edited"
          }
        },
        { actor: musician, requestId: "request_graphql_mutation" }
      )
    ).resolves.toMatchObject({
      chartId: "chart_1",
      chordProSource: "[A]Edited"
    });
  });
});
