import type { AuthenticatedActor } from "../../auth/index.js";
import {
  AddChartAnnotationCommandSchema,
  ChartAnnotationSchema,
  ChartArrangementSchema,
  ChartSchema,
  ChartsDomainError,
  GetChartQuerySchema,
  GetMusicianChartPreferenceQuerySchema,
  ListChartAnnotationsQuerySchema,
  ListChartArrangementsQuerySchema,
  ListChartsForSongQuerySchema,
  ListChartsQuerySchema,
  MusicianChartPreferenceSchema,
  RemoveChartAnnotationCommandSchema,
  SaveChartArrangementCommandSchema,
  SaveChartCommandSchema,
  SetMusicianChartPreferenceCommandSchema,
  UpdateChartAnnotationCommandSchema,
  UpdateChartSourceCommandSchema,
  type Chart,
  type ChartAnnotation,
  type ChartArrangement,
  type ChartsCommandService,
  type ChartsQueryService,
  type MusicianChartPreference
} from "../../domain/charts/index.js";

const chartsQueryRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
] as const;

const chartsCommandRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician"
] as const;

export interface InMemoryChartsServiceSeed {
  readonly annotations?: readonly ChartAnnotation[];
  readonly arrangements?: readonly ChartArrangement[];
  readonly charts?: readonly Chart[];
  readonly preferences?: readonly MusicianChartPreference[];
}

export interface InMemoryChartsServiceIds {
  readonly annotationId: () => string;
  readonly chartId: () => string;
}

export interface InMemoryChartsServiceDependencies {
  readonly clock?: () => string;
  readonly ids?: Partial<InMemoryChartsServiceIds>;
  readonly seed?: InMemoryChartsServiceSeed;
}

export interface InMemoryChartsServicesAdapter {
  readonly commandService: ChartsCommandService;
  readonly queryService: ChartsQueryService;
  readonly readAnnotations: () => readonly ChartAnnotation[];
  readonly readArrangements: () => readonly ChartArrangement[];
  readonly readCharts: () => readonly Chart[];
  readonly readPreferences: () => readonly MusicianChartPreference[];
}

const arrangementKey = (tenantId: string, arrangementRef: string): string =>
  `${tenantId}::${arrangementRef}`;

const annotationKey = (
  tenantId: string,
  chartId: string,
  musicianId: string,
  annotationId: string
): string => `${tenantId}::${chartId}::${musicianId}::${annotationId}`;

const preferenceKey = (
  tenantId: string,
  chartId: string,
  musicianId: string
): string => `${tenantId}::${chartId}::${musicianId}`;

