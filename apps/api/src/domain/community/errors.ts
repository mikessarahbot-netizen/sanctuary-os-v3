/**
 * Typed Community+ domain error.
 *
 * Carries a stable machine-readable `code` and a `safeMessage` that is already
 * redacted for operator display. The GraphQL transport surfaces the `code` as
 * `errors[].extensions.code` and the `safeMessage` as the error message, while
 * untyped errors stay redacted. The Community services throw this for
 * non-retryable conditions (missing member/household/group/membership/
 * attendance/message/recipient/summary, cross-tenant access, validation, an
 * illegal lifecycle transition, a missing human confirmation, or a
 * consent-blocked send) so a caller can classify the failure.
 *
 * Community+ is the strictest PII surface in the system: `safeMessage`s are
 * redacted by construction and **never** carry a name, contact value, message
 * body, or other raw PII.
 */
export const COMMUNITY_DOMAIN_ERROR_CODES = [
  "MEMBER_NOT_FOUND",
  "HOUSEHOLD_NOT_FOUND",
  "GROUP_NOT_FOUND",
  "MEMBERSHIP_NOT_FOUND",
  "ATTENDANCE_NOT_FOUND",
  "MESSAGE_NOT_FOUND",
  "RECIPIENT_NOT_FOUND",
  "SUMMARY_NOT_FOUND",
  "CONFIRMATION_REQUIRED",
  "INVALID_LIFECYCLE_TRANSITION",
  "CONSENT_REQUIRED",
  "VALIDATION_FAILED",
  "AUTHORIZATION_FAILED"
] as const;

export type CommunityDomainErrorCode = (typeof COMMUNITY_DOMAIN_ERROR_CODES)[number];

export class CommunityDomainError extends Error {
  readonly code: CommunityDomainErrorCode;
  readonly safeMessage: string;

  constructor(code: CommunityDomainErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "CommunityDomainError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export const isCommunityDomainError = (
  error: unknown
): error is CommunityDomainError => error instanceof CommunityDomainError;
