import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import type { PlanningReadinessResult } from "../domain/planning/index.js";
import type {
  PlanningAssignmentRecord,
  PlanningCommandService,
  PlanningServiceItemRecord,
  PlanningServiceRecord
} from "../services/planning/commands.js";
import {
  AddPlanningServiceItemCommandSchema,
  AssignPlanningVolunteerCommandSchema,
  CreatePlanningServiceCommandSchema,
  ReorderPlanningServiceItemsCommandSchema,
  UpdatePlanningAssignmentStatusCommandSchema,
  UpdatePlanningServiceCommandSchema,
  UpdatePlanningServiceItemCommandSchema
} from "../services/planning/commands.js";
import type {
  PlanningQueryService,
  PlanningServiceTemplateRecord
} from "../services/planning/queries.js";
import {
  GetPlanningServiceQuerySchema,
  GetPlanningServiceReadinessQuerySchema,
  ListPlanningServiceAssignmentsQuerySchema,
  ListPlanningServiceTemplatesQuerySchema,
  ListPlanningServicesQuerySchema
} from "../services/planning/queries.js";
import type { PlanningReadinessService } from "../services/planning/readiness.js";
import { RefreshPlanningReadinessCommandSchema } from "../services/planning/readiness.js";

const NonEmptyStringSchema = z.string().min(1);

export const planningGraphqlTypeDefs = /* GraphQL */ `
  scalar DateTime

  enum PlanningServiceStatus {
    draft
    scheduled
    published
    canceled
  }

  enum PlanningServiceItemType {
    song
    scripture
    prayer
    announcement
    message
    media
    other
  }

  enum PlanningAssignmentStatus {
    pending
    confirmed
    declined
  }

  enum PlanningReadinessBand {
    blocked
    needs_attention
    ready
  }

  type PlanningService {
    serviceId: ID!
    serviceTypeId: ID!
    startsAt: DateTime
    status: PlanningServiceStatus!
    tenantId: ID!
    title: String!
  }

  type PlanningServiceItem {
    durationMinutes: Int
    notes: String
    serviceId: ID!
    serviceItemId: ID!
    songId: ID
    sortOrder: Int!
    tenantId: ID!
    title: String!
    type: PlanningServiceItemType!
  }

  type PlanningAssignment {
    assignmentId: ID!
    personId: ID!
    roleId: ID!
    serviceId: ID!
    status: PlanningAssignmentStatus!
    tenantId: ID!
  }

  type PlanningReadinessCheck {
    code: String!
    label: String!
    maxScore: Int!
    score: Int!
  }

  type PlanningReadiness {
    band: PlanningReadinessBand!
    checks: [PlanningReadinessCheck!]!
    recommendedActions: [String!]!
    readinessScore: Int!
    risks: [String!]!
    serviceId: ID!
    strengths: [String!]!
    tenantId: ID!
  }

  type PlanningServiceTemplate {
    description: String
    serviceTemplateId: ID!
    serviceTypeId: ID!
    tenantId: ID!
    title: String!
  }

  input PlanningConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input CreateServiceInput {
    serviceTypeId: ID!
    startsAt: DateTime
    title: String!
  }

  input UpdateServiceInput {
    confirmationIntent: PlanningConfirmationIntentInput
    serviceId: ID!
    serviceTypeId: ID
    startsAt: DateTime
    status: PlanningServiceStatus
    title: String
  }

  input AddServiceItemInput {
    durationMinutes: Int
    notes: String
    serviceId: ID!
    songId: ID
    title: String!
    type: PlanningServiceItemType!
  }

  input UpdateServiceItemInput {
    durationMinutes: Int
    notes: String
    serviceId: ID!
    serviceItemId: ID!
    songId: ID
    title: String
    type: PlanningServiceItemType
  }

  input ReorderServiceItemsInput {
    orderedServiceItemIds: [ID!]!
    serviceId: ID!
  }

  input AssignVolunteerInput {
    personId: ID!
    roleId: ID!
    serviceId: ID!
  }

  input UpdateAssignmentStatusInput {
    assignmentId: ID!
    serviceId: ID!
    status: PlanningAssignmentStatus!
  }

  input DuplicateServiceFromTemplateInput {
    serviceTemplateId: ID!
    startsAt: DateTime
    title: String!
  }

  input GenerateSetlistInput {
    serviceId: ID!
    theme: String
  }

  input RefreshReadinessScoreInput {
    serviceId: ID!
  }

  input PlanningServicesFilterInput {
    serviceTypeId: ID
    startsAtOrAfter: DateTime
    startsBefore: DateTime
    status: PlanningServiceStatus
  }

  extend type Query {
    services(filter: PlanningServicesFilterInput): [PlanningService!]!
    service(id: ID!): PlanningService
    serviceTemplates(serviceTypeId: ID!): [PlanningServiceTemplate!]!
    serviceAssignments(serviceId: ID!): [PlanningAssignment!]!
    serviceReadiness(serviceId: ID!): PlanningReadiness
  }

  extend type Mutation {
    createService(input: CreateServiceInput!): PlanningService!
    updateService(input: UpdateServiceInput!): PlanningService!
    duplicateServiceFromTemplate(input: DuplicateServiceFromTemplateInput!): PlanningService!
    addServiceItem(input: AddServiceItemInput!): PlanningServiceItem!
    updateServiceItem(input: UpdateServiceItemInput!): PlanningServiceItem!
    reorderServiceItems(input: ReorderServiceItemsInput!): [PlanningServiceItem!]!
    assignVolunteer(input: AssignVolunteerInput!): PlanningAssignment!
    updateAssignmentStatus(input: UpdateAssignmentStatusInput!): PlanningAssignment!
    generateSetlist(input: GenerateSetlistInput!): PlanningService!
    refreshReadinessScore(input: RefreshReadinessScoreInput!): PlanningReadiness!
  }
`;