export const createInMemoryChartsServicesAdapter = (
  dependencies: InMemoryChartsServiceDependencies = {}
): InMemoryChartsServicesAdapter => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const ids = createChartsIds(dependencies.ids);
  const charts = new Map<string, Chart>();
  const arrangements = new Map<string, ChartArrangement>();
  const annotations = new Map<string, ChartAnnotation>();
  const preferences = new Map<string, MusicianChartPreference>();

  dependencies.seed?.charts?.forEach((chart) => {
    const parsedChart = ChartSchema.parse(chart);
    charts.set(parsedChart.chartId, parsedChart);
  });

  dependencies.seed?.arrangements?.forEach((arrangement) => {
    const parsedArrangement = ChartArrangementSchema.parse(arrangement);
    arrangements.set(
      arrangementKey(parsedArrangement.tenantId, parsedArrangement.arrangementRef),
      parsedArrangement
    );
  });

  dependencies.seed?.annotations?.forEach((annotation) => {
    const parsedAnnotation = ChartAnnotationSchema.parse(annotation);
    annotations.set(
      annotationKey(
        parsedAnnotation.tenantId,
        parsedAnnotation.chartId,
        parsedAnnotation.musicianId,
        parsedAnnotation.annotationId
      ),
      parsedAnnotation
    );
  });

  dependencies.seed?.preferences?.forEach((preference) => {
    const parsedPreference = MusicianChartPreferenceSchema.parse(preference);
    preferences.set(
      preferenceKey(
        parsedPreference.tenantId,
        parsedPreference.chartId,
        parsedPreference.musicianId
      ),
      parsedPreference
    );
  });

  const findTenantChart = (chartId: string, actor: AuthenticatedActor): Chart => {
    const chart = charts.get(chartId);

    if (chart === undefined) {
      throw new ChartsDomainError(
        "CHART_NOT_FOUND",
        "This chart is no longer available on the server."
      );
    }

    if (chart.tenantId !== actor.tenantId) {
      throw new ChartsDomainError(
        "AUTHORIZATION_FAILED",
        "You are not allowed to access this chart."
      );
    }

    return chart;
  };

  const saveChartRecord = (chart: Chart): Chart => {
    const parsedChart = ChartSchema.parse(chart);
    charts.set(parsedChart.chartId, parsedChart);

    return parsedChart;
  };

  const queryService: ChartsQueryService = {
    listCharts: (rawQuery): Promise<readonly Chart[]> =>
      runChartsOperation((): readonly Chart[] => {
        const query = ListChartsQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);

        return [...charts.values()].filter(
          (chart) =>
            chart.tenantId === query.actor.tenantId &&
            (query.input.filter?.songRef === undefined ||
              chart.songRef === query.input.filter.songRef)
        );
      }),

    getChart: (rawQuery): Promise<Chart | null> =>
      runChartsOperation((): Chart | null => {
        const query = GetChartQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);
        const chart = charts.get(query.input.chartId);

        return chart?.tenantId === query.actor.tenantId ? chart : null;
      }),

    listChartsForSong: (rawQuery): Promise<readonly Chart[]> =>
      runChartsOperation((): readonly Chart[] => {
        const query = ListChartsForSongQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);

        return [...charts.values()].filter(
          (chart) =>
            chart.tenantId === query.actor.tenantId &&
            chart.songRef === query.input.songRef
        );
      }),

    listChartArrangements: (rawQuery): Promise<readonly ChartArrangement[]> =>
      runChartsOperation((): readonly ChartArrangement[] => {
        const query = ListChartArrangementsQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);

        return [...arrangements.values()].filter(
          (arrangement) =>
            arrangement.tenantId === query.actor.tenantId &&
            arrangement.songRef === query.input.songRef
        );
      }),

    getMusicianChartPreference: (rawQuery): Promise<MusicianChartPreference | null> =>
      runChartsOperation((): MusicianChartPreference | null => {
        const query = GetMusicianChartPreferenceQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);
        const preference = preferences.get(
          preferenceKey(query.actor.tenantId, query.input.chartId, query.actor.actorId)
        );

        return preference ?? null;
      }),

    listChartAnnotations: (rawQuery): Promise<readonly ChartAnnotation[]> =>
      runChartsOperation((): readonly ChartAnnotation[] => {
        const query = ListChartAnnotationsQuerySchema.parse(rawQuery);
        assertChartsQueryRole(query.actor);

        return [...annotations.values()].filter(
          (annotation) =>
            annotation.tenantId === query.actor.tenantId &&
            annotation.chartId === query.input.chartId &&
            annotation.musicianId === query.actor.actorId
        );
      })
  };

  const commandService: ChartsCommandService = {
    saveChart: (rawCommand): Promise<Chart> =>
      runChartsOperation((): Chart => {
        const command = SaveChartCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        const now = clock();
        const chartId = command.input.chartId ?? ids.chartId();
        const existingChart = charts.get(chartId);

        if (existingChart !== undefined && existingChart.tenantId !== command.actor.tenantId) {
          throw new ChartsDomainError(
            "AUTHORIZATION_FAILED",
            "You are not allowed to access this chart."
          );
        }

        return saveChartRecord(
          ChartSchema.parse({
            chartId,
            chordProSource: command.input.chordProSource,
            createdAt: existingChart?.createdAt ?? now,
            defaultKey: command.input.defaultKey,
            songRef: command.input.songRef,
            tenantId: command.actor.tenantId,
            updatedAt: now,
            ...(command.input.arrangementRef !== undefined
              ? { arrangementRef: command.input.arrangementRef }
              : {}),
            ...(command.input.title !== undefined ? { title: command.input.title } : {})
          })
        );
      }),

    updateChartSource: (rawCommand): Promise<Chart> =>
      runChartsOperation((): Chart => {
        const command = UpdateChartSourceCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        const chart = findTenantChart(command.input.chartId, command.actor);

        return saveChartRecord({
          ...chart,
          chordProSource: command.input.chordProSource,
          updatedAt: clock(),
          ...(command.input.defaultKey !== undefined
            ? { defaultKey: command.input.defaultKey }
            : {})
        });
      }),

    saveChartArrangement: (rawCommand): Promise<ChartArrangement> =>
      runChartsOperation((): ChartArrangement => {
        const command = SaveChartArrangementCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        const arrangement = ChartArrangementSchema.parse({
          arrangementRef: command.input.arrangementRef,
          capo: command.input.capo,
          defaultKey: command.input.defaultKey,
          label: command.input.label,
          sectionOrder: command.input.sectionOrder,
          songRef: command.input.songRef,
          tenantId: command.actor.tenantId
        });
        arrangements.set(
          arrangementKey(arrangement.tenantId, arrangement.arrangementRef),
          arrangement
        );

        return arrangement;
      }),

    setMusicianChartPreference: (rawCommand): Promise<MusicianChartPreference> =>
      runChartsOperation((): MusicianChartPreference => {
        const command = SetMusicianChartPreferenceCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        assertOwningMusician(command.actor, command.input.musicianId);
        findTenantChart(command.input.chartId, command.actor);
        const preference = MusicianChartPreferenceSchema.parse({
          capo: command.input.capo,
          chartId: command.input.chartId,
          chordsVisible: command.input.chordsVisible,
          fontScale: command.input.fontScale,
          instrument: command.input.instrument,
          musicianId: command.input.musicianId,
          tenantId: command.actor.tenantId,
          transposeSemitones: command.input.transposeSemitones,
          updatedAt: clock()
        });
        preferences.set(
          preferenceKey(preference.tenantId, preference.chartId, preference.musicianId),
          preference
        );

        return preference;
      }),

    addChartAnnotation: (rawCommand): Promise<ChartAnnotation> =>
      runChartsOperation((): ChartAnnotation => {
        const command = AddChartAnnotationCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        assertOwningMusician(command.actor, command.input.musicianId);
        findTenantChart(command.input.chartId, command.actor);
        const now = clock();
        const annotation = ChartAnnotationSchema.parse({
          annotationId: ids.annotationId(),
          chartId: command.input.chartId,
          createdAt: now,
          kind: command.input.kind,
          lineIndex: command.input.lineIndex,
          musicianId: command.input.musicianId,
          sectionIndex: command.input.sectionIndex,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.color !== undefined ? { color: command.input.color } : {}),
          ...(command.input.note !== undefined ? { note: command.input.note } : {})
        });
        annotations.set(
          annotationKey(
            annotation.tenantId,
            annotation.chartId,
            annotation.musicianId,
            annotation.annotationId
          ),
          annotation
        );

        return annotation;
      }),

    updateChartAnnotation: (rawCommand): Promise<ChartAnnotation> =>
      runChartsOperation((): ChartAnnotation => {
        const command = UpdateChartAnnotationCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        assertOwningMusician(command.actor, command.input.musicianId);
        findTenantChart(command.input.chartId, command.actor);
        const key = annotationKey(
          command.actor.tenantId,
          command.input.chartId,
          command.input.musicianId,
          command.input.annotationId
        );
        const existingAnnotation = annotations.get(key);

        if (existingAnnotation === undefined) {
          throw new ChartsDomainError(
            "ANNOTATION_NOT_FOUND",
            "This annotation is no longer available on the server."
          );
        }

        const annotation = ChartAnnotationSchema.parse({
          annotationId: existingAnnotation.annotationId,
          chartId: existingAnnotation.chartId,
          createdAt: existingAnnotation.createdAt,
          kind: command.input.kind,
          lineIndex: command.input.lineIndex,
          musicianId: existingAnnotation.musicianId,
          sectionIndex: command.input.sectionIndex,
          tenantId: existingAnnotation.tenantId,
          updatedAt: clock(),
          ...(command.input.color !== undefined ? { color: command.input.color } : {}),
          ...(command.input.note !== undefined ? { note: command.input.note } : {})
        });
        annotations.set(key, annotation);

        return annotation;
      }),

    removeChartAnnotation: (rawCommand): Promise<void> =>
      runChartsOperation((): void => {
        const command = RemoveChartAnnotationCommandSchema.parse(rawCommand);
        assertChartsCommandRole(command.actor);
        assertOwningMusician(command.actor, command.input.musicianId);
        const key = annotationKey(
          command.actor.tenantId,
          command.input.chartId,
          command.input.musicianId,
          command.input.annotationId
        );

        if (!annotations.has(key)) {
          throw new ChartsDomainError(
            "ANNOTATION_NOT_FOUND",
            "This annotation is no longer available on the server."
          );
        }

        annotations.delete(key);
      })
  };

  return {
    commandService,
    queryService,
    readAnnotations: (): readonly ChartAnnotation[] => [...annotations.values()],
    readArrangements: (): readonly ChartArrangement[] => [...arrangements.values()],
    readCharts: (): readonly Chart[] => [...charts.values()],
    readPreferences: (): readonly MusicianChartPreference[] => [...preferences.values()]
  };
};

const createChartsIds = (
  overrides: Partial<InMemoryChartsServiceIds> | undefined
): InMemoryChartsServiceIds => {
  let nextChartNumber = 1;
  let nextAnnotationNumber = 1;

  return {
    annotationId:
      overrides?.annotationId ??
      ((): string => {
        const value = `annotation_${String(nextAnnotationNumber)}`;
        nextAnnotationNumber += 1;
        return value;
      }),
    chartId:
      overrides?.chartId ??
      ((): string => {
        const value = `chart_${String(nextChartNumber)}`;
        nextChartNumber += 1;
        return value;
      })
  };
};

const assertChartsQueryRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, chartsQueryRoles)) {
    throw new Error("Actor is not allowed to read Charts resources.");
  }
};

const assertChartsCommandRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, chartsCommandRoles)) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to change this chart."
    );
  }
};

const assertOwningMusician = (actor: AuthenticatedActor, musicianId: string): void => {
  if (actor.actorId !== musicianId) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You can only change your own chart annotations and preferences."
    );
  }
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));

const runChartsOperation = <TResult>(
  operation: () => TResult | Promise<TResult>
): Promise<TResult> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Charts operation failed.")
    );
  }
};
