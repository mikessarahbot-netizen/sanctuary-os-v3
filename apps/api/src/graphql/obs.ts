import { z } from "zod";
import { AuthenticatedActorSchema } from "../auth/index.js";
import {
  CancelObsActionCommandSchema,
  ConfirmObsActionCommandSchema,
  DispatchObsActionCommandSchema,
  GetObsConnectionProfileQuerySchema,
  GetObsRecordingStateQuerySchema,
  GetObsStreamStateQuerySchema,
  ListObsActionIntentsQuerySchema,
  ListObsActionLogQuerySchema,
  ListObsConnectionProfilesQuerySchema,
  ListObsSceneItemsQuerySchema,
  ListObsScenesQuerySchema,
  ListObsSourcesQuerySchema,
  RefreshObsCatalogCommandSchema,
  RemoveObsConnectionProfileCommandSchema,
  RequestObsActionCommandSchema,
  SaveObsConnectionProfileCommandSchema,
  SuggestObsActionWithAiCommandSchema,
  type ObsActionIntent,
  type ObsActionLogEntry,
  type ObsCatalogSnapshot,
  type ObsCommandService,
  type ObsConnectionProfile,
  type ObsQueryService,
  type ObsRecordingState,
  type ObsScene,
  type ObsSceneItem,
  type ObsSource,
  type ObsStreamState
} from "../domain/obs/index.js";

const NonEmptyStringSchema = z.string().min(1);

/**
 * OBS GraphQL surface (SDL + thin resolvers), merged into the executable schema
 * with `ObsDomainError.code → extensions.code` mapping (mirrors `charts.ts` /
 * `play.ts` / `community.ts`).
 *
 * Slice scope: the read queries + connection/catalog management + the action
 * **request** mutation, plus the slice-7 confirm→dispatch gate.
 * `requestObsAction` proposes an `ObsActionIntent` at `status = requested` and
 * never touches the OBS port. `confirmObsAction` is the human-confirmation step
 * (it carries a `confirmationIntent`); `dispatchObsAction` executes the confirmed
 * intent through the injected `ObsControlPort` and returns the updated intent (it
 * is the only operation that calls a port mutate method, and only when the intent
 * is `confirmed`); `cancelObsAction` terminates a requested/confirmed intent with
 * no port call. `suggestObsActionWithAi` is the AI-assist surface (mirroring
 * Community+'s `draftCommunicationWithAi`): the service builds the secret-free +
 * PII-free projection, calls the injected `ObsAiSuggestionPort`, and returns a
 * `requested`, `origin = "ai-suggested"` `ObsActionIntent` bound by the SAME
 * confirm→dispatch gate — AI may suggest, never confirm, never dispatch, never go
 * live. Each resolver stays thin — it parses input + context and delegates the gate
 * (and the AI seam) to the service.
 *
 * Safety posture (this is the system's strongest "automation must fail
 * gracefully" surface — it controls live, public-facing output): **no type
 * exposes a host/port/password/token/stream-key field** — there is no such scalar
 * anywhere on the OBS surface; a connection profile carries an opaque
 * `connectionRef` only. The destructive `removeObsConnectionProfile` carries an
 * explicit `confirmationIntent`.
 *
 * Enum values: GraphQL enum value names cannot contain hyphens, so the hyphenated
 * Zod enum values (`ObsActionKind`'s `start-stream` / `stop-stream` /
 * `switch-scene` / `toggle-source-visibility` / `toggle-source-mute`, and
 * `ObsActionOrigin`'s `ai-suggested`) are declared with underscores here and
 * mapped back to the hyphenated domain values by the enum value maps registered
 * in `presenter-schema.ts`. Hyphen-free OBS enums pass through unchanged.
 */
