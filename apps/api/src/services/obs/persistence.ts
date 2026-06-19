import type {
  ObsActionIntentPersistenceRecord,
  ObsActionLogEntryPersistenceRecord,
  ObsCommandPersistenceRepository,
  ObsConnectionProfilePersistenceRecord,
  ObsPersistenceReadOptions,
  ObsPersistenceWriteOptions,
  ObsQueryPersistenceRepository,
  ObsRecordingStatePersistenceRecord,
  ObsSceneItemPersistenceRecord,
  ObsScenePersistenceRecord,
  ObsSourcePersistenceRecord,
  ObsStreamStatePersistenceRecord,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
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
  ObsActionConfirmationSchema,
  ObsActionIntentSchema,
  ObsActionLogEntrySchema,
  ObsConnectionProfileSchema,
  ObsDomainError,
  ObsRecordingStateSchema,
  ObsSceneItemSchema,
  ObsSceneSchema,
  ObsSourceSchema,
  ObsStreamStateSchema,
  RefreshObsCatalogCommandSchema,
  RemoveObsConnectionProfileCommandSchema,
  RequestObsActionCommandSchema,
  SaveObsConnectionProfileCommandSchema,
  SuggestObsActionWithAiCommandSchema,
  applyActionTransition,
  checkActionEligibility,
  type ActionBlockReason,
  type ActionEligibilitySnapshot,
  type ObsActionConfirmation,
  type ObsActionIntent,
  type ObsActionLogEntry,
  type ObsActionTransition,
  type ObsActionTransitionResult,
  type ObsCatalogSnapshot,
  type ObsCommandService,
  type ObsConnectionProfile,
  type ObsQueryService,
  type ObsRecordingState,
  type ObsScene,
  type ObsSceneItem,
  type ObsSource,
  type ObsStreamState
} from "../../domain/obs/index.js";
import {
  ObsAiActionSuggestionSchema,
  buildObsAiActionSuggestionPrompt,
  type ObsAiPolicyProfile,
  type ObsAiSuggestionPort
} from "./ai-suggest.js";
import {
  isObsControlError,
  type ObsControlPort,
  type ObsObservedCatalog
} from "./control-port.js";
import {
  classifyObsDispatchError,
  type ObsDispatchErrorClassifier
} from "./error-classifier.js";
import { createFakeObsControlPort } from "./fake-control-port.js";
import { callObsPortForAction, requireObsActionField } from "./port-bridge.js";

const OBS_STORAGE_SCHEMA_VERSION = "obs.v1";

/**
 * Persistence-backed OBS service adapter — the slice-8 production path.
 *
 * Implements both `ObsQueryService` and `ObsCommandService` over the OBS SQL
 * repositories (slice 4), mirroring the Charts/Play/Community+ persistence
 * adapters: Zod validation on every operation, an injected clock + id generators,
 * role checks, tenant isolation, and typed `ObsDomainError`s. Persistence records
 * (plain storage strings) are mapped back to the branded domain records by
 * re-parsing through the domain schemas on read; the persistence-only
 * `schemaVersion` field is dropped from the domain record. The same injected
 * `ObsControlPort` + error classifier the in-memory service takes are used here —
 * a drop-in behind the same resolvers.
 *
 * OBS controls live, public-facing output, so this adapter enforces the module's
 * structural safety rules **identically to the in-memory service** over the
 * persistence path:
 *   - **No secrets.** A connection profile holds only an opaque `connectionRef`
 *     (a vault handle); there is no host/port/password/token field anywhere.
 *   - **`requestObsAction` never touches the port.** It runs the pure
 *     `checkActionEligibility` precondition checker against the last-known
 *     persisted catalog/state snapshot and, on an eligible request, persists an
 *     `ObsActionIntent` at `status = requested`. Nothing is dispatched.
 *   - **The confirm→dispatch gate is structural.** `confirmObsAction` runs the
 *     pure `confirm` transition (which requires a human confirmation) and persists
 *     `confirmed` + audits; `dispatchObsAction` loads the intent and **refuses
 *     unless its status is `confirmed`** (`NOT_CONFIRMED`, before any port call) —
 *     it is the ONLY method that calls a port mutate method, and only for a
 *     confirmed-then-dispatched intent. A failed dispatch is persisted terminal
 *     `failed` with the redacted, classified `safeFailureMessage`; `cancelObsAction`
 *     never touches the port. Every lifecycle step writes an `ObsActionLogEntry`.
 *
 * The obs-websocket session is isolated behind the injected `ObsControlPort` (a
 * fake in tests; the real client is slice 11). The service only orchestrates,
 * validates, clocks, audits, persists, and — for dispatch/refresh only — calls the
 * port.
 */
const obsQueryRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
] as const;

const obsCommandRoles = [
  "super_admin",
  "church_admin",
  "worship_leader"
] as const;

/**
 * The safest AI policy when a caller supplies none: PII is never shared with the
 * model. OBS records carry no PII regardless, so the suggestion projection is
 * PII-free either way; this keeps the policy shape consistent with the Community+
 * AI-draft default and makes the secret-free/PII-free posture explicit.
 */
const DEFAULT_PII_FREE_AI_POLICY: ObsAiPolicyProfile = {
  humanReviewRequiredFor: ["obs-action"],
  piiSharingAllowed: false
};

export interface PersistenceBackedObsServiceIds {
  readonly actionIntentId: () => string;
  readonly connectionProfileId: () => string;
  readonly logEntryId: () => string;
  readonly sceneId: () => string;
  readonly sceneItemId: () => string;
  readonly sourceId: () => string;
}

export interface PersistenceBackedObsServiceDependencies {
  readonly aiSuggestionPort?: ObsAiSuggestionPort;
  readonly clock?: () => string;
  readonly commandRepository: ObsCommandPersistenceRepository;
  readonly controlPort?: ObsControlPort;
  readonly errorClassifier?: ObsDispatchErrorClassifier;
  readonly ids?: Partial<PersistenceBackedObsServiceIds>;
  readonly queryRepository: ObsQueryPersistenceRepository;
}

export interface PersistenceBackedObsServicesAdapter {
  readonly commandService: ObsCommandService;
  readonly queryService: ObsQueryService;
}