export const PlanningGraphqlContextSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

const GraphqlInputArgsSchema = z.object({
  input: z.unknown()
});

export type PlanningGraphqlContext = z.infer<typeof PlanningGraphqlContextSchema>;

export interface PlanningGraphqlResolverDependencies {
  readonly planningCommandService: PlanningCommandService;
  readonly planningQueryService: PlanningQueryService;
  readonly planningReadinessService: PlanningReadinessService;
}

export interface PlanningQueryResolvers {
  readonly services: GraphqlQueryResolver<readonly PlanningServiceRecord[]>;
  readonly service: GraphqlQueryResolver<PlanningServiceRecord | null>;
  readonly serviceTemplates: GraphqlQueryResolver<readonly PlanningServiceTemplateRecord[]>;
  readonly serviceAssignments: GraphqlQueryResolver<readonly PlanningAssignmentRecord[]>;
  readonly serviceReadiness: GraphqlQueryResolver<PlanningReadinessResult | null>;
}

export interface PlanningMutationResolvers {
  readonly createService: GraphqlMutationResolver<PlanningServiceRecord>;
  readonly updateService: GraphqlMutationResolver<PlanningServiceRecord>;
  readonly addServiceItem: GraphqlMutationResolver<PlanningServiceItemRecord>;
  readonly updateServiceItem: GraphqlMutationResolver<PlanningServiceItemRecord>;
  readonly reorderServiceItems: GraphqlMutationResolver<
    readonly PlanningServiceItemRecord[]
  >;
  readonly assignVolunteer: GraphqlMutationResolver<PlanningAssignmentRecord>;
  readonly updateAssignmentStatus: GraphqlMutationResolver<PlanningAssignmentRecord>;
  readonly refreshReadinessScore: GraphqlMutationResolver<PlanningReadinessResult>;
}

export interface PlanningGraphqlResolvers {
  readonly Query: PlanningQueryResolvers;
  readonly Mutation: PlanningMutationResolvers;
}

type GraphqlQueryResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PlanningGraphqlContext
) => Promise<TResult>;

type GraphqlMutationResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: PlanningGraphqlContext
) => Promise<TResult>;

export const createPlanningGraphqlResolvers = (
  dependencies: PlanningGraphqlResolverDependencies
): PlanningGraphqlResolvers => ({
  Query: {
    services: async (_parent, args, context): Promise<readonly PlanningServiceRecord[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          filter: z.unknown().optional()
        })
        .parse(args);

      return dependencies.planningQueryService.services(
        ListPlanningServicesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    service: async (_parent, args, context): Promise<PlanningServiceRecord | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          id: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.planningQueryService.service(
        GetPlanningServiceQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceId: queryArgs.id
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    serviceTemplates: async (
      _parent,
      args,
      context
    ): Promise<readonly PlanningServiceTemplateRecord[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          serviceTypeId: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.planningQueryService.serviceTemplates(
        ListPlanningServiceTemplatesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceTypeId: queryArgs.serviceTypeId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    serviceAssignments: async (
      _parent,
      args,
      context
    ): Promise<readonly PlanningAssignmentRecord[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          serviceId: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.planningQueryService.serviceAssignments(
        ListPlanningServiceAssignmentsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceId: queryArgs.serviceId
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    serviceReadiness: async (
      _parent,
      args,
      context
    ): Promise<PlanningReadinessResult | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          serviceId: NonEmptyStringSchema
        })
        .parse(args);

      return dependencies.planningQueryService.serviceReadiness(
        GetPlanningServiceReadinessQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            serviceId: queryArgs.serviceId
          },
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Mutation: {
    createService: async (_parent, args, context): Promise<PlanningServiceRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.createService(
        CreatePlanningServiceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateService: async (_parent, args, context): Promise<PlanningServiceRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.updateService(
        UpdatePlanningServiceCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    addServiceItem: async (_parent, args, context): Promise<PlanningServiceItemRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.addServiceItem(
        AddPlanningServiceItemCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateServiceItem: async (_parent, args, context): Promise<PlanningServiceItemRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.updateServiceItem(
        UpdatePlanningServiceItemCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    reorderServiceItems: async (
      _parent,
      args,
      context
    ): Promise<readonly PlanningServiceItemRecord[]> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.reorderServiceItems(
        ReorderPlanningServiceItemsCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    assignVolunteer: async (_parent, args, context): Promise<PlanningAssignmentRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.assignVolunteer(
        AssignPlanningVolunteerCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    updateAssignmentStatus: async (
      _parent,
      args,
      context
    ): Promise<PlanningAssignmentRecord> => {
      const graphqlContext = parseContext(context);

      return dependencies.planningCommandService.updateAssignmentStatus(
        UpdatePlanningAssignmentStatusCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    refreshReadinessScore: async (
      _parent,
      args,
      context
    ): Promise<PlanningReadinessResult> => {
      const graphqlContext = parseContext(context);
      const input = z
        .object({
          serviceId: NonEmptyStringSchema
        })
        .parse(parseInput(args));

      return dependencies.planningReadinessService.refreshReadinessScore(
        RefreshPlanningReadinessCommandSchema.parse({
          actor: graphqlContext.actor,
          requestId: graphqlContext.requestId,
          serviceId: input.serviceId
        })
      );
    }
  }
});

const parseContext = (context: PlanningGraphqlContext): PlanningGraphqlContext =>
  PlanningGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;
