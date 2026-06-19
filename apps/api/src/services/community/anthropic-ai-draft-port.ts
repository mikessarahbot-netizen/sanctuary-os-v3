import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import {
  COMMUNITY_AI_DRAFT_PROMPT_VERSION,
  type CommunityAiDraftPort,
  type CommunityAiDraftPrompt
} from "./ai-draft.js";

/**
 * Real, Anthropic-backed implementation of the injected `CommunityAiDraftPort`
 * (slice 10 — the strictest-privacy AI surface). The fake in `ai-draft.test.ts`
 * stands in for tests; this is the production adapter wired against the official
 * Anthropic TypeScript SDK (`@anthropic-ai/sdk`).
 *
 * **Why co-located with the port (not in `packages/ai-engine`).** The adapter
 * depends on the port contract (`CommunityAiDraftPort`/`CommunityAiDraftPrompt`)
 * and the versioned prompt spec, both of which live in this api workspace. Normal
 * dependency direction is app → package, never package → app, so making
 * `packages/ai-engine` (a scaffold, intentionally left empty here) import these
 * api-owned types would invert it. The adapter therefore lives beside its port;
 * `packages/ai-engine` stays a placeholder for genuinely provider-agnostic engine
 * code that the api could one day depend on.
 *
 * **Privacy posture is unchanged by this adapter — it is pure transport.** The
 * service builds the PII-free `CommunityAiDraftPrompt` (already asserted PII-free
 * by `buildCommunityAiDraftPrompt`), hands it here, and this adapter forwards
 * *only* that projection to the model — it never adds, fetches, or fabricates a
 * field, and never resolves a recipient. The returned value is the model's parsed
 * JSON as `unknown`; the service re-validates it through
 * `CommunityAiDraftSuggestionSchema` (this adapter does NOT re-implement that Zod
 * check). AI may draft, never send.
 *
 * **Key handling.** The adapter never reads or holds an API key. The injected
 * `client` is a real `Anthropic` instance constructed at the composition root,
 * where the SDK resolves `ANTHROPIC_API_KEY` from the environment. Tests inject a
 * fake `client` and never touch the network.
 *
 * Versioned prompt spec: `04-prompts/comms-drafter-community.md`
 * (`community-comms-draft.v1`).
 */

/**
 * The exactly `claude-opus-4-8` default model (no date suffix). Overridable per
 * adapter via the `model` option, but defaults to the latest Claude model.
 */
export const DEFAULT_COMMUNITY_AI_DRAFT_MODEL = "claude-opus-4-8";

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
export interface CommunityAnthropicMessagesClient {
  readonly messages: Pick<Anthropic.Messages, "create">;
}

export interface CreateAnthropicCommunityAiDraftPortOptions {
  readonly client: CommunityAnthropicMessagesClient;
  readonly model?: string;
}

/**
 * The JSON schema handed to structured outputs to constrain the model's reply to a
 * `community-comms-draft.v1` suggestion. This is a reliability aid only — the
 * service still re-validates the returned `unknown` with
 * `CommunityAiDraftSuggestionSchema`, which is the authoritative gate (placeholder
 * tokens, `needsReview` literal true, no resolved contact value). Mirrors the
 * suggestion shape's fields; `additionalProperties: false` per structured-output
 * rules.
 */
const COMMUNITY_AI_DRAFT_OUTPUT_SCHEMA: { readonly [key: string]: unknown } = {
  additionalProperties: false,
  properties: {
    bodyTemplate: { type: "string" },
    needsReview: { const: true, type: "boolean" },
    omittedDueToMissingData: { items: { type: "string" }, type: "array" },
    rationale: { type: "string" },
    status: { enum: ["drafted", "insufficient_context", "blocked"], type: "string" },
    subject: { type: "string" },
    usedPlaceholders: { items: { type: "string" }, type: "array" }
  },
  required: ["bodyTemplate", "needsReview", "rationale", "status"],
  type: "object"
};

/**
 * The system prompt = the embedded `community-comms-draft.v1` spec text (the
 * contract from `04-prompts/comms-drafter-community.md`, selected by the
 * projection's `promptVersion`). Kept in sync with that file; the
 * `promptVersion` guard below asserts the projection targets this spec.
 */