export const createPersistenceBackedObsServicesAdapter = (
  dependencies: PersistenceBackedObsServiceDependencies
): PersistenceBackedObsServicesAdapter => {
  const clock = dependencies.clock ?? ((): string => new Date().toISOString());
  const ids = createObsIds(dependencies.ids);
  // Default to a disconnected fake so `refreshObsCatalog` degrades gracefully
  // (reports `disconnected`) when no port is injected — never a thrown surprise.
  const controlPort =
    dependencies.controlPort ??
    createFakeObsControlPort({ failures: { getSceneList: { code: "disconnected" } } })
      .port;
  const errorClassifier = dependencies.errorClassifier ?? classifyObsDispatchError;
  const aiSuggestionPort = dependencies.aiSuggestionPort;
  const { commandRepository, queryRepository } = dependencies;

  /**
   * Load a tenant-scoped connection profile or throw `CONNECTION_PROFILE_NOT_FOUND`.
   * A cross-tenant id resolves to nothing (the repo scopes by tenant) so one tenant
   * can never act on another's connection.
   */
  const requireConnectionProfile = async (
    connectionProfileId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsConnectionProfilePersistenceRecord> => {
    const profile = await queryRepository.getObsConnectionProfile({
      input: { connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    if (profile === null) {
      throw new ObsDomainError(
        "CONNECTION_PROFILE_NOT_FOUND",
        "This OBS connection profile is no longer available on the server."
      );
    }

    return assertTenantScopedProfile(profile, actor.tenantId);
  };

  /**
   * Load a tenant-scoped action intent or throw `ACTION_INTENT_NOT_FOUND`. The
   * scope is `(tenant, actionIntentId)` — a cross-tenant id resolves to nothing, so
   * one tenant can never confirm, dispatch, or cancel another tenant's intent.
   */
  const requireActionIntent = async (
    actionIntentId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsActionIntentPersistenceRecord> => {
    const intent = await queryRepository.getObsActionIntent({
      input: { actionIntentId },
      options: toReadOptions(actor, requestId)
    });

    if (intent === null) {
      throw new ObsDomainError(
        "ACTION_INTENT_NOT_FOUND",
        "This OBS action intent is no longer available on the server."
      );
    }

    return assertTenantScopedIntent(intent, actor.tenantId);
  };

  const tenantScenesForConnection = async (
    connectionProfileId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsScene[]> => {
    const records = await queryRepository.listObsScenes({
      input: { connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    return records.map((record) =>
      toDomainScene(assertTenantScopedScene(record, actor.tenantId))
    );
  };

  const tenantSourcesForConnection = async (
    connectionProfileId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsSource[]> => {
    const records = await queryRepository.listObsSources({
      input: { connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    return records.map((record) =>
      toDomainSource(assertTenantScopedSource(record, actor.tenantId))
    );
  };

  const tenantSceneItemsForConnection = async (
    connectionProfileId: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsSceneItem[]> => {
    const records = await queryRepository.listObsSceneItems({
      input: { connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    return records.map((record) =>
      toDomainSceneItem(assertTenantScopedSceneItem(record, actor.tenantId))
    );
  };

  /**
   * The last-known coarse stream snapshot for a connection, or a synthesized
   * `unknown` row when none has been persisted yet. The eligibility checker needs a
   * stream state; an `unknown` status blocks neither `start-stream` nor
   * `stop-stream`, matching the "read snapshot stays available, flagged stale"
   * posture before a refresh has run.
   */
  const streamStateOrDefault = async (
    profile: ObsConnectionProfilePersistenceRecord,
    now: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsStreamState> => {
    const existing = await queryRepository.getObsStreamState({
      input: { connectionProfileId: profile.connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    if (existing !== null) {
      return toDomainStreamState(assertTenantScopedStreamState(existing, actor.tenantId));
    }

    return ObsStreamStateSchema.parse({
      connectionProfileId: profile.connectionProfileId,
      streamStatus: "unknown",
      tenantId: profile.tenantId,
      updatedAt: now
    });
  };

  const recordingStateOrDefault = async (
    profile: ObsConnectionProfilePersistenceRecord,
    now: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<ObsRecordingState> => {
    const existing = await queryRepository.getObsRecordingState({
      input: { connectionProfileId: profile.connectionProfileId },
      options: toReadOptions(actor, requestId)
    });

    if (existing !== null) {
      return toDomainRecordingState(
        assertTenantScopedRecordingState(existing, actor.tenantId)
      );
    }

    return ObsRecordingStateSchema.parse({
      connectionProfileId: profile.connectionProfileId,
      recordingStatus: "unknown",
      tenantId: profile.tenantId,
      updatedAt: now
    });
  };

  const appendActionLogEntry = async (
    input: {
      readonly actor: AuthenticatedActor;
      readonly actionIntentRef: string;
      readonly connectionProfileId: string;
      readonly occurredAt: string;
      readonly outcome: ObsActionLogEntry["outcome"];
      readonly reason: string;
      readonly requestId: string;
      readonly safeMessage?: string;
    }
  ): Promise<void> => {
    // `safeMessage` is allowed by the schema only on a `failed` outcome (it is the
    // redacted port-failure detail). The conditional spread keeps it absent
    // otherwise so the append-only audit row parses under exactOptionalPropertyTypes.
    await commandRepository.appendObsActionLogEntry({
      input: {
        actionIntentRef: input.actionIntentRef,
        actorId: input.actor.actorId,
        connectionProfileId: input.connectionProfileId,
        logEntryId: ids.logEntryId(),
        occurredAt: input.occurredAt,
        outcome: input.outcome,
        reason: input.reason,
        tenantId: input.actor.tenantId,
        ...(input.safeMessage !== undefined ? { safeMessage: input.safeMessage } : {})
      },
      options: toWriteOptions(input.actor, input.requestId, "create")
    });
  };

  /**
   * Run a pure lifecycle transition and persist the advanced intent, or translate
   * the typed `ActionLifecycleError` into an `ObsDomainError`. A
   * `CONFIRMATION_REQUIRED` lifecycle failure maps to the reserved
   * `CONFIRMATION_REQUIRED` domain code; every other illegal move maps to
   * `VALIDATION_FAILED`. The service supplies the clock; the pure function decides
   * legality and merges any confirmation, then the new status (and the confirmation
   * on the confirming step) is written back via `setObsActionIntentStatus`.
   */
  const advanceIntent = async (
    intent: ObsActionIntent,
    transition: ObsActionTransition,
    now: string,
    actor: AuthenticatedActor,
    requestId: string,
    confirmation?: ObsActionConfirmation
  ): Promise<ObsActionIntent> => {
    const result: ObsActionTransitionResult = applyActionTransition(
      intent,
      transition,
      confirmation
    );

    if (!result.ok) {
      const code =
        result.error.code === "CONFIRMATION_REQUIRED"
          ? "CONFIRMATION_REQUIRED"
          : "VALIDATION_FAILED";

      throw new ObsDomainError(code, result.error.safeMessage);
    }

    const nextConfirmation = result.intent.confirmation;
    const stored = await commandRepository.setObsActionIntentStatus({
      input: {
        actionIntentId: result.intent.actionIntentId,
        status: result.intent.status,
        updatedAt: now,
        ...(nextConfirmation !== undefined
          ? {
              confirmation: {
                confirmed: true,
                confirmedAt: nextConfirmation.confirmedAt,
                confirmedByRef: nextConfirmation.confirmedByRef,
                reason: nextConfirmation.reason
              }
            }
          : {})
      },
      options: toWriteOptions(actor, requestId, "update")
    });

    return toDomainActionIntent(assertTenantScopedIntent(stored, actor.tenantId));
  };

  /**
   * Resolve the `obsSceneRef` a `toggle-source-visibility` dispatch needs for the
   * port's `setSceneItemEnabled` call, using the pre-loaded scene-item snapshot.
   * The intent may carry `targetSceneRef` directly; otherwise the owning scene is
   * looked up by `obsSceneItemId`. Fails closed (`VALIDATION_FAILED`) if neither
   * resolves — the port is never called with an unresolved scene ref.
   */
  const resolveSceneRefForSceneItem = (
    sceneItems: readonly ObsSceneItem[]
  ) => (
    intent: ObsActionIntent,
    targetSceneItemId: NonNullable<ObsActionIntent["targetSceneItemId"]>
  ): ObsSceneItem["sceneRef"] => {
    if (intent.targetSceneRef !== undefined) {
      return intent.targetSceneRef;
    }

    const sceneItem = sceneItems.find(
      (entry) =>
        entry.connectionProfileId === intent.connectionProfileId &&
        entry.obsSceneItemId === targetSceneItemId
    );

    return requireObsActionField(sceneItem?.sceneRef, "target scene-item scene");
  };

  /**
   * Apply a succeeded stream-output dispatch to the durable coarse stream snapshot.
   * Only `start-stream` / `stop-stream` move stream state, and only **after** a
   * confirmed action dispatched successfully (never speculatively). Scene/source
   * toggles reconcile via `refreshObsCatalog`, so they do not write here.
   */
  const recordStreamTransition = async (
    intent: ObsActionIntent,
    actor: AuthenticatedActor,
    streamStatus: ObsStreamState["streamStatus"],
    now: string,
    requestId: string
  ): Promise<void> => {
    await commandRepository.setObsStreamState({
      input: {
        connectionProfileId: intent.connectionProfileId,
        lastActionIntentRef: intent.actionIntentId,
        lastTransitionActorId: actor.actorId,
        lastTransitionAt: now,
        streamStatus,
        tenantId: intent.tenantId,
        updatedAt: now
      },
      options: toWriteOptions(actor, requestId, "update")
    });
  };

  /**
   * Build the freshly-reconciled scene/source/scene-item rows from a port read and
   * replace the connection's catalog snapshot in one tenant-scoped write.
   * Deterministic single-program-scene resolution: a scene is the program scene
   * only if its ref matches the observed `currentProgramSceneRef`. Returns the
   * reconciled domain records for the snapshot result.
   */
  const replaceCatalogSnapshot = async (
    profile: ObsConnectionProfilePersistenceRecord,
    catalog: ObsObservedCatalog,
    snapshotAt: string,
    actor: AuthenticatedActor,
    requestId: string
  ): Promise<{
    readonly scenes: ObsScene[];
    readonly sceneItems: ObsSceneItem[];
    readonly sources: ObsSource[];
  }> => {
    const tenantId = profile.tenantId;
    const connectionProfileId = profile.connectionProfileId;

    const sceneRecords: ObsScenePersistenceRecord[] = catalog.scenes.map(
      (scene, index) => ({
        connectionProfileId,
        displayName: scene.displayName,
        isCurrentProgramScene:
          catalog.currentProgramSceneRef !== undefined &&
          scene.obsSceneRef === catalog.currentProgramSceneRef,
        obsSceneRef: scene.obsSceneRef,
        orderHint: index,
        sceneId: ids.sceneId(),
        snapshotAt,
        tenantId
      })
    );

    const sourceRecords: ObsSourcePersistenceRecord[] = catalog.sources.map(
      (source) => ({
        connectionProfileId,
        kindLabel: source.kindLabel,
        obsSourceRef: source.obsSourceRef,
        snapshotAt,
        sourceId: ids.sourceId(),
        tenantId,
        ...(source.activeHint !== undefined ? { activeHint: source.activeHint } : {}),
        ...(source.mutedHint !== undefined ? { mutedHint: source.mutedHint } : {})
      })
    );

    const sceneItemRecords: ObsSceneItemPersistenceRecord[] = catalog.sceneItems.map(
      (sceneItem, index) => ({
        connectionProfileId,
        obsSceneItemId: sceneItem.obsSceneItemId,
        orderHint: index,
        sceneItemId: ids.sceneItemId(),
        sceneRef: sceneItem.obsSceneRef,
        snapshotAt,
        sourceRef: sceneItem.obsSourceRef,
        tenantId,
        visibleHint: sceneItem.visibleHint
      })
    );

    await commandRepository.replaceObsCatalogSnapshot({
      input: {
        connectionProfileId,
        sceneItems: sceneItemRecords,
        scenes: sceneRecords,
        sources: sourceRecords
      },
      options: toWriteOptions(actor, requestId, "update")
    });

    return {
      sceneItems: sceneItemRecords.map((record) => toDomainSceneItem(record)),
      scenes: sceneRecords.map((record) => toDomainScene(record)),
      sources: sourceRecords.map((record) => toDomainSource(record))
    };
  };

  /**
   * Build a `requested` `ObsActionIntent` from an already-validated action shape,
   * run the PURE eligibility precondition checker against the last-known persisted
   * snapshot, and — only on an eligible request — persist it and write the
   * `requested` audit row. This NEVER touches the OBS port (no dispatch at request
   * time). It is the single creation path shared by both an operator
   * `requestObsAction` and an `ai-suggested` `suggestObsActionWithAi`, so an
   * AI-originated intent is born exactly like a human one — `status = requested`,
   * unconfirmed — and is bound by the identical slice-7 confirm→dispatch gate. An
   * ineligible request throws a typed error (disconnected-only → OBS_DISCONNECTED;
   * any other block → ACTION_INELIGIBLE) and persists nothing.
   */
  const createRequestedActionIntent = async (
    actor: AuthenticatedActor,
    requestId: string,
    profile: ObsConnectionProfilePersistenceRecord,
    now: string,
    action: {
      readonly kind: ObsActionIntent["kind"];
      readonly origin: ObsActionIntent["origin"];
      readonly requestedByRef: string;
      readonly desiredMuted?: boolean;
      readonly desiredVisible?: boolean;
      readonly targetSceneItemId?: string;
      readonly targetSceneRef?: string;
      readonly targetSourceRef?: string;
    }
  ): Promise<ObsActionIntent> => {
    // Every v1 kind affects live output, so affectsLiveOutput is always true; the
    // schema's superRefine validates the per-kind target-ref shape and rejects a
    // confirmation on a requested action.
    const intent = ObsActionIntentSchema.parse({
      actionIntentId: ids.actionIntentId(),
      affectsLiveOutput: true,
      connectionProfileId: profile.connectionProfileId,
      createdAt: now,
      kind: action.kind,
      origin: action.origin,
      requestedByRef: action.requestedByRef,
      status: "requested",
      tenantId: actor.tenantId,
      updatedAt: now,
      ...(action.desiredMuted !== undefined ? { desiredMuted: action.desiredMuted } : {}),
      ...(action.desiredVisible !== undefined
        ? { desiredVisible: action.desiredVisible }
        : {}),
      ...(action.targetSceneItemId !== undefined
        ? { targetSceneItemId: action.targetSceneItemId }
        : {}),
      ...(action.targetSceneRef !== undefined
        ? { targetSceneRef: action.targetSceneRef }
        : {}),
      ...(action.targetSourceRef !== undefined
        ? { targetSourceRef: action.targetSourceRef }
        : {})
    });

    const snapshot: ActionEligibilitySnapshot = {
      connection: toDomainConnectionProfile(profile),
      recording: await recordingStateOrDefault(profile, now, actor, requestId),
      scenes: await tenantScenesForConnection(
        profile.connectionProfileId,
        actor,
        requestId
      ),
      sceneItems: await tenantSceneItemsForConnection(
        profile.connectionProfileId,
        actor,
        requestId
      ),
      sources: await tenantSourcesForConnection(
        profile.connectionProfileId,
        actor,
        requestId
      ),
      stream: await streamStateOrDefault(profile, now, actor, requestId)
    };
    const eligibility = checkActionEligibility(intent, snapshot);

    if (!eligibility.eligible) {
      throw ineligibilityError(eligibility.reasons);
    }

    const stored = await commandRepository.saveObsActionIntent({
      input: toPersistenceActionIntent(intent),
      options: toWriteOptions(actor, requestId, "create")
    });
    await appendActionLogEntry({
      actionIntentRef: intent.actionIntentId,
      actor,
      connectionProfileId: intent.connectionProfileId,
      occurredAt: now,
      outcome: "requested",
      reason: `Requested ${intent.kind} (${intent.origin}).`,
      requestId
    });

    return toDomainActionIntent(assertTenantScopedIntent(stored, actor.tenantId));
  };

  const queryService: ObsQueryService = {
    listObsConnectionProfiles: async (
      rawQuery
    ): Promise<readonly ObsConnectionProfile[]> => {
      const query = ListObsConnectionProfilesQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listObsConnectionProfiles({
        input:
          filter?.connectionStatus === undefined
            ? {}
            : { filter: { connectionStatus: filter.connectionStatus } },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainConnectionProfile(
          assertTenantScopedProfile(record, query.actor.tenantId)
        )
      );
    },

    getObsConnectionProfile: async (
      rawQuery
    ): Promise<ObsConnectionProfile | null> => {
      const query = GetObsConnectionProfileQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const record = await queryRepository.getObsConnectionProfile({
        input: { connectionProfileId: query.input.connectionProfileId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainConnectionProfile(record);
    },

    listObsScenes: async (rawQuery): Promise<readonly ObsScene[]> => {
      const query = ListObsScenesQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);

      return tenantScenesForConnection(
        query.input.connectionProfileId,
        query.actor,
        query.requestId
      );
    },

    listObsSources: async (rawQuery): Promise<readonly ObsSource[]> => {
      const query = ListObsSourcesQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);

      return tenantSourcesForConnection(
        query.input.connectionProfileId,
        query.actor,
        query.requestId
      );
    },

    listObsSceneItems: async (rawQuery): Promise<readonly ObsSceneItem[]> => {
      const query = ListObsSceneItemsQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const sceneRef = query.input.sceneRef;
      const records = await queryRepository.listObsSceneItems({
        input: {
          connectionProfileId: query.input.connectionProfileId,
          ...(sceneRef !== undefined ? { sceneRef } : {})
        },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainSceneItem(assertTenantScopedSceneItem(record, query.actor.tenantId))
      );
    },

    getObsStreamState: async (rawQuery): Promise<ObsStreamState | null> => {
      const query = GetObsStreamStateQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const record = await queryRepository.getObsStreamState({
        input: { connectionProfileId: query.input.connectionProfileId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainStreamState(record);
    },

    getObsRecordingState: async (rawQuery): Promise<ObsRecordingState | null> => {
      const query = GetObsRecordingStateQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const record = await queryRepository.getObsRecordingState({
        input: { connectionProfileId: query.input.connectionProfileId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return record === null || record.tenantId !== query.actor.tenantId
        ? null
        : toDomainRecordingState(record);
    },

    listObsActionIntents: async (rawQuery): Promise<readonly ObsActionIntent[]> => {
      const query = ListObsActionIntentsQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const filter = query.input.filter;
      const records = await queryRepository.listObsActionIntents({
        input:
          filter === undefined
            ? {}
            : {
                filter: {
                  ...(filter.connectionProfileId !== undefined
                    ? { connectionProfileId: filter.connectionProfileId }
                    : {}),
                  ...(filter.status !== undefined ? { status: filter.status } : {})
                }
              },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainActionIntent(assertTenantScopedIntent(record, query.actor.tenantId))
      );
    },

    listObsActionLog: async (rawQuery): Promise<readonly ObsActionLogEntry[]> => {
      const query = ListObsActionLogQuerySchema.parse(rawQuery);
      assertObsQueryRole(query.actor);
      const records = await queryRepository.listObsActionLog({
        input: { connectionProfileId: query.input.connectionProfileId },
        options: toReadOptions(query.actor, query.requestId)
      });

      return records.map((record) =>
        toDomainActionLogEntry(
          assertTenantScopedLogEntry(record, query.actor.tenantId)
        )
      );
    }
  };

  const commandService: ObsCommandService = {
    saveObsConnectionProfile: async (rawCommand): Promise<ObsConnectionProfile> => {
      const command = SaveObsConnectionProfileCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const now = clock();
      const connectionProfileId =
        command.input.connectionProfileId ?? ids.connectionProfileId();
      const existing = await queryRepository.getObsConnectionProfile({
        input: { connectionProfileId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing !== null && existing.tenantId !== command.actor.tenantId) {
        throw new ObsDomainError(
          "AUTHORIZATION_FAILED",
          "You are not allowed to manage this OBS resource."
        );
      }

      const record = await commandRepository.upsertObsConnectionProfile({
        input: {
          connectionProfileId,
          connectionRef: command.input.connectionRef,
          connectionStatus:
            command.input.connectionStatus ??
            existing?.connectionStatus ??
            "unknown",
          createdAt: existing?.createdAt ?? now,
          label: command.input.label,
          schemaVersion: OBS_STORAGE_SCHEMA_VERSION,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(existing?.lastSeenAt !== undefined
            ? { lastSeenAt: existing.lastSeenAt }
            : {}),
          ...(existing?.obsWebsocketVersion !== undefined
            ? { obsWebsocketVersion: existing.obsWebsocketVersion }
            : {})
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      return toDomainConnectionProfile(
        assertTenantScopedProfile(record, command.actor.tenantId)
      );
    },

    removeObsConnectionProfile: async (rawCommand): Promise<void> => {
      const command = RemoveObsConnectionProfileCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const existing = await queryRepository.getObsConnectionProfile({
        input: { connectionProfileId: command.input.connectionProfileId },
        options: toReadOptions(command.actor, command.requestId)
      });

      if (existing === null || existing.tenantId !== command.actor.tenantId) {
        throw new ObsDomainError(
          "CONNECTION_PROFILE_NOT_FOUND",
          "This OBS connection profile is no longer available on the server."
        );
      }

      await commandRepository.removeObsConnectionProfile({
        input: { connectionProfileId: command.input.connectionProfileId },
        options: toWriteOptions(
          command.actor,
          command.requestId,
          "destructive-confirmed"
        )
      });
    },

    refreshObsCatalog: async (rawCommand): Promise<ObsCatalogSnapshot> => {
      const command = RefreshObsCatalogCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const profile = await requireConnectionProfile(
        command.input.connectionProfileId,
        command.actor,
        command.requestId
      );

      // Read-only port calls. A disconnected/failed read surfaces as a typed
      // OBS_DISCONNECTED domain error (graceful degradation) — no OBS state is
      // ever mutated by a refresh. The port takes the branded opaque
      // `connectionRef` (a vault handle), never a credential.
      const connectionRef = toDomainConnectionProfile(profile).connectionRef;
      let catalog: ObsObservedCatalog;
      let observedStreamStatus: ObsStreamState["streamStatus"];
      let observedRecordingStatus: ObsRecordingState["recordingStatus"];
      try {
        catalog = await controlPort.getSceneList(connectionRef);
        observedStreamStatus = (
          await controlPort.getStreamStatus(connectionRef)
        ).streamStatus;
        observedRecordingStatus = (
          await controlPort.getRecordStatus(connectionRef)
        ).recordingStatus;
      } catch {
        throw new ObsDomainError(
          "OBS_DISCONNECTED",
          "OBS is not reachable, so the catalog could not be refreshed."
        );
      }

      const now = clock();
      const snapshot = await replaceCatalogSnapshot(
        profile,
        catalog,
        now,
        command.actor,
        command.requestId
      );

      const streamStateRecord = await commandRepository.setObsStreamState({
        input: {
          connectionProfileId: profile.connectionProfileId,
          streamStatus: observedStreamStatus,
          tenantId: profile.tenantId,
          updatedAt: now
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      const recordingStateRecord = await commandRepository.setObsRecordingState({
        input: {
          connectionProfileId: profile.connectionProfileId,
          recordingStatus: observedRecordingStatus,
          tenantId: profile.tenantId,
          updatedAt: now
        },
        options: toWriteOptions(command.actor, command.requestId, "update")
      });

      // A successful read means OBS answered: mark the profile connected and stamp
      // lastSeenAt. (Refresh reads OBS; it never changes OBS state.)
      const connectionProfileRecord =
        await commandRepository.upsertObsConnectionProfile({
          input: {
            connectionProfileId: profile.connectionProfileId,
            connectionRef: profile.connectionRef,
            connectionStatus: "connected",
            createdAt: profile.createdAt,
            label: profile.label,
            lastSeenAt: now,
            schemaVersion: OBS_STORAGE_SCHEMA_VERSION,
            tenantId: profile.tenantId,
            updatedAt: now,
            ...(profile.obsWebsocketVersion !== undefined
              ? { obsWebsocketVersion: profile.obsWebsocketVersion }
              : {})
          },
          options: toWriteOptions(command.actor, command.requestId, "update")
        });

      return {
        connectionProfile: toDomainConnectionProfile(
          assertTenantScopedProfile(connectionProfileRecord, command.actor.tenantId)
        ),
        recordingState: toDomainRecordingState(
          assertTenantScopedRecordingState(
            recordingStateRecord,
            command.actor.tenantId
          )
        ),
        sceneItems: snapshot.sceneItems,
        scenes: snapshot.scenes,
        sources: snapshot.sources,
        streamState: toDomainStreamState(
          assertTenantScopedStreamState(streamStateRecord, command.actor.tenantId)
        )
      };
    },

    requestObsAction: async (rawCommand): Promise<ObsActionIntent> => {
      const command = RequestObsActionCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const profile = await requireConnectionProfile(
        command.input.connectionProfileId,
        command.actor,
        command.requestId
      );
      const now = clock();

      // Build + eligibility-check + persist + audit through the shared creation
      // path. `origin` comes from the operator input (human or, for a reviewable
      // nudge, ai-suggested). Nothing is dispatched — the port is never touched.
      return createRequestedActionIntent(command.actor, command.requestId, profile, now, {
        kind: command.input.kind,
        origin: command.input.origin,
        requestedByRef: command.input.requestedByRef,
        ...(command.input.desiredMuted !== undefined
          ? { desiredMuted: command.input.desiredMuted }
          : {}),
        ...(command.input.desiredVisible !== undefined
          ? { desiredVisible: command.input.desiredVisible }
          : {}),
        ...(command.input.targetSceneItemId !== undefined
          ? { targetSceneItemId: command.input.targetSceneItemId }
          : {}),
        ...(command.input.targetSceneRef !== undefined
          ? { targetSceneRef: command.input.targetSceneRef }
          : {}),
        ...(command.input.targetSourceRef !== undefined
          ? { targetSourceRef: command.input.targetSourceRef }
          : {})
      });
    },

    confirmObsAction: async (rawCommand): Promise<ObsActionIntent> => {
      const command = ConfirmObsActionCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      // Tenant + actor scoped load: a missing/cross-tenant intent → not-found.
      const existing = await requireActionIntent(
        command.input.actionIntentId,
        command.actor,
        command.requestId
      );
      const now = clock();

      // The human-confirm gate. Build the confirmation FROM the operator's
      // confirmation intent: confirmedByRef is the human actor, confirmedAt is the
      // injected clock, reason is audited. There is no non-human path that
      // constructs this — an `ai-suggested` intent advances ONLY because a human
      // called confirmObsAction here; the AI can never self-confirm. The pure
      // `confirm` transition requires this confirmation and rejects an
      // already-confirmed or out-of-order intent (→ typed error).
      const confirmation = ObsActionConfirmationSchema.parse({
        confirmed: true,
        confirmedAt: now,
        confirmedByRef: command.input.confirmedByRef,
        reason: command.input.confirmationIntent.reason
      });

      const confirmed = await advanceIntent(
        toDomainActionIntent(existing),
        "confirm",
        now,
        command.actor,
        command.requestId,
        confirmation
      );

      await appendActionLogEntry({
        actionIntentRef: confirmed.actionIntentId,
        actor: command.actor,
        connectionProfileId: confirmed.connectionProfileId,
        occurredAt: now,
        outcome: "confirmed",
        reason: `Confirmed ${confirmed.kind} by ${confirmation.confirmedByRef}: ${confirmation.reason}`,
        requestId: command.requestId
      });

      return confirmed;
    },

    dispatchObsAction: async (rawCommand): Promise<ObsActionIntent> => {
      const command = DispatchObsActionCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const existing = await requireActionIntent(
        command.input.actionIntentId,
        command.actor,
        command.requestId
      );

      // THE GATE. Dispatch refuses unless the intent is `confirmed`. This guard is
      // the structural reason a request or an ai-suggested intent can never go
      // live: there is no other branch in this method that reaches the port. A
      // dispatched/terminal intent fails this check too (its status is no longer
      // `confirmed`), so it can never be re-dispatched.
      if (existing.status !== "confirmed") {
        throw new ObsDomainError(
          "NOT_CONFIRMED",
          "This OBS action cannot be dispatched until a human has confirmed it."
        );
      }

      const profile = await requireConnectionProfile(
        existing.connectionProfileId,
        command.actor,
        command.requestId
      );
      const now = clock();

      // Move to `dispatched` (the pure transition re-asserts the recorded
      // confirmation) and audit BEFORE the port call, so the attempt is always on
      // record even if the port then rejects it.
      const dispatched = await advanceIntent(
        toDomainActionIntent(existing),
        "dispatch",
        now,
        command.actor,
        command.requestId,
        undefined
      );
      await appendActionLogEntry({
        actionIntentRef: dispatched.actionIntentId,
        actor: command.actor,
        connectionProfileId: dispatched.connectionProfileId,
        occurredAt: now,
        outcome: "dispatched",
        reason: `Dispatching ${dispatched.kind} to OBS.`,
        requestId: command.requestId
      });

      // The scene-item snapshot a visibility toggle may need to resolve its owning
      // scene ref, loaded once for the bridge.
      const sceneItems = await tenantSceneItemsForConnection(
        dispatched.connectionProfileId,
        command.actor,
        command.requestId
      );

      // The ONE place a port mutate method is called — and only for a confirmed,
      // just-dispatched intent — through the shared bridge.
      let observedStreamStatus: ObsStreamState["streamStatus"] | undefined;
      try {
        observedStreamStatus = await callObsPortForAction(
          controlPort,
          toDomainConnectionProfile(profile).connectionRef,
          dispatched,
          resolveSceneRefForSceneItem(sceneItems)
        );
      } catch (error) {
        // A normalized, redacted ObsControlError → classify (retryable vs terminal)
        // and record terminal `failed` with the REDACTED safeMessage (no
        // secret/URL/raw payload — the port guarantees redaction; the classifier
        // never widens it). An unexpected non-ObsControlError throw is re-thrown
        // untouched rather than presented as a classified OBS failure.
        if (!isObsControlError(error)) {
          throw error;
        }

        const classification = errorClassifier(error);
        const failedAt = clock();
        const failedRecord = await commandRepository.setObsActionIntentStatus({
          input: {
            actionIntentId: dispatched.actionIntentId,
            safeFailureMessage: classification.safeMessage,
            status: "failed",
            updatedAt: failedAt
          },
          options: toWriteOptions(command.actor, command.requestId, "update")
        });
        const failed = toDomainActionIntent(
          assertTenantScopedIntent(failedRecord, command.actor.tenantId)
        );
        await appendActionLogEntry({
          actionIntentRef: failed.actionIntentId,
          actor: command.actor,
          connectionProfileId: failed.connectionProfileId,
          occurredAt: failedAt,
          outcome: "failed",
          reason: `Dispatch of ${failed.kind} failed (${classification.kind}).`,
          requestId: command.requestId,
          safeMessage: classification.safeMessage
        });

        return failed;
      }

      // Success: a stream action moves the durable coarse stream snapshot (only
      // after this confirmed dispatch succeeded). Then mark the intent `succeeded`
      // and audit.
      const succeededAt = clock();
      if (observedStreamStatus !== undefined) {
        await recordStreamTransition(
          dispatched,
          command.actor,
          observedStreamStatus,
          succeededAt,
          command.requestId
        );
      }

      const succeeded = await advanceIntent(
        dispatched,
        "succeed",
        succeededAt,
        command.actor,
        command.requestId,
        undefined
      );
      await appendActionLogEntry({
        actionIntentRef: succeeded.actionIntentId,
        actor: command.actor,
        connectionProfileId: succeeded.connectionProfileId,
        occurredAt: succeededAt,
        outcome: "succeeded",
        reason: `Dispatched ${succeeded.kind} to OBS successfully.`,
        requestId: command.requestId
      });

      return succeeded;
    },

    cancelObsAction: async (rawCommand): Promise<ObsActionIntent> => {
      const command = CancelObsActionCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);
      const existing = await requireActionIntent(
        command.input.actionIntentId,
        command.actor,
        command.requestId
      );
      const now = clock();

      // Cancel never touches the port. The pure `cancel` transition rejects a
      // terminal intent (succeeded/failed/canceled) → VALIDATION_FAILED.
      const canceled = await advanceIntent(
        toDomainActionIntent(existing),
        "cancel",
        now,
        command.actor,
        command.requestId,
        undefined
      );
      await appendActionLogEntry({
        actionIntentRef: canceled.actionIntentId,
        actor: command.actor,
        connectionProfileId: canceled.connectionProfileId,
        occurredAt: now,
        outcome: "canceled",
        reason: `Canceled ${canceled.kind}: ${command.input.reason}`,
        requestId: command.requestId
      });

      return canceled;
    },

    suggestObsActionWithAi: async (rawCommand): Promise<ObsActionIntent> => {
      const command = SuggestObsActionWithAiCommandSchema.parse(rawCommand);
      assertObsCommandRole(command.actor);

      if (aiSuggestionPort === undefined) {
        throw new ObsDomainError(
          "VALIDATION_FAILED",
          "The OBS AI suggestion provider is not configured."
        );
      }

      const profile = await requireConnectionProfile(
        command.input.connectionProfileId,
        command.actor,
        command.requestId
      );
      const now = clock();

      // Build the smallest secret-free + PII-free projection from the last-known
      // persisted catalog/state snapshot. The connection contributes its opaque id
      // + coarse status ONLY — never its connectionRef vault handle. The builder
      // structurally asserts the projection carries no secret before it leaves.
      const prompt = buildObsAiActionSuggestionPrompt({
        aiPolicyProfile: command.input.aiPolicyProfile ?? DEFAULT_PII_FREE_AI_POLICY,
        connection: toDomainConnectionProfile(profile),
        operatorIntent: command.input.operatorIntent,
        recording: await recordingStateOrDefault(
          profile,
          now,
          command.actor,
          command.requestId
        ),
        requestId: command.requestId,
        scenes: await tenantScenesForConnection(
          profile.connectionProfileId,
          command.actor,
          command.requestId
        ),
        sceneItems: await tenantSceneItemsForConnection(
          profile.connectionProfileId,
          command.actor,
          command.requestId
        ),
        serviceSegmentLabels: command.input.serviceSegmentLabels,
        sources: await tenantSourcesForConnection(
          profile.connectionProfileId,
          command.actor,
          command.requestId
        ),
        stream: await streamStateOrDefault(
          profile,
          now,
          command.actor,
          command.requestId
        ),
        tenantId: command.actor.tenantId
      });

      // The port returns untrusted output; re-validate before any persistence. A
      // schema failure surfaces as a typed VALIDATION_FAILED error (never a raw
      // ZodError), and NO intent is created.
      const parsed = ObsAiActionSuggestionSchema.safeParse(
        await aiSuggestionPort.suggestObsAction(prompt)
      );

      if (!parsed.success) {
        throw new ObsDomainError(
          "VALIDATION_FAILED",
          "The AI action suggestion failed validation."
        );
      }

      const suggestion = parsed.data;

      if (suggestion.status !== "suggested") {
        throw new ObsDomainError(
          "VALIDATION_FAILED",
          "The AI could not produce a usable OBS action suggestion."
        );
      }

      // Create the suggestion as a `requested`, origin="ai-suggested" intent
      // through the SAME shared creation path a human request uses — eligibility
      // checked, no port touched. It is born unconfirmed and bound by the slice-7
      // gate: it can NEVER self-advance to confirmed/dispatched, so the AI can
      // never go live.
      return createRequestedActionIntent(command.actor, command.requestId, profile, now, {
        kind: suggestion.kind,
        origin: "ai-suggested",
        requestedByRef: command.input.requestedByRef,
        ...(suggestion.desiredMuted !== undefined
          ? { desiredMuted: suggestion.desiredMuted }
          : {}),
        ...(suggestion.desiredVisible !== undefined
          ? { desiredVisible: suggestion.desiredVisible }
          : {}),
        ...(suggestion.targetSceneItemId !== undefined
          ? { targetSceneItemId: suggestion.targetSceneItemId }
          : {}),
        ...(suggestion.targetSceneRef !== undefined
          ? { targetSceneRef: suggestion.targetSceneRef }
          : {}),
        ...(suggestion.targetSourceRef !== undefined
          ? { targetSourceRef: suggestion.targetSourceRef }
          : {})
      });
    }
  };

  return { commandService, queryService };
};

const createObsIds = (
  overrides: Partial<PersistenceBackedObsServiceIds> | undefined
): PersistenceBackedObsServiceIds => {
  const counter = (prefix: string): (() => string) => {
    let next = 1;

    return (): string => {
      const value = `${prefix}_${String(next)}`;
      next += 1;
      return value;
    };
  };

  return {
    actionIntentId: overrides?.actionIntentId ?? counter("action_intent"),
    connectionProfileId: overrides?.connectionProfileId ?? counter("connection_profile"),
    logEntryId: overrides?.logEntryId ?? counter("log_entry"),
    sceneId: overrides?.sceneId ?? counter("scene"),
    sceneItemId: overrides?.sceneItemId ?? counter("scene_item"),
    sourceId: overrides?.sourceId ?? counter("source")
  };
};

/**
 * Map the pure eligibility block reasons to a typed domain error. A block whose
 * only reason is `obs-disconnected` surfaces as `OBS_DISCONNECTED` (the
 * graceful-degradation signal the plan prescribes); every other ineligibility
 * surfaces as `ACTION_INELIGIBLE`. The reasons are joined into the redacted
 * `safeMessage`.
 */
const ineligibilityError = (reasons: readonly ActionBlockReason[]): ObsDomainError => {
  const joined = reasons.join(", ");

  if (reasons.length === 1 && reasons[0] === "obs-disconnected") {
    return new ObsDomainError(
      "OBS_DISCONNECTED",
      "OBS is disconnected, so this action cannot be requested."
    );
  }

  return new ObsDomainError(
    "ACTION_INELIGIBLE",
    `This OBS action is not eligible against the current snapshot (${joined}).`
  );
};

/**
 * Flatten a branded domain `ObsActionIntent` to its persistence input shape (plain
 * storage strings + a flattened `confirmation`). The persistence schema's
 * superRefine re-asserts the same gate invariants the domain schema enforces.
 */
const toPersistenceActionIntent = (
  intent: ObsActionIntent
): ObsActionIntentPersistenceRecord => ({
  actionIntentId: intent.actionIntentId,
  affectsLiveOutput: intent.affectsLiveOutput,
  connectionProfileId: intent.connectionProfileId,
  createdAt: intent.createdAt,
  kind: intent.kind,
  origin: intent.origin,
  requestedByRef: intent.requestedByRef,
  status: intent.status,
  tenantId: intent.tenantId,
  updatedAt: intent.updatedAt,
  ...(intent.confirmation !== undefined
    ? {
        confirmation: {
          confirmed: true,
          confirmedAt: intent.confirmation.confirmedAt,
          confirmedByRef: intent.confirmation.confirmedByRef,
          reason: intent.confirmation.reason
        }
      }
    : {}),
  ...(intent.desiredMuted !== undefined ? { desiredMuted: intent.desiredMuted } : {}),
  ...(intent.desiredVisible !== undefined
    ? { desiredVisible: intent.desiredVisible }
    : {}),
  ...(intent.safeFailureMessage !== undefined
    ? { safeFailureMessage: intent.safeFailureMessage }
    : {}),
  ...(intent.targetSceneItemId !== undefined
    ? { targetSceneItemId: intent.targetSceneItemId }
    : {}),
  ...(intent.targetSceneRef !== undefined
    ? { targetSceneRef: intent.targetSceneRef }
    : {}),
  ...(intent.targetSourceRef !== undefined
    ? { targetSourceRef: intent.targetSourceRef }
    : {})
});

const toDomainConnectionProfile = (
  record: ObsConnectionProfilePersistenceRecord
): ObsConnectionProfile =>
  ObsConnectionProfileSchema.parse({
    connectionProfileId: record.connectionProfileId,
    connectionRef: record.connectionRef,
    connectionStatus: record.connectionStatus,
    createdAt: record.createdAt,
    label: record.label,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.lastSeenAt !== undefined ? { lastSeenAt: record.lastSeenAt } : {}),
    ...(record.obsWebsocketVersion !== undefined
      ? { obsWebsocketVersion: record.obsWebsocketVersion }
      : {})
  });

const toDomainScene = (record: ObsScenePersistenceRecord): ObsScene =>
  ObsSceneSchema.parse({
    connectionProfileId: record.connectionProfileId,
    displayName: record.displayName,
    isCurrentProgramScene: record.isCurrentProgramScene,
    obsSceneRef: record.obsSceneRef,
    orderHint: record.orderHint,
    sceneId: record.sceneId,
    snapshotAt: record.snapshotAt,
    tenantId: record.tenantId
  });

const toDomainSource = (record: ObsSourcePersistenceRecord): ObsSource =>
  ObsSourceSchema.parse({
    connectionProfileId: record.connectionProfileId,
    kindLabel: record.kindLabel,
    obsSourceRef: record.obsSourceRef,
    snapshotAt: record.snapshotAt,
    sourceId: record.sourceId,
    tenantId: record.tenantId,
    ...(record.activeHint !== undefined ? { activeHint: record.activeHint } : {}),
    ...(record.mutedHint !== undefined ? { mutedHint: record.mutedHint } : {})
  });

const toDomainSceneItem = (record: ObsSceneItemPersistenceRecord): ObsSceneItem =>
  ObsSceneItemSchema.parse({
    connectionProfileId: record.connectionProfileId,
    obsSceneItemId: record.obsSceneItemId,
    orderHint: record.orderHint,
    sceneItemId: record.sceneItemId,
    sceneRef: record.sceneRef,
    snapshotAt: record.snapshotAt,
    sourceRef: record.sourceRef,
    tenantId: record.tenantId,
    visibleHint: record.visibleHint
  });

const toDomainStreamState = (
  record: ObsStreamStatePersistenceRecord
): ObsStreamState =>
  ObsStreamStateSchema.parse({
    connectionProfileId: record.connectionProfileId,
    streamStatus: record.streamStatus,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.lastActionIntentRef !== undefined
      ? { lastActionIntentRef: record.lastActionIntentRef }
      : {}),
    ...(record.lastTransitionActorId !== undefined
      ? { lastTransitionActorId: record.lastTransitionActorId }
      : {}),
    ...(record.lastTransitionAt !== undefined
      ? { lastTransitionAt: record.lastTransitionAt }
      : {})
  });

const toDomainRecordingState = (
  record: ObsRecordingStatePersistenceRecord
): ObsRecordingState =>
  ObsRecordingStateSchema.parse({
    connectionProfileId: record.connectionProfileId,
    recordingStatus: record.recordingStatus,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.lastTransitionActorId !== undefined
      ? { lastTransitionActorId: record.lastTransitionActorId }
      : {}),
    ...(record.lastTransitionAt !== undefined
      ? { lastTransitionAt: record.lastTransitionAt }
      : {})
  });

const toDomainActionIntent = (
  record: ObsActionIntentPersistenceRecord
): ObsActionIntent =>
  ObsActionIntentSchema.parse({
    actionIntentId: record.actionIntentId,
    affectsLiveOutput: record.affectsLiveOutput,
    connectionProfileId: record.connectionProfileId,
    createdAt: record.createdAt,
    kind: record.kind,
    origin: record.origin,
    requestedByRef: record.requestedByRef,
    status: record.status,
    tenantId: record.tenantId,
    updatedAt: record.updatedAt,
    ...(record.confirmation !== undefined
      ? { confirmation: record.confirmation }
      : {}),
    ...(record.desiredMuted !== undefined ? { desiredMuted: record.desiredMuted } : {}),
    ...(record.desiredVisible !== undefined
      ? { desiredVisible: record.desiredVisible }
      : {}),
    ...(record.safeFailureMessage !== undefined
      ? { safeFailureMessage: record.safeFailureMessage }
      : {}),
    ...(record.targetSceneItemId !== undefined
      ? { targetSceneItemId: record.targetSceneItemId }
      : {}),
    ...(record.targetSceneRef !== undefined
      ? { targetSceneRef: record.targetSceneRef }
      : {}),
    ...(record.targetSourceRef !== undefined
      ? { targetSourceRef: record.targetSourceRef }
      : {})
  });

const toDomainActionLogEntry = (
  record: ObsActionLogEntryPersistenceRecord
): ObsActionLogEntry =>
  ObsActionLogEntrySchema.parse({
    actionIntentRef: record.actionIntentRef,
    actorId: record.actorId,
    connectionProfileId: record.connectionProfileId,
    logEntryId: record.logEntryId,
    occurredAt: record.occurredAt,
    outcome: record.outcome,
    reason: record.reason,
    tenantId: record.tenantId,
    ...(record.safeMessage !== undefined ? { safeMessage: record.safeMessage } : {})
  });

const toReadOptions = (
  actor: AuthenticatedActor,
  requestId: string
): ObsPersistenceReadOptions => ({
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
): ObsPersistenceWriteOptions => ({
  ...toReadOptions(actor, requestId),
  intent
});

const assertObsQueryRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, obsQueryRoles)) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to read OBS resources."
    );
  }
};

const assertObsCommandRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, obsCommandRoles)) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to manage this OBS resource."
    );
  }
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));

const assertTenantScopedProfile = (
  record: ObsConnectionProfilePersistenceRecord,
  expectedTenantId: string
): ObsConnectionProfilePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS connection profile."
    );
  }

  return record;
};

const assertTenantScopedScene = (
  record: ObsScenePersistenceRecord,
  expectedTenantId: string
): ObsScenePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS scene."
    );
  }

  return record;
};

const assertTenantScopedSource = (
  record: ObsSourcePersistenceRecord,
  expectedTenantId: string
): ObsSourcePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS source."
    );
  }

  return record;
};

const assertTenantScopedSceneItem = (
  record: ObsSceneItemPersistenceRecord,
  expectedTenantId: string
): ObsSceneItemPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS scene item."
    );
  }

  return record;
};

const assertTenantScopedStreamState = (
  record: ObsStreamStatePersistenceRecord,
  expectedTenantId: string
): ObsStreamStatePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS stream state."
    );
  }

  return record;
};

const assertTenantScopedRecordingState = (
  record: ObsRecordingStatePersistenceRecord,
  expectedTenantId: string
): ObsRecordingStatePersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS recording state."
    );
  }

  return record;
};

const assertTenantScopedIntent = (
  record: ObsActionIntentPersistenceRecord,
  expectedTenantId: string
): ObsActionIntentPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS action intent."
    );
  }

  return record;
};

const assertTenantScopedLogEntry = (
  record: ObsActionLogEntryPersistenceRecord,
  expectedTenantId: string
): ObsActionLogEntryPersistenceRecord => {
  if (record.tenantId !== expectedTenantId) {
    throw new ObsDomainError(
      "AUTHORIZATION_FAILED",
      "You are not allowed to access this OBS action log entry."
    );
  }

  return record;
};
