/**
 * Typed Presenter domain error.
 *
 * Carries a stable machine-readable `code` (the conflict taxonomy the desktop
 * replay classifier maps to conflict kinds) and a `safeMessage` that is already
 * redacted for operator display. The GraphQL transport surfaces the `code` as
 * `errors[].extensions.code` and the `safeMessage` as the error message, while
 * untyped errors stay redacted. The Presenter services throw this for
 * non-retryable conditions so an offline replay can be marked `conflict`.
 */
export const PRESENTER_DOMAIN_ERROR_CODES = [
  "STALE_PRESENTATION",
  "MISSING_SLIDE",
  "THEME_MISMATCH",
  "OUTPUT_TARGET_MISMATCH",
  "VALIDATION_FAILED",
  "AUTHORIZATION_FAILED"
] as const;

export type PresenterDomainErrorCode = (typeof PRESENTER_DOMAIN_ERROR_CODES)[number];

export class PresenterDomainError extends Error {
  readonly code: PresenterDomainErrorCode;
  readonly safeMessage: string;

  constructor(code: PresenterDomainErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "PresenterDomainError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export const isPresenterDomainError = (error: unknown): error is PresenterDomainError =>
  error instanceof PresenterDomainError;