export const obsGraphqlTypeDefs = /* GraphQL */ `
  enum ObsConnectionStatus {
    connected
    disconnected
    unknown
  }

  enum ObsStreamStatus {
    active
    inactive
    unknown
  }

  enum ObsRecordingStatus {
    active
    paused
    inactive
    unknown
  }

  enum ObsActionKind {
    start_stream
    stop_stream
    switch_scene
    toggle_source_visibility
    toggle_source_mute
  }

  enum ObsActionStatus {
    requested
    confirmed
    dispatched
    succeeded
    failed
    canceled
  }

  enum ObsActionOrigin {
    human
    ai_suggested
  }

  enum ObsActionLogOutcome {
    requested
    confirmed
    dispatched
    succeeded
    failed
    canceled
  }

  type ObsConnectionProfile {
    connectionProfileId: ID!
    connectionRef: ID!
    connectionStatus: ObsConnectionStatus!
    createdAt: DateTime!
    label: String!
    lastSeenAt: DateTime
    obsWebsocketVersion: String
    tenantId: ID!
    updatedAt: DateTime!
  }

  type ObsScene {
    connectionProfileId: ID!
    displayName: String!
    isCurrentProgramScene: Boolean!
    obsSceneRef: ID!
    orderHint: Int!
    sceneId: ID!
    snapshotAt: DateTime!
    tenantId: ID!
  }

  type ObsSource {
    activeHint: Boolean
    connectionProfileId: ID!
    kindLabel: String!
    mutedHint: Boolean
    obsSourceRef: ID!
    snapshotAt: DateTime!
    sourceId: ID!
    tenantId: ID!
  }

  type ObsSceneItem {
    connectionProfileId: ID!
    obsSceneItemId: ID!
    orderHint: Int!
    sceneItemId: ID!
    sceneRef: ID!
    snapshotAt: DateTime!
    sourceRef: ID!
    tenantId: ID!
    visibleHint: Boolean!
  }

  type ObsStreamState {
    connectionProfileId: ID!
    lastActionIntentRef: ID
    lastTransitionActorId: ID
    lastTransitionAt: DateTime
    streamStatus: ObsStreamStatus!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type ObsRecordingState {
    connectionProfileId: ID!
    lastTransitionActorId: ID
    lastTransitionAt: DateTime
    recordingStatus: ObsRecordingStatus!
    tenantId: ID!
    updatedAt: DateTime!
  }

  type ObsActionConfirmation {
    confirmedAt: DateTime!
    confirmedByRef: ID!
    reason: String!
  }

  type ObsActionIntent {
    actionIntentId: ID!
    affectsLiveOutput: Boolean!
    confirmation: ObsActionConfirmation
    connectionProfileId: ID!
    createdAt: DateTime!
    desiredMuted: Boolean
    desiredVisible: Boolean
    kind: ObsActionKind!
    origin: ObsActionOrigin!
    requestedByRef: ID!
    safeFailureMessage: String
    status: ObsActionStatus!
    targetSceneItemId: ID
    targetSceneRef: ID
    targetSourceRef: ID
    tenantId: ID!
    updatedAt: DateTime!
  }

  type ObsActionLogEntry {
    actionIntentRef: ID!
    actorId: ID!
    connectionProfileId: ID!
    logEntryId: ID!
    occurredAt: DateTime!
    outcome: ObsActionLogOutcome!
    reason: String!
    safeMessage: String
    tenantId: ID!
  }

  type ObsCatalogSnapshot {
    connectionProfile: ObsConnectionProfile!
    recordingState: ObsRecordingState!
    sceneItems: [ObsSceneItem!]!
    scenes: [ObsScene!]!
    sources: [ObsSource!]!
    streamState: ObsStreamState!
  }

  input ObsConnectionProfilesFilterInput {
    connectionStatus: ObsConnectionStatus
  }

  input ObsActionIntentsFilterInput {
    connectionProfileId: ID
    status: ObsActionStatus
  }

  input ObsConfirmationIntentInput {
    confirmed: Boolean!
    reason: String!
  }

  input SaveObsConnectionProfileInput {
    connectionProfileId: ID
    connectionRef: ID!
    connectionStatus: ObsConnectionStatus
    label: String!
  }

  input RemoveObsConnectionProfileInput {
    confirmationIntent: ObsConfirmationIntentInput!
    connectionProfileId: ID!
  }

  input RefreshObsCatalogInput {
    connectionProfileId: ID!
  }

  input RequestObsActionInput {
    connectionProfileId: ID!
    desiredMuted: Boolean
    desiredVisible: Boolean
    kind: ObsActionKind!
    origin: ObsActionOrigin!
    requestedByRef: ID!
    targetSceneItemId: ID
    targetSceneRef: ID
    targetSourceRef: ID
  }

  input ConfirmObsActionInput {
    actionIntentId: ID!
    confirmationIntent: ObsConfirmationIntentInput!
    confirmedByRef: ID!
  }

  input DispatchObsActionInput {
    actionIntentId: ID!
  }

  input CancelObsActionInput {
    actionIntentId: ID!
    reason: String!
  }

  input ObsAiPolicyProfileInput {
    humanReviewRequiredFor: [String!]!
    piiSharingAllowed: Boolean!
  }

  input SuggestObsActionWithAiInput {
    aiPolicyProfile: ObsAiPolicyProfileInput
    connectionProfileId: ID!
    operatorIntent: String
    requestedByRef: ID!
    serviceSegmentLabels: [String!]
  }

  extend type Query {
    obsConnectionProfiles(
      filter: ObsConnectionProfilesFilterInput
    ): [ObsConnectionProfile!]!
    obsConnectionProfile(id: ID!): ObsConnectionProfile
    obsScenes(connectionProfileId: ID!): [ObsScene!]!
    obsSources(connectionProfileId: ID!): [ObsSource!]!
    obsSceneItems(connectionProfileId: ID!, sceneRef: ID): [ObsSceneItem!]!
    obsStreamState(connectionProfileId: ID!): ObsStreamState
    obsRecordingState(connectionProfileId: ID!): ObsRecordingState
    obsActionIntents(filter: ObsActionIntentsFilterInput): [ObsActionIntent!]!
    obsActionLog(connectionProfileId: ID!): [ObsActionLogEntry!]!
  }

  extend type Mutation {
    saveObsConnectionProfile(
      input: SaveObsConnectionProfileInput!
    ): ObsConnectionProfile!
    removeObsConnectionProfile(input: RemoveObsConnectionProfileInput!): Boolean!
    refreshObsCatalog(input: RefreshObsCatalogInput!): ObsCatalogSnapshot!
    requestObsAction(input: RequestObsActionInput!): ObsActionIntent!
    confirmObsAction(input: ConfirmObsActionInput!): ObsActionIntent!
    dispatchObsAction(input: DispatchObsActionInput!): ObsActionIntent!
    cancelObsAction(input: CancelObsActionInput!): ObsActionIntent!
    suggestObsActionWithAi(
      input: SuggestObsActionWithAiInput!
    ): ObsActionIntent!
  }
`;

