import type { PresenterLocalSyncConflictDetailPersistence } from "@sanctuary-os/db";
import type { PresenterDesktopReplayErrorClassifier } from "./replay-pass.js";
import { PresenterNetworkReplayError } from "./network-command-service.js";

/**
 * Concrete replay error classifier for the network executor.
 *
 * A `PresenterNetworkReplayError` whose GraphQL `extensions.code` names a known
 * non-retryable condition (stale revision, missing slide, theme/output-target
 * mismatch, validation, authorization) becomes a `conflict` with redacted
 * details for operator review. Everything else — transport errors, server
 * faults, unknown codes — stays a retryable `failed`, which safely pauses that
 * presentation until the next pass. No raw server error text is surfaced.
 */
type ConflictKind = PresenterLocalSyncConflictDetailPersistence["conflictKind"];

const CONFLICT_CODE_TO_KIND: Readonly<Record<string, ConflictKind>> = {
  AUTHORIZATION_FAILED: "authorization-failed",
  MISSING_SLIDE: "missing-slide",
  OUTPUT_TARGET_MISMATCH: "output-target-mismatch",
  STALE_PRESENTATION: "stale-presentation",
  THEME_MISMATCH: "theme-mismatch",
  VALIDATION_FAILED: "validation-failed"
};

const CONFLICT_SAFE_MESSAGE: Readonly<Record<ConflictKind, string>> = {
  "authorization-failed": "You no longer have permission to apply this edit. Please review it.",
  "missing-slide": "A slide this edit depends on no longer exists on the server. Please review it.",
  "output-target-mismatch": "The output target changed on the server. Please review this edit.",
  "stale-presentation": "This presentation changed on the server since the edit was made. Please review it.",
  "theme-mismatch": "The presentation theme changed on the server. Please review this edit.",
  "validation-failed": "The server rejected this edit as invalid. Please review it."
};

export interface PresenterReplayErrorClassifierOptions {
  readonly safeErrorMessage?: string;
}

const readServerRevision = (
  extensions: Readonly<Record<string, unknown>> | undefined
): string => {
  const serverRevision = extensions?.["serverRevision"];

  return typeof serverRevision === "string" && serverRevision.length > 0
    ? serverRevision
    : "unknown";
};

export const createPresenterReplayErrorClassifier = (
  options: PresenterReplayErrorClassifierOptions = {}
): PresenterDesktopReplayErrorClassifier => {
  const safeErrorMessage =
    options.safeErrorMessage ??
    "This edit could not be synced yet and will be retried automatically.";

  return (error, entry) => {
    if (error instanceof PresenterNetworkReplayError && error.code !== undefined) {
      const conflictKind = CONFLICT_CODE_TO_KIND[error.code];

      if (conflictKind !== undefined) {
        return {
          conflict: {
            conflictKind,
            localBaseRevision: entry.baseRevision,
            safeMessage: CONFLICT_SAFE_MESSAGE[conflictKind],
            serverRevision: readServerRevision(error.extensions)
          },
          kind: "conflict"
        };
      }
    }

    return { kind: "failed", safeErrorMessage };
  };
};
