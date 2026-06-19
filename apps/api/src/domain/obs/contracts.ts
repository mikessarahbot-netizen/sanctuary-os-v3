import { z } from "zod";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import {
  ObsActionKindSchema,
  ObsActionOriginSchema,
  ObsActionStatusSchema,
  ObsConnectionStatusSchema,
  type ObsActionIntent,
  type ObsActionLogEntry,
  type ObsConnectionProfile,
  type ObsRecordingState,
  type ObsScene,
  type ObsSceneItem,
  type ObsSource,
  type ObsStreamState
} from "./schemas.js";

/**
 * OBS service operation envelopes + query/command service interfaces (slice 6).
 *
 * Every operation is an `{ actor, requestId, input }` Zod envelope (mirroring
 * Charts/Play/Community `contracts.ts` exactly) so the GraphQL resolver can
 * parse, the service can authorize against `actor`, and the in-memory/persistence
 * adapters share one validated request shape. The input schemas reuse the slice-1
 * OBS domain enums — they never restate field shapes the schemas already own.
 *
 * Slice scope (this file): the read queries + connection/catalog management + the
 * action **request** surface, plus the slice-7 confirm→dispatch gate.
 * `requestObsAction` proposes an `ObsActionIntent` at `status = requested` after
 * the pure eligibility check and **never touches the OBS port** — nothing is
 * dispatched. The three-step gate that follows is structural: `confirmObsAction`
 * is the human-confirmation step (it carries a `confirmationIntent { confirmed:
 * true, reason }` + `confirmedByRef`, the only path that authorizes a dispatch),
 * `dispatchObsAction` is the **single** operation that calls a port mutate method
 * and refuses unless the intent's status is `confirmed`, and `cancelObsAction`
 * terminates a `requested`/`confirmed` intent without any port call. No single
 * mutation both decides and goes live, and an `origin = "ai-suggested"` intent can
 * never reach confirm/dispatch on its own — AI proposes, a human confirms.
 *
 * Safety posture (this is the system's strongest "automation must fail
 * gracefully" surface — it controls live, public-facing output): no input or
 * interface carries an OBS host/port/password/auth token or stream key — a
 * connection profile is named by an opaque `connectionRef` only. The destructive
 * `removeObsConnectionProfile` carries an explicit human `confirmationIntent`
 * (mirroring the Community+ destructive-confirmation intents); `requestObsAction`
 * may carry `origin = "ai-suggested"`, but such an intent can never self-advance
 * past `requested` (the slice-7 gate enforces the rest).
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

const ObsServiceRequestSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

/**
 * The explicit human-confirmation intent that gates the destructive
 * `removeObsConnectionProfile` and the output-action `confirmObsAction` step
 * (mirrors the Community+ `confirmCommunicationSend` / `removeGroupMembership` and
 * the Charts/Play destructive-confirmation intents). `reason` is audited;
 * `confirmed` is a literal `true` — the shape carries no "false" form, so the gate
 * cannot be passed without an affirmative human intent.
 */
const ConfirmationIntentSchema = z
  .object({
    confirmed: z.literal(true),
    reason: NonEmptyStringSchema
  })
  .strict();

export const ObsConnectionProfilesFilterSchema = z
  .object({
    connectionStatus: ObsConnectionStatusSchema.optional()
  })
  .strict();

export const ObsActionIntentsFilterSchema = z
  .object({
    connectionProfileId: OptionalNonEmptyStringSchema,
    status: ObsActionStatusSchema.optional()
  })
  .strict();

// ---------------------------------------------------------------------------
// Queries (read-only — safe whether OBS is connected or showing a stale snapshot)
// ---------------------------------------------------------------------------

export const ListObsConnectionProfilesQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      filter: ObsConnectionProfilesFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetObsConnectionProfileQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListObsScenesQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListObsSourcesQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListObsSceneItemsQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema,
      sceneRef: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const GetObsStreamStateQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const GetObsRecordingStateQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListObsActionIntentsQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      filter: ObsActionIntentsFilterSchema.optional()
    })
    .strict()
}).strict();

export const ListObsActionLogQuerySchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

// ---------------------------------------------------------------------------
// Commands — connection / catalog (non-output-affecting, still tenant-scoped + audited)
// ---------------------------------------------------------------------------

/**
 * Save a connection profile. Stores `label` + opaque `connectionRef` only — there
 * is no `host`/`port`/`password`/`token`/`streamKey` field on the input at all
 * (the secret lives in the vault; the schema gives nowhere to pass it). A
 * `connectionStatus` may be supplied to seed the last-known status (defaults to
 * `unknown` in the service when omitted).
 */
export const SaveObsConnectionProfileCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: OptionalNonEmptyStringSchema,
      connectionRef: NonEmptyStringSchema,
      connectionStatus: ObsConnectionStatusSchema.optional(),
      label: NonEmptyStringSchema
    })
    .strict()
}).strict();

/**
 * Remove a connection profile (destructive). Requires an explicit human
 * `confirmationIntent`; the service audits the removal.
 */
export const RemoveObsConnectionProfileCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      confirmationIntent: ConfirmationIntentSchema,
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

/**
 * Ask the injected `ObsControlPort` for the live catalog/status and reconcile the
 * snapshot (scenes + sources + scene-items + coarse stream/recording state).
 * Online-only — it reads OBS and changes no OBS state. The port resolves the
 * credential from the vault behind the boundary; this input carries only the
 * connection-profile id.
 */
export const RefreshObsCatalogCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema
    })
    .strict()
}).strict();

// ---------------------------------------------------------------------------
// Commands — action request (no dispatch; the port is never touched here)
// ---------------------------------------------------------------------------

/**
 * Propose an output-affecting action as an `ObsActionIntent` at
 * `status = requested`. The service runs the pure eligibility check against the
 * last-known catalog/state snapshot and, on an eligible request, persists the
 * intent; it **does not** touch the OBS port — nothing is dispatched yet. The
 * confirm→dispatch gate is slice 7. `origin` is `human` (an operator request) or
 * `ai-suggested` (a reviewable AI nudge); either way the intent is born
 * unconfirmed and cannot self-advance.
 *
 * `affectsLiveOutput` is not an input: every v1 kind affects live output, so the
 * service sets it to `true`. Per-kind target refs are validated structurally when
 * the service constructs the `ObsActionIntent` (the slice-1 schema superRefine).
 */
export const RequestObsActionCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      connectionProfileId: NonEmptyStringSchema,
      desiredMuted: z.boolean().optional(),
      desiredVisible: z.boolean().optional(),
      kind: ObsActionKindSchema,
      origin: ObsActionOriginSchema,
      requestedByRef: NonEmptyStringSchema,
      targetSceneItemId: OptionalNonEmptyStringSchema,
      targetSceneRef: OptionalNonEmptyStringSchema,
      targetSourceRef: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

// ---------------------------------------------------------------------------
// Commands — the confirm → dispatch gate (output-affecting; human-confirmed; audited)
// ---------------------------------------------------------------------------

/**
 * The human-confirmation step (`requested → confirmed`). Carries an explicit
 * `confirmationIntent { confirmed: true, reason }` and the `confirmedByRef` of the
 * confirming human; the service records `confirmedAt` from its injected clock and
 * runs the pure `confirm` transition. This is the **only** path that authorizes a
 * later dispatch, and the only place an `ai-suggested` intent can advance — and
 * only by a human acting here, never by the AI itself. Nothing is dispatched: the
 * OBS port is not touched by confirmation.
 */
export const ConfirmObsActionCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      actionIntentId: NonEmptyStringSchema,
      confirmationIntent: ConfirmationIntentSchema,
      confirmedByRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

/**
 * The single moment OBS state changes (`confirmed → dispatched → succeeded` |
 * `failed`). The service **refuses unless the intent's status is `confirmed`**
 * (`NOT_CONFIRMED`), runs the pure `dispatch` transition, and then calls the one
 * matching `ObsControlPort` mutate method for the action kind. On success the
 * intent ends `succeeded`; on a normalized `ObsControlError` it ends terminal
 * `failed` with a redacted `safeFailureMessage`. A dispatched/terminal intent can
 * never be re-dispatched (the transition map rejects it) — a fresh confirmation is
 * required to retry. This is the **only** command that calls a port mutate method.
 */
export const DispatchObsActionCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      actionIntentId: NonEmptyStringSchema
    })
    .strict()
}).strict();

/**
 * Cancel a `requested`/`confirmed` intent (`→ canceled`). Records an explicit
 * `reason` for the audit row and runs the pure `cancel` transition; it **never**
 * touches the OBS port. A terminal intent (succeeded/failed/canceled) cannot be
 * canceled (the transition map rejects it).
 */
export const CancelObsActionCommandSchema = ObsServiceRequestSchema.extend({
  input: z
    .object({
      actionIntentId: NonEmptyStringSchema,
      reason: NonEmptyStringSchema
    })
    .strict()
}).strict();

