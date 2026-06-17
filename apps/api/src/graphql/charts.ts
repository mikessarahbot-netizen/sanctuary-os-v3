import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import {
  AddChartAnnotationCommandSchema,
  GetChartQuerySchema,
  GetMusicianChartPreferenceQuerySchema,
  ListChartAnnotationsQuerySchema,
  ListChartArrangementsQuerySchema,
  ListChartsForSongQuerySchema,
  ListChartsQuerySchema,
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
} from "../domain/charts/index.js";

const NonEmptyStringSchema = z.string().min(1);

export const chartsGraphqlTypeDefs = /* GraphQL */ `
  enum ChartAnnotationKind {
    highlight
    note
    repeat
    section_marker
  }

  enum ChartInstrument {
    guitar
    piano
    bass
    vocal
    other
  }

  type Chart {
    arrangementRef: ID
    chartId: ID!
    chordProSource: String!
    createdAt: DateTime!
    defaultKey: String!
    songRef: ID!
    tenantId: ID!
    title: String
    updatedAt: DateTime!
  }

  type ChartArrangement {
    arrangementRef: ID!
    capo: Int!
    defaultKey: String!
    label: String!
    sectionOrder: [String!]!
    songRef: ID!
    tenantId: ID!
  }

  type ChartAnnotation {
    annotationId: ID!
    chartId: ID!
    color: String
    createdAt: DateTime!
    kind: ChartAnnotationKind!
    lineIndex: Int!
    musicianId: ID!
    note: String
    sectionIndex: Int!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type MusicianChartPreference {
    capo: Int!
    chartId: ID!
    chordsVisible: Boolean!
    fontScale: Float!
    instrument: ChartInstrument!
    musicianId: ID!
    tenantId: ID!
    transposeSemitones: Int!
    updatedAt: DateTime!
  }

  input ChartsFilterInput {
    songRef: ID
  }

  input SaveChartInput {
    arrangementRef: ID
    chartId: ID
    chordProSource: String!
    defaultKey: String!
    songRef: ID!
    title: String
  }

  input UpdateChartSourceInput {
    chartId: ID!
    chordProSource: String!
    defaultKey: String
  }

  input SaveChartArrangementInput {
    arrangementRef: ID!
    capo: Int!
    defaultKey: String!
    label: String!
    sectionOrder: [String!]!
    songRef: ID!
  }

  input SetMusicianChartPreferenceInput {
    capo: Int!
    chartId: ID!
    chordsVisible: Boolean!
    fontScale: Float!
    instrument: ChartInstrument!
    musicianId: ID!
    transposeSemitones: Int!
  }

  input AddChartAnnotationInput {
    chartId: ID!
    color: String
    kind: ChartAnnotationKind!
    lineIndex: Int!
    musicianId: ID!
    note: String
    sectionIndex: Int!
  }

  input UpdateChartAnnotationInput {
    annotationId: ID!
    chartId: ID!
    color: String
    kind: ChartAnnotationKind!
    lineIndex: Int!
    musicianId: ID!
    note: String
    sectionIndex: Int!
  }

  input ChartConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input RemoveChartAnnotationInput {
    annotationId: ID!
    chartId: ID!
    confirmationIntent: ChartConfirmationIntentInput!
    musicianId: ID!
  }

  extend type Query {
    charts(filter: ChartsFilterInput): [Chart!]!
    chart(id: ID!): Chart
    chartsForSong(songRef: ID!): [Chart!]!
    chartArrangements(songRef: ID!): [ChartArrangement!]!
    musicianChartPreference(chartId: ID!): MusicianChartPreference
    chartAnnotations(chartId: ID!): [ChartAnnotation!]!
  }

  extend type Mutation {
    saveChart(input: SaveChartInput!): Chart!
    updateChartSource(input: UpdateChartSourceInput!): Chart!
    saveChartArrangement(input: SaveChartArrangementInput!): ChartArrangement!
    setMusicianChartPreference(
      input: SetMusicianChartPreferenceInput!
    ): MusicianChartPreference!
    addChartAnnotation(input: AddChartAnnotationInput!): ChartAnnotation!
    updateChartAnnotation(input: UpdateChartAnnotationInput!): ChartAnnotation!
    removeChartAnnotation(input: RemoveChartAnnotationInput!): Boolean!
  }
`;

export const ChartsGraphqlContextSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

const GraphqlInputArgsSchema = z
  .object({
    input: z.unknown()
  })
  .strict();

