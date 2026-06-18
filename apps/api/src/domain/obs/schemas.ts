import { z } from "zod";

/**
 * OBS domain records for the tenant-scoped OBS Studio control surface.
 *
 * Strict, tenant-scoped, branded-ID Zod schemas for the eight OBS records
 * (`ObsConnectionProfile`, `Scene`, `Source`, `SceneItem`, `StreamState`,
 * `RecordingState`, `ObsActionIntent`, `ObsActionLogEntry`) plus every enum.
 * Every record is `.strict()`, carries `tenantId`, and stores only **opaque
 * references and coarse state** — never the OBS host/port/password/auth token or
 * any streaming-service stream key, never raw obs-websocket payloads, never PII.
 * Invariants from the OBS plan are encoded via `superRefine` so an invalid
 * record can never parse.
 *
 * Safety posture (this is the system's strongest "automation must fail
 * gracefully" surface — it controls live, public-facing output):
 *   - **No secrets.** A connection profile holds only an opaque `connectionRef`
 *     (a vault handle); the OBS host/port/password/auth token and any stream key
 *     live exclusively in a separate access-controlled secret/vault boundary.
 *     `.strict()` makes the absence structural: a `host`/`port`/`password`/
 *     `token`/`streamKey`/`secret` key cannot be attached to any record.
 *   - **Human-confirm gate is structural.** Every output-affecting
 *     `ObsActionIntent` carries `affectsLiveOutput = true`, can never be created
 *     already-confirmed, and may advance to `confirmed`/`dispatched`/`succeeded`
 *     only once a human `confirmation` is recorded. `origin = "ai-suggested"`
 *     intents are bound by the same gate and may exist only at `requested`.
 *   - **Coarse only.** Stream/recording state is a coarse, resumable last-known
 *     snapshot — no bitrate / uptime / dropped-frame / per-frame telemetry,
 *     which stays on the local runtime bus.
 *
 * These shapes are the durable contract the persistence layer (`packages/db`)
 * and the pure transforms (`action-eligibility.ts` / `action-lifecycle.ts`)
 * agree on.
 */
const NonEmptyStringSchema = z.string().min(1);
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const ObsTenantIdSchema = NonEmptyStringSchema.brand<"ObsTenantId">();
export const ObsConnectionProfileIdSchema =
  NonEmptyStringSchema.brand<"ObsConnectionProfileId">();
export const ObsSceneIdSchema = NonEmptyStringSchema.brand<"ObsSceneId">();
export const ObsSourceIdSchema = NonEmptyStringSchema.brand<"ObsSourceId">();
export const ObsSceneItemIdSchema = NonEmptyStringSchema.brand<"ObsSceneItemId">();
export const ObsActionIntentIdSchema =
  NonEmptyStringSchema.brand<"ObsActionIntentId">();
export const ObsLogEntryIdSchema = NonEmptyStringSchema.brand<"ObsLogEntryId">();
export const ObsActorRefSchema = NonEmptyStringSchema.brand<"ObsActorRef">();
/**
 * Opaque pointer into the access-controlled secret/vault boundary that names a
 * reachable OBS instance. This is a *reference*, never a host/port/password/auth
 * token or stream key — the credential is resolved (and access-checked) outside
 * this domain, at connect time, by the injected port's real implementation.
 */
export const ObsConnectionRefSchema =
  NonEmptyStringSchema.brand<"ObsConnectionRef">();
/**
 * Opaque OBS scene name/uuid as supplied by obs-websocket — treated as a
 * descriptive string only, never parsed for meaning.
 */
export const ObsSceneRefSchema = NonEmptyStringSchema.brand<"ObsSceneRef">();
/** Opaque OBS source/input name/uuid. */
export const ObsSourceRefSchema = NonEmptyStringSchema.brand<"ObsSourceRef">();
/** Opaque OBS scene-item id (numeric or string id, kept as an opaque string). */
export const ObsSceneItemRefSchema =
  NonEmptyStringSchema.brand<"ObsSceneItemRef">();
/** A reference to an `ObsActionIntent` for audit/state linkage. */
export const ObsActionIntentRefSchema =
  NonEmptyStringSchema.brand<"ObsActionIntentRef">();

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

