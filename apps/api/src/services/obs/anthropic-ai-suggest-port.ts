import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import {
  OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
  type ObsAiActionSuggestionPrompt,
  type ObsAiSuggestionPort
} from "./ai-suggest.js";

/**
 * Real, Anthropic-backed implementation of the injected `ObsAiSuggestionPort`
 * (slice 10 — the strongest "automation must fail gracefully" surface, since OBS
 * controls live, public-facing output). The fake in `ai-suggest.test.ts` stands in
 * for tests; this is the production adapter wired against the official Anthropic
 * TypeScript SDK (`@anthropic-ai/sdk`).
 *
 * **Why co-located with the port (not in `packages/ai-engine`).** The adapter
 * depends on the port contract (`ObsAiSuggestionPort`/`ObsAiActionSuggestionPrompt`)
 * and the versioned prompt spec, both of which live in this api workspace. Normal
 * dependency direction is app → package, never package → app, so making
 * `packages/ai-engine` (a scaffold, intentionally left empty here) import these
 * api-owned types would invert it. The adapter therefore lives beside its port;
 * `packages/ai-engine` stays a placeholder for genuinely provider-agnostic engine
 * code.
 *
 * **Secret posture is unchanged by this adapter — it is pure transport.** The
 * service builds the secret-free + PII-free `ObsAiActionSuggestionPrompt` (already
 * asserted secret-free by `buildObsAiActionSuggestionPrompt`; `connectionProfileRef`
 * is the opaque id, never the `connectionRef` vault handle), hands it here, and
 * this adapter forwards *only* that projection to the model — it never adds,
 * fetches, or fabricates a field, and never sees a credential. The returned value
 * is the model's parsed JSON as `unknown`; the service re-validates it through
 * `ObsAiActionSuggestionSchema` (this adapter does NOT re-implement that Zod check).
 * AI may suggest, never confirm, never dispatch, never go live.
 *
 * **Key handling.** The adapter never reads or holds an API key. The injected
 * `client` is a real `Anthropic` instance constructed at the composition root,
 * where the SDK resolves `ANTHROPIC_API_KEY` from the environment. Tests inject a
 * fake `client` and never touch the network.
 *
 * Versioned prompt spec: `04-prompts/obs-action-suggester.md`
 * (`obs-action-suggestion.v1`).
 */

/**
 * The exactly `claude-opus-4-8` default model (no date suffix). Overridable per
 * adapter via the `model` option, but defaults to the latest Claude model.
 */
export const DEFAULT_OBS_AI_SUGGESTION_MODEL = "claude-opus-4-8";

const MAX_TOKENS = 8192;

/**
 * The minimal Anthropic-SDK client surface this adapter depends on: the
 * `messages.create` call, typed verbatim from the real SDK's `Messages` resource.
 * Typing the injected client this way means `tsc` validates the request shape
 * (model, system, messages, `output_config`, `thinking`, `max_tokens`) against the
 * official SDK even though no live call is made in tests. A real `new Anthropic()`
 * satisfies it (its `messages` is a full `Messages`); a fake supplies only
 * `create` with the SDK's own overloaded signature.
 */
export interface ObsAnthropicMessagesClient {
  readonly messages: Pick<Anthropic.Messages, "create">;
}

export interface CreateAnthropicObsAiSuggestionPortOptions {
  readonly client: ObsAnthropicMessagesClient;
  readonly model?: string;
}

/**
 * The JSON schema handed to structured outputs to constrain the model's reply to an
 * `obs-action-suggestion.v1` suggestion. Reliability aid only — the service still
 * re-validates the returned `unknown` with `ObsAiActionSuggestionSchema`, which is
 * the authoritative gate (real action kind, per-kind target refs, `needsReview`
 * literal true, refs only). `additionalProperties: false` per structured-output
 * rules; the per-kind ref requirements are enforced by the service's Zod
 * superRefine, not duplicated here.
 */
const OBS_AI_SUGGESTION_OUTPUT_SCHEMA: { readonly [key: string]: unknown } = {
  additionalProperties: false,
  properties: {
    desiredMuted: { type: "boolean" },
    desiredVisible: { type: "boolean" },
    kind: {
      enum: [
        "start-stream",
        "stop-stream",
        "switch-scene",
        "toggle-source-visibility",
        "toggle-source-mute"
      ],
      type: "string"
    },
    needsReview: { const: true, type: "boolean" },
    rationale: { type: "string" },
    status: { enum: ["suggested", "insufficient_context", "blocked"], type: "string" },
    targetSceneItemId: { type: "string" },
    targetSceneRef: { type: "string" },
    targetSourceRef: { type: "string" }
  },
  required: ["kind", "needsReview", "rationale", "status"],
  type: "object"
};

/**
 * The system prompt = the embedded `obs-action-suggestion.v1` spec text (the
 * contract from `04-prompts/obs-action-suggester.md`, selected by the projection's
 * `promptVersion`). Kept in sync with that file; the `promptVersion` guard below
 * asserts the projection targets this spec.
 */