export const ObsGraphqlContextSchema = z
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

export type ObsGraphqlContext = z.infer<typeof ObsGraphqlContextSchema>;

export interface ObsGraphqlResolverDependencies {
  readonly obsCommandService: ObsCommandService;
  readonly obsQueryService: ObsQueryService;
}

export interface ObsQueryResolvers {
  readonly obsConnectionProfiles: GraphqlResolver<readonly ObsConnectionProfile[]>;
  readonly obsConnectionProfile: GraphqlResolver<ObsConnectionProfile | null>;
  readonly obsScenes: GraphqlResolver<readonly ObsScene[]>;
  readonly obsSources: GraphqlResolver<readonly ObsSource[]>;
  readonly obsSceneItems: GraphqlResolver<readonly ObsSceneItem[]>;
  readonly obsStreamState: GraphqlResolver<ObsStreamState | null>;
  readonly obsRecordingState: GraphqlResolver<ObsRecordingState | null>;
  readonly obsActionIntents: GraphqlResolver<readonly ObsActionIntent[]>;
  readonly obsActionLog: GraphqlResolver<readonly ObsActionLogEntry[]>;
}

export interface ObsMutationResolvers {
  readonly saveObsConnectionProfile: GraphqlResolver<ObsConnectionProfile>;
  readonly removeObsConnectionProfile: GraphqlResolver<boolean>;
  readonly refreshObsCatalog: GraphqlResolver<ObsCatalogSnapshot>;
  readonly requestObsAction: GraphqlResolver<ObsActionIntent>;
  readonly confirmObsAction: GraphqlResolver<ObsActionIntent>;
  readonly dispatchObsAction: GraphqlResolver<ObsActionIntent>;
  readonly cancelObsAction: GraphqlResolver<ObsActionIntent>;
  readonly suggestObsActionWithAi: GraphqlResolver<ObsActionIntent>;
}

