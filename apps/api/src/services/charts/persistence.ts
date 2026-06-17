import type {
  ChartAnnotationPersistenceRecord,
  ChartArrangementPersistenceRecord,
  ChartPersistenceRecord,
  ChartsCommandPersistenceRepository,
  ChartsPersistenceReadOptions,
  ChartsPersistenceWriteOptions,
  ChartsQueryPersistenceRepository,
  MusicianChartPreferencePersistenceRecord,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
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

const CHART_STORAGE_SCHEMA_VERSION = "charts.v1";

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

export interface PersistenceBackedChartsServiceIds {
  readonly annotationId: () => string;
  readonly chartId: () => string;
}

export interface PersistenceBackedChartsServiceDependencies {
  readonly clock?: () => string;
  readonly commandRepository: ChartsCommandPersistenceRepository;
  readonly ids?: Partial<PersistenceBackedChartsServiceIds>;
  readonly queryRepository: ChartsQueryPersistenceRepository;
}

export interface PersistenceBackedChartsServicesAdapter {
  readonly commandService: ChartsCommandService;
  readonly queryService: ChartsQueryService;
}

export const createPersistenceBackedChartsServicesAdapter = (
  dependencies: PersistenceBackedChartsServiceDependencies
): PersistenceBackedChartsServicesAdapter => {
  const clock = dependencies.clock ?? ((): string => new Date().toISOString());
  const ids = createChartsIds(dependencies.ids);
  const { commandRepository, queryRepository } = dependencies;

  const requireTenantChart = async (
    chartId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ChartPersistenceRecord> => {
    const chart = await queryRepository.getChart({
      input: { chartId },
      options: toReadOptions(actor, requestId)
    });

    if (chart === null) {
      throw new ChartsDomainError(
        "CHART_NOT_FOUND",
        "This chart is no longer available on the server."
      );
    }

    return assertTenantScopedPersistenceChart(chart, actor.tenantId);
  };

  const queryService: ChartsQueryService = {
    listCharts: async (rawQuery): Promise<readonly Chart[]> => {
      const query = ListChartsQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const records = await queryRepository.listCharts({
        input:
          query.input.filter?.songRef === undefined
            ? {}
            : { filter: { songRef: query.input.filter.songRef } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainChart(
          assertTenantScopedPersistenceChart(record, query.actor.tenantId)
        )
      );
    },

    getChart: async (rawQuery): Promise<Chart | null> => {
      const query = GetChartQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const record = await queryRepository.getChart({
        input: { chartId: query.input.chartId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainChart(record);
    },

    listChartsForSong: async (rawQuery): Promise<readonly Chart[]> => {
      const query = ListChartsForSongQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const records = await queryRepository.listChartsForSong({
        input: { songRef: query.input.songRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainChart(
          assertTenantScopedPersistenceChart(record, query.actor.tenantId)
        )
      );
    },

    listChartArrangements: async (rawQuery): Promise<readonly ChartArrangement[]> => {
      const query = ListChartArrangementsQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const records = await queryRepository.listChartArrangements({
        input: { songRef: query.input.songRef },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainArrangement(
          assertTenantScopedPersistenceArrangement(record, query.actor.tenantId)
        )
      );
    },

    getMusicianChartPreference: async (
      rawQuery
    ): Promise<MusicianChartPreference | null> => {
      const query = GetMusicianChartPreferenceQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const record = await queryRepository.getMusicianChartPreference({
        input: { chartId: query.input.chartId, musicianId: query.actor.actorId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainPreference(record);
    },

    listChartAnnotations: async (rawQuery): Promise<readonly ChartAnnotation[]> => {
      const query = ListChartAnnotationsQuerySchema.parse(rawQuery);
      assertChartsQueryRole(query.actor);
      const records = await queryRepository.listChartAnnotations({
        input: { chartId: query.input.chartId, musicianId: query.actor.actorId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainAnnotation(
          assertTenantScopedPersistenceAnnotation(record, query.actor.tenantId)
        )
      );
    }
  };

  const commandService: ChartsCommandService = {
    saveChart: async (rawCommand): Promise<Chart> => {
      const command = SaveChartCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      const now = clock();
      const chartId = command.input.chartId ?? ids.chartId();
      const existing = await queryRepository.getChart({
        input: { chartId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new ChartsDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to access this chart."
        );
      }

      const record = await commandRepository.saveChart({
        input: {
          chartId,
          chordProSource: command.input.chordProSource,
          createdAt: existing?.createdAt ?? now,
          defaultKey: command.input.defaultKey,
          schemaVersion: CHART_STORAGE_SCHEMA_VERSION,
          songRef: command.input.songRef,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(command.input.arrangementRef !== undefined
            ? { arrangementRef: command.input.arrangementRef }
            : {}),
          ...(command.input.title !== undefined ? { title: command.input.title } : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainChart(
        assertTenantScopedPersistenceChart(record, command.actor.tenantId)
      );
    },

    updateChartSource: async (rawCommand): Promise<Chart> => {
      const command = UpdateChartSourceCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      await requireTenantChart(command.input.chartId, command.actor, command.requestId);
      const record = await commandRepository.updateChartSource({
        input: {
          chartId: command.input.chartId,
          chordProSource: command.input.chordProSource,
          ...(command.input.defaultKey !== undefined
            ? { defaultKey: command.input.defaultKey }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainChart(
        assertTenantScopedPersistenceChart(record, command.actor.tenantId)
      );
    },

    saveChartArrangement: async (rawCommand): Promise<ChartArrangement> => {
      const command = SaveChartArrangementCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      const record = await commandRepository.saveChartArrangement({
        input: {
          arrangementRef: command.input.arrangementRef,
          capo: command.input.capo,
          defaultKey: command.input.defaultKey,
          label: command.input.label,
          sectionOrder: command.input.sectionOrder,
          songRef: command.input.songRef,
          tenantId: command.actor.tenantId
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainArrangement(
        assertTenantScopedPersistenceArrangement(record, command.actor.tenantId)
      );
    },

    setMusicianChartPreference: async (
      rawCommand
    ): Promise<MusicianChartPreference> => {
      const command = SetMusicianChartPreferenceCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      assertOwningMusician(command.actor, command.input.musicianId);
      await requireTenantChart(command.input.chartId, command.actor, command.requestId);
      const record = await commandRepository.setMusicianChartPreference({
        input: {
          capo: command.input.capo,
          chartId: command.input.chartId,
          chordsVisible: command.input.chordsVisible,
          fontScale: command.input.fontScale,
          instrument: command.input.instrument,
          musicianId: command.input.musicianId,
          tenantId: command.actor.tenantId,
          transposeSemitones: command.input.transposeSemitones,
          updatedAt: clock()
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainPreference(
        assertTenantScopedPersistencePreference(record, command.actor.tenantId)
      );
    },

    addChartAnnotation: async (rawCommand): Promise<ChartAnnotation> => {
      const command = AddChartAnnotationCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      assertOwningMusician(command.actor, command.input.musicianId);
      await requireTenantChart(command.input.chartId, command.actor, command.requestId);
      const now = clock();
      const record = await commandRepository.addChartAnnotation({
        input: {
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
        },
        options: toWriteOptions(command.actor, command.requestId, "create")
      });

      return toDomainAnnotation(
        assertTenantScopedPersistenceAnnotation(record, command.actor.tenantId)
      );
    },

    updateChartAnnotation: async (rawCommand): Promise<ChartAnnotation> => {
      const command = UpdateChartAnnotationCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      assertOwningMusician(command.actor, command.input.musicianId);
      await requireTenantChart(command.input.chartId, command.actor, command.requestId);
      const existing = await findOwnedAnnotation(
        queryRepository,
        command.actor,
        command.requestId,
        command.input.chartId,
        command.input.annotationId
      );
      const record = await commandRepository.updateChartAnnotation({
        input: {
          annotationId: existing.annotationId,
          chartId: existing.chartId,
          createdAt: existing.createdAt,
          kind: command.input.kind,
          lineIndex: command.input.lineIndex,
          musicianId: existing.musicianId,
          sectionIndex: command.input.sectionIndex,
          tenantId: existing.tenantId,
          updatedAt: clock(),
          ...(command.input.color !== undefined ? { color: command.input.color } : {}),
          ...(command.input.note !== undefined ? { note: command.input.note } : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainAnnotation(
        assertTenantScopedPersistenceAnnotation(record, command.actor.tenantId)
      );
    },

    removeChartAnnotation: async (rawCommand): Promise<void> => {
      const command = RemoveChartAnnotationCommandSchema.parse(rawCommand);
      assertChartsCommandRole(command.actor);
      assertOwningMusician(command.actor, command.input.musicianId);
      await findOwnedAnnotation(
        queryRepository,
        command.actor,
        command.requestId,
        command.input.chartId,
        command.input.annotationId
      );
      await commandRepository.removeChartAnnotation({
        input: {
          annotationId: command.input.annotationId,
          chartId: command.input.chartId,
          musicianId: command.input.musicianId
        },
        options: toWriteOptions(command.actor, command.requestId, "destructive-confirmed")
      });
    }
  };

  return { commandService, queryService };
};

const findOwnedAnnotation = async (
  queryRepository: ChartsQueryPersistenceRepository,
  actor: AuthenticatedActor,
  requestId: string,
  chartId: string,
  annotationId: string
): Promise<ChartAnnotationPersistenceRecord> => {
  const annotations = await queryRepository.listChartAnnotations({
    input: { chartId, musicianId: actor.actorId },
    options: toReadOptions(actor, requestId)
  });
  const annotation = annotations.find(
    (candidate) =>
      candidate.annotationId === annotationId &&
      candidate.tenantId === actor.tenantId &&
      candidate.musicianId === actor.actorId
  );

  if (annotation === undefined) {
    throw new ChartsDomainError(
      "ANNOTATION_NOT_FOUND",
      "This annotation is no longer available on the server."
    );
  }

  return annotation;
};

const toDomainChart = (record: ChartPersistenceRecord): Chart =>
  ChartSchema.parse({
    chartId: record.chartId,
    chordProSource: record.chordProSource,
    createdAt: record.createdAt,
    defaultKey: record.defaultKey,
    songRef: record.songRef,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.arrangementRef !== undefined
      ? { arrangementRef: record.arrangementRef }
      : {}),
    ...(record.title !== undefined ? { title: record.title } : {})
  });

const toDomainArrangement = (
  record: ChartArrangementPersistenceRecord
): ChartArrangement =>
  ChartArrangementSchema.parse({
    arrangementRef: record.arrangementRef,
    capo: record.capo,
    defaultKey: record.defaultKey,
    label: record.label,
    sectionOrder: record.sectionOrder,
    songRef: record.songRef,
    tenantId: record.tenantId
  });

const toDomainAnnotation = (
  record: ChartAnnotationPersistenceRecord
): ChartAnnotation =>
  ChartAnnotationSchema.parse({
    annotationId: record.annotationId,
    chartId: record.chartId,
    createdAt: record.createdAt,
    kind: record.kind,
    lineIndex: record.lineIndex,
    musicianId: record.musicianId,
    sectionIndex: record.sectionIndex,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.color !== undefined ? { color: record.color } : {}),
    ...(record.note !== undefined ? { note: record.note } : {})
  });

const toDomainPreference = (
  record: MusicianChartPreferencePersistenceRecord
): MusicianChartPreference =>
  MusicianChartPreferenceSchema.parse({
    capo: record.capo,
    chartId: record.chartId,
    chordsVisible: record.chordsVisible,
    fontScale: record.fontScale,
    instrument: record.instrument,
    musicianId: record.musicianId,
    tenantId: record.tenantId,
    transposeSemitones: record.transposeSemitones,
    updatedAt: record.updatedAt
  });

const toReadOptions = (
  actor: AuthenticatedActor,
  requestId: string
): ChartsPersistenceReadOptions => ({
  context: {
    actorId: actor.actorId,
    requestId,
    tenantId: actor.tenantId
  }
});

const toWriteOptions = (
  actor: AuthenticatedActor,
  requestId: string,
  intent: RepositoryMutationIntent
): ChartsPersistenceWriteOptions => ({
  ...toReadOptions(actor, requestId),
  intent
});

const createChartsIds = (
  overrides: Partial<PersistenceBackedChartsServiceIds> | undefined
): PersistenceBackedChartsServiceIds => {
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

const assertTenantScopedPersistenceChart = (
  record: ChartPersistenceRecord,
  expectedTenantId: string
): ChartPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this chart."
    );
  }

  return record;
};

const assertTenantScopedPersistenceArrangement = (
  record: ChartArrangementPersistenceRecord,
  expectedTenantId: string
): ChartArrangementPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this arrangement."
    );
  }

  return record;
};

const assertTenantScopedPersistenceAnnotation = (
  record: ChartAnnotationPersistenceRecord,
  expectedTenantId: string
): ChartAnnotationPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this annotation."
    );
  }

  return record;
};

const assertTenantScopedPersistencePreference = (
  record: MusicianChartPreferencePersistenceRecord,
  expectedTenantId: string
): MusicianChartPreferencePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ChartsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this preference."
    );
  }

  return record;
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));
