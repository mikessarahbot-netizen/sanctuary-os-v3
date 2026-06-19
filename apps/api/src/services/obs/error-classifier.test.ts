import { describe, expect, it } from "vitest";
import { ObsControlError } from "./control-port.js";
import {
  classifyObsDispatchError,
  isClassifiableObsDispatchError
} from "./error-classifier.js";

/**
 * The OBS dispatch error classifier mirrors the Play replay classifiers: a
 * `disconnected` port failure is the only transient (retryable) condition; every
 * other normalized code is terminal. The `safeMessage` is passed through from the
 * already-redacted `ObsControlError` and never widened.
 */
describe("classifyObsDispatchError", () => {
  it("classifies a disconnected failure as retryable", () => {
    const classification = classifyObsDispatchError(
      new ObsControlError("disconnected", "The OBS instance is not reachable.", true)
    );

    expect(classification).toEqual({
      kind: "retryable",
      safeMessage: "The OBS instance is not reachable."
    });
  });

  it("classifies action-rejected / not-found / port-failure as terminal", () => {
    for (const code of ["action-rejected", "not-found", "port-failure"] as const) {
      const classification = classifyObsDispatchError(
        new ObsControlError(code, "OBS rejected the requested action.", false)
      );

      expect(classification.kind).toBe("terminal");
      expect(classification.safeMessage).toBe("OBS rejected the requested action.");
    }
  });

  it("does not depend on the error's own retryable hint (classifies by code)", () => {
    // Even if the error claims retryable, a terminal code stays terminal — the
    // classifier owns the retryable-vs-terminal decision so a mislabeled port
    // error can never invite a re-dispatch.
    const classification = classifyObsDispatchError(
      new ObsControlError("action-rejected", "OBS rejected the requested action.", true)
    );

    expect(classification.kind).toBe("terminal");
  });

  it("passes the redacted safeMessage through unchanged (never widens it)", () => {
    const classification = classifyObsDispatchError(
      new ObsControlError("disconnected", "The OBS instance is not reachable.", true)
    );

    // No secret/URL/raw detail is ever added by the classifier.
    expect(classification.safeMessage).not.toContain("://");
    expect(classification.safeMessage).not.toContain("password");
  });
});

describe("isClassifiableObsDispatchError", () => {
  it("narrows an ObsControlError", () => {
    expect(
      isClassifiableObsDispatchError(
        new ObsControlError("port-failure", "The OBS control connection failed.", false)
      )
    ).toBe(true);
  });

  it("rejects a non-ObsControlError throw", () => {
    expect(isClassifiableObsDispatchError(new Error("boom"))).toBe(false);
    expect(isClassifiableObsDispatchError("nope")).toBe(false);
    expect(isClassifiableObsDispatchError(undefined)).toBe(false);
  });
});
