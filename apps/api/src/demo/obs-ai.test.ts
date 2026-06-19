import { describe, expect, it } from "vitest";
import { resolveObsAiSuggestionPort } from "./obs-ai.js";

/**
 * The env gate for the demo servers' OBS AI-suggestion port. Only the KEYLESS
 * branch is exercised here: it must return `undefined` (the safe "no provider"
 * path) so the demo never constructs an Anthropic client or reaches the network
 * without an explicit key. The key-present branch builds a real `new Anthropic()`
 * and is verified live by the parent (the SDK only needs the key at request time),
 * so it is intentionally not unit-tested here — this asserts the half that must
 * never touch the network.
 *
 * The function reads the key from an injected `env` map, so these cases never read
 * the ambient `process.env` and never print a key.
 */
describe("resolveObsAiSuggestionPort", () => {
  it("returns undefined when ANTHROPIC_API_KEY is absent (keyless fake path)", () => {
    expect(resolveObsAiSuggestionPort({})).toBeUndefined();
  });

  it("returns undefined when ANTHROPIC_API_KEY is an empty string", () => {
    expect(resolveObsAiSuggestionPort({ ANTHROPIC_API_KEY: "" })).toBeUndefined();
  });
});