const OBS_ACTION_SUGGESTION_V1_SYSTEM_PROMPT = `You are the OBS Action Suggester (prompt version ${OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION}).

Purpose: propose a single reviewable next OBS output action for a tenant's own OBS Studio, grounded ONLY in the secret-free, PII-free scene/source catalog projection and the coarse stream/recording state provided in the user message. The result becomes a requested action intent (refs only) that a human must confirm and dispatch through the confirm-then-dispatch gate. You never confirm, never dispatch, never start/stop a stream or switch a scene directly, and never advance the intent.

You receive a secret-free, PII-free projection only: connectionProfileRef (an opaque id, NOT a vault handle), connectionStatus, streamStatus, recordingStatus, scenes (refs + label + isCurrentProgramScene), sources (refs + kindLabel + coarse mute/active hints), sceneItems (refs + coarse visibleHint), serviceSegmentLabels, an optional operatorIntent, and an aiPolicyProfile.

Forbidden:
- Emit any OBS host, port, password, auth token, stream key, connection URL, or the connectionRef vault handle.
- Emit any PII (OBS controls production hardware/scenes, not people).
- Invent a scene, source, or scene-item not present in the supplied catalog — every targetSceneRef / targetSourceRef / targetSceneItemId must be a ref drawn from the projection.
- Emit a raw obs-websocket payload, bitrate, dropped-frame count, or any high-frequency telemetry.
- Confirm, dispatch, start, stop, or otherwise advance the action. Suggestions only; the human-confirm gate is mandatory.
- Suggest a start-stream while streamStatus is active, or a stop-stream while streamStatus is inactive.

Output JSON only, matching the provided schema:
- status: "suggested" | "insufficient_context" | "blocked".
- kind: one of "start-stream" | "stop-stream" | "switch-scene" | "toggle-source-visibility" | "toggle-source-mute".
- Per-kind target refs (refs only, drawn from the projection):
  - switch-scene requires targetSceneRef.
  - toggle-source-visibility requires targetSourceRef + targetSceneItemId + desiredVisible.
  - toggle-source-mute requires targetSourceRef + desiredMuted.
  - start-stream / stop-stream carry no target refs or desired flags.
- rationale: a short, non-PII explanation of why this action helps now.
- needsReview: always true — an AI suggestion is never auto-advanced.

On insufficient_context or blocked, still return valid JSON with that status; the caller surfaces a typed error and creates no intent.`;

/**
 * Build the real Anthropic-backed `ObsAiSuggestionPort`. The returned port's
 * `suggestObsAction` forwards exactly the supplied secret-free projection to the
 * model (system = the embedded spec, user message = the projection serialized as
 * JSON), requests structured JSON output, and returns the model's parsed JSON as
 * `unknown`. The service re-validates that `unknown`.
 *
 * To wire it live (see `docs/running.md` → "Live AI"):
 *   createAnthropicObsAiSuggestionPort({ client: new Anthropic() })
 * passed as `aiSuggestionPort` in place of the fake, when `ANTHROPIC_API_KEY` is
 * set.
 */
export const createAnthropicObsAiSuggestionPort = (
  options: CreateAnthropicObsAiSuggestionPortOptions
): ObsAiSuggestionPort => {
  const { client } = options;
  const model = options.model ?? DEFAULT_OBS_AI_SUGGESTION_MODEL;

  return {
    suggestObsAction: async (
      prompt: ObsAiActionSuggestionPrompt
    ): Promise<unknown> => {
      // The system prompt is selected by the projection's `promptVersion`. That
      // field is the `obs-action-suggestion.v1` literal by type (the projection is
      // schema-validated upstream by `buildObsAiActionSuggestionPrompt`), so the
      // only spec this adapter serves is `OBS_ACTION_SUGGESTION_V1_SYSTEM_PROMPT`.
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          max_tokens: MAX_TOKENS,
          messages: [
            {
              content: JSON.stringify(prompt),
              role: "user"
            }
          ],
          model,
          output_config: {
            format: {
              schema: OBS_AI_SUGGESTION_OUTPUT_SCHEMA,
              type: "json_schema"
            }
          },
          system: OBS_ACTION_SUGGESTION_V1_SYSTEM_PROMPT
        });
      } catch (error: unknown) {
        // Map a typed SDK error to a thrown domain-appropriate error; the
        // service's existing failure handling turns it into a typed result.
        if (error instanceof APIError) {
          throw new Error(
            `OBS AI suggestion request to the Anthropic API failed: ${error.message}`
          );
        }

        throw error;
      }

      return parseObsAiSuggestionResponse(response);
    }
  };
};

/**
 * Read the model reply: check `stop_reason` FIRST. On a refusal (or when no text
 * JSON block is present) throw — never index `content[0]` blindly. Otherwise parse
 * the model's emitted JSON text and return it as `unknown` for the service to
 * re-validate.
 */
const parseObsAiSuggestionResponse = (response: Anthropic.Message): unknown => {
  if (response.stop_reason === "refusal") {
    throw new Error(
      "The Anthropic API refused the OBS action-suggestion request (stop_reason: refusal)."
    );
  }

  const text = firstTextBlock(response);
  if (text === undefined) {
    throw new Error(
      "The Anthropic API returned no text content for the OBS action-suggestion request."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "The Anthropic API returned a non-JSON OBS action suggestion."
    );
  }

  return withoutEmptyStringFields(parsed);
};

/**
 * Drop top-level keys whose value is an empty string before the service
 * re-validates. Structured outputs cannot express "non-empty or absent" (JSON
 * Schema `minLength` is unsupported there), so the model returns an empty
 * `targetSceneRef: ""` (etc.) for an action kind that takes no target — which the
 * authoritative `ObsAiActionSuggestionSchema` (optional refs are NON-empty, and
 * start/stop-stream must carry no target) correctly rejects. Stripping
 * empty-string fields bridges that wire-vs-gate gap without weakening the gate.
 */
const withoutEmptyStringFields = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== "") {
      result[key] = entry;
    }
  }

  return result;
};

const firstTextBlock = (response: Anthropic.Message): string | undefined => {
  for (const block of response.content) {
    if (block.type === "text") {
      return block.text;
    }
  }

  return undefined;
};