export type ListObsConnectionProfilesQuery = z.infer<
  typeof ListObsConnectionProfilesQuerySchema
>;
export type GetObsConnectionProfileQuery = z.infer<
  typeof GetObsConnectionProfileQuerySchema
>;
export type ListObsScenesQuery = z.infer<typeof ListObsScenesQuerySchema>;
export type ListObsSourcesQuery = z.infer<typeof ListObsSourcesQuerySchema>;
export type ListObsSceneItemsQuery = z.infer<typeof ListObsSceneItemsQuerySchema>;
export type GetObsStreamStateQuery = z.infer<typeof GetObsStreamStateQuerySchema>;
export type GetObsRecordingStateQuery = z.infer<
  typeof GetObsRecordingStateQuerySchema
>;
export type ListObsActionIntentsQuery = z.infer<
  typeof ListObsActionIntentsQuerySchema
>;
export type ListObsActionLogQuery = z.infer<typeof ListObsActionLogQuerySchema>;

export type SaveObsConnectionProfileCommand = z.infer<
  typeof SaveObsConnectionProfileCommandSchema
>;
export type RemoveObsConnectionProfileCommand = z.infer<
  typeof RemoveObsConnectionProfileCommandSchema
>;
export type RefreshObsCatalogCommand = z.infer<
  typeof RefreshObsCatalogCommandSchema
>;
export type RequestObsActionCommand = z.infer<
  typeof RequestObsActionCommandSchema
>;
export type ConfirmObsActionCommand = z.infer<
  typeof ConfirmObsActionCommandSchema
>;
export type DispatchObsActionCommand = z.infer<
  typeof DispatchObsActionCommandSchema
>;
export type CancelObsActionCommand = z.infer<
  typeof CancelObsActionCommandSchema
>;

/**
 * The result of `refreshObsCatalog`: the reconciled connection profile + its
 * coarse catalog/state snapshot, all freshly mirrored from the port read. Carries
 * refs + coarse state only — never a credential or any high-frequency telemetry.
 */
export interface ObsCatalogSnapshot {
  readonly connectionProfile: ObsConnectionProfile;
  readonly recordingState: ObsRecordingState;
  readonly scenes: readonly ObsScene[];
  readonly sceneItems: readonly ObsSceneItem[];
  readonly sources: readonly ObsSource[];
  readonly streamState: ObsStreamState;
}

export interface ObsQueryService {
  readonly listObsConnectionProfiles: (
    query: ListObsConnectionProfilesQuery
  ) => Promise<readonly ObsConnectionProfile[]>;
  readonly getObsConnectionProfile: (
    query: GetObsConnectionProfileQuery
  ) => Promise<ObsConnectionProfile | null>;
  readonly listObsScenes: (
    query: ListObsScenesQuery
  ) => Promise<readonly ObsScene[]>;
  readonly listObsSources: (
    query: ListObsSourcesQuery
  ) => Promise<readonly ObsSource[]>;
  readonly listObsSceneItems: (
    query: ListObsSceneItemsQuery
  ) => Promise<readonly ObsSceneItem[]>;
  readonly getObsStreamState: (
    query: GetObsStreamStateQuery
  ) => Promise<ObsStreamState | null>;
  readonly getObsRecordingState: (
    query: GetObsRecordingStateQuery
  ) => Promise<ObsRecordingState | null>;
  readonly listObsActionIntents: (
    query: ListObsActionIntentsQuery
  ) => Promise<readonly ObsActionIntent[]>;
  readonly listObsActionLog: (
    query: ListObsActionLogQuery
  ) => Promise<readonly ObsActionLogEntry[]>;
}

export interface ObsCommandService {
  readonly saveObsConnectionProfile: (
    command: SaveObsConnectionProfileCommand
  ) => Promise<ObsConnectionProfile>;
  readonly removeObsConnectionProfile: (
    command: RemoveObsConnectionProfileCommand
  ) => Promise<void>;
  readonly refreshObsCatalog: (
    command: RefreshObsCatalogCommand
  ) => Promise<ObsCatalogSnapshot>;
  readonly requestObsAction: (
    command: RequestObsActionCommand
  ) => Promise<ObsActionIntent>;
  readonly confirmObsAction: (
    command: ConfirmObsActionCommand
  ) => Promise<ObsActionIntent>;
  readonly dispatchObsAction: (
    command: DispatchObsActionCommand
  ) => Promise<ObsActionIntent>;
  readonly cancelObsAction: (
    command: CancelObsActionCommand
  ) => Promise<ObsActionIntent>;
}
