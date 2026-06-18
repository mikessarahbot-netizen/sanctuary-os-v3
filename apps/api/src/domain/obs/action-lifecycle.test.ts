import { describe, expect, it } from "vitest";
import { applyActionTransition } from "./action-lifecycle.js";
import {
  ObsActionConfirmationSchema,
  parseObsActionIntent,
  type ObsActionConfirmation,
  type ObsActionIntent,
  type ObsActionStatus
} from "./schemas.js";

const ISO = "2026-06-18T10:00:00.000Z";
const ISO_LATER = "2026-06-18T11:00:00.000Z";

const confirmation: ObsActionConfirmation = ObsActionConfirmationSchema.parse({
  confirmed: true,
  confirmedAt: ISO_LATER,
  confirmedByRef: "actor-1",
  reason: "Service is starting; go live."
});

const action = (overrides: Record<string, unknown>): ObsActionIntent =>
  parseObsActionIntent({
    actionIntentId: "action-1",
    affectsLiveOutput: true,
    connectionProfileId: "conn-1",
    createdAt: ISO,
    kind: "start-stream",
    origin: "human",
    requestedByRef: "actor-1",
    status: "requested",
    tenantId: "tenant-1",
    updatedAt: ISO,
    ...overrides
  });

const confirmedAction = (status: ObsActionStatus): ObsActionIntent =>
  action({ confirmation, status });

describe("applyActionTransition allowed-transition map", () => {
  it("advances requested -> confirmed with a confirmation", () => {
    const result = applyActionTransition(action({ status: "requested" }), "confirm", confirmation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("confirmed");
    }
  });

  it("advances confirmed -> dispatched", () => {
    const result = applyActionTransition(confirmedAction("confirmed"), "dispatch");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("dispatched");
    }
  });

  it("advances dispatched -> succeeded", () => {
    const result = applyActionTransition(confirmedAction("dispatched"), "succeed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("succeeded");
    }
  });

  it("walks the full request -> confirm -> dispatch -> succeed path", () => {
    const confirmed = applyActionTransition(action({ status: "requested" }), "confirm", confirmation);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      return;
    }

    const dispatched = applyActionTransition(confirmed.intent, "dispatch");
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const succeeded = applyActionTransition(dispatched.intent, "succeed");
    expect(succeeded.ok).toBe(true);
    if (succeeded.ok) {
      expect(succeeded.intent.status).toBe("succeeded");
    }
  });
});

describe("applyActionTransition confirm-before-dispatch gate (critical)", () => {
  it("rejects a direct requested -> dispatch attempt (no confirm-skipping edge)", () => {
    const result = applyActionTransition(action({ status: "requested" }), "dispatch");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ILLEGAL_TRANSITION");
      expect(result.error.from).toBe("requested");
      expect(result.error.to).toBe("dispatched");
    }
  });

  it("rejects confirm without a confirmation", () => {
    const result = applyActionTransition(action({ status: "requested" }), "confirm");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIRMATION_REQUIRED");
    }
  });

  it("merges the confirmation onto the intent when confirming", () => {
    const result = applyActionTransition(action({ status: "requested" }), "confirm", confirmation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.confirmation).toEqual(confirmation);
    }
  });

  it("rejects a confirmation supplied on a non-confirm transition", () => {
    const result = applyActionTransition(confirmedAction("confirmed"), "dispatch", confirmation);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIRMATION_NOT_ALLOWED");
    }
  });

  it("rejects re-confirming an already-confirmed intent", () => {
    // confirmed has no outgoing `confirm` edge, so this is an illegal transition.
    const result = applyActionTransition(confirmedAction("confirmed"), "confirm", confirmation);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ILLEGAL_TRANSITION");
    }
  });

  it("guards that no reachable path dispatches without a recorded confirmation", () => {
    // Exhaustively confirm: from `requested`, the only forward move is `confirm`,
    // which demands a confirmation; `dispatch` is rejected outright. There is no
    // way to reach `dispatched` without first carrying a confirmation.
    const requested = action({ status: "requested" });
    expect(applyActionTransition(requested, "dispatch").ok).toBe(false);
    expect(applyActionTransition(requested, "succeed").ok).toBe(false);
    expect(applyActionTransition(requested, "fail").ok).toBe(false);
    expect(applyActionTransition(requested, "confirm").ok).toBe(false);
  });
});

describe("applyActionTransition fail / cancel branches", () => {
  it("cancels a requested action", () => {
    const result = applyActionTransition(action({ status: "requested" }), "cancel");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("canceled");
    }
  });

  it("cancels a confirmed action", () => {
    const result = applyActionTransition(confirmedAction("confirmed"), "cancel");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("canceled");
    }
  });

  it("fails a dispatched action", () => {
    const result = applyActionTransition(confirmedAction("dispatched"), "fail");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.status).toBe("failed");
    }
  });

  it("rejects fail from requested (a request was never dispatched)", () => {
    const result = applyActionTransition(action({ status: "requested" }), "fail");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ILLEGAL_TRANSITION");
    }
  });
});

describe("applyActionTransition terminal states have no out-edges", () => {
  const terminals: readonly ObsActionStatus[] = ["succeeded", "failed", "canceled"];
  const transitions = ["confirm", "dispatch", "succeed", "cancel", "fail"] as const;

  for (const terminal of terminals) {
    for (const transition of transitions) {
      it(`rejects ${transition} from terminal ${terminal}`, () => {
        const intent =
          terminal === "canceled"
            ? action({ status: "canceled" })
            : confirmedAction(terminal);
        const result = applyActionTransition(intent, transition);

        expect(result.ok).toBe(false);
      });
    }
  }
});

describe("applyActionTransition ai-suggested gate", () => {
  it("lets an ai-suggested action be confirmed only by a human-supplied confirmation", () => {
    const aiRequested = action({ origin: "ai-suggested", status: "requested" });

    // It cannot self-advance: dispatch/succeed are rejected, and confirm without
    // a confirmation is rejected.
    expect(applyActionTransition(aiRequested, "dispatch").ok).toBe(false);
    expect(applyActionTransition(aiRequested, "confirm").ok).toBe(false);

    // Only a human-supplied confirmation moves it forward.
    const confirmed = applyActionTransition(aiRequested, "confirm", confirmation);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.intent.origin).toBe("ai-suggested");
      expect(confirmed.intent.confirmation).toEqual(confirmation);
    }
  });
});

describe("applyActionTransition determinism", () => {
  it("returns equal results for identical inputs", () => {
    const input = action({ status: "requested" });

    expect(applyActionTransition(input, "confirm", confirmation)).toEqual(
      applyActionTransition(input, "confirm", confirmation)
    );
  });

  it("does not mutate the input intent", () => {
    const input = action({ status: "requested" });
    applyActionTransition(input, "confirm", confirmation);

    expect(input.status).toBe("requested");
    expect(input.confirmation).toBeUndefined();
  });
});