export const ObsConnectionProfileSchema = z
  .object({
    connectionProfileId: ObsConnectionProfileIdSchema,
    connectionRef: ObsConnectionRefSchema,
    connectionStatus: ObsConnectionStatusSchema,
    createdAt: IsoDateTimeStringSchema,
    label: NonEmptyStringSchema,
    lastSeenAt: IsoDateTimeStringSchema.optional(),
    obsWebsocketVersion: NonEmptyStringSchema.optional(),
    tenantId: ObsTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ObsSceneSchema = z
  .object({
    connectionProfileId: ObsConnectionProfileIdSchema,
    displayName: NonEmptyStringSchema,
    isCurrentProgramScene: z.boolean(),
    obsSceneRef: ObsSceneRefSchema,
    orderHint: NonNegativeIntegerSchema,
    sceneId: ObsSceneIdSchema,
    snapshotAt: IsoDateTimeStringSchema,
    tenantId: ObsTenantIdSchema
  })
  .strict();

export const ObsSourceSchema = z
  .object({
    activeHint: z.boolean().optional(),
    connectionProfileId: ObsConnectionProfileIdSchema,
    kindLabel: NonEmptyStringSchema,
    mutedHint: z.boolean().optional(),
    obsSourceRef: ObsSourceRefSchema,
    snapshotAt: IsoDateTimeStringSchema,
    sourceId: ObsSourceIdSchema,
    tenantId: ObsTenantIdSchema
  })
  .strict();

export const ObsSceneItemSchema = z
  .object({
    connectionProfileId: ObsConnectionProfileIdSchema,
    obsSceneItemId: ObsSceneItemRefSchema,
    orderHint: NonNegativeIntegerSchema,
    sceneItemId: ObsSceneItemIdSchema,
    sceneRef: ObsSceneRefSchema,
    snapshotAt: IsoDateTimeStringSchema,
    sourceRef: ObsSourceRefSchema,
    tenantId: ObsTenantIdSchema,
    visibleHint: z.boolean()
  })
  .strict();

export const ObsStreamStateSchema = z
  .object({
    connectionProfileId: ObsConnectionProfileIdSchema,
    lastActionIntentRef: ObsActionIntentRefSchema.optional(),
    lastTransitionActorId: ObsActorRefSchema.optional(),
    lastTransitionAt: IsoDateTimeStringSchema.optional(),
    streamStatus: ObsStreamStatusSchema,
    tenantId: ObsTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ObsRecordingStateSchema = z
  .object({
    connectionProfileId: ObsConnectionProfileIdSchema,
    lastTransitionActorId: ObsActorRefSchema.optional(),
    lastTransitionAt: IsoDateTimeStringSchema.optional(),
    recordingStatus: ObsRecordingStatusSchema,
    tenantId: ObsTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

/**
 * The recorded human confirmation that authorizes a dispatch. `confirmed` is a
 * literal `true` (the shape carries no "false" form — an unconfirmed intent
 * simply omits `confirmation`), and every confirmation pins the actor, reason,
 * and timestamp for audit. This is the structural enforcement point of the
 * human-confirm gate, mirroring Community+ `CommunicationConfirmation`.
 */
export const ObsActionConfirmationSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: IsoDateTimeStringSchema,
    confirmedByRef: ObsActorRefSchema,
    reason: NonEmptyStringSchema
  })
  .strict();

/**
 * Statuses an `ObsActionIntent` may occupy only once a human confirmation is
 * recorded. `requested` is the sole pre-confirmation status; `failed`/`canceled`
 * are terminal branches reachable without confirmation (a request can be
 * canceled, and a confirmed-then-dispatched action can fail).
 */
const CONFIRMATION_GATED_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "dispatched",
  "succeeded"
]);

export const ObsActionIntentSchema = z
  .object({
    actionIntentId: ObsActionIntentIdSchema,
    affectsLiveOutput: z.boolean(),
    confirmation: ObsActionConfirmationSchema.optional(),
    connectionProfileId: ObsConnectionProfileIdSchema,
    createdAt: IsoDateTimeStringSchema,
    desiredMuted: z.boolean().optional(),
    desiredVisible: z.boolean().optional(),
    kind: ObsActionKindSchema,
    origin: ObsActionOriginSchema,
    requestedByRef: ObsActorRefSchema,
    safeFailureMessage: NonEmptyStringSchema.optional(),
    status: ObsActionStatusSchema,
    targetSceneItemId: ObsSceneItemRefSchema.optional(),
    targetSceneRef: ObsSceneRefSchema.optional(),
    targetSourceRef: ObsSourceRefSchema.optional(),
    tenantId: ObsTenantIdSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((intent, context) => {
    // Every v1 output action affects what viewers see/hear, so the gate applies
    // uniformly: affectsLiveOutput is always true.
    if (!intent.affectsLiveOutput) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every v1 OBS action affects live output (affectsLiveOutput must be true).",
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
    if (intent.desiredVisible !== undefined && intent.kind !== "toggle-source-visibility") {
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

    // An action that affects live output can never be born already confirmed:
    // confirmation is a deliberate human step taken on an existing request.
    if (intent.status === "requested" && intent.confirmation !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A requested action must not already carry a confirmation.",
        path: ["confirmation"]
      });
    }

    // AI may only ever *propose* an action: an `ai-suggested` intent can never
    // SELF-advance past `requested` without a human confirmation. Advancing it
    // is legal only once a human confirmation is recorded (the same gate the
    // status machine enforces) — so any ai-suggested status other than
    // `requested`/`canceled` must carry that confirmation. This mirrors the
    // Community+ `ai-drafted` posture: AI proposes, a human confirms.
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

export const ObsActionLogEntrySchema = z
  .object({
    actionIntentRef: ObsActionIntentRefSchema,
    actorId: ObsActorRefSchema,
    connectionProfileId: ObsConnectionProfileIdSchema,
    logEntryId: ObsLogEntryIdSchema,
    occurredAt: IsoDateTimeStringSchema,
    outcome: ObsActionLogOutcomeSchema,
    reason: NonEmptyStringSchema,
    safeMessage: NonEmptyStringSchema.optional(),
    tenantId: ObsTenantIdSchema
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

export type ObsTenantId = z.infer<typeof ObsTenantIdSchema>;
export type ObsConnectionProfileId = z.infer<typeof ObsConnectionProfileIdSchema>;
export type ObsSceneId = z.infer<typeof ObsSceneIdSchema>;
export type ObsSourceId = z.infer<typeof ObsSourceIdSchema>;
export type ObsSceneItemId = z.infer<typeof ObsSceneItemIdSchema>;
export type ObsActionIntentId = z.infer<typeof ObsActionIntentIdSchema>;
export type ObsLogEntryId = z.infer<typeof ObsLogEntryIdSchema>;
export type ObsActorRef = z.infer<typeof ObsActorRefSchema>;
export type ObsConnectionRef = z.infer<typeof ObsConnectionRefSchema>;
export type ObsSceneRef = z.infer<typeof ObsSceneRefSchema>;
export type ObsSourceRef = z.infer<typeof ObsSourceRefSchema>;
export type ObsSceneItemRef = z.infer<typeof ObsSceneItemRefSchema>;
export type ObsActionIntentRef = z.infer<typeof ObsActionIntentRefSchema>;

export type ObsConnectionStatus = z.infer<typeof ObsConnectionStatusSchema>;
export type ObsStreamStatus = z.infer<typeof ObsStreamStatusSchema>;
export type ObsRecordingStatus = z.infer<typeof ObsRecordingStatusSchema>;
export type ObsActionKind = z.infer<typeof ObsActionKindSchema>;
export type ObsActionStatus = z.infer<typeof ObsActionStatusSchema>;
export type ObsActionOrigin = z.infer<typeof ObsActionOriginSchema>;
export type ObsActionLogOutcome = z.infer<typeof ObsActionLogOutcomeSchema>;

export type ObsConnectionProfile = z.infer<typeof ObsConnectionProfileSchema>;
export type ObsScene = z.infer<typeof ObsSceneSchema>;
export type ObsSource = z.infer<typeof ObsSourceSchema>;
export type ObsSceneItem = z.infer<typeof ObsSceneItemSchema>;
export type ObsStreamState = z.infer<typeof ObsStreamStateSchema>;
export type ObsRecordingState = z.infer<typeof ObsRecordingStateSchema>;
export type ObsActionConfirmation = z.infer<typeof ObsActionConfirmationSchema>;
export type ObsActionIntent = z.infer<typeof ObsActionIntentSchema>;
export type ObsActionLogEntry = z.infer<typeof ObsActionLogEntrySchema>;

export const parseObsConnectionProfile = (
  rawInput: unknown
): ObsConnectionProfile => ObsConnectionProfileSchema.parse(rawInput);

export const parseObsScene = (rawInput: unknown): ObsScene =>
  ObsSceneSchema.parse(rawInput);

export const parseObsSource = (rawInput: unknown): ObsSource =>
  ObsSourceSchema.parse(rawInput);

export const parseObsSceneItem = (rawInput: unknown): ObsSceneItem =>
  ObsSceneItemSchema.parse(rawInput);

export const parseObsStreamState = (rawInput: unknown): ObsStreamState =>
  ObsStreamStateSchema.parse(rawInput);

export const parseObsRecordingState = (rawInput: unknown): ObsRecordingState =>
  ObsRecordingStateSchema.parse(rawInput);

export const parseObsActionIntent = (rawInput: unknown): ObsActionIntent =>
  ObsActionIntentSchema.parse(rawInput);

export const parseObsActionLogEntry = (rawInput: unknown): ObsActionLogEntry =>
  ObsActionLogEntrySchema.parse(rawInput);
