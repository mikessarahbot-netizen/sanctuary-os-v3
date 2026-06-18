import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema
} from "./repository-contracts.js";

/**
 * OBS persistence contracts for the tenant-scoped OBS Studio control surface.
 *
 * Durable, tenant-scoped Zod persistence records + per-operation input schemas +
 * read/write option guards + query/command repository interfaces, mirroring
 * `charts-repository-contracts.ts` / `play-repository-contracts.ts` /
 * `community-repository-contracts.ts` exactly in shape. These are the
 * storage-facing contract the slice-4 SQLite adapter realizes against the
 * `obs.v1` schema (`obs-migrations.ts`); they mirror the slice-1 API domain
 * (`apps/api/src/domain/obs/schemas.ts`) field-for-field but use plain storage
 * strings rather than branded IDs — the same relationship Charts/Play/Community
 * persistence records have to their API domains.
 *
 * Safety posture (this is the system's strongest "automation must fail
 * gracefully" surface — it controls live, public-facing output):
 *   - **No secrets / no credential columns.** A connection profile holds only an
 *     opaque `connectionRef` (a vault handle); the OBS host/port/password/auth
 *     token and any streaming-service stream key live exclusively in a separate
 *     access-controlled secret/vault boundary. Every record is `.strict()`, so a
 *     `host`/`port`/`password`/`token`/`streamKey`/`secret` key cannot be
 *     attached to any persistence record — the absence is structural, not just a
 *     runtime check (verified by a no-secrets contract test).
 *   - **Human-confirm gate is structural.** Every output-affecting
 *     `ObsActionIntent` carries `affectsLiveOutput = true`, can never be stored
 *     already-confirmed while still `requested`, and may occupy
 *     `confirmed`/`dispatched`/`succeeded` only once a human `confirmation`
 *     (`confirmed = true` + actor + reason + timestamp) is recorded. The
 *     `setObsActionIntentStatus` transition write re-asserts the same gate (the
 *     `confirm` step carries the confirmation). `origin = "ai-suggested"` intents
 *     are bound by the same gate and may exist past `requested` only with a
 *     human confirmation.
 *   - **Coarse only.** Stream/recording state is a coarse, resumable last-known
 *     snapshot — no bitrate / uptime / dropped-frame / per-frame telemetry,
 *     which stays on the local runtime bus, never here.
 *   - **No PII.** OBS controls production hardware/scenes, not people; the
 *     schemas provide nowhere to put it.
 *
 * Array fields (the scene/source/scene-item catalog snapshot replace) are
 * modeled here as **validated arrays**; the slice-4 adapter serializes them to
 * the underlying rows. Validating the structured shape at the contract layer
 * keeps the invariants enforceable before any serialization.
 *
 * Every persisted read/write requires an `actorId` (inlined `superRefine` on the
 * option schemas) so the operation is attributable for audit, exactly as
 * Charts/Play/Community require.
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const ObsPersistenceReadOptionsSchema = RepositoryReadOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OBS persistence read operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const ObsPersistenceWriteOptionsSchema = RepositoryWriteOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OBS persistence write operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const ObsStorageSchemaVersionSchema = z.literal("obs.v1");
export const ObsConnectionStatusSchema = z.enum([
  "connected",
  "disconnected",
  "unknown"
]);
export const ObsStreamStatusSchema = z.enum(["active", "inactive", "unknown"]);
export const ObsRecordingStatusSchema = z.enum([
  "active",
  "paused",
  "inactive",
  "unknown"
]);
export const ObsActionKindSchema = z.enum([
  "start-stream",
  "stop-stream",
  "switch-scene",
  "toggle-source-visibility",
  "toggle-source-mute"
]);
export const ObsActionStatusSchema = z.enum([
  "requested",
  "confirmed",
  "dispatched",
  "succeeded",
  "failed",
  "canceled"
]);
export const ObsActionOriginSchema = z.enum(["human", "ai-suggested"]);
export const ObsActionLogOutcomeSchema = z.enum([
  "requested",
  "confirmed",
  "dispatched",
  "succeeded",
  "failed",
  "canceled"
]);

/**
 * Statuses an `ObsActionIntent` may occupy only once a human confirmation is
 * recorded. `requested` is the sole pre-confirmation status; `failed`/`canceled`
 * are terminal branches reachable without confirmation. Mirrors the slice-1
 * domain `CONFIRMATION_GATED_STATUSES`.
 */
