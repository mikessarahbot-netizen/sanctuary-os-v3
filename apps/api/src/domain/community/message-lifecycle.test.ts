import { describe, expect, it } from "vitest";
import { applyMessageTransition } from "./message-lifecycle.js";
import {
  CommunicationConfirmationSchema,
  parseCommunicationMessage,
  type CommunicationConfirmation,
  type CommunicationMessage,
  type CommunicationStatus
} from "./schemas.js";

const ISO = "2026-06-17T10:00:00.000Z";

const confirmation: CommunicationConfirmation = CommunicationConfirmationSchema.parse({
  confirmed: true,
  confirmedAt: ISO,
  confirmedByRef: "actor-1",
  reason: "Reviewed and approved by pastor"
});

const message = (overrides: Record<string, unknown>): CommunicationMessage =>
  parseCommunicationMessage({
    audience: { groupId: "group-1", kind: "group" },
    bodyTemplate: "Hi {{firstName}}",
    channel: "sms",
    createdAt: ISO,
    createdByRef: "actor-1",
    messageId: "message-1",
    origin: "human",
    status: "draft",
    tenantId: "tenant-1",
    updatedAt: ISO,
    ...overrides
  });

const confirmedMessage = (status: CommunicationStatus): CommunicationMessage =>
  message({ confirmation, status });

describe("applyMessageTransition allowed-transition map", () => {
  it("advances draft -> reviewed", () => {
    const result = applyMessageTransition(message({ status: "draft" }), "review");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("reviewed");
    }
  });

  it("rejects an illegal jump (draft -> send)", () => {
    const result = applyMessageTransition(message({ status: "draft" }), "send");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ILLEGAL_TRANSITION");
      expect(result.error.from).toBe("draft");
      expect(result.error.to).toBe("sent");
    }
  });

  it("advances queued -> sent on an already-confirmed message", () => {
    const result = applyMessageTransition(confirmedMessage("queued"), "send");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("sent");
    }
  });

  it("allows cancel from a live state", () => {
    const result = applyMessageTransition(message({ status: "reviewed" }), "cancel");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("canceled");
    }
  });

  it("allows fail from queued", () => {
    const result = applyMessageTransition(confirmedMessage("queued"), "fail");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("failed");
    }
  });

  it("rejects any transition out of a terminal state", () => {
    const fromSent = applyMessageTransition(confirmedMessage("sent"), "cancel");
    const fromCanceled = applyMessageTransition(message({ status: "canceled" }), "fail");

    expect(fromSent.ok).toBe(false);
    expect(fromCanceled.ok).toBe(false);
  });
});

describe("applyMessageTransition confirmation gate", () => {
  it("rejects confirm without a confirmation", () => {
    const result = applyMessageTransition(message({ status: "reviewed" }), "confirm");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIRMATION_REQUIRED");
    }
  });

  it("confirms reviewed -> confirmed and records the confirmation", () => {
    const result = applyMessageTransition(
      message({ status: "reviewed" }),
      "confirm",
      confirmation
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("confirmed");
      expect(result.message.confirmation).toEqual(confirmation);
    }
  });

  it("rejects a confirmation supplied on a non-confirm transition", () => {
    const result = applyMessageTransition(
      message({ status: "draft" }),
      "review",
      confirmation
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIRMATION_NOT_ALLOWED");
    }
  });

  it("advances confirmed -> queued once confirmation is recorded", () => {
    const result = applyMessageTransition(confirmedMessage("confirmed"), "queue");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.status).toBe("queued");
    }
  });
});

describe("applyMessageTransition AI-drafted gate", () => {
  it("lets an ai-drafted message be reviewed but never self-advance to send", () => {
    const aiDraft = message({ origin: "ai-drafted", status: "draft" });

    const reviewed = applyMessageTransition(aiDraft, "review");
    expect(reviewed.ok).toBe(true);

    // No path advances toward send without a human confirmation: confirm
    // without a confirmation is rejected, so an AI draft cannot self-send.
    if (reviewed.ok) {
      const confirmAttempt = applyMessageTransition(reviewed.message, "confirm");
      expect(confirmAttempt.ok).toBe(false);
    }
  });

  it("still requires human confirmation even for an ai-drafted message", () => {
    const aiReviewed = message({ origin: "ai-drafted", status: "reviewed" });
    const confirmed = applyMessageTransition(aiReviewed, "confirm", confirmation);

    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.message.origin).toBe("ai-drafted");
      expect(confirmed.message.confirmation).toEqual(confirmation);
    }
  });
});

describe("applyMessageTransition determinism", () => {
  it("returns equal results for identical inputs", () => {
    const input = message({ status: "reviewed" });

    expect(applyMessageTransition(input, "confirm", confirmation)).toEqual(
      applyMessageTransition(input, "confirm", confirmation)
    );
  });

  it("does not mutate the input message", () => {
    const input = message({ status: "draft" });
    applyMessageTransition(input, "review");

    expect(input.status).toBe("draft");
  });
});
