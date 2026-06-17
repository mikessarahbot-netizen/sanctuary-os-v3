/**
 * Typed Play domain error.
 *
 * Carries a stable machine-readable `code` and a `safeMessage` that is already
 * redacted for operator display. The GraphQL transport surfaces the `code` as
 * `errors[].extensions.code` and the `safeMessage` as the error message, while
 * untyped errors stay redacted. The Play services throw this for non-retryable
 * conditions (missing track set/arrangement/section/cue/pad/playback state,
 * cross-tenant access, validation) so an offline replay can be classified
 * accordingly.
 */
export const PLAY_DOMAIN_ERROR_CODES = [
  "TRACK_SET_NOT_FOUND",
  "ARRANGEMENT_NOT_FOUND",
  "SECTION_NOT_FOUND",
  "CUE_NOT_FOUND",
  "PAD_LAYER_NOT_FOUND",
  "PLAYBACK_STATE_NOT_FOUND",
  "VALIDATION_FAILED",
  "AUTHORIZATION_FAILED"
] as const;

export type PlayDomainErrorCode = (typeof PLAY_DOMAIN_ERROR_CODES)[number];

export class PlayDomainError extends Error {
  readonly code: PlayDomainErrorCode;
  readonly safeMessage: string;

  constructor(code: PlayDomainErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "PlayDomainError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export const isPlayDomainError = (error: unknown): error is PlayDomainError =>
  error instanceof PlayDomainError;
