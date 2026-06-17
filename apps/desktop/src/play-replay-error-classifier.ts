import { PLAY_DOMAIN_ERROR_CODES, type PlayDomainErrorCode } from "@sanctuary-os/api/play";
import type { PlayDesktopReplayErrorClassifier } from "./play-replay-pass.js";
import { PlayNetworkReplayError } from "./play-network-command-service.js";

/**
 * Concrete replay error classifier for the network executor.
 *
 * A `PlayNetworkReplayError` whose GraphQL `extensions.code` names a known Play
 * domain condition (missing track set/arrangement/section/cue/pad/playback
 * state, validation, authorization) is a `terminal` failure with a redacted safe
 * message for operator review — it will not be requeued. Everything else —
 * transport errors, server faults, unknown codes — stays a `retryable` failure
 * that is requeued with backoff and re-attempted next pass. No raw server error
 * text is surfaced.
 */
const TERMINAL_CODE_SAFE_MESSAGE: Readonly<Record<PlayDomainErrorCode, string>> = {
  ARRANGEMENT_NOT_FOUND:
    "An arrangement this edit depends on no longer exists on the server. Please review it.",
  AUTHORIZATION_FAILED:
    "You no longer have permission to apply this edit. Please review it.",
  CUE_NOT_FOUND:
    "A cue this edit depends on no longer exists on the server. Please review it.",
  PAD_LAYER_NOT_FOUND:
    "A pad layer this edit depends on no longer exists on the server. Please review it.",
  PLAYBACK_STATE_NOT_FOUND:
    "The playback state changed on the server. Please review this edit.",
  SECTION_NOT_FOUND:
    "A section this edit depends on no longer exists on the server. Please review it.",
  TRACK_SET_NOT_FOUND:
    "A track set this edit depends on no longer exists on the server. Please review it.",
  VALIDATION_FAILED: "The server rejected this edit as invalid. Please review it."
};

const TERMINAL_CODES: ReadonlySet<string> = new Set(PLAY_DOMAIN_ERROR_CODES);

const isPlayDomainErrorCode = (code: string): code is PlayDomainErrorCode =>
  TERMINAL_CODES.has(code);

export interface PlayReplayErrorClassifierOptions {
  readonly retryableSafeErrorMessage?: string;
}

export const createPlayReplayErrorClassifier = (
  options: PlayReplayErrorClassifierOptions = {}
): PlayDesktopReplayErrorClassifier => {
  const retryableSafeErrorMessage =
    options.retryableSafeErrorMessage ??
    "This edit could not be synced yet and will be retried automatically.";

  return (error) => {
    if (
      error instanceof PlayNetworkReplayError &&
      error.code !== undefined &&
      isPlayDomainErrorCode(error.code)
    ) {
      return { kind: "terminal", safeErrorMessage: TERMINAL_CODE_SAFE_MESSAGE[error.code] };
    }

    return { kind: "retryable", safeErrorMessage: retryableSafeErrorMessage };
  };
};
