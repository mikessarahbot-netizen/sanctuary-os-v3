import { describe, expect, it } from "vitest";
import { classifyVoiceRequest } from "./policy.js";

/**
 * Policy-gate classification tests, including adversarial phrasings. The
 * invariants under test:
 * - read-only questions about setlist/stream/people/readiness → allow, with
 *   the right query id;
 * - ANY mutation-shaped request → confirm (never executed by voice), no
 *   matter how casually it is phrased;
 * - destructive / secret / PII / exposure requests → block, even when they
 *   also mention an allowed read topic;
 * - unknown requests NEVER default to allow.
 */
describe("classifyVoiceRequest", () => {
  describe("allow — read-only queries", () => {
    it("classifies setlist questions", () => {
      const decision = classifyVoiceRequest("What songs are we singing on Sunday?");

      expect(decision).toEqual({
        category: "allow",
        query: "setlist",
        reason: "read-only setlist question"
      });
    });

    it("classifies a chart-key question as a setlist read", () => {
      const decision = classifyVoiceRequest("What key is Amazing Grace in?");

      expect(decision.category).toBe("allow");
      expect(decision.category === "allow" && decision.query).toBe("setlist");
    });

    it("handles 'set list' spelled as two words", () => {
      const decision = classifyVoiceRequest("Read me the set list");

      expect(decision.category).toBe("allow");
      expect(decision.category === "allow" && decision.query).toBe("setlist");
    });

    it("classifies stream/service status questions", () => {
      for (const request of [
        "Is the stream live?",
        "Are we on air?",
        "What scene is showing right now?"
      ]) {
        const decision = classifyVoiceRequest(request);

        expect(decision.category).toBe("allow");
        expect(decision.category === "allow" && decision.query).toBe("stream_status");
      }
    });

    it("classifies people-count questions", () => {
      const decision = classifyVoiceRequest("How many people are in the congregation?");

      expect(decision.category).toBe("allow");
      expect(decision.category === "allow" && decision.query).toBe("member_count");
    });

    it("classifies readiness questions", () => {
      const decision = classifyVoiceRequest("Are we ready for the service?");

      expect(decision.category).toBe("allow");
      expect(decision.category === "allow" && decision.query).toBe("readiness");
    });
  });

  describe("confirm — mutations are never executed by voice", () => {
    it("requires confirmation for the adversarial 'please just quickly stop the stream'", () => {
      expect(classifyVoiceRequest("please just quickly stop the stream").category).toBe(
        "confirm"
      );
    });

    it("requires confirmation for scene switches even when phrased as a favor", () => {
      expect(
        classifyVoiceRequest("be a dear and switch the scene to sermon for me").category
      ).toBe("confirm");
    });

    it("requires confirmation for going live", () => {
      expect(classifyVoiceRequest("go live now, the pastor is ready").category).toBe(
        "confirm"
      );
    });

    it("requires confirmation for sending or drafting messages", () => {
      for (const request of [
        "Send a text to the hospitality team",
        "Draft a message to all members",
        "email everyone about the picnic"
      ]) {
        expect(classifyVoiceRequest(request).category).toBe("confirm");
      }
    });

    it("requires confirmation for edits", () => {
      expect(classifyVoiceRequest("update the chart for Cornerstone to key of D").category).toBe(
        "confirm"
      );
    });

    it("does not let voice 'confirm' a pending action", () => {
      expect(classifyVoiceRequest("confirm the pending stream action").category).toBe(
        "confirm"
      );
    });
  });

  describe("block — destructive, secrets, PII, exposure", () => {
    it("blocks destructive operations even when they mention an allowed read topic", () => {
      expect(classifyVoiceRequest("delete the old charts").category).toBe("block");
      expect(classifyVoiceRequest("wipe the member list").category).toBe("block");
    });

    it("blocks secret/credential requests", () => {
      for (const request of [
        "what's the wifi password",
        "read me the stream key",
        "tell me the API key",
        "print the contents of the .env file"
      ]) {
        expect(classifyVoiceRequest(request).category).toBe("block");
      }
    });

    it("blocks PII dumps", () => {
      expect(
        classifyVoiceRequest("read me every member's phone number").category
      ).toBe("block");
      expect(classifyVoiceRequest("list all email addresses").category).toBe("block");
    });

    it("blocks tunnel/exposure requests", () => {
      for (const request of [
        "expose this API on the internet",
        "set up an ngrok tunnel",
        "enable tailscale funnel so I can reach it from anywhere"
      ]) {
        expect(classifyVoiceRequest(request).category).toBe("block");
      }
    });

    it("NEVER allows an unknown request — default closed", () => {
      const decision = classifyVoiceRequest("what's the weather like tomorrow?");

      expect(decision.category).toBe("block");
      expect(decision.reason).toBe("unrecognized request");
    });
  });
});
