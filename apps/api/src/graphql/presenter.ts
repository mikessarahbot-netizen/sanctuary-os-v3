import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import type {
  PresenterOutputState,
  PresenterPresentation,
  PresenterScriptureReference,
  PresenterSlide,
  PresenterSlideGroup,
  PresenterStyleTemplate
} from "../domain/index.js";
import type {
  PresenterCommandService,
  PresenterQueryService
} from "../services/presenter/index.js";
import {
  ApplyPresenterStyleTemplateCommandSchema,
  CreatePresentationFromServiceCommandSchema,
  GetPresentationForServiceQuerySchema,
  GetPresenterOutputStateQuerySchema,
  ImportScriptureSlidesCommandSchema,
  ListPresenterStyleTemplatesQuerySchema,
  PreviewPresenterScriptureQuerySchema,
  ReorderSlidesCommandSchema,
  SetPresenterOutputStateCommandSchema,
  UpdateSlideCommandSchema,
  UpdateSlideGroupCommandSchema
} from "../services/presenter/index.js";

const NonEmptyStringSchema = z.string().min(1);

export const presenterGraphqlTypeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  enum PresenterSlideGroupType {
    service_item
    scripture
    song
    announcement
    message
    media
    custom
  }

  enum PresenterSlideBlockKind {
    text
    scripture
    lyric
    announcement
    media_placeholder
    lower_third
  }

  enum PresenterMediaType {
    image
    video
  }

  enum PresenterOutputMode {
    preview
    live
  }

  enum PresenterSyncStatus {
    synced
    local_only
    sync_pending
    conflict
  }

  type PresenterStyleToken {
    backgroundColor: String!
    bodyFontFamily: String!
    bodyTextColor: String!
    headingFontFamily: String!
    headingTextColor: String!
    lowerThirdBackgroundColor: String
    lowerThirdTextColor: String
    safeAreaInsetPercent: Float!
  }

  type PresenterStyleTemplate {
    createdAt: DateTime!
    name: String!
    styleTemplateId: ID!
    tenantId: ID!
    tokens: PresenterStyleToken!
    updatedAt: DateTime!
  }

  type PresenterScriptureReference {
    displayText: String!
    passageRef: String!
    scriptureReferenceId: ID!
    translationLabel: String!
    verseRange: String
  }

  type PresenterSlideBlock {
    assetRef: ID
    blockId: ID!
    kind: PresenterSlideBlockKind!
    mediaType: PresenterMediaType
    scripture: PresenterScriptureReference
    songId: ID
    styleRole: String
    subtitle: String
    text: String
    title: String
  }

  type PresenterSlide {
    backgroundMediaRef: ID
    blocks: [PresenterSlideBlock!]!
    durationSeconds: Int
    operatorNotes: String
    slideId: ID!
    title: String
  }

  type PresenterSlideGroup {
    groupId: ID!
    groupType: PresenterSlideGroupType!
    operatorNotes: String
    serviceItemId: ID
    slides: [PresenterSlide!]!
    title: String!
  }

  type PresenterPresentation {
    presentationId: ID!
    serviceId: ID!
    slideGroups: [PresenterSlideGroup!]!
    styleTemplateId: ID
    syncStatus: PresenterSyncStatus!
    tenantId: ID!
    title: String!
    updatedAt: DateTime!
  }

  type PresenterOutputState {
    blackout: Boolean!
    currentGroupId: ID!
    currentSlideId: ID!
    freeze: Boolean!
    mode: PresenterOutputMode!
    presentationId: ID!
    tenantId: ID!
    updatedAt: DateTime!
  }

  input CreatePresentationFromServiceInput {
    serviceId: ID!
    styleTemplateId: ID
    title: String
  }

  input PresenterStyleTemplatesInput {
    serviceTypeId: ID
  }

  input ScripturePreviewInput {
    passageRef: String!
    serviceId: ID
    translationLabel: String
  }

  input PresenterScriptureReferenceInput {
    displayText: String!
    passageRef: String!
    scriptureReferenceId: ID!
    translationLabel: String!
    verseRange: String
  }

  input PresenterSlideBlockInput {
    assetRef: ID
    blockId: ID!
    kind: PresenterSlideBlockKind!
    mediaType: PresenterMediaType
    scripture: PresenterScriptureReferenceInput
    songId: ID
    styleRole: String
    subtitle: String
    text: String
    title: String
  }

  input PresenterSlideInput {
    backgroundMediaRef: ID
    blocks: [PresenterSlideBlockInput!]!
    durationSeconds: Int
    operatorNotes: String
    slideId: ID!
    title: String
  }

  input PresenterSlideGroupInput {
    groupId: ID!
    groupType: PresenterSlideGroupType!
    operatorNotes: String
    serviceItemId: ID
    slides: [PresenterSlideInput!]!
    title: String!
  }

  input UpdateSlideGroupInput {
    presentationId: ID!
    slideGroup: PresenterSlideGroupInput!
  }

  input UpdateSlideInput {
    presentationId: ID!
    slide: PresenterSlideInput!
    slideGroupId: ID!
  }

  input ReorderSlidesInput {
    orderedSlideIds: [ID!]!
    presentationId: ID!
    slideGroupId: ID!
  }

  input ApplyPresenterStyleTemplateInput {
    presentationId: ID!
    styleTemplateId: ID!
  }

  input ImportScriptureSlidesInput {
    passageRef: String!
    presentationId: ID!
    slideGroupId: ID
    translationLabel: String
  }

  input SetPresenterOutputStateInput {
    blackout: Boolean
    currentGroupId: ID!
    currentSlideId: ID!
    freeze: Boolean
    mode: PresenterOutputMode!
    presentationId: ID!
    updatedAt: DateTime!
  }

  extend type Query {
    presentation(serviceId: ID!): PresenterPresentation
    presenterStyleTemplates(input: PresenterStyleTemplatesInput): [PresenterStyleTemplate!]!
    presenterOutputState(presentationId: ID!): PresenterOutputState
    scripturePreview(input: ScripturePreviewInput!): [PresenterScriptureReference!]!
  }

  extend type Mutation {
    createPresentationFromService(input: CreatePresentationFromServiceInput!): PresenterPresentation!
    updateSlideGroup(input: UpdateSlideGroupInput!): PresenterSlideGroup!
    updateSlide(input: UpdateSlideInput!): PresenterSlide!
    reorderSlides(input: ReorderSlidesInput!): PresenterPresentation!
    applyPresenterStyleTemplate(input: ApplyPresenterStyleTemplateInput!): PresenterPresentation!
    importScriptureSlides(input: ImportScriptureSlidesInput!): PresenterSlideGroup!
    setPresenterOutputState(input: SetPresenterOutputStateInput!): PresenterOutputState!
  }