const CONFIRMATION_GATED_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "dispatched",
  "succeeded"
]);

/**
 * The recorded human confirmation that authorizes a dispatch. `confirmed` is a
 * literal `true` (an unconfirmed intent simply omits `confirmation`); every
 * confirmation pins the actor, reason, and timestamp for audit. Mirrors the
 * slice-1 domain `ObsActionConfirmation` and Community+
 * `CommunicationConfirmation`.
 */
export const ObsActionConfirmationPersistenceSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: IsoDateTimeStringSchema,
    confirmedByRef: NonEmptyStringSchema,
    reason: NonEmptyStringSchema
  })
  .strict();

/**
 * Connection-profile persistence record — the structural no-secret boundary.
 * Holds only an opaque `connectionRef` (a vault handle) + last-known status;
 * there is **no** `host`/`port`/`password`/`token`/`streamKey`/`secret` key on
 * this schema at all, and `.strict()` rejects any attempt to attach one.
 */
export const ObsConnectionProfilePersistenceRecordSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    connectionRef: NonEmptyStringSchema,
    connectionStatus: ObsConnectionStatusSchema,
    createdAt: IsoDateTimeStringSchema,
    label: NonEmptyStringSchema,
    lastSeenAt: OptionalNonEmptyStringSchema,
    obsWebsocketVersion: OptionalNonEmptyStringSchema,
    schemaVersion: ObsStorageSchemaVersionSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ObsScenePersistenceRecordSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    displayName: NonEmptyStringSchema,
    isCurrentProgramScene: z.boolean(),
    obsSceneRef: NonEmptyStringSchema,
    orderHint: NonNegativeIntegerSchema,
    sceneId: NonEmptyStringSchema,
    snapshotAt: IsoDateTimeStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export const ObsSourcePersistenceRecordSchema = z
  .object({
    activeHint: z.boolean().optional(),
    connectionProfileId: NonEmptyStringSchema,
    kindLabel: NonEmptyStringSchema,
    mutedHint: z.boolean().optional(),
    obsSourceRef: NonEmptyStringSchema,
    snapshotAt: IsoDateTimeStringSchema,
    sourceId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export const ObsSceneItemPersistenceRecordSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    obsSceneItemId: NonEmptyStringSchema,
    orderHint: NonNegativeIntegerSchema,
    sceneItemId: NonEmptyStringSchema,
    sceneRef: NonEmptyStringSchema,
    snapshotAt: IsoDateTimeStringSchema,
    sourceRef: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    visibleHint: z.boolean()
  })
  .strict();

/**
 * Coarse, resumable stream snapshot — **one row per `(tenant,
 * connectionProfileId)`**. No bitrate / uptime / dropped-frame / per-frame
 * fields exist; that telemetry stays on the local runtime bus.
 */
export const ObsStreamStatePersistenceRecordSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    lastActionIntentRef: OptionalNonEmptyStringSchema,
    lastTransitionActorId: OptionalNonEmptyStringSchema,
    lastTransitionAt: OptionalNonEmptyStringSchema,
    streamStatus: ObsStreamStatusSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

/**
 * Coarse, resumable recording snapshot — one row per `(tenant,
 * connectionProfileId)`. No file path / bytes / codec.
 */
export const ObsRecordingStatePersistenceRecordSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    lastTransitionActorId: OptionalNonEmptyStringSchema,
    lastTransitionAt: OptionalNonEmptyStringSchema,
    recordingStatus: ObsRecordingStatusSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

/**
 * Output-affecting action intent — the durable form of the human-confirm gate.
 * Holds no socket handle, no obs-websocket payload, no credential; the per-kind
 * target-ref shape, the `affectsLiveOutput = true` invariant, the
 * confirm-before-dispatch invariant, and the ai-suggested-cannot-self-advance
 * rule are all encoded structurally via `superRefine`, mirroring the slice-1
 * domain `ObsActionIntent`.
 */
