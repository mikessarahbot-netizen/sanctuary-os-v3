/**
 * Typed OBS domain error.
 *
 * Carries a stable machine-readable `code` and a `safeMessage` that is already
 * redacted for operator display. The GraphQL transport surfaces the `code` as
 * `errors[].extensions.code` and the `safeMessage` as the error message, while
 * untyped errors stay redacted. The OBS services throw this for non-retryable
 * conditions (a missing connection-profile/scene/source/scene-item/action-intent,
 * cross-tenant access, validation, an ineligible action, or OBS being
 * disconnected) so a caller can classify the failure.
 *
 * OBS controls live, public-facing output and is the system's strongest
 * "automation must fail gracefully" surface: `safeMessage`s are redacted by
 * construction and **never** carry an OBS host/port/password/auth token, a stream
 * key, a connection URL, or a raw obs-websocket payload.
 *
 * `CONFIRMATION_REQUIRED` and `NOT_CONFIRMED` are reserved here for the slice-7
 * confirm→dispatch gate (the human-confirmation step + the dispatch-refused-
 * unless-confirmed guard); this slice exposes reads + connection/catalog
 * management + the action REQUEST surface only, so it raises the not-found,
 * validation, authorization, ineligibility, and disconnected codes.
 */
export const OBS_DOMAIN_ERROR_CODES = [
  "CONNECTION_PROFILE_NOT_FOUND",
  "SCENE_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "SCENE_ITEM_NOT_FOUND",
  "ACTION_INTENT_NOT_FOUND",
  "CONFIRMATION_REQUIRED",
  "NOT_CONFIRMED",
  "ACTION_INELIGIBLE",
  "OBS_DISCONNECTED",
  "VALIDATION_FAILED",
  "AUTHORIZATION_FAILED"
] as const;

export type ObsDomainErrorCode = (typeof OBS_DOMAIN_ERROR_CODES)[number];

export class ObsDomainError extends Error {
  readonly code: ObsDomainErrorCode;
  readonly safeMessage: string;

  constructor(code: ObsDomainErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "ObsDomainError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export const isObsDomainError = (error: unknown): error is ObsDomainError =>
  error instanceof ObsDomainError;