`;

export const PresenterGraphqlContextSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

const GraphqlInputArgsSchema = z.object({
  input: z.unknown()
});

export type PresenterGraphqlContext = z.infer<typeof PresenterGraphqlContextSchema>;

export interface PresenterGraphqlResolverDependencies {
  readonly presenterCommandService: PresenterCommandService;
  readonly presenterQueryService: PresenterQueryService;
}

export interface PresenterQueryResolvers {
  readonly presentation: GraphqlQueryResolver<PresenterPresentation | null>;
  readonly presenterStyleTemplates: GraphqlQueryResolver<
    readonly PresenterStyleTemplate[]
  >;
  readonly presenterOutputState: GraphqlQueryResolver<PresenterOutputState | null>;
  readonly scripturePreview: GraphqlQueryResolver<
    readonly PresenterScriptureReference[]
  >;
}

export interface PresenterMutationResolvers {
  readonly applyPresenterStyleTemplate: GraphqlMutationResolver<PresenterPresentation>;
  readonly createPresentationFromService: GraphqlMutationResolver<PresenterPresentation>;
  readonly importScriptureSlides: GraphqlMutationResolver<PresenterSlideGroup>;
  readonly reorderSlides: GraphqlMutationResolver<PresenterPresentation>;
  readonly setPresenterOutputState: GraphqlMutationResolver<PresenterOutputState>;
  readonly updateSlide: GraphqlMutationResolver<PresenterSlide>;
  readonly updateSlideGroup: GraphqlMutationResolver<PresenterSlideGroup>;
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
    presentation: async (
      _parent,
      args,
      context
    ): Promise<PresenterPresentation | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          serviceId: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.presenterQueryService.getPresentationForService(
        GetPresentationForServiceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceId: queryArgs.serviceId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    presenterStyleTemplates: async (
      _parent,
      args,
      context
    ): Promise<readonly PresenterStyleTemplate[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          input: z.unknown().optional()
        })
        .parse(args);

      return dependencies.presenterQueryService.listPresenterStyleTemplates(
        ListPresenterStyleTemplatesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: queryArgs.input ?? {},
          requestId: graphqlContext.requestId
        })
      );
    },

    presenterOutputState: async (
      _parent,
      args,
      context
    ): Promise<PresenterOutputState | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          presentationId: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.presenterQueryService.getPresenterOutputState(
        GetPresenterOutputStateQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            presentationId: queryArgs.presentationId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    scripturePreview: async (
      _parent,
      args,
      context
    ): Promise<readonly PresenterScriptureReference[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterQueryService.previewScripture(
        PreviewPresenterScriptureQuerySchema.parse({
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
    ): Promise<PresenterPresentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.createPresentationFromService(
        CreatePresentationFromServiceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          intent: "create",
          requestId: graphqlContext.requestId
        })
      );
    },

    updateSlideGroup: async (
      _parent,
      args,
      context
    ): Promise<PresenterSlideGroup> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.updateSlideGroup(
        UpdateSlideGroupCommandSchema.parse({
          actor: graphqlContext.actor,
          input: normalizePresenterInput(parseInput(args)),
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    },

    updateSlide: async (_parent, args, context): Promise<PresenterSlide> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.updateSlide(
        UpdateSlideCommandSchema.parse({
          actor: graphqlContext.actor,
          input: normalizePresenterInput(parseInput(args)),
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    },

    reorderSlides: async (
      _parent,
      args,
      context
    ): Promise<PresenterPresentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.reorderSlides(
        ReorderSlidesCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    },

    applyPresenterStyleTemplate: async (
      _parent,
      args,
      context
    ): Promise<PresenterPresentation> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.applyPresenterStyleTemplate(
        ApplyPresenterStyleTemplateCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    },

    importScriptureSlides: async (
      _parent,
      args,
      context
    ): Promise<PresenterSlideGroup> => {
      const graphqlContext = parseContext(context);

      return dependencies.presenterCommandService.importScriptureSlides(
        ImportScriptureSlidesCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    },

    setPresenterOutputState: async (
      _parent,
      args,
      context
    ): Promise<PresenterOutputState> => {
      const graphqlContext = parseContext(context);
      const input = z
        .object({
          blackout: z.boolean().optional(),
          currentGroupId: NonEmptyStringSchema,
          currentSlideId: NonEmptyStringSchema,
          freeze: z.boolean().optional(),
          mode: z.enum(["preview", "live"]),
          presentationId: NonEmptyStringSchema,
          updatedAt: z.string().datetime()
        })
        .strict()
        .parse(parseInput(args));

      return dependencies.presenterCommandService.setPresenterOutputState(
        SetPresenterOutputStateCommandSchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...input,
            tenantId: graphqlContext.actor.tenantId
          },
          intent: "update",
          requestId: graphqlContext.requestId
        })
      );
    }
  }
});

const parseContext = (context: PresenterGraphqlContext): PresenterGraphqlContext =>
  PresenterGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;

const presenterGraphqlEnumValueMap: Readonly<Record<string, string>> = {
  local_only: "local-only",
  lower_third: "lower-third",
  media_placeholder: "media-placeholder",
  service_item: "service-item",
  sync_pending: "sync-pending"
};

const normalizePresenterInput = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => normalizePresenterInput(item));
  }

  if (input !== null && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, normalizePresenterInput(value)])
    );
  }

  if (typeof input === "string") {
    return presenterGraphqlEnumValueMap[input] ?? input;
  }

  return input;
};