export const ObsActionIntentPersistenceRecordSchema = z
  .object({
    actionIntentId: NonEmptyStringSchema,
    affectsLiveOutput: z.boolean(),
    confirmation: ObsActionConfirmationPersistenceSchema.optional(),
    connectionProfileId: NonEmptyStringSchema,
    createdAt: IsoDateTimeStringSchema,
    desiredMuted: z.boolean().optional(),
    desiredVisible: z.boolean().optional(),
    kind: ObsActionKindSchema,
    origin: ObsActionOriginSchema,
    requestedByRef: NonEmptyStringSchema,
    safeFailureMessage: OptionalNonEmptyStringSchema,
    status: ObsActionStatusSchema,
    targetSceneItemId: OptionalNonEmptyStringSchema,
    targetSceneRef: OptionalNonEmptyStringSchema,
    targetSourceRef: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((intent, context) => {
    // Every v1 output action affects what viewers see/hear, so the gate applies
    // uniformly: affectsLiveOutput is always true.
    if (!intent.affectsLiveOutput) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Every v1 OBS action affects live output (affectsLiveOutput must be true).",
        path: ["affectsLiveOutput"]
      });
    }

    // Per-kind target-ref shape.
    switch (intent.kind) {
      case "switch-scene": {
        if (intent.targetSceneRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "switch-scene requires targetSceneRef.",
            path: ["targetSceneRef"]
          });
        }

        break;
      }

      case "toggle-source-visibility": {
        if (intent.targetSourceRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires targetSourceRef.",
            path: ["targetSourceRef"]
          });
        }

        if (intent.targetSceneItemId === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires targetSceneItemId.",
            path: ["targetSceneItemId"]
          });
        }

        if (intent.desiredVisible === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires desiredVisible.",
            path: ["desiredVisible"]
          });
        }

        break;
      }

      case "toggle-source-mute": {
        if (intent.targetSourceRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-mute requires targetSourceRef.",
            path: ["targetSourceRef"]
          });
        }

        if (intent.desiredMuted === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-mute requires desiredMuted.",
            path: ["desiredMuted"]
          });
        }

        break;
      }

      case "start-stream":
      case "stop-stream": {
        // Stream actions carry no target refs.
        if (intent.targetSceneRef !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${intent.kind} must not carry targetSceneRef.`,
            path: ["targetSceneRef"]
          });
        }

        if (intent.targetSourceRef !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${intent.kind} must not carry targetSourceRef.`,
            path: ["targetSourceRef"]
          });
        }

        if (intent.targetSceneItemId !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${intent.kind} must not carry targetSceneItemId.`,
            path: ["targetSceneItemId"]
          });
        }

        if (intent.desiredVisible !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${intent.kind} must not carry desiredVisible.`,
            path: ["desiredVisible"]
          });
        }

        if (intent.desiredMuted !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${intent.kind} must not carry desiredMuted.`,
            path: ["desiredMuted"]
          });
        }

        break;
      }
    }

    // desiredVisible belongs only to a visibility toggle; desiredMuted only to a
    // mute toggle. (Stream-kind cases above already reject both; this guards the
    // cross-pairings, e.g. desiredMuted on a switch-scene.)
    if (
      intent.desiredVisible !== undefined &&
      intent.kind !== "toggle-source-visibility"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "desiredVisible is allowed only on toggle-source-visibility.",
        path: ["desiredVisible"]
      });
    }

    if (intent.desiredMuted !== undefined && intent.kind !== "toggle-source-mute") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "desiredMuted is allowed only on toggle-source-mute.",
        path: ["desiredMuted"]
      });
    }

    // The human-confirm gate, expressed structurally: any status past `requested`
    // (other than the terminal failure branches) requires a recorded confirmation.
    if (
      CONFIRMATION_GATED_STATUSES.has(intent.status) &&
      intent.confirmation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Status may advance to confirmed/dispatched/succeeded only with a recorded human confirmation.",
        path: ["confirmation"]
      });
    }

    // An action that affects live output can never be stored already confirmed
    // while still `requested`: confirmation is a deliberate human step taken on
    // an existing request.
    if (intent.status === "requested" && intent.confirmation !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A requested action must not already carry a confirmation.",
        path: ["confirmation"]
      });
    }

    // AI may only ever *propose* an action: an `ai-suggested` intent can never
    // SELF-advance past `requested` without a human confirmation. Advancing it is
    // legal only once a human confirmation is recorded — so any ai-suggested
    // status other than `requested`/`canceled` must carry that confirmation.
    if (
      intent.origin === "ai-suggested" &&
      intent.status !== "requested" &&
      intent.status !== "canceled" &&
      intent.confirmation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "An ai-suggested action can never self-advance past requested without a human confirmation.",
        path: ["confirmation"]
      });
    }

    // The redacted failure message exists only on a failed action.
    if (intent.safeFailureMessage !== undefined && intent.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "safeFailureMessage is present only when status is failed.",
        path: ["safeFailureMessage"]
      });
    }
  });

/**
 * Append-only audit row for one action attempt. `safeMessage` is redacted and
 * present only for `failed`; the row never stores a raw obs-websocket response
 * or any secret. Mirrors the slice-1 domain `ObsActionLogEntry`.
 */
export const ObsActionLogEntryPersistenceRecordSchema = z
  .object({
    actionIntentRef: NonEmptyStringSchema,
    actorId: NonEmptyStringSchema,
    connectionProfileId: NonEmptyStringSchema,
    logEntryId: NonEmptyStringSchema,
    occurredAt: IsoDateTimeStringSchema,
    outcome: ObsActionLogOutcomeSchema,
    reason: NonEmptyStringSchema,
    safeMessage: OptionalNonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.safeMessage !== undefined && entry.outcome !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "safeMessage is present only when outcome is failed.",
        path: ["safeMessage"]
      });
    }
  });

export const ListObsConnectionProfilesPersistenceInputSchema = z
  .object({
    filter: z
      .object({ connectionStatus: ObsConnectionStatusSchema.optional() })
      .strict()
      .optional()
  })
  .strict();
export const GetObsConnectionProfilePersistenceInputSchema = z
  .object({ connectionProfileId: NonEmptyStringSchema })
  .strict();
export const ListObsScenesPersistenceInputSchema = z
  .object({ connectionProfileId: NonEmptyStringSchema })
  .strict();
export const GetObsScenePersistenceInputSchema = z
  .object({ sceneId: NonEmptyStringSchema })
  .strict();
export const ListObsSourcesPersistenceInputSchema = z
  .object({ connectionProfileId: NonEmptyStringSchema })
  .strict();
export const GetObsSourcePersistenceInputSchema = z
  .object({ sourceId: NonEmptyStringSchema })
  .strict();
export const ListObsSceneItemsPersistenceInputSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    sceneRef: OptionalNonEmptyStringSchema
  })
  .strict();
export const GetObsSceneItemPersistenceInputSchema = z
  .object({ sceneItemId: NonEmptyStringSchema })
  .strict();
export const GetObsStreamStatePersistenceInputSchema = z
  .object({ connectionProfileId: NonEmptyStringSchema })
  .strict();
export const GetObsRecordingStatePersistenceInputSchema = z
  .object({ connectionProfileId: NonEmptyStringSchema })
  .strict();
export const ListObsActionIntentsPersistenceInputSchema = z
  .object({
    filter: z
      .object({
        connectionProfileId: OptionalNonEmptyStringSchema,
        status: ObsActionStatusSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict();
export const GetObsActionIntentPersistenceInputSchema = z
  .object({ actionIntentId: NonEmptyStringSchema })
  .strict();
export const ListObsActionLogPersistenceInputSchema = z
  .object({
    actionIntentRef: OptionalNonEmptyStringSchema,
    connectionProfileId: NonEmptyStringSchema
  })
  .strict();

export const UpsertObsConnectionProfilePersistenceInputSchema =
  ObsConnectionProfilePersistenceRecordSchema;
export const UpsertObsScenePersistenceInputSchema = ObsScenePersistenceRecordSchema;
export const UpsertObsSourcePersistenceInputSchema = ObsSourcePersistenceRecordSchema;
export const UpsertObsSceneItemPersistenceInputSchema =
  ObsSceneItemPersistenceRecordSchema;

/**
 * Replace a connection's entire catalog snapshot (scenes + sources + scene-items)
 * in one tenant-scoped write — the persistence form of a reconciled
 * `refreshObsCatalog`. All three arrays must agree on `connectionProfileId`; at
 * most one scene may be `isCurrentProgramScene` (the single-program-scene
 * resolution); scene/source/scene-item refs are unique within the snapshot.
 */
export const ReplaceObsCatalogSnapshotPersistenceInputSchema = z
  .object({
    connectionProfileId: NonEmptyStringSchema,
    sceneItems: z.array(ObsSceneItemPersistenceRecordSchema),
    scenes: z.array(ObsScenePersistenceRecordSchema),
    sources: z.array(ObsSourcePersistenceRecordSchema)
  })
  .strict()
  .superRefine((snapshot, context) => {
    snapshot.scenes.forEach((scene, index) => {
      if (scene.connectionProfileId !== snapshot.connectionProfileId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every scene must share the snapshot connectionProfileId.",
          path: ["scenes", index, "connectionProfileId"]
        });
      }
    });

    snapshot.sources.forEach((source, index) => {
      if (source.connectionProfileId !== snapshot.connectionProfileId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every source must share the snapshot connectionProfileId.",
          path: ["sources", index, "connectionProfileId"]
        });
      }
    });

    snapshot.sceneItems.forEach((sceneItem, index) => {
      if (sceneItem.connectionProfileId !== snapshot.connectionProfileId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every scene item must share the snapshot connectionProfileId.",
          path: ["sceneItems", index, "connectionProfileId"]
        });
      }
    });

    const programSceneCount = snapshot.scenes.filter(
      (scene) => scene.isCurrentProgramScene
    ).length;

    if (programSceneCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most one scene may be the current program scene.",
        path: ["scenes"]
      });
    }

    const seenSceneRefs = new Set<string>();

    snapshot.scenes.forEach((scene, index) => {
      if (seenSceneRefs.has(scene.obsSceneRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Snapshot scenes must be unique by obsSceneRef.",
          path: ["scenes", index, "obsSceneRef"]
        });
      }

      seenSceneRefs.add(scene.obsSceneRef);
    });

    const seenSourceRefs = new Set<string>();

    snapshot.sources.forEach((source, index) => {
      if (seenSourceRefs.has(source.obsSourceRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Snapshot sources must be unique by obsSourceRef.",
          path: ["sources", index, "obsSourceRef"]
        });
      }

      seenSourceRefs.add(source.obsSourceRef);
    });

    const seenSceneItemKeys = new Set<string>();

    snapshot.sceneItems.forEach((sceneItem, index) => {
      const key = `${sceneItem.sceneRef}::${sceneItem.sourceRef}::${sceneItem.obsSceneItemId}`;

      if (seenSceneItemKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Snapshot scene items must be unique by (sceneRef, sourceRef, obsSceneItemId).",
          path: ["sceneItems", index]
        });
      }

      seenSceneItemKeys.add(key);
    });
  });

export const SetObsStreamStatePersistenceInputSchema =
  ObsStreamStatePersistenceRecordSchema;
export const SetObsRecordingStatePersistenceInputSchema =
  ObsRecordingStatePersistenceRecordSchema;
export const SaveObsActionIntentPersistenceInputSchema =
  ObsActionIntentPersistenceRecordSchema;

/**
 * The action-intent lifecycle transition write: advance an existing intent's
 * `status`, carrying the human `confirmation` on the confirming step. Re-asserts
 * the confirm-before-dispatch gate — a transition into
 * `confirmed`/`dispatched`/`succeeded` must carry (or already have) a recorded
 * confirmation — and the ai-suggested-cannot-self-advance rule. Mirrors
 * Community+ `SetCommunicationMessageStatusPersistenceInput`.
 */
export const SetObsActionIntentStatusPersistenceInputSchema = z
  .object({
    actionIntentId: NonEmptyStringSchema,
    confirmation: ObsActionConfirmationPersistenceSchema.optional(),
    safeFailureMessage: OptionalNonEmptyStringSchema,
    status: ObsActionStatusSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((input, context) => {
    if (
      CONFIRMATION_GATED_STATUSES.has(input.status) &&
      input.confirmation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Status may advance to confirmed/dispatched/succeeded only with a recorded human confirmation.",
        path: ["confirmation"]
      });
    }

    if (input.safeFailureMessage !== undefined && input.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "safeFailureMessage is present only when status is failed.",
        path: ["safeFailureMessage"]
      });
    }
  });
export const AppendObsActionLogEntryPersistenceInputSchema =
  ObsActionLogEntryPersistenceRecordSchema;

const readOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: ObsPersistenceReadOptionsSchema }).strict();
const writeOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: ObsPersistenceWriteOptionsSchema }).strict();

export const ListObsConnectionProfilesPersistenceOperationSchema = readOperation(
  ListObsConnectionProfilesPersistenceInputSchema
);
export const GetObsConnectionProfilePersistenceOperationSchema = readOperation(
  GetObsConnectionProfilePersistenceInputSchema
);
export const ListObsScenesPersistenceOperationSchema = readOperation(
  ListObsScenesPersistenceInputSchema
);
export const GetObsScenePersistenceOperationSchema = readOperation(
  GetObsScenePersistenceInputSchema
);
export const ListObsSourcesPersistenceOperationSchema = readOperation(
  ListObsSourcesPersistenceInputSchema
);
export const GetObsSourcePersistenceOperationSchema = readOperation(
  GetObsSourcePersistenceInputSchema
);
export const ListObsSceneItemsPersistenceOperationSchema = readOperation(
  ListObsSceneItemsPersistenceInputSchema
);
export const GetObsSceneItemPersistenceOperationSchema = readOperation(
  GetObsSceneItemPersistenceInputSchema
);
export const GetObsStreamStatePersistenceOperationSchema = readOperation(
  GetObsStreamStatePersistenceInputSchema
);
export const GetObsRecordingStatePersistenceOperationSchema = readOperation(
  GetObsRecordingStatePersistenceInputSchema
);
export const ListObsActionIntentsPersistenceOperationSchema = readOperation(
  ListObsActionIntentsPersistenceInputSchema
);
export const GetObsActionIntentPersistenceOperationSchema = readOperation(
  GetObsActionIntentPersistenceInputSchema
);
export const ListObsActionLogPersistenceOperationSchema = readOperation(
  ListObsActionLogPersistenceInputSchema
);
export const UpsertObsConnectionProfilePersistenceOperationSchema = writeOperation(
  UpsertObsConnectionProfilePersistenceInputSchema
);
export const UpsertObsScenePersistenceOperationSchema = writeOperation(
  UpsertObsScenePersistenceInputSchema
);
export const UpsertObsSourcePersistenceOperationSchema = writeOperation(
  UpsertObsSourcePersistenceInputSchema
);
export const UpsertObsSceneItemPersistenceOperationSchema = writeOperation(
  UpsertObsSceneItemPersistenceInputSchema
);
export const ReplaceObsCatalogSnapshotPersistenceOperationSchema = writeOperation(
  ReplaceObsCatalogSnapshotPersistenceInputSchema
);
export const SetObsStreamStatePersistenceOperationSchema = writeOperation(
  SetObsStreamStatePersistenceInputSchema
);
export const SetObsRecordingStatePersistenceOperationSchema = writeOperation(
  SetObsRecordingStatePersistenceInputSchema
);
export const SaveObsActionIntentPersistenceOperationSchema = writeOperation(
  SaveObsActionIntentPersistenceInputSchema
);
export const SetObsActionIntentStatusPersistenceOperationSchema = writeOperation(
  SetObsActionIntentStatusPersistenceInputSchema
);
export const AppendObsActionLogEntryPersistenceOperationSchema = writeOperation(
  AppendObsActionLogEntryPersistenceInputSchema
);

export type ObsPersistenceReadOptions = z.infer<
  typeof ObsPersistenceReadOptionsSchema
>;
export type ObsPersistenceWriteOptions = z.infer<
  typeof ObsPersistenceWriteOptionsSchema
>;
export type ObsConnectionStatus = z.infer<typeof ObsConnectionStatusSchema>;
export type ObsStreamStatus = z.infer<typeof ObsStreamStatusSchema>;
export type ObsRecordingStatus = z.infer<typeof ObsRecordingStatusSchema>;
export type ObsActionKind = z.infer<typeof ObsActionKindSchema>;
export type ObsActionStatus = z.infer<typeof ObsActionStatusSchema>;
export type ObsActionOrigin = z.infer<typeof ObsActionOriginSchema>;
export type ObsActionLogOutcome = z.infer<typeof ObsActionLogOutcomeSchema>;
export type ObsActionConfirmationPersistence = z.infer<
  typeof ObsActionConfirmationPersistenceSchema
>;
export type ObsConnectionProfilePersistenceRecord = z.infer<
  typeof ObsConnectionProfilePersistenceRecordSchema
>;
export type ObsScenePersistenceRecord = z.infer<
  typeof ObsScenePersistenceRecordSchema
>;
export type ObsSourcePersistenceRecord = z.infer<
  typeof ObsSourcePersistenceRecordSchema
>;
export type ObsSceneItemPersistenceRecord = z.infer<
  typeof ObsSceneItemPersistenceRecordSchema
>;
export type ObsStreamStatePersistenceRecord = z.infer<
  typeof ObsStreamStatePersistenceRecordSchema
>;
export type ObsRecordingStatePersistenceRecord = z.infer<
  typeof ObsRecordingStatePersistenceRecordSchema
>;
export type ObsActionIntentPersistenceRecord = z.infer<
  typeof ObsActionIntentPersistenceRecordSchema
>;
export type ObsActionLogEntryPersistenceRecord = z.infer<
  typeof ObsActionLogEntryPersistenceRecordSchema
>;
export type ListObsConnectionProfilesPersistenceInput = z.infer<
  typeof ListObsConnectionProfilesPersistenceInputSchema
>;
export type GetObsConnectionProfilePersistenceInput = z.infer<
  typeof GetObsConnectionProfilePersistenceInputSchema
>;
export type ListObsScenesPersistenceInput = z.infer<
  typeof ListObsScenesPersistenceInputSchema
>;
export type GetObsScenePersistenceInput = z.infer<
  typeof GetObsScenePersistenceInputSchema
>;
export type ListObsSourcesPersistenceInput = z.infer<
  typeof ListObsSourcesPersistenceInputSchema
>;
export type GetObsSourcePersistenceInput = z.infer<
  typeof GetObsSourcePersistenceInputSchema
>;
export type ListObsSceneItemsPersistenceInput = z.infer<
  typeof ListObsSceneItemsPersistenceInputSchema
>;
export type GetObsSceneItemPersistenceInput = z.infer<
  typeof GetObsSceneItemPersistenceInputSchema
>;
export type GetObsStreamStatePersistenceInput = z.infer<
  typeof GetObsStreamStatePersistenceInputSchema
>;
export type GetObsRecordingStatePersistenceInput = z.infer<
  typeof GetObsRecordingStatePersistenceInputSchema
>;
export type ListObsActionIntentsPersistenceInput = z.infer<
  typeof ListObsActionIntentsPersistenceInputSchema
>;
export type GetObsActionIntentPersistenceInput = z.infer<
  typeof GetObsActionIntentPersistenceInputSchema
>;
export type ListObsActionLogPersistenceInput = z.infer<
  typeof ListObsActionLogPersistenceInputSchema
>;
export type ReplaceObsCatalogSnapshotPersistenceInput = z.infer<
  typeof ReplaceObsCatalogSnapshotPersistenceInputSchema
>;
export type SetObsActionIntentStatusPersistenceInput = z.infer<
  typeof SetObsActionIntentStatusPersistenceInputSchema
>;

export interface ObsReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ObsPersistenceReadOptions;
}

export interface ObsPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ObsPersistenceWriteOptions;
}

export interface ObsQueryPersistenceRepository {
  readonly listObsConnectionProfiles: (
    operation: ObsReadPersistenceOperation<ListObsConnectionProfilesPersistenceInput>
  ) => Promise<readonly ObsConnectionProfilePersistenceRecord[]>;
  readonly getObsConnectionProfile: (
    operation: ObsReadPersistenceOperation<GetObsConnectionProfilePersistenceInput>
  ) => Promise<ObsConnectionProfilePersistenceRecord | null>;
  readonly listObsScenes: (
    operation: ObsReadPersistenceOperation<ListObsScenesPersistenceInput>
  ) => Promise<readonly ObsScenePersistenceRecord[]>;
  readonly getObsScene: (
    operation: ObsReadPersistenceOperation<GetObsScenePersistenceInput>
  ) => Promise<ObsScenePersistenceRecord | null>;
  readonly listObsSources: (
    operation: ObsReadPersistenceOperation<ListObsSourcesPersistenceInput>
  ) => Promise<readonly ObsSourcePersistenceRecord[]>;
  readonly getObsSource: (
    operation: ObsReadPersistenceOperation<GetObsSourcePersistenceInput>
  ) => Promise<ObsSourcePersistenceRecord | null>;
  readonly listObsSceneItems: (
    operation: ObsReadPersistenceOperation<ListObsSceneItemsPersistenceInput>
  ) => Promise<readonly ObsSceneItemPersistenceRecord[]>;
  readonly getObsSceneItem: (
    operation: ObsReadPersistenceOperation<GetObsSceneItemPersistenceInput>
  ) => Promise<ObsSceneItemPersistenceRecord | null>;
  readonly getObsStreamState: (
    operation: ObsReadPersistenceOperation<GetObsStreamStatePersistenceInput>
  ) => Promise<ObsStreamStatePersistenceRecord | null>;
  readonly getObsRecordingState: (
    operation: ObsReadPersistenceOperation<GetObsRecordingStatePersistenceInput>
  ) => Promise<ObsRecordingStatePersistenceRecord | null>;
  readonly listObsActionIntents: (
    operation: ObsReadPersistenceOperation<ListObsActionIntentsPersistenceInput>
  ) => Promise<readonly ObsActionIntentPersistenceRecord[]>;
  readonly getObsActionIntent: (
    operation: ObsReadPersistenceOperation<GetObsActionIntentPersistenceInput>
  ) => Promise<ObsActionIntentPersistenceRecord | null>;
  readonly listObsActionLog: (
    operation: ObsReadPersistenceOperation<ListObsActionLogPersistenceInput>
  ) => Promise<readonly ObsActionLogEntryPersistenceRecord[]>;
}

export interface ObsCommandPersistenceRepository {
  readonly upsertObsConnectionProfile: (
    operation: ObsPersistenceOperation<ObsConnectionProfilePersistenceRecord>
  ) => Promise<ObsConnectionProfilePersistenceRecord>;
  readonly upsertObsScene: (
    operation: ObsPersistenceOperation<ObsScenePersistenceRecord>
  ) => Promise<ObsScenePersistenceRecord>;
  readonly upsertObsSource: (
    operation: ObsPersistenceOperation<ObsSourcePersistenceRecord>
  ) => Promise<ObsSourcePersistenceRecord>;
  readonly upsertObsSceneItem: (
    operation: ObsPersistenceOperation<ObsSceneItemPersistenceRecord>
  ) => Promise<ObsSceneItemPersistenceRecord>;
  readonly replaceObsCatalogSnapshot: (
    operation: ObsPersistenceOperation<ReplaceObsCatalogSnapshotPersistenceInput>
  ) => Promise<void>;
  readonly setObsStreamState: (
    operation: ObsPersistenceOperation<ObsStreamStatePersistenceRecord>
  ) => Promise<ObsStreamStatePersistenceRecord>;
  readonly setObsRecordingState: (
    operation: ObsPersistenceOperation<ObsRecordingStatePersistenceRecord>
  ) => Promise<ObsRecordingStatePersistenceRecord>;
  readonly saveObsActionIntent: (
    operation: ObsPersistenceOperation<ObsActionIntentPersistenceRecord>
  ) => Promise<ObsActionIntentPersistenceRecord>;
  readonly setObsActionIntentStatus: (
    operation: ObsPersistenceOperation<SetObsActionIntentStatusPersistenceInput>
  ) => Promise<ObsActionIntentPersistenceRecord>;
  readonly appendObsActionLogEntry: (
    operation: ObsPersistenceOperation<ObsActionLogEntryPersistenceRecord>
  ) => Promise<ObsActionLogEntryPersistenceRecord>;
}
