import { z } from "zod";
import {
  ObsActionKindSchema,
  type ObsConnectionProfile,
  type ObsRecordingState,
  type ObsScene,
  type ObsSceneItem,
  type ObsSource,
  type ObsStreamState
} from "../../domain/obs/index.js";

/**
 * OBS AI-assist: reviewable action-suggestion projection, port, and output schema
 * (slice 10 — the final OBS backend slice; the strongest "automation must fail
 * gracefully" surface, since OBS controls live, public-facing output).
 *
 * This module is the single boundary where OBS talks to an AI provider, and it is
 * built so a secret can *never* reach the model and the AI can *never* go live by
 * construction:
 *
 *   - **Smallest secret-free + PII-free projection.** The service hands the port
 *     only the AI-safe catalog signals — scene/source/scene-item **refs** + coarse
 *     mute/active/visible hints, the coarse stream/recording status, the
 *     `connectionStatus`, an opaque `connectionProfileRef` (the
 *     `connectionProfileId`, **never** the `connectionRef` vault handle), the
 *     smallest non-PII `ChurchContext` slice (service-order segment labels), a
 *     short non-PII operator hint, and the `aiPolicyProfile`. No OBS
 *     host/port/password/auth token, no streaming-service stream key, no
 *     `connectionRef`, and no PII can be expressed in this shape.
 *     `buildObsAiActionSuggestionPrompt` derives plain ref/label strings — never a
 *     credential and never a raw obs-websocket payload.
 *   - **Hard secret guard.** `assertObsAiActionSuggestionPromptIsSecretFree` walks
 *     the projection and rejects any forbidden key (a host/port/password/token/
 *     streamKey/connectionRef/secret/vault key) or any value that looks like a
 *     `vault://`-style connection handle, so a future projection change that leaks
 *     a secret fails loudly instead of silently shipping it to the model.
 *   - **Zod-validated, untrusted output.** The port returns `unknown`; the service
 *     re-parses it through `ObsAiActionSuggestionSchema` before any use. The
 *     suggested `kind` must be a real OBS action kind, its per-kind target refs
 *     must be present (mirroring the domain `ObsActionIntent` superRefine), every
 *     ref is an opaque string (no secret), and `needsReview` is a literal `true`.
 *
 * The validated suggestion maps to a `requested`, `origin = "ai-suggested"`
 * `ObsActionIntent`, which the existing slice-7 human-confirm gate binds exactly
 * like any other request: it can never self-advance past `requested` without a
 * human calling `confirmObsAction` (and only then can `dispatchObsAction` reach
 * the port). AI may suggest, never confirm, never dispatch, never go live. This is
 * the OBS analog of Community+'s `ai-drafted` posture (`ai-draft.ts`): the AI
 * proposes a reviewable artifact, a human confirms it.
 *
 * Versioned prompt spec: `04-prompts/obs-action-suggester.md`
 * (`obs-action-suggestion.v1`).
 */
const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION = "obs-action-suggestion.v1";

/**
 * Keys that must never appear in an AI-bound OBS projection. These are the secret
 * field names the domain schema structurally forbids on any record (`.strict()`
 * already makes them unattachable, but this is defence-in-depth on the derived
 * projection): the OBS host/port/password/auth token, any streaming-service stream
 * key, the `connectionRef` vault handle, and generic secret/vault/credential keys.
 * The guard is secret-first because OBS controls production hardware/scenes, not
 * people — it carries no PII, and the projection's only human-readable strings are
 * non-PII scene/source LABELS (`displayName`/`kindLabel`), which are deliberately
 * NOT forbidden here.
 */
const FORBIDDEN_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  "connectionRef",
  "host",
  "hostname",
  "port",
  "password",
  "passphrase",
  "token",
  "authToken",
  "streamKey",
  "secret",
  "vault",
  "vaultPath",
  "credential",
  "credentials"
]);

