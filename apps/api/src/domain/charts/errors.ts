/**
 * Typed Charts domain error.
 *
 * Carries a stable machine-readable `code` and a `safeMessage` that is already
 * redacted for operator display. The GraphQL transport surfaces the `code` as
 * `errors[].extensions.code` and the `safeMessage` as the error message, while
 * untyped errors stay redacted. The Charts services throw this for
 * non-retryable conditions (missing chart/arrangement/annotation, cross-tenant
 * access, validation) so an offline replay can be classified accordingly.
 */
export const CHARTS_DOMAIN_ERROR_CODES = [
  "CHART_NOT_FOUND",
  "ARRANGEMENT_NOT_FOUND",
  "ANNOTATION_NOT_FOUND",
  "PREFERENCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "AUTHORIZATION_FAILED"
] as const;

export type ChartsDomainErrorCode = (typeof CHARTS_DOMAIN_ERROR_CODES)[number];

export class ChartsDomainError extends Error {
  readonly code: ChartsDomainErrorCode;
  readonly safeMessage: string;

  constructor(code: ChartsDomainErrorCode, safeMessage: string) {
    super(safeMessage);
    this.name = "ChartsDomainError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export const isChartsDomainError = (error: unknown): error is ChartsDomainError =>
  error instanceof ChartsDomainError;
