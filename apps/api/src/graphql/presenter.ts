import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import type {
  OutputTarget,
  Presentation,
  PresenterTheme,
  Slide
} from "../domain/presenter/index.js";
import type {
  PresenterCommandService,
  PresenterQueryService
} from "../services/presenter/index.js";
import {
  AddPresenterSlideCommandSchema,
  ApplyPresenterThemeCommandSchema,
  CreatePresentationFromServiceCommandSchema,
  GetPresenterPresentationForServiceQuerySchema,
  GetPresenterPresentationQuerySchema,
  ListPresenterOutputTargetsQuerySchema,
  ListPresenterPresentationsQuerySchema,
  ListPresenterThemesQuerySchema,
  RemovePresenterSlideCommandSchema,
  ReorderPresenterSlidesCommandSchema,
  SetPresenterOutputTargetCommandSchema,
  UpdatePresentationCommandSchema,
  UpdatePresenterSlideCommandSchema
} from "../services/presenter/index.js";

const NonEmptyStringSchema = z.string().min(1);

export const presenterGraphqlTypeDefs = /* GraphQL */ `
  scalar DateTime

  enum PresenterSlideBlockKind {
    text
    scripture
    lyric
    image
    video
    lower_third
  }

  enum PresenterSlideLayout {
    title
    content
    scripture
    lyrics
    media
    lower_third
  }

  enum PresenterOutputTargetKind {
    main
    confidence
    stage_display
  }

  type PresenterScriptureVerse {
    chapter: Int!
    text: String!
    verseEnd: Int
    verseStart: Int!
  }

  type PresenterScripturePassage {
    displayGrouping: String!
    passageId: ID!
    referenceText: String!
    tenantId: ID!
    translationRef: String!
    verses: [PresenterScriptureVerse!]!
  }

  type PresenterSlideBlock {
    blockId: ID!
    kind: PresenterSlideBlockKind!
  }

  type PresenterSlide {
    backgroundRef: ID
    blocks: [PresenterSlideBlock!]!
    layout: PresenterSlideLayout!
    notes: String
    order: Int!
    presentationId: ID!
    serviceItemId: ID
    slideId: ID!
    tenantId: ID!
    timingHintSeconds: Int
    title: String
  }

  type PresenterMediaCue {
    label: String!
    mediaAssetRef: ID!
    mediaCueId: ID!
    playbackHint: String!
    presentationId: ID!
    slideId: ID!
    tenantId: ID!
  }

  type PresenterOutputTarget {
    confidenceOutputEnabled: Boolean!
    displayName: String!
    outputTargetId: ID!
    safeBlanked: Boolean!
    targetKind: PresenterOutputTargetKind!
    tenantId: ID!
    windowRef: String!
  }

  type PresenterTheme {
    name: String!
    tenantId: ID!
    themeId: ID!
  }

  type Presentation {
    createdAt: DateTime!
    mediaCues: [PresenterMediaCue!]!
    presentationId: ID!
    serviceId: ID
    slides: [PresenterSlide!]!
    tenantId: ID!
    theme: PresenterTheme!
    title: String!
    updatedAt: DateTime!
  }

  input PresenterPresentationsFilterInput {
    serviceId: ID
  }

  input PresenterThemesFilterInput {
    query: String
  }

  input PresenterOutputTargetsInput {
    presentationId: ID
  }

  input CreatePresentationFromServiceInput {
    serviceId: ID!
    title: String
  }

  input UpdatePresentationInput {
    presentationId: ID!
    serviceId: ID
    title: String
  }

  input AddPresenterSlideInput {
    afterSlideId: ID
    presentationId: ID!
    slide: JSON!
  }

  input UpdatePresenterSlideInput {
    presentationId: ID!
    slide: JSON!
  }

  input ReorderPresenterSlidesInput {
    orderedSlideIds: [ID!]!
    presentationId: ID!
  }

  input RemovePresenterSlideInput {
    confirmationIntent: PresenterConfirmationIntentInput!
    presentationId: ID!
    slideId: ID!
  }

  input PresenterConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input ApplyPresenterThemeInput {
    presentationId: ID!
    themeId: ID!
  }

  input SetPresenterOutputTargetInput {
    outputTarget: JSON!
    presentationId: ID!
  }

  extend type Query {
    presentations(filter: PresenterPresentationsFilterInput): [Presentation!]!
    presentation(id: ID!): Presentation
    presentationForService(serviceId: ID!): Presentation
    presenterThemes(filter: PresenterThemesFilterInput): [PresenterTheme!]!
    outputTargets(input: PresenterOutputTargetsInput!): [PresenterOutputTarget!]!
  }

  extend type Mutation {
    createPresentationFromService(input: CreatePresentationFromServiceInput!): Presentation!
    updatePresentation(input: UpdatePresentationInput!): Presentation!
    addSlide(input: AddPresenterSlideInput!): PresenterSlide!
    updateSlide(input: UpdatePresenterSlideInput!): PresenterSlide!
    reorderSlides(input: ReorderPresenterSlidesInput!): [PresenterSlide!]!
    removeSlide(input: RemovePresenterSlideInput!): Presentation!
    applyPresenterTheme(input: ApplyPresenterThemeInput!): Presentation!
    setOutputTarget(input: SetPresenterOutputTargetInput!): PresenterOutputTarget!
  }
`;