/**
 * A value that looks like a vault handle / connection URL (e.g.
 * `vault://obs/connection_1`, `ws://…`, `obsws://…`). The opaque
 * `connectionProfileRef` is a plain id, so any URL-shaped value is a leak and is
 * rejected by the secret guard.
 */
const CONNECTION_HANDLE_LIKE = /^[a-z][\w+.-]*:\/\//u;

/**
 * The `aiPolicyProfile` slice every OBS AI call carries. Mirrors the required
 * policy fields from the ChurchContext schema (and the Community+ AI policy shape);
 * `piiSharingAllowed` is honored but irrelevant here — OBS records carry no PII
 * regardless, and the projection stays secret-free + PII-free either way.
 */
export const ObsAiPolicyProfileSchema = z
  .object({
    humanReviewRequiredFor: z.array(NonEmptyStringSchema),
    piiSharingAllowed: z.boolean()
  })
  .strict();

/**
 * One AI-safe scene signal: the opaque OBS scene ref, its display label, and the
 * coarse program-scene flag. Refs + a label only — never a render or a credential.
 */
export const ObsAiSceneSignalSchema = z
  .object({
    displayName: NonEmptyStringSchema,
    isCurrentProgramScene: z.boolean(),
    obsSceneRef: NonEmptyStringSchema
  })
  .strict();

/**
 * One AI-safe source signal: the opaque OBS source ref, a descriptive kind label,
 * and coarse mute/active hints. No device handle, filter, or audio level.
 */
export const ObsAiSourceSignalSchema = z
  .object({
    activeHint: z.boolean().optional(),
    kindLabel: NonEmptyStringSchema,
    mutedHint: z.boolean().optional(),
    obsSourceRef: NonEmptyStringSchema
  })
  .strict();

/**
 * One AI-safe scene-item signal: the opaque placement ids + a coarse visibility
 * hint. No transform/crop geometry.
 */
export const ObsAiSceneItemSignalSchema = z
  .object({
    obsSceneItemId: NonEmptyStringSchema,
    obsSceneRef: NonEmptyStringSchema,
    obsSourceRef: NonEmptyStringSchema,
    visibleHint: z.boolean()
  })
  .strict();

/**
 * The smallest secret-free + PII-free OBS action-suggestion projection handed to
 * the AI port. Refs, coarse state, non-PII labels, enums, and the policy profile
 * only — no OBS host/port/password/token/stream key, no `connectionRef`, and no
 * PII can be expressed in this shape. `connectionProfileRef` is the opaque
 * `connectionProfileId`, never the vault handle.
 */
export const ObsAiActionSuggestionPromptSchema = z
  .object({
    aiPolicyProfile: ObsAiPolicyProfileSchema,
    connectionProfileRef: NonEmptyStringSchema,
    connectionStatus: z.enum(["connected", "disconnected", "unknown"]),
    operatorIntent: OptionalNonEmptyStringSchema,
    promptVersion: z.literal(OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION),
    recordingStatus: z.enum(["active", "paused", "inactive", "unknown"]),
    requestId: NonEmptyStringSchema,
    scenes: z.array(ObsAiSceneSignalSchema),
    sceneItems: z.array(ObsAiSceneItemSignalSchema),
    serviceSegmentLabels: z.array(NonEmptyStringSchema),
    sources: z.array(ObsAiSourceSignalSchema),
    streamStatus: z.enum(["active", "inactive", "unknown"]),
    tenantId: NonEmptyStringSchema
  })
  .strict();

/**
 * The AI suggestion shape — untrusted until parsed. The suggested `kind` must be a
 * real OBS action kind; the per-kind target refs must be present (mirroring the
 * domain `ObsActionIntent` superRefine, so a malformed suggestion is rejected
 * here before an intent is ever built); every ref is an opaque string with no
 * secret; and `needsReview` is a literal `true` so a suggestion can never be
 * marked auto-approved. `status` gates whether a usable suggestion was produced.
 */