export type ChartsGraphqlContext = z.infer<typeof ChartsGraphqlContextSchema>;

export interface ChartsGraphqlResolverDependencies {
  readonly chartsCommandService: ChartsCommandService;
  readonly chartsQueryService: ChartsQueryService;
}

export interface ChartsQueryResolvers {
  readonly charts: GraphqlQueryResolver<readonly Chart[]>;
  readonly chart: GraphqlQueryResolver<Chart | null>;
  readonly chartsForSong: GraphqlQueryResolver<readonly Chart[]>;
  readonly chartArrangements: GraphqlQueryResolver<readonly ChartArrangement[]>;
  readonly musicianChartPreference: GraphqlQueryResolver<MusicianChartPreference | null>;
  readonly chartAnnotations: GraphqlQueryResolver<readonly ChartAnnotation[]>;
}

export interface ChartsMutationResolvers {
  readonly saveChart: GraphqlMutationResolver<Chart>;
  readonly updateChartSource: GraphqlMutationResolver<Chart>;
  readonly saveChartArrangement: GraphqlMutationResolver<ChartArrangement>;
  readonly setMusicianChartPreference: GraphqlMutationResolver<MusicianChartPreference>;
  readonly addChartAnnotation: GraphqlMutationResolver<ChartAnnotation>;
  readonly updateChartAnnotation: GraphqlMutationResolver<ChartAnnotation>;
  readonly removeChartAnnotation: GraphqlMutationResolver<boolean>;
}

export interface ChartsGraphqlResolvers {
  readonly Query: ChartsQueryResolvers;
  readonly Mutation: ChartsMutationResolvers;
}

type GraphqlQueryResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: ChartsGraphqlContext
) => Promise<TResult>;

type GraphqlMutationResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: ChartsGraphqlContext
) => Promise<TResult>;

export const createChartsGraphqlResolvers = (
  dependencies: ChartsGraphqlResolverDependencies
): ChartsGraphqlResolvers => ({
  Query: {
    charts: async (_parent, args, context): Promise<readonly Chart[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.listCharts(
        ListChartsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    chart: async (_parent, args, context): Promise<Chart | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          id: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.getChart(
        GetChartQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            chartId: queryArgs.id
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    chartsForSong: async (_parent, args, context): Promise<readonly Chart[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          songRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.listChartsForSong(
        ListChartsForSongQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            songRef: queryArgs.songRef
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    chartArrangements: async (
      _parent,
      args,
      context
    ): Promise<readonly ChartArrangement[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          songRef: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.listChartArrangements(
        ListChartArrangementsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            songRef: queryArgs.songRef
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    musicianChartPreference: async (
      _parent,
      args,
      context
    ): Promise<MusicianChartPreference | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          chartId: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.getMusicianChartPreference(
        GetMusicianChartPreferenceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            chartId: queryArgs.chartId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    chartAnnotations: async (
      _parent,
      args,
      context
    ): Promise<readonly ChartAnnotation[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          chartId: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.chartsQueryService.listChartAnnotations(
        ListChartAnnotationsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            chartId: queryArgs.chartId
          },
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Mutation: {
    saveChart: async (_parent, args, context): Promise<Chart> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.saveChart(
        SaveChartCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateChartSource: async (_parent, args, context): Promise<Chart> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.updateChartSource(
        UpdateChartSourceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    saveChartArrangement: async (_parent, args, context): Promise<ChartArrangement> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.saveChartArrangement(
        SaveChartArrangementCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    setMusicianChartPreference: async (
      _parent,
      args,
      context
    ): Promise<MusicianChartPreference> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.setMusicianChartPreference(
        SetMusicianChartPreferenceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    addChartAnnotation: async (_parent, args, context): Promise<ChartAnnotation> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.addChartAnnotation(
        AddChartAnnotationCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateChartAnnotation: async (_parent, args, context): Promise<ChartAnnotation> => {
      const graphqlContext = parseContext(context);

      return dependencies.chartsCommandService.updateChartAnnotation(
        UpdateChartAnnotationCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    removeChartAnnotation: async (_parent, args, context): Promise<boolean> => {
      const graphqlContext = parseContext(context);

      await dependencies.chartsCommandService.removeChartAnnotation(
        RemoveChartAnnotationCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );

      return true;
    }
  }
});

const parseContext = (context: ChartsGraphqlContext): ChartsGraphqlContext =>
  ChartsGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;