export const PresenterGraphqlContextSchema = z
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

export type PresenterGraphqlContext = z.infer<typeof PresenterGraphqlContextSchema>;

export interface PresenterGraphqlResolverDependencies {
  readonly presenterCommandService: PresenterCommandService;
  readonly presenterQueryService: PresenterQueryService;
}

export interface PresenterQueryResolvers {
  readonly presentations: GraphqlQueryResolver<readonly Presentation[]>;
  readonly presentation: GraphqlQueryResolver<Presentation | null>;
  readonly presentationForService: GraphqlQueryResolver<Presentation | null>;
  readonly presenterThemes: GraphqlQueryResolver<readonly PresenterTheme[]>;
  readonly outputTargets: GraphqlQueryResolver<readonly OutputTarget[]>;
}

export interface PresenterMutationResolvers {
  readonly createPresentationFromService: GraphqlMutationResolver<Presentation>;
  readonly updatePresentation: GraphqlMutationResolver<Presentation>;
  readonly addSlide: GraphqlMutationResolver<Slide>;
  readonly updateSlide: GraphqlMutationResolver<Slide>;
  readonly reorderSlides: GraphqlMutationResolver<readonly Slide[]>;
  readonly removeSlide: GraphqlMutationResolver<Presentation>;
  readonly applyPresenterTheme: GraphqlMutationResolver<Presentation>;
  readonly setOutputTarget: GraphqlMutationResolver<OutputTarget>;
}

export interface PresenterGraphqlResolvers {
  readonly Query: PresenterQueryResolvers;
  readonly Mutation: PresenterMutationResolvers;
}

type GraphqlQueryResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PresenterGraphqlContext
) => Promise<TResult>;

type GraphqlMutationResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PresenterGraphqlContext
) => Promise<TResult>;

export const createPresenterGraphqlResolvers = (
  dependencies: PresenterGraphqlResolverDependencies
): PresenterGraphqlResolvers => ({
  Query: {
    presentations: async (_parent, args, context): Promise<readonly Presentation[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .strict()
        .parse(args);

      return dependencies.presenterQueryService.presentations(
        ListPresenterPresentationsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    presentation: async (_parent, args, context): Promise<Presentation | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          id: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.presenterQueryService.presentation(
        GetPresenterPresentationQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            presentationId: queryArgs.id
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    presentationForService: async (
      _parent,
      args,
      context
    ): Promise<Presentation | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          serviceId: NonEmptyStringSchema
        })
        .strict()
        .parse(args);

      return dependencies.presenterQueryService.presentationForService(
        GetPresenterPresentationForServiceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceId: queryArgs.serviceId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    presenterThemes: async (
      _parent,
      args,
      context
    ): Promise<readonly PresenterTheme[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .strict()
        .parse(args);

      return dependencies.presenterQueryService.presenterThemes(
        ListPresenterThemesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    outputTargets: async (
      _parent,
      args,
      context
    ): Promise<readonly OutputTarget[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterQueryService.outputTargets(
        ListPresenterOutputTargetsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Mutation: {
    createPresentationFromService: async (
      _parent,
      args,
      context
    ): Promise<Presentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.createPresentationFromService(
        CreatePresentationFromServiceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updatePresentation: async (_parent, args, context): Promise<Presentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.updatePresentation(
        UpdatePresentationCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    addSlide: async (_parent, args, context): Promise<Slide> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.addSlide(
        AddPresenterSlideCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateSlide: async (_parent, args, context): Promise<Slide> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.updateSlide(
        UpdatePresenterSlideCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    reorderSlides: async (_parent, args, context): Promise<readonly Slide[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.reorderSlides(
        ReorderPresenterSlidesCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    removeSlide: async (_parent, args, context): Promise<Presentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.removeSlide(
        RemovePresenterSlideCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    applyPresenterTheme: async (_parent, args, context): Promise<Presentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.applyPresenterTheme(
        ApplyPresenterThemeCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    setOutputTarget: async (_parent, args, context): Promise<OutputTarget> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.setOutputTarget(
        SetPresenterOutputTargetCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    }
  }
});

const parseContext = (context: PresenterGraphqlContext): PresenterGraphqlContext =>
  PresenterGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;
