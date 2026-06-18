import { z } from "zod";
import {
  ObsActionIntentSchema,
  ObsConnectionProfileSchema,
  ObsRecordingStateSchema,
  ObsSceneItemSchema,
  ObsSceneSchema,
  ObsSourceSchema,
  ObsStreamStateSchema,
  type ObsActionIntent,
  type ObsConnectionProfile,
  type ObsRecordingState,
  type ObsSceneItem,
  type ObsScene,
  type ObsSource,
  type ObsStreamState
} from "./schemas.js";

/**
 * Pure OBS action-eligibility / precondition checker.
 *
 * `checkActionEligibility` decides whether a requested `ObsActionIntent` is
 * *dispatchable* against the last-known catalog/state snapshot **before** the
 * injected port is ever touched, and **flags** every blocking reason rather than
 * throwing — mirroring the flagged-unresolved posture in Play
 * (`resolveCueTimeline`) and the consent-exclusion flagging in Community+
 * (`resolveAudience`). It only *decides* eligibility; it performs no dispatch and
 * no I/O.
 *
 * Blocking reasons it surfaces:
 *   - `obs-disconnected` — the connection is not `connected` (graceful
 *     degradation: actions are disabled with visible status, never queued).
 *   - `scene-not-found` — a `switch-scene` target `obsSceneRef` is absent from
 *     the scene snapshot.
 *   - `source-not-found` — a `toggle-*` target source is absent from the source
 *     snapshot.
 *   - `scene-item-not-found` — a `toggle-source-visibility` target scene-item is
 *     absent from the scene-item snapshot.
 *   - `already-streaming` — a `start-stream` while `streamStatus = active`.
 *   - `not-streaming` — a `stop-stream` while `streamStatus = inactive`.
 *   - `connection-mismatch` — a snapshot record belongs to a different
 *     connection profile than the intent (defensive; the service scopes inputs).
 *
 * Pure and deterministic: no I/O, no clock, no randomness. Inputs are
 * already-tenant-scoped records (the function is tenant-agnostic); it only
 * decides whether the action may proceed. The recording snapshot is accepted for
 * completeness/symmetry with the state surface, though no v1 reason consults it.
 */
export const ActionBlockReasonSchema = z.enum([
  "obs-disconnected",
  "scene-not-found",
  "source-not-found",
  "scene-item-not-found",
  "already-streaming",
  "not-streaming",
  "connection-mismatch"
]);

export const ActionEligibilitySchema = z
  .object({
    eligible: z.boolean(),
    reasons: z.array(ActionBlockReasonSchema)
  })
  .strict()
  .superRefine((eligibility, context) => {
    if (eligibility.eligible && eligibility.reasons.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An eligible result must carry no blocking reasons.",
        path: ["reasons"]
      });
    }

    if (!eligibility.eligible && eligibility.reasons.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An ineligible result must carry at least one blocking reason.",
        path: ["reasons"]
      });
    }
  });

export type ActionBlockReason = z.infer<typeof ActionBlockReasonSchema>;
export type ActionEligibility = z.infer<typeof ActionEligibilitySchema>;

/**
 * The last-known snapshot the eligibility check reasons against. Every member is
 * a coarse, durable record mirrored from OBS (never authoritative); the function
 * never contacts the port.
 */
export interface ActionEligibilitySnapshot {
  readonly connection: ObsConnectionProfile;
  readonly scenes: readonly ObsScene[];
  readonly sources: readonly ObsSource[];
  readonly sceneItems: readonly ObsSceneItem[];
  readonly stream: ObsStreamState;
  readonly recording: ObsRecordingState;
}

export const checkActionEligibility = (
  intent: ObsActionIntent,
  snapshot: ActionEligibilitySnapshot
): ActionEligibility => {
  const parsedIntent = ObsActionIntentSchema.parse(intent);
  const connection = ObsConnectionProfileSchema.parse(snapshot.connection);
  const scenes = snapshot.scenes.map((scene) => ObsSceneSchema.parse(scene));
  const sources = snapshot.sources.map((source) => ObsSourceSchema.parse(source));
  const sceneItems = snapshot.sceneItems.map((sceneItem) =>
    ObsSceneItemSchema.parse(sceneItem)
  );
  const stream = ObsStreamStateSchema.parse(snapshot.stream);
  // Parsed for symmetry/validation with the live state surface even though no v1
  // reason currently consults recording state.
  ObsRecordingStateSchema.parse(snapshot.recording);

  const reasons: ActionBlockReason[] = [];
  const pushReason = (reason: ActionBlockReason): void => {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  };

  // The intent and its snapshot must describe the same connection profile.
  if (stream.connectionProfileId !== parsedIntent.connectionProfileId) {
    pushReason("connection-mismatch");
  }

  if (connection.connectionProfileId !== parsedIntent.connectionProfileId) {
    pushReason("connection-mismatch");
  }

  // Graceful degradation: OBS must be connected for any output-affecting action.
  if (connection.connectionStatus !== "connected") {
    pushReason("obs-disconnected");
  }

  const sceneRefs = new Set<string>(scenes.map((scene) => scene.obsSceneRef));
  const sourceRefs = new Set<string>(sources.map((source) => source.obsSourceRef));
  const sceneItemRefs = new Set<string>(
    sceneItems.map((sceneItem) => sceneItem.obsSceneItemId)
  );

  switch (parsedIntent.kind) {
    case "start-stream": {
      if (stream.streamStatus === "active") {
        pushReason("already-streaming");
      }

      break;
    }

    case "stop-stream": {
      if (stream.streamStatus === "inactive") {
        pushReason("not-streaming");
      }

      break;
    }

    case "switch-scene": {
      if (
        parsedIntent.targetSceneRef === undefined ||
        !sceneRefs.has(parsedIntent.targetSceneRef)
      ) {
        pushReason("scene-not-found");
      }

      break;
    }

    case "toggle-source-visibility": {
      if (
        parsedIntent.targetSourceRef === undefined ||
        !sourceRefs.has(parsedIntent.targetSourceRef)
      ) {
        pushReason("source-not-found");
      }

      if (
        parsedIntent.targetSceneItemId === undefined ||
        !sceneItemRefs.has(parsedIntent.targetSceneItemId)
      ) {
        pushReason("scene-item-not-found");
      }

      break;
    }

    case "toggle-source-mute": {
      if (
        parsedIntent.targetSourceRef === undefined ||
        !sourceRefs.has(parsedIntent.targetSourceRef)
      ) {
        pushReason("source-not-found");
      }

      break;
    }
  }

  return ActionEligibilitySchema.parse({
    eligible: reasons.length === 0,
    reasons
  });
};
