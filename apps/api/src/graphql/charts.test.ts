import { describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import {
  ChartArrangementSchema,
  ChartSchema,
  ChartsDomainError,
  MusicianChartPreferenceSchema,
  type Chart,
  type ChartArrangement,
  type ChartsCommandService,
  type ChartsQueryService,
  type MusicianChartPreference
} from "../domain/charts/index.js";
import {
  createChartsGraphqlResolvers,
  chartsGraphqlTypeDefs,
  type ChartsGraphqlContext
} from "./charts.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";
import { createPresenterGraphqlRequestHandler } from "./transport.js";

const graphqlContext: ChartsGraphqlContext = {
  actor: {
    actorId: "musician_1",
    roles: ["musician"],
    tenantId: "tenant_1"
  },
  requestId: "request_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

const chart: Chart = ChartSchema.parse({
  chartId: "chart_1",
  chordProSource: "{title: Amazing Grace}\n[G]Amazing [C]grace",
  createdAt: timestamp,
  defaultKey: "G",
  songRef: "song_1",
  tenantId: "tenant_1",
  title: "Amazing Grace",
  updatedAt: timestamp
});

const arrangement: ChartArrangement = ChartArrangementSchema.parse({
  arrangementRef: "arrangement_1",
  capo: 2,
  defaultKey: "G",
  label: "Acoustic",
  sectionOrder: ["intro", "verse"],
  songRef: "song_1",
  tenantId: "tenant_1"
});

const preference: MusicianChartPreference = MusicianChartPreferenceSchema.parse({
  capo: 0,
  chartId: "chart_1",
  chordsVisible: true,
  fontScale: 1,
  instrument: "guitar",
  musicianId: "musician_1",
  tenantId: "tenant_1",
  transposeSemitones: 0,
  updatedAt: timestamp
});

const createChartsQueryService = (
  overrides: Partial<ChartsQueryService> = {}
): ChartsQueryService => ({
  getChart: vi.fn<ChartsQueryService["getChart"]>(() => Promise.resolve(chart)),
  getMusicianChartPreference: vi.fn<ChartsQueryService["getMusicianChartPreference"]>(
    () => Promise.resolve(preference)
  ),
  listChartAnnotations: vi.fn<ChartsQueryService["listChartAnnotations"]>(() =>
    Promise.resolve([])
  ),
  listChartArrangements: vi.fn<ChartsQueryService["listChartArrangements"]>(() =>
    Promise.resolve([arrangement])
  ),
  listCharts: vi.fn<ChartsQueryService["listCharts"]>(() => Promise.resolve([chart])),
  listChartsForSong: vi.fn<ChartsQueryService["listChartsForSong"]>(() =>
    Promise.resolve([chart])
  ),
  ...overrides
});

const createChartsCommandService = (
  overrides: Partial<ChartsCommandService> = {}
): ChartsCommandService => ({
  addChartAnnotation: vi.fn<ChartsCommandService["addChartAnnotation"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  removeChartAnnotation: vi.fn<ChartsCommandService["removeChartAnnotation"]>(() =>
    Promise.resolve()
  ),
  saveChart: vi.fn<ChartsCommandService["saveChart"]>(() => Promise.resolve(chart)),
  saveChartArrangement: vi.fn<ChartsCommandService["saveChartArrangement"]>(() =>
    Promise.resolve(arrangement)
  ),
  setMusicianChartPreference: vi.fn<ChartsCommandService["setMusicianChartPreference"]>(
    () => Promise.resolve(preference)
  ),
  updateChartAnnotation: vi.fn<ChartsCommandService["updateChartAnnotation"]>(() =>
    Promise.reject(new Error("not used"))
  ),
  updateChartSource: vi.fn<ChartsCommandService["updateChartSource"]>(() =>
    Promise.resolve(chart)
  ),
  ...overrides
});

describe("chartsGraphqlTypeDefs", () => {
  it("declares the planned Charts query contract", () => {
    expect(chartsGraphqlTypeDefs).toContain("charts(filter: ChartsFilterInput): [Chart!]!");
    expect(chartsGraphqlTypeDefs).toContain("chart(id: ID!): Chart");
    expect(chartsGraphqlTypeDefs).toContain("chartsForSong(songRef: ID!): [Chart!]!");
    expect(chartsGraphqlTypeDefs).toContain(
      "chartArrangements(songRef: ID!): [ChartArrangement!]!"
    );
    expect(chartsGraphqlTypeDefs).toContain(
      "musicianChartPreference(chartId: ID!): MusicianChartPreference"
    );
    expect(chartsGraphqlTypeDefs).toContain(
      "chartAnnotations(chartId: ID!): [ChartAnnotation!]!"
    );
  });

  it("declares the planned Charts mutation contract", () => {
    expect(chartsGraphqlTypeDefs).toContain("saveChart(input: SaveChartInput!): Chart!");
    expect(chartsGraphqlTypeDefs).toContain(
      "updateChartSource(input: UpdateChartSourceInput!): Chart!"
    );
    expect(chartsGraphqlTypeDefs).toContain(
      "saveChartArrangement(input: SaveChartArrangementInput!): ChartArrangement!"
    );
    expect(chartsGraphqlTypeDefs).toContain(
      "addChartAnnotation(input: AddChartAnnotationInput!): ChartAnnotation!"
    );
    expect(chartsGraphqlTypeDefs).toContain(
      "removeChartAnnotation(input: RemoveChartAnnotationInput!): Boolean!"
    );
  });

  it("keeps licensing credentials and catalog ownership out of Charts v1", () => {
    expect(chartsGraphqlTypeDefs).not.toContain("ccliToken");
    expect(chartsGraphqlTypeDefs).not.toContain("songSelectCredential");
    expect(chartsGraphqlTypeDefs).not.toContain("createSong");
  });
});

describe("createChartsGraphqlResolvers", () => {
  it("delegates chartsForSong with actor and request scope", async () => {
    const listChartsForSong = vi.fn<ChartsQueryService["listChartsForSong"]>(() =>
      Promise.resolve([chart])
    );
    const resolvers = createChartsGraphqlResolvers({
      chartsCommandService: createChartsCommandService(),
      chartsQueryService: createChartsQueryService({ listChartsForSong })
    });

    await expect(
      resolvers.Query.chartsForSong(undefined, { songRef: "song_1" }, graphqlContext)
    ).resolves.toEqual([chart]);

    expect(listChartsForSong).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: { songRef: "song_1" },
      requestId: "request_1"
    });
  });

  it("delegates saveChart to the Charts command service", async () => {
    const saveChart = vi.fn<ChartsCommandService["saveChart"]>(() =>
      Promise.resolve(chart)
    );
    const resolvers = createChartsGraphqlResolvers({
      chartsCommandService: createChartsCommandService({ saveChart }),
      chartsQueryService: createChartsQueryService()
    });

    await expect(
      resolvers.Mutation.saveChart(
        undefined,
        {
          input: {
            chordProSource: "[G]Amazing [C]grace",
            defaultKey: "G",
            songRef: "song_1",
            title: "Amazing Grace"
          }
        },
        graphqlContext
      )
    ).resolves.toEqual(chart);

    expect(saveChart).toHaveBeenCalledWith({
      actor: graphqlContext.actor,
      input: {
        chordProSource: "[G]Amazing [C]grace",
        defaultKey: "G",
        songRef: "song_1",
        title: "Amazing Grace"
      },
      requestId: "request_1"
    });
  });

  it("requires explicit confirmation for destructive annotation removal", async () => {
    const removeChartAnnotation = vi.fn<ChartsCommandService["removeChartAnnotation"]>(
      () => Promise.resolve()
    );
    const resolvers = createChartsGraphqlResolvers({
      chartsCommandService: createChartsCommandService({ removeChartAnnotation }),
      chartsQueryService: createChartsQueryService()
    });

    await expect(
      resolvers.Mutation.removeChartAnnotation(
        undefined,
        {
          input: {
            annotationId: "annotation_1",
            chartId: "chart_1",
            musicianId: "musician_1"
          }
        },
        graphqlContext
      )
    ).rejects.toThrow();

    expect(removeChartAnnotation).not.toHaveBeenCalled();
  });

  it("propagates service errors without replacing them with vendor details", async () => {
    const listCharts = vi.fn<ChartsQueryService["listCharts"]>(() =>
      Promise.reject(new Error("Charts store unavailable."))
    );
    const resolvers = createChartsGraphqlResolvers({
      chartsCommandService: createChartsCommandService(),
      chartsQueryService: createChartsQueryService({ listCharts })
    });

    await expect(
      resolvers.Query.charts(undefined, {}, graphqlContext)
    ).rejects.toThrow("Charts store unavailable.");
  });
});

const actor: AuthenticatedActor = {
  actorId: "musician_1",
  roles: ["musician"],
  tenantId: "tenant_1"
};

const authBoundary: AuthBoundary = {
  resolveActor: (authHeader) =>
    authHeader === "Bearer good-token"
      ? Promise.resolve(actor)
      : Promise.reject(new Error("invalid token"))
};

const presenterStub = {
  presenterCommandService: {
    addSlide: () => Promise.reject(new Error("not used")),
    applyPresenterTheme: () => Promise.reject(new Error("not used")),
    createPresentationFromService: () => Promise.reject(new Error("not used")),
    removeSlide: () => Promise.reject(new Error("not used")),
    reorderSlides: () => Promise.reject(new Error("not used")),
    setOutputTarget: () => Promise.reject(new Error("not used")),
    updatePresentation: () => Promise.reject(new Error("not used")),
    updateSlide: () => Promise.reject(new Error("not used"))
  },
  presenterQueryService: {
    outputTargets: () => Promise.reject(new Error("not used")),
    presentation: () => Promise.reject(new Error("not used")),
    presentationForService: () => Promise.reject(new Error("not used")),
    presentations: () => Promise.reject(new Error("not used")),
    presenterThemes: () => Promise.reject(new Error("not used"))
  }
} as const;

describe("Charts GraphQL transport", () => {
  it("executes a charts query for an authenticated actor", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        charts: {
          chartsCommandService: createChartsCommandService(),
          chartsQueryService: createChartsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query: "{ chartsForSong(songRef: \"song_1\") { chartId songRef } }"
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { chartsForSong: [{ chartId: "chart_1", songRef: "song_1" }] }
    });
  });

  it("surfaces a typed Charts domain error as a conflict code with a safe message", async () => {
    const handler = createPresenterGraphqlRequestHandler({
      authBoundary,
      schema: createPresenterGraphqlSchema({
        ...presenterStub,
        charts: {
          chartsCommandService: createChartsCommandService({
            updateChartSource: () =>
              Promise.reject(
                new ChartsDomainError(
                  "CHART_NOT_FOUND",
                  "This chart is no longer available on the server."
                )
              )
          }),
          chartsQueryService: createChartsQueryService()
        }
      })
    });

    const response = await handler({
      body: {
        query:
          "mutation updateChartSource($input: UpdateChartSourceInput!) { updateChartSource(input: $input) { chartId } }",
        variables: { input: { chartId: "chart_missing", chordProSource: "[A]Edited" } }
      },
      headers: { Authorization: "Bearer good-token", "x-request-id": "request_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]).toEqual({
      extensions: { code: "CHART_NOT_FOUND" },
      message: "This chart is no longer available on the server."
    });
  });
});
