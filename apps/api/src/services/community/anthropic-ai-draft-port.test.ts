import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  CommunityAiDraftPromptSchema,
  CommunityAiDraftSuggestionSchema,
  COMMUNITY_AI_DRAFT_PROMPT_VERSION,
  type CommunityAiDraftPrompt
} from "./ai-draft.js";
import {
  DEFAULT_COMMUNITY_AI_DRAFT_MODEL,
  createAnthropicCommunityAiDraftPort,
  type CommunityAnthropicMessagesClient
} from "./anthropic-ai-draft-port.js";

/**
 * Real-adapter unit tests for `createAnthropicCommunityAiDraftPort`. These inject a
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
  readonly client: CommunityAnthropicMessagesClient;
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

/**
 * Build an `Anthropic.Message` carrying a single text block. `stop_reason` defaults
 * to `end_turn`; pass `"refusal"` to exercise the refusal path.
 */
const messageWithText = (
  text: string,
  stopReason: Anthropic.StopReason = "end_turn"
): Anthropic.Message => ({
  container: null,
  content: [{ citations: null, text, type: "text" }],
  id: "msg_test",
  model: DEFAULT_COMMUNITY_AI_DRAFT_MODEL,
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
  bodyTemplate: "Hi {{firstName}}, we'd love to see you on {{serviceDate}}.",
  needsReview: true,
  omittedDueToMissingData: [],
  rationale: "Re-engagement nudge grounded in attendance-streak signals only.",
  status: "drafted",
  usedPlaceholders: ["firstName", "serviceDate"]
});

/**
 * A PII-free projection exactly as `buildCommunityAiDraftPrompt` would produce it:
 * refs/counts/labels/policy only. Parsed through the real schema so the test can
 * never drift from the contract.
 */
const projection: CommunityAiDraftPrompt = CommunityAiDraftPromptSchema.parse({
  aiPolicyProfile: { humanReviewRequiredFor: ["communication"], piiSharingAllowed: false },
  audienceKind: "group",
  audienceLabel: "Welcome Team",
  campaignIntent: "Invite the lapsed segment back to a Sunday gathering.",
  channel: "email",
  churchToneSummary: "Warm, concise, welcoming.",
  engagementSignals: [
    {
      attendanceStreak: 4,
      commsResponseCount: 2,
      scopeKind: "segment",
      scopeRef: "segment_a",
      servingCount: 1
    }
  ],
  forbiddenTopics: ["fundraising"],
  promptVersion: COMMUNITY_AI_DRAFT_PROMPT_VERSION,
  requiredPlaceholders: ["firstName", "serviceDate"],
  requestId: "request_ai_draft",
  tenantId: "tenant_1"
});

describe("createAnthropicCommunityAiDraftPort", () => {
  it("calls messages.create with the default model, the spec as system prompt, structured output (no thinking), and the projection in the user message", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicCommunityAiDraftPort({ client });

    const result = await port.draftCommunication(projection);

    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body).toBeDefined();
    if (body === undefined) {
      return;
    }

    // Default model is exactly claude-opus-4-8 (no date suffix).
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(8192);

    // System prompt is the embedded community-comms-draft.v1 spec.
    expect(typeof body.system).toBe("string");
    expect(body.system).toContain(COMMUNITY_AI_DRAFT_PROMPT_VERSION);
    expect(body.system).toContain("Community+ Communications Drafter");

    // Structured output (json_schema) requested; no thinking (deterministic
    // structured generation — adaptive thinking added variance, e.g. occasional
    // stub outputs, without benefit here); non-streaming.
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
    const parsed = CommunityAiDraftSuggestionSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("forwards ONLY the PII-free projection fields — no contact value, name, or channel value is added", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicCommunityAiDraftPort({ client });

    await port.draftCommunication(projection);

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

    // No PII key-name or contact value can have leaked into the FORWARDED
    // projection (the user message).
    expect(sentContent).not.toContain("displayName");
    expect(sentContent).not.toContain("contactChannelRefs");
    expect(sentContent).not.toContain("@");
    expect(sentContent).not.toContain("channelRef");
  });

  it("uses an injected model override instead of the default", async () => {
    const { client, bodies } = createFakeClient({
      kind: "message",
      message: messageWithText(validSuggestionJson)
    });
    const port = createAnthropicCommunityAiDraftPort({
      client,
      model: "claude-opus-4-7"
    });

    await port.draftCommunication(projection);

    expect(bodies[0]?.model).toBe("claude-opus-4-7");
  });

  it("throws (not an index error) when the model refuses with an empty content array", async () => {
    const { client } = createFakeClient({ kind: "message", message: refusalMessage() });
    const port = createAnthropicCommunityAiDraftPort({ client });

    await expect(port.draftCommunication(projection)).rejects.toThrow(/refused/u);
  });

  it("surfaces a thrown error when the SDK client throws an APIError", async () => {
    const apiError = new APIError(
      500,
      { type: "error", error: { type: "api_error", message: "boom" } },
      "Internal server error",
      new Headers()
    );
    const { client } = createFakeClient({ kind: "reject", error: apiError });
    const port = createAnthropicCommunityAiDraftPort({ client });

    await expect(port.draftCommunication(projection)).rejects.toThrow(
      /Anthropic API failed/u
    );
  });

  it("throws when the model returns non-JSON text", async () => {
    const { client } = createFakeClient({
      kind: "message",
      message: messageWithText("not json at all")
    });
    const port = createAnthropicCommunityAiDraftPort({ client });

    await expect(port.draftCommunication(projection)).rejects.toThrow(/non-JSON/u);
  });

  it("strips an empty-string optional field (subject on SMS) so the strict gate accepts the draft", async () => {
    // Structured outputs cannot express "non-empty or absent" (no JSON Schema
    // minLength), so the model emits subject:"" for a non-email channel. The
    // adapter drops empty-string fields before the service re-validates with
    // CommunityAiDraftSuggestionSchema (subject is optional but NON-empty) — a
    // real bug caught by live verification.
    const withEmptySubject = JSON.stringify({
      bodyTemplate: "Hi {{firstName}}, thanks for serving — see you Sunday!",
      needsReview: true,
      rationale: "Warm SMS thank-you using only the firstName placeholder.",
      status: "drafted",
      subject: "",
      usedPlaceholders: ["firstName"]
    });
    const { client } = createFakeClient({
      kind: "message",
      message: messageWithText(withEmptySubject)
    });
    const port = createAnthropicCommunityAiDraftPort({ client });

    const result = await port.draftCommunication(projection);

    // The empty subject is gone, and the result now passes the authoritative gate.
    expect(result).not.toHaveProperty("subject");
    expect(CommunityAiDraftSuggestionSchema.safeParse(result).success).toBe(true);
  });
});