export const ObsAiActionSuggestionSchema = z
  .object({
    desiredMuted: z.boolean().optional(),
    desiredVisible: z.boolean().optional(),
    kind: ObsActionKindSchema,
    needsReview: z.literal(true),
    rationale: NonEmptyStringSchema,
    status: z.enum(["suggested", "insufficient_context", "blocked"]),
    targetSceneItemId: OptionalNonEmptyStringSchema,
    targetSceneRef: OptionalNonEmptyStringSchema,
    targetSourceRef: OptionalNonEmptyStringSchema
  })
  .strict()
  .superRefine((suggestion, context) => {
    switch (suggestion.kind) {
      case "switch-scene": {
        if (suggestion.targetSceneRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "switch-scene requires targetSceneRef.",
            path: ["targetSceneRef"]
          });
        }

        break;
      }

      case "toggle-source-visibility": {
        if (suggestion.targetSourceRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires targetSourceRef.",
            path: ["targetSourceRef"]
          });
        }

        if (suggestion.targetSceneItemId === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires targetSceneItemId.",
            path: ["targetSceneItemId"]
          });
        }

        if (suggestion.desiredVisible === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-visibility requires desiredVisible.",
            path: ["desiredVisible"]
          });
        }

        break;
      }

      case "toggle-source-mute": {
        if (suggestion.targetSourceRef === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toggle-source-mute requires targetSourceRef.",
            path: ["targetSourceRef"]
          });
        }

        if (suggestion.desiredMuted === undefined) {
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
        if (
          suggestion.targetSceneRef !== undefined ||
          suggestion.targetSourceRef !== undefined ||
          suggestion.targetSceneItemId !== undefined ||
          suggestion.desiredVisible !== undefined ||
          suggestion.desiredMuted !== undefined
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${suggestion.kind} must not carry any target ref or desired flag.`,
            path: ["kind"]
          });
        }

        break;
      }
    }
  });

export type ObsAiPolicyProfile = z.infer<typeof ObsAiPolicyProfileSchema>;
export type ObsAiSceneSignal = z.infer<typeof ObsAiSceneSignalSchema>;
export type ObsAiSourceSignal = z.infer<typeof ObsAiSourceSignalSchema>;
export type ObsAiSceneItemSignal = z.infer<typeof ObsAiSceneItemSignalSchema>;
export type ObsAiActionSuggestionPrompt = z.infer<
  typeof ObsAiActionSuggestionPromptSchema
>;
export type ObsAiActionSuggestion = z.infer<typeof ObsAiActionSuggestionSchema>;

/**
 * The injected AI-provider boundary for OBS action suggestions. The service builds
 * the secret-free + PII-free `ObsAiActionSuggestionPrompt`, hands it to this port,
 * and re-validates the returned `unknown` through `ObsAiActionSuggestionSchema`. A
 * fake is used in tests (no network, no real model); real wiring stays
 * injected/config-driven and never sees a credential. Mirrors Community+'s
 * injected `CommunityAiDraftPort` and planning's `PlanningSetlistGenerator`.
 */
export interface ObsAiSuggestionPort {
  readonly suggestObsAction: (
    prompt: ObsAiActionSuggestionPrompt
  ) => Promise<unknown>;
}

/**
 * Inputs the service gathers to build the secret-free projection: the connection
 * profile (read for its opaque id + coarse `connectionStatus` ONLY — never its
 * `connectionRef`), the last-known catalog snapshot (scenes/sources/scene-items),
 * the coarse stream/recording state, the smallest non-PII `ChurchContext` slice
 * (service-order segment labels), an optional short operator hint, the policy
 * profile, and the request/tenant ids.
 */
export interface ObsAiActionSuggestionPromptInputs {
  readonly aiPolicyProfile: ObsAiPolicyProfile;
  readonly connection: ObsConnectionProfile;
  readonly operatorIntent: string | undefined;
  readonly recording: ObsRecordingState;
  readonly requestId: string;
  readonly scenes: readonly ObsScene[];
  readonly sceneItems: readonly ObsSceneItem[];
  readonly serviceSegmentLabels: readonly string[];
  readonly sources: readonly ObsSource[];
  readonly stream: ObsStreamState;
  readonly tenantId: string;
}

const toSceneSignal = (scene: ObsScene): ObsAiSceneSignal =>
  ObsAiSceneSignalSchema.parse({
    displayName: scene.displayName,
    isCurrentProgramScene: scene.isCurrentProgramScene,
    obsSceneRef: scene.obsSceneRef
  });

const toSourceSignal = (source: ObsSource): ObsAiSourceSignal =>
  ObsAiSourceSignalSchema.parse({
    kindLabel: source.kindLabel,
    obsSourceRef: source.obsSourceRef,
    ...(source.activeHint !== undefined ? { activeHint: source.activeHint } : {}),
    ...(source.mutedHint !== undefined ? { mutedHint: source.mutedHint } : {})
  });

const toSceneItemSignal = (sceneItem: ObsSceneItem): ObsAiSceneItemSignal =>
  ObsAiSceneItemSignalSchema.parse({
    obsSceneItemId: sceneItem.obsSceneItemId,
    obsSceneRef: sceneItem.sceneRef,
    obsSourceRef: sceneItem.sourceRef,
    visibleHint: sceneItem.visibleHint
  });

/**
 * Build the smallest secret-free + PII-free OBS action-suggestion projection from
 * the AI-safe inputs, then structurally assert it carries no secret before
 * returning. The scene/source/scene-item signals are derived from the durable
 * catalog snapshot (refs + coarse hints only); the connection contributes its
 * opaque id (`connectionProfileRef`) and coarse `connectionStatus` — **never** its
 * `connectionRef` vault handle, which is deliberately not read into the projection.
 */
export const buildObsAiActionSuggestionPrompt = (
  inputs: ObsAiActionSuggestionPromptInputs
): ObsAiActionSuggestionPrompt => {
  const prompt = ObsAiActionSuggestionPromptSchema.parse({
    aiPolicyProfile: inputs.aiPolicyProfile,
    // The opaque profile id only — NOT inputs.connection.connectionRef.
    connectionProfileRef: inputs.connection.connectionProfileId,
    connectionStatus: inputs.connection.connectionStatus,
    promptVersion: OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
    recordingStatus: inputs.recording.recordingStatus,
    requestId: inputs.requestId,
    scenes: inputs.scenes.map(toSceneSignal),
    sceneItems: inputs.sceneItems.map(toSceneItemSignal),
    serviceSegmentLabels: [...inputs.serviceSegmentLabels],
    sources: inputs.sources.map(toSourceSignal),
    streamStatus: inputs.stream.streamStatus,
    tenantId: inputs.tenantId,
    ...(inputs.operatorIntent !== undefined
      ? { operatorIntent: inputs.operatorIntent }
      : {})
  });

  assertObsAiActionSuggestionPromptIsSecretFree(prompt);

  return prompt;
};

/**
 * Structural secret guard: throws if the projection contains a forbidden key (a
 * host/port/password/token/streamKey/connectionRef/secret/vault key) or any value
 * shaped like a vault handle / connection URL. Defence-in-depth behind the
 * secret-free-by-construction projection type — a future leak fails loudly here
 * rather than reaching the model. Pure and deterministic.
 */
export const assertObsAiActionSuggestionPromptIsSecretFree = (
  prompt: ObsAiActionSuggestionPrompt
): void => {
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (CONNECTION_HANDLE_LIKE.test(value)) {
        throw new Error(
          "OBS AI suggestion projection must not contain a connection handle or URL."
        );
      }

      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }

      return;
    }

    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_PROJECTION_KEYS.has(key)) {
          throw new Error(
            `OBS AI suggestion projection must not carry the forbidden field "${key}".`
          );
        }

        visit(nested);
      }
    }
  };

  visit(prompt);
};