const COMMUNITY_COMMS_DRAFT_V1_SYSTEM_PROMPT = `You are the Community+ Communications Drafter (prompt version ${COMMUNITY_AI_DRAFT_PROMPT_VERSION}).

Purpose: draft a single reviewable outbound communication (an optional subject and a bodyTemplate) for a Community+ recipient set, grounded ONLY in the AI-safe, PII-free engagement projection provided in the user message. The result becomes a draft communication that a human must confirm before it can be queued or sent. You never send, never resolve recipients, and never advance the message.

You receive a PII-free projection only: channel, audienceKind, an optional non-PII audienceLabel, engagementSignals (refs + counts only), churchToneSummary, campaignIntent, requiredPlaceholders, forbiddenTopics, and an aiPolicyProfile.

Forbidden:
- Emit any concrete recipient name, phone, email, address, or other contact value.
- Invent members, households, segments, events, service times, or ministries.
- Bake a resolved recipient value into bodyTemplate — use {{placeholder}} tokens only.
- Add donation/giving asks unless campaignIntent explicitly requests one.
- Reference giving data, prayer/counseling notes, or child-sensitive records.
- Advance, confirm, or send the message. Drafts only; human confirmation is mandatory.

Output JSON only, matching the provided schema:
- status: "drafted" | "insufficient_context" | "blocked".
- bodyTemplate: text containing only {{placeholder}} tokens, never resolved PII.
- usedPlaceholders: the placeholder tokens referenced by the draft (no concrete values).
- omittedDueToMissingData: required placeholders you could not responsibly use.
- subject: include only for the email channel.
- rationale: a short, non-PII explanation of the draft.
- needsReview: always true — an AI draft is never auto-advanced.

On insufficient_context or blocked, still return valid JSON with that status; the caller surfaces a typed error and creates no message.`;

/**
 * Build the real Anthropic-backed `CommunityAiDraftPort`. The returned port's
 * `draftCommunication` forwards exactly the supplied PII-free projection to the
 * model (system = the embedded spec, user message = the projection serialized as
 * JSON), requests structured JSON output, and returns the model's parsed JSON as
 * `unknown`. The service re-validates that `unknown`.
 *
 * To wire it live (see `docs/running.md` → "Live AI"):
 *   createAnthropicCommunityAiDraftPort({ client: new Anthropic() })
 * passed as `aiDraftPort` in place of the fake, when `ANTHROPIC_API_KEY` is set.
 */
export const createAnthropicCommunityAiDraftPort = (
  options: CreateAnthropicCommunityAiDraftPortOptions
): CommunityAiDraftPort => {
  const { client } = options;
  const model = options.model ?? DEFAULT_COMMUNITY_AI_DRAFT_MODEL;

  return {
    draftCommunication: async (prompt: CommunityAiDraftPrompt): Promise<unknown> => {
      // The system prompt is selected by the projection's `promptVersion`. That
      // field is the `community-comms-draft.v1` literal by type (the projection is
      // schema-validated upstream by `buildCommunityAiDraftPrompt`), so the only
      // spec this adapter serves is `COMMUNITY_COMMS_DRAFT_V1_SYSTEM_PROMPT`.
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
              schema: COMMUNITY_AI_DRAFT_OUTPUT_SCHEMA,
              type: "json_schema"
            }
          },
          system: COMMUNITY_COMMS_DRAFT_V1_SYSTEM_PROMPT,
          thinking: { type: "adaptive" }
        });
      } catch (error: unknown) {
        // Map a typed SDK error to a thrown domain-appropriate error; the
        // service's existing failure handling turns it into a typed result.
        if (error instanceof APIError) {
          throw new Error(
            `Community AI draft request to the Anthropic API failed: ${error.message}`
          );
        }

        throw error;
      }

      return parseCommunityAiDraftResponse(response);
    }
  };
};

/**
 * Read the model reply: check `stop_reason` FIRST. On a refusal (or when no text
 * JSON block is present) throw — never index `content[0]` blindly. Otherwise parse
 * the model's emitted JSON text and return it as `unknown` for the service to
 * re-validate.
 */
const parseCommunityAiDraftResponse = (response: Anthropic.Message): unknown => {
  if (response.stop_reason === "refusal") {
    throw new Error(
      "The Anthropic API refused the Community comms-draft request (stop_reason: refusal)."
    );
  }

  const text = firstTextBlock(response);
  if (text === undefined) {
    throw new Error(
      "The Anthropic API returned no text content for the Community comms-draft request."
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "The Anthropic API returned a non-JSON Community comms-draft suggestion."
    );
  }
};

const firstTextBlock = (response: Anthropic.Message): string | undefined => {
  for (const block of response.content) {
    if (block.type === "text") {
      return block.text;
    }
  }

  return undefined;
};
