import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
  ObsAiActionSuggestionPromptSchema,
  ObsAiActionSuggestionSchema,
  type ObsAiActionSuggestionPrompt
} from "./ai-suggest.js";
import {
  DEFAULT_OBS_AI_SUGGESTION_MODEL,
  createAnthropicObsAiSuggestionPort,
  type ObsAnthropicMessagesClient
} from "./anthropic-ai-suggest-port.js";

/**
 * Real-adapter unit tests for `createAnthropicObsAiSuggestionPort`. These inject a
 * FAKE Anthropic client (typed against the real SDK's `messages.create` so `tsc`
 * still validates the request the adapter builds) and NEVER touch the network. The
 * real `ANTHROPIC_API_KEY` is resolved by the SDK at the composition root, never in
 * code — there is no key here. The adapter is UNIT-tested, not live-verified.
 */

/** A captured `messages.create` request the fake recorded. */
type CaptureBody = Anthropic.MessageCreateParams;

/**
 * A fake `messages.create` whose signature is taken verbatim from the SDK
 * (`Anthropic.Messages["create"]`), so the adapter's call site is type-checked
 * against the real SDK. It records the request body and returns a caller-supplied,
 * fully-typed `Anthropic.Message` — or rejects, to exercise the error path.
 */
const createFakeClient = (
  outcome:
    | { readonly kind: "message"; readonly message: Anthropic.Message }
    | { readonly kind: "reject"; readonly error: unknown }
): {
  readonly client: ObsAnthropicMessagesClient;
  readonly bodies: CaptureBody[];
} => {
  const bodies: CaptureBody[] = [];

  const create = ((body: CaptureBody): Promise<Anthropic.Message> => {
    bodies.push(body);

    return outcome.kind === "message"
      ? Promise.resolve(outcome.message)
      : Promise.reject(
          outcome.error instanceof Error
            ? outcome.error
            : new Error(String(outcome.error))
        );
  }) as Anthropic.Messages["create"];

  return { bodies, client: { messages: { create } } };
};

const messageWithText = (
  text: string,
  stopReason: Anthropic.StopReason = "end_turn"
): Anthropic.Message => ({
  container: null,
  content: [{ citations: null, text, type: "text" }],
  id: "msg_test",
  model: DEFAULT_OBS_AI_SUGGESTION_MODEL,
  role: "assistant",
  stop_details: null,
  stop_reason: stopReason,
  stop_sequence: null,
  type: "message",
  usage: {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: 10,
    output_tokens: 20,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null
  }
});

/**
 * A refusal `Message` whose `content` is empty — the shape that makes blind
 * `content[0]` indexing throw. The adapter must throw a clear error first.
 */
const refusalMessage = (): Anthropic.Message => ({
  ...messageWithText("", "refusal"),
  content: []
});

const validSuggestionJson = JSON.stringify({
  kind: "switch-scene",
  needsReview: true,
  rationale: "Move to the lower-third scene for the announcements segment.",
  status: "suggested",
  targetSceneRef: "scene-lower"
});

/**
 * A secret-free + PII-free projection exactly as `buildObsAiActionSuggestionPrompt`
 * would produce it: refs/coarse state/non-PII labels/policy only.
 * `connectionProfileRef` is the opaque id, NOT the vault handle. Parsed through the
 * real schema so the test can never drift from the contract.
 */
const projection: ObsAiActionSuggestionPrompt = ObsAiActionSuggestionPromptSchema.parse({
  aiPolicyProfile: { humanReviewRequiredFor: ["obs-action"], piiSharingAllowed: false },
  connectionProfileRef: "connection_1",
  connectionStatus: "connected",
  operatorIntent: "Moving into announcements.",
  promptVersion: OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
  recordingStatus: "inactive",
  requestId: "request_ai_suggest",
  scenes: [
    { displayName: "Main", isCurrentProgramScene: true, obsSceneRef: "scene-main" },
    { displayName: "Lower Third", isCurrentProgramScene: false, obsSceneRef: "scene-lower" }
  ],
  sceneItems: [
    {
      obsSceneItemId: "item-1",
      obsSceneRef: "scene-main",
      obsSourceRef: "source-cam",
      visibleHint: true
    }
  ],
  serviceSegmentLabels: ["Welcome", "Announcements"],
  sources: [{ kindLabel: "v4l2_source", obsSourceRef: "source-cam" }],
  streamStatus: "inactive",
  tenantId: "tenant_1"
});