export interface ObsGraphqlResolvers {
  readonly Mutation: ObsMutationResolvers;
  readonly Query: ObsQueryResolvers;
}

type GraphqlResolver<TResult> = (
  parent: unknown,
  args: unknown,
  context: ObsGraphqlContext
) => Promise<TResult>;

export const createObsGraphqlResolvers = (
  dependencies: ObsGraphqlResolverDependencies
): ObsGraphqlResolvers => ({
  Mutation: {
    saveObsConnectionProfile: async (
      _parent,
      args,
      context
    ): Promise<ObsConnectionProfile> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.saveObsConnectionProfile(
        SaveObsConnectionProfileCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    removeObsConnectionProfile: async (
      _parent,
      args,
      context
    ): Promise<boolean> => {
      const graphqlContext = parseContext(context);

      await dependencies.obsCommandService.removeObsConnectionProfile(
        RemoveObsConnectionProfileCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );

      return true;
    },

    refreshObsCatalog: async (
      _parent,
      args,
      context
    ): Promise<ObsCatalogSnapshot> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.refreshObsCatalog(
        RefreshObsCatalogCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    requestObsAction: async (
      _parent,
      args,
      context
    ): Promise<ObsActionIntent> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.requestObsAction(
        RequestObsActionCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    confirmObsAction: async (
      _parent,
      args,
      context
    ): Promise<ObsActionIntent> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.confirmObsAction(
        ConfirmObsActionCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    dispatchObsAction: async (
      _parent,
      args,
      context
    ): Promise<ObsActionIntent> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.dispatchObsAction(
        DispatchObsActionCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    cancelObsAction: async (
      _parent,
      args,
      context
    ): Promise<ObsActionIntent> => {
      const graphqlContext = parseContext(context);

      return dependencies.obsCommandService.cancelObsAction(
        CancelObsActionCommandSchema.parse({
          actor: graphqlContext.actor,
          input: parseInput(args),
          requestId: graphqlContext.requestId
        })
      );
    },

    suggestObsActionWithAi: async (
      _parent,
      args,
      context
    ): Promise<ObsActionIntent> => {
      const graphqlContext = parseContext(context);
      const input = parseInputObject(args);

      // AI SUGGESTS, A HUMAN CONFIRMS. The service builds the secret-free + PII-free
      // projection, calls the injected `ObsAiSuggestionPort` (the real claude-opus-4-8
      // adapter when a key is wired; a fake in tests), Zod-validates the suggestion,
      // and returns a `requested`, `origin = "ai-suggested"` `ObsActionIntent` — the
      // SAME intent type the other action mutations return, bound by the same
      // confirm→dispatch gate. It can never self-advance: only `confirmObsAction`
      // then `dispatchObsAction` (driven by a human) can take it live.
      //
      // The optional `aiPolicyProfile` and the nullable `[String!]` segment-label
      // list are conditionally spread so an absent (or null) GraphQL value never
      // reaches the `.strict()` command schema as `null` — it stays absent and the
      // schema default ([]) applies. `operatorIntent` is likewise only forwarded
      // when present and non-null. No host/port/password/token/stream key and no
      // `connectionRef` is accepted on this surface — only the opaque profile id.
      return dependencies.obsCommandService.suggestObsActionWithAi(
        SuggestObsActionWithAiCommandSchema.parse({
          actor: graphqlContext.actor,
          input: {
            connectionProfileId: input["connectionProfileId"],
            requestedByRef: input["requestedByRef"],
            ...(input["aiPolicyProfile"] !== undefined &&
            input["aiPolicyProfile"] !== null
              ? { aiPolicyProfile: input["aiPolicyProfile"] }
              : {}),
            ...(input["operatorIntent"] !== undefined &&
            input["operatorIntent"] !== null
              ? { operatorIntent: input["operatorIntent"] }
              : {}),
            ...(input["serviceSegmentLabels"] !== undefined &&
            input["serviceSegmentLabels"] !== null
              ? { serviceSegmentLabels: input["serviceSegmentLabels"] }
              : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    }
  },

  Query: {
    obsConnectionProfiles: async (
      _parent,
      args,
      context
    ): Promise<readonly ObsConnectionProfile[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.obsQueryService.listObsConnectionProfiles(
        ListObsConnectionProfilesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsConnectionProfile: async (
      _parent,
      args,
      context
    ): Promise<ObsConnectionProfile | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseIdArgs(args);

      return dependencies.obsQueryService.getObsConnectionProfile(
        GetObsConnectionProfileQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.id },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsScenes: async (_parent, args, context): Promise<readonly ObsScene[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseConnectionProfileArgs(args);

      return dependencies.obsQueryService.listObsScenes(
        ListObsScenesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.connectionProfileId },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsSources: async (_parent, args, context): Promise<readonly ObsSource[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseConnectionProfileArgs(args);

      return dependencies.obsQueryService.listObsSources(
        ListObsSourcesQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.connectionProfileId },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsSceneItems: async (
      _parent,
      args,
      context
    ): Promise<readonly ObsSceneItem[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = z
        .object({
          connectionProfileId: NonEmptyStringSchema,
          sceneRef: NonEmptyStringSchema.optional()
        })
        .strict()
        .parse(args);

      return dependencies.obsQueryService.listObsSceneItems(
        ListObsSceneItemsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            connectionProfileId: queryArgs.connectionProfileId,
            ...(queryArgs.sceneRef !== undefined
              ? { sceneRef: queryArgs.sceneRef }
              : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsStreamState: async (
      _parent,
      args,
      context
    ): Promise<ObsStreamState | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseConnectionProfileArgs(args);

      return dependencies.obsQueryService.getObsStreamState(
        GetObsStreamStateQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.connectionProfileId },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsRecordingState: async (
      _parent,
      args,
      context
    ): Promise<ObsRecordingState | null> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseConnectionProfileArgs(args);

      return dependencies.obsQueryService.getObsRecordingState(
        GetObsRecordingStateQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.connectionProfileId },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsActionIntents: async (
      _parent,
      args,
      context
    ): Promise<readonly ObsActionIntent[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseFilterArgs(args);

      return dependencies.obsQueryService.listObsActionIntents(
        ListObsActionIntentsQuerySchema.parse({
          actor: graphqlContext.actor,
          input: {
            ...(queryArgs.filter !== undefined ? { filter: queryArgs.filter } : {})
          },
          requestId: graphqlContext.requestId
        })
      );
    },

    obsActionLog: async (
      _parent,
      args,
      context
    ): Promise<readonly ObsActionLogEntry[]> => {
      const graphqlContext = parseContext(context);
      const queryArgs = parseConnectionProfileArgs(args);

      return dependencies.obsQueryService.listObsActionLog(
        ListObsActionLogQuerySchema.parse({
          actor: graphqlContext.actor,
          input: { connectionProfileId: queryArgs.connectionProfileId },
          requestId: graphqlContext.requestId
        })
      );
    }
  }
});

const parseContext = (context: ObsGraphqlContext): ObsGraphqlContext =>
  ObsGraphqlContextSchema.parse(context);

const parseInput = (args: unknown): unknown => GraphqlInputArgsSchema.parse(args).input;

const parseInputObject = (args: unknown): Record<string, unknown> =>
  z.record(z.unknown()).parse(GraphqlInputArgsSchema.parse(args).input);

const parseFilterArgs = (args: unknown): { filter?: unknown } =>
  z.object({ filter: z.unknown().optional() }).strict().parse(args);

const parseIdArgs = (args: unknown): { id: string } =>
  z.object({ id: NonEmptyStringSchema }).strict().parse(args);

const parseConnectionProfileArgs = (
  args: unknown
): { connectionProfileId: string } =>
  z.object({ connectionProfileId: NonEmptyStringSchema }).strict().parse(args);
