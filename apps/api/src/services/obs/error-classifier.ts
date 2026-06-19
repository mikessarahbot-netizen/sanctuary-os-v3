import {
  OBS_CONTROL_ERROR_CODES,
  isObsControlError,
  type ObsControlError,
  type ObsControlErrorCode
} from "./control-port.js";

/**
 * OBS dispatch error classifier — `ObsControlError → { kind, safeMessage }`.
 *
 * `dispatchObsAction` is the single operation that calls an `ObsControlPort`
 * mutate method, so it is the single place a normalized, redacted `ObsControlError`
 * can surface. This classifier decides whether that failure is `terminal` (OBS
 * refused the action, or a referenced scene/source/scene-item vanished — re-firing
 * the same intent would just fail again, so it is left for operator review) or
 * `retryable` (the OBS instance was unreachable — a transient transport-like
 * condition). It mirrors the Play replay classifiers
 * (`play-replay-error-classifier.ts` / `local-sync-queue-replay-coordinator.ts`)
 * and the Community+ typed-error posture: a known typed failure is terminal with
 * its already-redacted `safeMessage`; everything else is a retryable fallback.
 *
 * Critically — and unlike the offline-first Play replay queue — a `retryable`
 * classification here does **not** authorize an automatic re-dispatch: an OBS
 * output action that failed is recorded as terminal `failed`, and a fresh human
 * confirmation (a new intent) is required to try again. The `retryable` flag only
 * describes the *nature* of the failure for the operator and any future surface;
 * it never silently takes a service live or dark. The `safeMessage` is the
 * `ObsControlError`'s already-redacted message (the port guarantees it carries no
 * OBS host/port/password/token, stream key, connection URL, or raw obs-websocket
 * payload); the classifier never widens it and never surfaces a raw error.
 */
export type ObsDispatchErrorClassification =
  | { readonly kind: "retryable"; readonly safeMessage: string }
  | { readonly kind: "terminal"; readonly safeMessage: string };

export type ObsDispatchErrorClassifier = (
  error: ObsControlError
) => ObsDispatchErrorClassification;

/**
 * Whether a normalized OBS control failure is retryable by nature. `disconnected`
 * is the only transient (transport-like) condition — the instance may come back.
 * `action-rejected` / `not-found` / `port-failure` are terminal: the same intent
 * would fail again, so it is surfaced for review rather than re-fired. This is the
 * classifier's own decision and does not depend on the error's `retryable` hint
 * (which the fake/real port may set independently).
 */
const RETRYABLE_BY_CODE: Readonly<Record<ObsControlErrorCode, boolean>> = {
  "action-rejected": false,
  disconnected: true,
  "not-found": false,
  "port-failure": false
};

const OBS_CONTROL_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  OBS_CONTROL_ERROR_CODES
);

const isObsControlErrorCode = (code: string): code is ObsControlErrorCode =>
  OBS_CONTROL_ERROR_CODE_SET.has(code);

/**
 * The default OBS dispatch error classifier. A `disconnected` failure is
 * `retryable`; every other known code, and any unrecognized code, is `terminal`
 * (fail closed — an unclassifiable port failure must never be treated as a safe
 * transient that could invite a re-dispatch). The `safeMessage` is passed through
 * from the already-redacted `ObsControlError`.
 */
export const classifyObsDispatchError: ObsDispatchErrorClassifier = (error) => {
  const retryable =
    isObsControlErrorCode(error.code) && RETRYABLE_BY_CODE[error.code];

  return retryable
    ? { kind: "retryable", safeMessage: error.safeMessage }
    : { kind: "terminal", safeMessage: error.safeMessage };
};

/**
 * Narrow an unknown thrown value to an `ObsControlError` so the dispatch path can
 * classify it. A non-`ObsControlError` (an unexpected throw that bypassed the
 * port's normalization) is not handled here; the dispatch caller re-throws it
 * untouched rather than guessing a safe message — it must never be presented as a
 * classified OBS failure.
 */
export const isClassifiableObsDispatchError = (
  error: unknown
): error is ObsControlError => isObsControlError(error);