describe("createAnthropicObsAiSuggestionPort", () => {
  it("calls messages.create with the default model, the spec as system prompt, structured output (no thinking), and the projection in the user message", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicObsAiSuggestionPort({ client });

    const result = await port.suggestObsAction(projection);

    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body).toBeDefined();
    if (body === undefined) {
      return;
    }

    // Default model is exactly claude-opus-4-8 (no date suffix).
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(8192);

    // System prompt is the embedded obs-action-suggestion.v1 spec.
    expect(typeof body.system).toBe("string");
    expect(body.system).toContain(OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION);
    expect(body.system).toContain("OBS Action Suggester");

    // Structured output (json_schema) requested; no thinking (deterministic
    // structured generation); non-streaming.
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body.thinking).toBeUndefined();
    expect(body.stream).toBeUndefined();

    // The user message carries exactly the projection serialized as JSON.
    expect(body.messages).toHaveLength(1);
    const userMessage = body.messages[0];
    expect(userMessage?.role).toBe("user");
    expect(userMessage?.content).toBe(JSON.stringify(projection));

    // The adapter returns the model's parsed JSON as `unknown`; it round-trips a
    // valid suggestion shape (the service re-validates this same way).
    const parsed = ObsAiActionSuggestionSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("forwards ONLY the secret-free projection fields — no connectionRef, vault handle, host, or password is added", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicObsAiSuggestionPort({ client });

    await port.suggestObsAction(projection);

    const body = bodies[0];
    expect(body).toBeDefined();
    if (body === undefined) {
      return;
    }

    const userMessage = body.messages[0];
    const sentContent = typeof userMessage?.content === "string" ? userMessage.content : "";

    // The request payload (user message) is exactly the projection — no more, no
    // fewer fields. The adapter is pure transport; it adds/fetches/fabricates
    // nothing.
    expect(JSON.parse(sentContent)).toEqual(projection);
    // The opaque profile id may appear; the vault handle never can.
    expect(sentContent).toContain("connection_1");

    // No secret key-name or secret-shaped value can have leaked into the FORWARDED
    // projection (the user message). The system prompt legitimately names these as
    // prohibitions, so the scan is scoped to the payload, not the whole request.
    expect(sentContent).not.toContain("connectionRef");
    expect(sentContent).not.toContain("vault://");
    expect(sentContent).not.toContain("password");
    expect(sentContent).not.toContain("streamKey");
    expect(sentContent).not.toContain("authToken");
    expect(sentContent).not.toContain("hunter2");
  });

  it("uses an injected model override instead of the default", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicObsAiSuggestionPort({
      client,
      model: "claude-opus-4-7"
    });

    await port.suggestObsAction(projection);

    expect(bodies[0]?.model).toBe("claude-opus-4-7");
  });

  it("throws (not an index error) when the model refuses with an empty content array", async () => {
    const { client } = createFakeClient({ kind: "message", message: refusalMessage() });
    const port = createAnthropicObsAiSuggestionPort({ client });

    await expect(port.suggestObsAction(projection)).rejects.toThrow(/refused/u);
  });

  it("surfaces a thrown error when the SDK client throws an APIError", async () => {
    const apiError = new APIError(
      500,
      { type: "error", error: { type: "api_error", message: "boom" } },
      "Internal server error",
      new Headers()
    );
    const { client } = createFakeClient({ kind: "reject", error: apiError });
    const port = createAnthropicObsAiSuggestionPort({ client });

    await expect(port.suggestObsAction(projection)).rejects.toThrow(
      /Anthropic API failed/u
    );
  });

  it("throws when the model returns non-JSON text", async () => {
    const { client } = createFakeClient({
      kind: "message",
      message: messageWithText("not json at all")
    });
    const port = createAnthropicObsAiSuggestionPort({ client });

    await expect(port.suggestObsAction(projection)).rejects.toThrow(/non-JSON/u);
  });

  it("strips an empty-string optional ref (targetSceneRef on a stream action) so the strict gate accepts the suggestion", async () => {
    // Same wire-vs-gate gap as the comms adapter: structured outputs cannot express
    // "non-empty or absent", so the model emits targetSceneRef:"" for start-stream
    // (which carries no target). The adapter drops empty-string fields before the
    // service re-validates with ObsAiActionSuggestionSchema (optional refs are
    // NON-empty; start/stop-stream must carry no target ref).
    const startStreamWithEmptyRef = JSON.stringify({
      kind: "start-stream",
      needsReview: true,
      rationale: "Begin the stream for the start of the service.",
      status: "suggested",
      targetSceneRef: ""
    });
    const { client } = createFakeClient({
      kind: "message",
      message: messageWithText(startStreamWithEmptyRef)
    });
    const port = createAnthropicObsAiSuggestionPort({ client });

    const result = await port.suggestObsAction(projection);

    expect(result).not.toHaveProperty("targetSceneRef");
    expect(ObsAiActionSuggestionSchema.safeParse(result).success).toBe(true);
  });
});
