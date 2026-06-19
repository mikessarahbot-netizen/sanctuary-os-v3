import type { AuthenticatedActor } from "../../auth/index.js";
import {
  GetObsConnectionProfileQuerySchema,
  GetObsRecordingStateQuerySchema,
  GetObsStreamStateQuerySchema,
  ListObsActionIntentsQuerySchema,
  ListObsActionLogQuerySchema,
  ListObsConnectionProfilesQuerySchema,
  ListObsSceneItemsQuerySchema,
  ListObsScenesQuerySchema,
  ListObsSourcesQuerySchema,
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
  checkActionEligibility,
  type ActionBlockReason,
  type ActionEligibilitySnapshot,
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
} from "../../domain/obs/index.js";
import {
  type ObsControlPort,
  type ObsObservedCatalog
} from "./control-port.js";
import { createFakeObsControlPort } from "./fake-control-port.js";

/**
 * In-memory OBS service adapter — the slice-6 test double.
 *
 * Implements both `ObsQueryService` and `ObsCommandService` over per-tenant
 * in-memory maps, mirroring the Charts/Play/Community in-memory adapters: Zod
 * validation on every operation, an injected clock + id generators, role checks,
 * tenant isolation, and typed `ObsDomainError`s.
 *
 * OBS controls live, public-facing output, so this slice still observes the
 * module's structural safety rules even though it stops short of dispatch:
 *   - **No secrets.** A connection profile holds only an opaque `connectionRef`
 *     (a vault handle); there is no host/port/password/token field anywhere.
 *   - **`requestObsAction` never touches the port.** It runs the pure
 *     `checkActionEligibility` precondition checker against the last-known
 *     catalog/state snapshot and, on an eligible request, persists an
 *     `ObsActionIntent` at `status = requested` (origin per input). Nothing is
 *     dispatched — no `setCurrentProgramScene` / `startStream` / `setInputMute` /
 *     `setSceneItemEnabled` / `stopStream` is ever called here. The
 *     confirm→dispatch gate is slice 7.
 *   - **Online-only catalog refresh, no output mutation.** `refreshObsCatalog`
 *     asks the injected `ObsControlPort` for the live catalog/status (read-only
 *     port methods) and reconciles the durable snapshot; it changes no OBS state.
 *
 * The obs-websocket session is isolated behind the injected `ObsControlPort` (the
 * slice-5 fake here; the real client is slice 11) — the service only orchestrates,
 * validates, clocks, audits, and stores.
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

export interface InMemoryObsServiceSeed {
  readonly actionIntents?: readonly ObsActionIntent[];
  readonly actionLog?: readonly ObsActionLogEntry[];
  readonly connectionProfiles?: readonly ObsConnectionProfile[];
  readonly recordingStates?: readonly ObsRecordingState[];
  readonly scenes?: readonly ObsScene[];
  readonly sceneItems?: readonly ObsSceneItem[];
  readonly sources?: readonly ObsSource[];
  readonly streamStates?: readonly ObsStreamState[];
}

export interface InMemoryObsServiceIds {
  readonly actionIntentId: () => string;
  readonly connectionProfileId: () => string;
  readonly logEntryId: () => string;
  readonly sceneId: () => string;
  readonly sceneItemId: () => string;
  readonly sourceId: () => string;
}

export interface InMemoryObsServiceDependencies {
  readonly clock?: () => string;
  readonly controlPort?: ObsControlPort;
  readonly ids?: Partial<InMemoryObsServiceIds>;
  readonly seed?: InMemoryObsServiceSeed;
}

export interface InMemoryObsServicesAdapter {
  readonly commandService: ObsCommandService;
  readonly queryService: ObsQueryService;
  readonly readActionIntents: () => readonly ObsActionIntent[];
  readonly readActionLog: () => readonly ObsActionLogEntry[];
  readonly readConnectionProfiles: () => readonly ObsConnectionProfile[];
  readonly readRecordingStates: () => readonly ObsRecordingState[];
  readonly readScenes: () => readonly ObsScene[];
  readonly readSceneItems: () => readonly ObsSceneItem[];
  readonly readSources: () => readonly ObsSource[];
  readonly readStreamStates: () => readonly ObsStreamState[];
}

const scopedKey = (tenantId: string, id: string): string => `${tenantId}::${id}`;

const connectionScopedKey = (
  tenantId: string,
  connectionProfileId: string
): string => `${tenantId}::${connectionProfileId}`;

export const createInMemoryObsServicesAdapter = (
  dependencies: InMemoryObsServiceDependencies = {}
): InMemoryObsServicesAdapter => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const ids = createObsIds(dependencies.ids);
  // Default to a disconnected fake so `refreshObsCatalog` degrades gracefully
  // (reports `disconnected`) when no port is injected — never a thrown surprise.
  const controlPort =
    dependencies.controlPort ??
    createFakeObsControlPort({ failures: { getSceneList: { code: "disconnected" } } })
      .port;

  const connectionProfiles = new Map<string, ObsConnectionProfile>();
  const scenes = new Map<string, ObsScene>();
  const sources = new Map<string, ObsSource>();
  const sceneItems = new Map<string, ObsSceneItem>();
  const streamStates = new Map<string, ObsStreamState>();
  const recordingStates = new Map<string, ObsRecordingState>();
  const actionIntents = new Map<string, ObsActionIntent>();
  const actionLog = new Map<string, ObsActionLogEntry>();

  dependencies.seed?.connectionProfiles?.forEach((profile) => {
    const parsed = ObsConnectionProfileSchema.parse(profile);
    connectionProfiles.set(scopedKey(parsed.tenantId, parsed.connectionProfileId), parsed);
  });
  dependencies.seed?.scenes?.forEach((scene) => {
    const parsed = ObsSceneSchema.parse(scene);
    scenes.set(scopedKey(parsed.tenantId, parsed.sceneId), parsed);
  });
  dependencies.seed?.sources?.forEach((source) => {
    const parsed = ObsSourceSchema.parse(source);
    sources.set(scopedKey(parsed.tenantId, parsed.sourceId), parsed);
  });
  dependencies.seed?.sceneItems?.forEach((sceneItem) => {
    const parsed = ObsSceneItemSchema.parse(sceneItem);
    sceneItems.set(scopedKey(parsed.tenantId, parsed.sceneItemId), parsed);
  });
  dependencies.seed?.streamStates?.forEach((state) => {
    const parsed = ObsStreamStateSchema.parse(state);
    streamStates.set(
      connectionScopedKey(parsed.tenantId, parsed.connectionProfileId),
      parsed
    );
  });
  dependencies.seed?.recordingStates?.forEach((state) => {
    const parsed = ObsRecordingStateSchema.parse(state);
    recordingStates.set(
      connectionScopedKey(parsed.tenantId, parsed.connectionProfileId),
      parsed
    );
  });
  dependencies.seed?.actionIntents?.forEach((intent) => {
    const parsed = ObsActionIntentSchema.parse(intent);
    actionIntents.set(scopedKey(parsed.tenantId, parsed.actionIntentId), parsed);
  });
  dependencies.seed?.actionLog?.forEach((entry) => {
    const parsed = ObsActionLogEntrySchema.parse(entry);
    actionLog.set(scopedKey(parsed.tenantId, parsed.logEntryId), parsed);
  });

  const requireConnectionProfile = (
    tenantId: string,
    connectionProfileId: string
  ): ObsConnectionProfile => {
    const profile = connectionProfiles.get(scopedKey(tenantId, connectionProfileId));

    if (profile === undefined) {
      throw new ObsDomainError(
        "CONNECTION_PROFILE_NOT_FOUND",
        "This OBS connection profile is no longer available on the server."
      );
    }

    return profile;
  };

  const tenantScenesForConnection = (
    tenantId: string,
    connectionProfileId: string
  ): ObsScene[] =>
    [...scenes.values()].filter(
      (scene) =>
        scene.tenantId === tenantId &&
        scene.connectionProfileId === connectionProfileId
    );

  const tenantSourcesForConnection = (
    tenantId: string,
    connectionProfileId: string
  ): ObsSource[] =>
    [...sources.values()].filter(
      (source) =>
        source.tenantId === tenantId &&
        source.connectionProfileId === connectionProfileId
    );

  const tenantSceneItemsForConnection = (
    tenantId: string,
    connectionProfileId: string
  ): ObsSceneItem[] =>
    [...sceneItems.values()].filter(
      (sceneItem) =>
        sceneItem.tenantId === tenantId &&
        sceneItem.connectionProfileId === connectionProfileId
    );

  /**
   * The last-known coarse stream snapshot for a connection, or a synthesized
   * `unknown` row when none has been persisted yet. The eligibility checker needs
   * a stream state; an `unknown` status blocks neither `start-stream` nor
   * `stop-stream`, matching the "read snapshot stays available, flagged stale"
   * posture before a refresh has run.
   */
  const streamStateOrDefault = (
    profile: ObsConnectionProfile,
    now: string
  ): ObsStreamState => {
    const existing = streamStates.get(
      connectionScopedKey(profile.tenantId, profile.connectionProfileId)
    );

    if (existing !== undefined) {
      return existing;
    }

    return ObsStreamStateSchema.parse({
      connectionProfileId: profile.connectionProfileId,
      streamStatus: "unknown",
      tenantId: profile.tenantId,
      updatedAt: now
    });
  };

  const recordingStateOrDefault = (
    profile: ObsConnectionProfile,
    now: string
  ): ObsRecordingState => {
    const existing = recordingStates.get(
      connectionScopedKey(profile.tenantId, profile.connectionProfileId)
    );

    if (existing !== undefined) {
      return existing;
    }

    return ObsRecordingStateSchema.parse({
      connectionProfileId: profile.connectionProfileId,
      recordingStatus: "unknown",
      tenantId: profile.tenantId,
      updatedAt: now
    });
  };

  const appendActionLogEntry = (input: {
    readonly actor: AuthenticatedActor;
    readonly actionIntentRef: string;
    readonly connectionProfileId: string;
    readonly occurredAt: string;
    readonly outcome: ObsActionLogEntry["outcome"];
    readonly reason: string;
  }): void => {
    const entry = ObsActionLogEntrySchema.parse({
      actionIntentRef: input.actionIntentRef,
      actorId: input.actor.actorId,
      connectionProfileId: input.connectionProfileId,
      logEntryId: ids.logEntryId(),
      occurredAt: input.occurredAt,
      outcome: input.outcome,
      reason: input.reason,
      tenantId: input.actor.tenantId
    });
    actionLog.set(scopedKey(entry.tenantId, entry.logEntryId), entry);
  };

  /**
   * Replace a connection's entire catalog snapshot from a freshly-observed port
   * read. Deterministic single-program-scene resolution: a scene is the program
   * scene only if its ref matches the observed `currentProgramSceneRef` (so at
   * most one is `true`). Prior scene/source/scene-item rows for the connection are
   * dropped, then the observed rows are persisted with fresh, deterministic ids
   * and the injected `snapshotAt`. Never contacts the port — the caller does.
   */
  const replaceCatalogSnapshot = (
    profile: ObsConnectionProfile,
    catalog: ObsObservedCatalog,
    snapshotAt: string
  ): {
    readonly scenes: ObsScene[];
    readonly sceneItems: ObsSceneItem[];
    readonly sources: ObsSource[];
  } => {
    const tenantId = profile.tenantId;
    const connectionProfileId = profile.connectionProfileId;

    for (const [key, scene] of scenes.entries()) {
      if (
        scene.tenantId === tenantId &&
        scene.connectionProfileId === connectionProfileId
      ) {
        scenes.delete(key);
      }
    }
    for (const [key, source] of sources.entries()) {
      if (
        source.tenantId === tenantId &&
        source.connectionProfileId === connectionProfileId
      ) {
        sources.delete(key);
      }
    }
    for (const [key, sceneItem] of sceneItems.entries()) {
      if (
        sceneItem.tenantId === tenantId &&
        sceneItem.connectionProfileId === connectionProfileId
      ) {
        sceneItems.delete(key);
      }
    }

    const nextScenes = catalog.scenes.map((scene, index) =>
      ObsSceneSchema.parse({
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
    for (const scene of nextScenes) {
      scenes.set(scopedKey(scene.tenantId, scene.sceneId), scene);
    }

    const nextSources = catalog.sources.map((source) =>
      ObsSourceSchema.parse({
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
    for (const source of nextSources) {
      sources.set(scopedKey(source.tenantId, source.sourceId), source);
    }

    const nextSceneItems = catalog.sceneItems.map((sceneItem, index) =>
      ObsSceneItemSchema.parse({
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
    for (const sceneItem of nextSceneItems) {
      sceneItems.set(scopedKey(sceneItem.tenantId, sceneItem.sceneItemId), sceneItem);
    }

    return { sceneItems: nextSceneItems, scenes: nextScenes, sources: nextSources };
  };

  const queryService: ObsQueryService = {
    listObsConnectionProfiles: (rawQuery): Promise<readonly ObsConnectionProfile[]> =>
      runObsOperation((): readonly ObsConnectionProfile[] => {
        const query = ListObsConnectionProfilesQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const filter = query.input.filter;

        return [...connectionProfiles.values()].filter(
          (profile) =>
            profile.tenantId === query.actor.tenantId &&
            (filter?.connectionStatus === undefined ||
              profile.connectionStatus === filter.connectionStatus)
        );
      }),

    getObsConnectionProfile: (rawQuery): Promise<ObsConnectionProfile | null> =>
      runObsOperation((): ObsConnectionProfile | null => {
        const query = GetObsConnectionProfileQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const profile = connectionProfiles.get(
          scopedKey(query.actor.tenantId, query.input.connectionProfileId)
        );

        return profile ?? null;
      }),

    listObsScenes: (rawQuery): Promise<readonly ObsScene[]> =>
      runObsOperation((): readonly ObsScene[] => {
        const query = ListObsScenesQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);

        return tenantScenesForConnection(
          query.actor.tenantId,
          query.input.connectionProfileId
        );
      }),

    listObsSources: (rawQuery): Promise<readonly ObsSource[]> =>
      runObsOperation((): readonly ObsSource[] => {
        const query = ListObsSourcesQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);

        return tenantSourcesForConnection(
          query.actor.tenantId,
          query.input.connectionProfileId
        );
      }),

    listObsSceneItems: (rawQuery): Promise<readonly ObsSceneItem[]> =>
      runObsOperation((): readonly ObsSceneItem[] => {
        const query = ListObsSceneItemsQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const sceneRef = query.input.sceneRef;

        return tenantSceneItemsForConnection(
          query.actor.tenantId,
          query.input.connectionProfileId
        ).filter((sceneItem) => sceneRef === undefined || sceneItem.sceneRef === sceneRef);
      }),

    getObsStreamState: (rawQuery): Promise<ObsStreamState | null> =>
      runObsOperation((): ObsStreamState | null => {
        const query = GetObsStreamStateQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const state = streamStates.get(
          connectionScopedKey(query.actor.tenantId, query.input.connectionProfileId)
        );

        return state ?? null;
      }),

    getObsRecordingState: (rawQuery): Promise<ObsRecordingState | null> =>
      runObsOperation((): ObsRecordingState | null => {
        const query = GetObsRecordingStateQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const state = recordingStates.get(
          connectionScopedKey(query.actor.tenantId, query.input.connectionProfileId)
        );

        return state ?? null;
      }),

    listObsActionIntents: (rawQuery): Promise<readonly ObsActionIntent[]> =>
      runObsOperation((): readonly ObsActionIntent[] => {
        const query = ListObsActionIntentsQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);
        const filter = query.input.filter;

        return [...actionIntents.values()].filter(
          (intent) =>
            intent.tenantId === query.actor.tenantId &&
            (filter?.connectionProfileId === undefined ||
              intent.connectionProfileId === filter.connectionProfileId) &&
            (filter?.status === undefined || intent.status === filter.status)
        );
      }),

    listObsActionLog: (rawQuery): Promise<readonly ObsActionLogEntry[]> =>
      runObsOperation((): readonly ObsActionLogEntry[] => {
        const query = ListObsActionLogQuerySchema.parse(rawQuery);
        assertObsQueryRole(query.actor);

        return [...actionLog.values()].filter(
          (entry) =>
            entry.tenantId === query.actor.tenantId &&
            entry.connectionProfileId === query.input.connectionProfileId
        );
      })
  };

  const commandService: ObsCommandService = {
    saveObsConnectionProfile: (rawCommand): Promise<ObsConnectionProfile> =>
      runObsOperation((): ObsConnectionProfile => {
        const command = SaveObsConnectionProfileCommandSchema.parse(rawCommand);
        assertObsCommandRole(command.actor);
        const now = clock();
        const connectionProfileId =
          command.input.connectionProfileId ?? ids.connectionProfileId();
        const existing = connectionProfiles.get(
          scopedKey(command.actor.tenantId, connectionProfileId)
        );

        const profile = ObsConnectionProfileSchema.parse({
          connectionProfileId,
          connectionRef: command.input.connectionRef,
          connectionStatus:
            command.input.connectionStatus ??
            existing?.connectionStatus ??
            "unknown",
          createdAt: existing?.createdAt ?? now,
          label: command.input.label,
          tenantId: command.actor.tenantId,
          updatedAt: now,
          ...(existing?.lastSeenAt !== undefined
            ? { lastSeenAt: existing.lastSeenAt }
            : {}),
          ...(existing?.obsWebsocketVersion !== undefined
            ? { obsWebsocketVersion: existing.obsWebsocketVersion }
            : {})
        });
        connectionProfiles.set(
          scopedKey(profile.tenantId, profile.connectionProfileId),
          profile
        );

        return profile;
      }),

    removeObsConnectionProfile: (rawCommand): Promise<void> =>
      runObsOperation((): void => {
        const command = RemoveObsConnectionProfileCommandSchema.parse(rawCommand);
        assertObsCommandRole(command.actor);
        const key = scopedKey(
          command.actor.tenantId,
          command.input.connectionProfileId
        );

        if (!connectionProfiles.has(key)) {
          throw new ObsDomainError(
            "CONNECTION_PROFILE_NOT_FOUND",
            "This OBS connection profile is no longer available on the server."
          );
        }

        connectionProfiles.delete(key);
      }),

    refreshObsCatalog: (rawCommand): Promise<ObsCatalogSnapshot> =>
      runObsOperation(async (): Promise<ObsCatalogSnapshot> => {
        const command = RefreshObsCatalogCommandSchema.parse(rawCommand);
        assertObsCommandRole(command.actor);
        const profile = requireConnectionProfile(
          command.actor.tenantId,
          command.input.connectionProfileId
        );

        // Read-only port calls. A disconnected/failed read surfaces as a typed
        // OBS_DISCONNECTED domain error (graceful degradation) — no OBS state is
        // ever mutated by a refresh.
        let catalog: ObsObservedCatalog;
        let observedStreamStatus: ObsStreamState["streamStatus"];
        let observedRecordingStatus: ObsRecordingState["recordingStatus"];
        try {
          catalog = await controlPort.getSceneList(profile.connectionRef);
          observedStreamStatus = (
            await controlPort.getStreamStatus(profile.connectionRef)
          ).streamStatus;
          observedRecordingStatus = (
            await controlPort.getRecordStatus(profile.connectionRef)
          ).recordingStatus;
        } catch {
          throw new ObsDomainError(
            "OBS_DISCONNECTED",
            "OBS is not reachable, so the catalog could not be refreshed."
          );
        }

        const now = clock();
        const snapshot = replaceCatalogSnapshot(profile, catalog, now);

        const streamState = ObsStreamStateSchema.parse({
          connectionProfileId: profile.connectionProfileId,
          streamStatus: observedStreamStatus,
          tenantId: profile.tenantId,
          updatedAt: now
        });
        streamStates.set(
          connectionScopedKey(streamState.tenantId, streamState.connectionProfileId),
          streamState
        );

        const recordingState = ObsRecordingStateSchema.parse({
          connectionProfileId: profile.connectionProfileId,
          recordingStatus: observedRecordingStatus,
          tenantId: profile.tenantId,
          updatedAt: now
        });
        recordingStates.set(
          connectionScopedKey(
            recordingState.tenantId,
            recordingState.connectionProfileId
          ),
          recordingState
        );

        // A successful read means OBS answered: mark the profile connected and
        // stamp lastSeenAt. (Refresh reads OBS; it never changes OBS state.)
        const connectionProfile = ObsConnectionProfileSchema.parse({
          ...profile,
          connectionStatus: "connected",
          lastSeenAt: now,
          updatedAt: now
        });
        connectionProfiles.set(
          scopedKey(connectionProfile.tenantId, connectionProfile.connectionProfileId),
          connectionProfile
        );

        return {
          connectionProfile,
          recordingState,
          sceneItems: snapshot.sceneItems,
          scenes: snapshot.scenes,
          sources: snapshot.sources,
          streamState
        };
      }),

    requestObsAction: (rawCommand): Promise<ObsActionIntent> =>
      runObsOperation((): ObsActionIntent => {
        const command = RequestObsActionCommandSchema.parse(rawCommand);
        assertObsCommandRole(command.actor);
        const profile = requireConnectionProfile(
          command.actor.tenantId,
          command.input.connectionProfileId
        );
        const now = clock();

        // Build the proposed intent at status=requested. Every v1 kind affects
        // live output, so affectsLiveOutput is always true; the schema's
        // superRefine validates the per-kind target-ref shape and rejects a
        // confirmation on a requested action.
        const intent = ObsActionIntentSchema.parse({
          actionIntentId: ids.actionIntentId(),
          affectsLiveOutput: true,
          connectionProfileId: profile.connectionProfileId,
          createdAt: now,
          kind: command.input.kind,
          origin: command.input.origin,
          requestedByRef: command.input.requestedByRef,
          status: "requested",
          tenantId: command.actor.tenantId,
          updatedAt: now,
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

        // Run the PURE eligibility precondition checker against the last-known
        // snapshot. This NEVER touches the port — no dispatch happens at request
        // time. An ineligible request is rejected with a typed error (a
        // disconnected-only block maps to OBS_DISCONNECTED; any other block to
        // ACTION_INELIGIBLE) and no intent is persisted.
        const snapshot: ActionEligibilitySnapshot = {
          connection: profile,
          recording: recordingStateOrDefault(profile, now),
          scenes: tenantScenesForConnection(
            profile.tenantId,
            profile.connectionProfileId
          ),
          sceneItems: tenantSceneItemsForConnection(
            profile.tenantId,
            profile.connectionProfileId
          ),
          sources: tenantSourcesForConnection(
            profile.tenantId,
            profile.connectionProfileId
          ),
          stream: streamStateOrDefault(profile, now)
        };
        const eligibility = checkActionEligibility(intent, snapshot);

        if (!eligibility.eligible) {
          throw ineligibilityError(eligibility.reasons);
        }

        actionIntents.set(scopedKey(intent.tenantId, intent.actionIntentId), intent);
        appendActionLogEntry({
          actionIntentRef: intent.actionIntentId,
          actor: command.actor,
          connectionProfileId: intent.connectionProfileId,
          occurredAt: now,
          outcome: "requested",
          reason: `Requested ${intent.kind} (${intent.origin}).`
        });

        return intent;
      })
  };

  return {
    commandService,
    queryService,
    readActionIntents: (): readonly ObsActionIntent[] => [...actionIntents.values()],
    readActionLog: (): readonly ObsActionLogEntry[] => [...actionLog.values()],
    readConnectionProfiles: (): readonly ObsConnectionProfile[] => [
      ...connectionProfiles.values()
    ],
    readRecordingStates: (): readonly ObsRecordingState[] => [
      ...recordingStates.values()
    ],
    readScenes: (): readonly ObsScene[] => [...scenes.values()],
    readSceneItems: (): readonly ObsSceneItem[] => [...sceneItems.values()],
    readSources: (): readonly ObsSource[] => [...sources.values()],
    readStreamStates: (): readonly ObsStreamState[] => [...streamStates.values()]
  };
};

const createObsIds = (
  overrides: Partial<InMemoryObsServiceIds> | undefined
): InMemoryObsServiceIds => {
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
 * graceful-degradation signal the plan prescribes); every other ineligibility —
 * an unknown scene/source/scene-item, an already-streaming guard — surfaces as
 * `ACTION_INELIGIBLE`. The reasons are joined into the redacted `safeMessage`.
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

const runObsOperation = <TResult>(
  operation: () => TResult | Promise<TResult>
): Promise<TResult> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("OBS operation failed.")
    );
  }
};
