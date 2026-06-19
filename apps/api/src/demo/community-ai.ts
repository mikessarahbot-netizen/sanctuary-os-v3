import Anthropic from "@anthropic-ai/sdk";
import type { CommunityAiDraftPort } from "../services/community/ai-draft.js";
import { createAnthropicCommunityAiDraftPort } from "../services/community/anthropic-ai-draft-port.js";

/**
 * The "real-if-key-else-fake" choice for the demo servers' Community `aiDraftPort`,
 * shared by BOTH the in-memory (`server.ts`) and the persistent
 * (`persistent-server.ts`) demo servers so the env gate lives in exactly one place.
 *
 * When `ANTHROPIC_API_KEY` is set and non-empty, this returns the REAL
 * Anthropic-backed port (`createAnthropicCommunityAiDraftPort` over a live
 * `new Anthropic()` — the SDK resolves the key from the environment), so an
 * operator clicking "AI draft" in the web Community compose panel reaches the real
 * `claude-opus-4-8` adapter. When no key is set, it returns `undefined`, which the
 * Community service treats as "no AI provider configured": the manual-compose path
 * is untouched and a `draftCommunicationWithAi` call surfaces a typed
 * `VALIDATION_FAILED` error rather than hitting the network. The web demo data
 * source returns a canned draft in that keyless case, so the demo screen still
 * works with no key and no network.
 *
 * IMPORTANT: this only reads the key — it never prints it. The key must be loaded
 * into `process.env` (via dotenv at the demo-server entry point) BEFORE this is
 * called. The server-composition functions default to NOT calling this (they take
 * the resolved port as an optional argument), so `server.test.ts` /
 * `persistent-server.test.ts` — which construct the composition directly, never via
 * `main()` — always run the keyless fake path regardless of the ambient env.
 */
export const resolveCommunityAiDraftPort = (
  env: Readonly<Record<string, string | undefined>> = process.env
): CommunityAiDraftPort | undefined => {
  const apiKey = env["ANTHROPIC_API_KEY"];

  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  // The SDK reads `ANTHROPIC_API_KEY` from the environment; we never pass or print
  // the key value here.
  return createAnthropicCommunityAiDraftPort({ client: new Anthropic() });
};
