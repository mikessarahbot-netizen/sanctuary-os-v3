import Anthropic from "@anthropic-ai/sdk";
import type { ObsAiSuggestionPort } from "../services/obs/ai-suggest.js";
import { createAnthropicObsAiSuggestionPort } from "../services/obs/anthropic-ai-suggest-port.js";

/**
 * The "real-if-key-else-fake" choice for the demo servers' OBS `aiSuggestionPort`,
 * shared by BOTH the in-memory (`server.ts`) and the persistent
 * (`persistent-server.ts`) demo servers so the env gate lives in exactly one place.
 * This is the OBS analog of `resolveCommunityAiDraftPort` (`community-ai.ts`).
 *
 * When `ANTHROPIC_API_KEY` is set and non-empty, this returns the REAL
 * Anthropic-backed port (`createAnthropicObsAiSuggestionPort` over a live
 * `new Anthropic()` — the SDK resolves the key from the environment), so an
 * operator clicking "AI suggest" in the web OBS screen reaches the real
 * `claude-opus-4-8` adapter. The model proposes a single reviewable action; the
 * service turns it into a `requested`, `origin = "ai-suggested"` `ObsActionIntent`
 * that the existing human-confirm gate still binds (request → confirm → dispatch).
 * AI may suggest, never confirm, never dispatch, never go live.
 *
 * When no key is set, it returns `undefined`, which the OBS service treats as "no
 * AI provider configured": the manual scene/stream gates are untouched and a
 * `suggestObsActionWithAi` call surfaces a typed `VALIDATION_FAILED` error rather
 * than hitting the network. The web demo data source returns a canned suggestion in
 * that keyless case, so the demo screen still works with no key and no network.
 *
 * IMPORTANT: this only reads the key — it never prints it. The key must be loaded
 * into `process.env` (via dotenv at the demo-server entry point) BEFORE this is
 * called. The server-composition functions default to NOT calling this (they take
 * the resolved port as an optional argument), so `server.test.ts` /
 * `persistent-server.test.ts` — which construct the composition directly, never via
 * `main()` — always run the keyless fake/none path regardless of the ambient env.
 *
 * The secret posture is unchanged by wiring a real port: the OBS service builds the
 * secret-free + PII-free projection (`connectionProfileRef` is the opaque id, never
 * the `connectionRef` vault handle), so no host/port/password/token/stream key can
 * reach the model regardless of which port is resolved here.
 */
export const resolveObsAiSuggestionPort = (
  env: Readonly<Record<string, string | undefined>> = process.env
): ObsAiSuggestionPort | undefined => {
  const apiKey = env["ANTHROPIC_API_KEY"];

  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  // The SDK reads `ANTHROPIC_API_KEY` from the environment; we never pass or print
  // the key value here.
  return createAnthropicObsAiSuggestionPort({ client: new Anthropic() });
};
