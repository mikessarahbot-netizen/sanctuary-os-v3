import { createHash, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { classifyVoiceRequest, type VoiceQueryId } from "./policy.js";
import type {
  PresenterGraphqlHttpInvocation,
  PresenterGraphqlHttpResult
} from "../graphql/http-server.js";

/**
 * Voice bridge (`ask_sanctuary`): a single narrow `POST /voice/ask` HTTP
 * endpoint so an external phone voice agent can ask Sanctuary OS questions.
 *
 * Hard rules, enforced here and covered by tests:
 * - Bearer-key auth against `SANCTUARY_OS_VOICE_KEY`. No key configured ⇒ the
 *   endpoint is disabled (503). Wrong key ⇒ 401. Comparison is timing-safe.
 * - Every request goes through the policy gate (`classifyVoiceRequest`)
 *   BEFORE anything executes. Only recognized read-only queries run; a
 *   `confirm` request executes NOTHING and answers that a human must confirm
 *   it in the web console; a `block` request is refused outright.
 * - Every request is audit-logged as one JSONL line: timestamp, category,
 *   truncated request summary, status, duration. Never the bearer key, never
 *   an auth header, never a message body.
 *
 * The handler is a pure invocation → result function (same shape as the
 * GraphQL transport binding) so it is testable without a socket; the demo
 * server plugs it in as the http server's extra invocation handler.
 */
export const VOICE_ASK_PATH = "/voice/ask";

export const DEFAULT_VOICE_AUDIT_LOG_PATH = "./logs/voice-audit.jsonl";

/** Max characters of the request kept in the audit summary. */
const AUDIT_SUMMARY_MAX_LENGTH = 80;

const VoiceAskBodySchema = z
  .object({
    request: z.string().min(1).max(500)
  })
  .strip();

const JSON_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json"
};

export type VoiceAskStatus =
  | "answered"
  | "blocked"
  | "disabled"
  | "error"
  | "invalid"
  | "needs_confirmation"
  | "unauthorized";

export interface VoiceAuditEntry {
  /** Policy category, or "none" when the request never reached the gate. */
  readonly category: string;
  readonly durationMs: number;
  /** Truncated request text — never a header, key, or message body. */
  readonly requestSummary: string;
  readonly status: VoiceAskStatus;
  readonly timestamp: string;
}

export type VoiceAuditLog = (entry: VoiceAuditEntry) => Promise<void>;

/**
 * JSONL audit sink: one line per voice request, appended to `path` (parent
 * directory created on demand). The entry shape is the whole contract — the
 * caller must never put a secret in it.
 */
export const createJsonlVoiceAuditLog = (path: string): VoiceAuditLog => {
  return async (entry: VoiceAuditEntry): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  };
};

/** One answerer per allowed read query; each returns short TTS-ready text. */
export type VoiceQueryAnswerers = Readonly<Record<VoiceQueryId, () => Promise<string>>>;

export interface VoiceAskHandlerDependencies {
  readonly answerers: VoiceQueryAnswerers;
  readonly audit: VoiceAuditLog;
  readonly now?: () => number;
  /** The shared bearer key. Unset/empty ⇒ the endpoint answers 503 to everything. */
  readonly voiceKey?: string;
}

export type VoiceAskHandler = (
  invocation: PresenterGraphqlHttpInvocation
) => Promise<PresenterGraphqlHttpResult | undefined>;

const jsonResult = (status: number, body: Record<string, string>): PresenterGraphqlHttpResult => ({
  body: JSON.stringify(body),
  headers: JSON_HEADERS,
  status
});

const headerValue = (
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string
): string | undefined => {
  const raw = headers[name];

  return typeof raw === "string" ? raw : raw?.[0];
};

/**
 * Timing-safe bearer-key comparison. Both sides are hashed to fixed-length
 * digests first so `timingSafeEqual` gets equal-length buffers regardless of
 * what the caller presented.
 */
const bearerKeyMatches = (presented: string, expected: string): boolean => {
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
};

const truncateForAudit = (request: string): string =>
  request.length <= AUDIT_SUMMARY_MAX_LENGTH
    ? request
    : `${request.slice(0, AUDIT_SUMMARY_MAX_LENGTH)}…`;

export const createVoiceAskHandler = (
  dependencies: VoiceAskHandlerDependencies
): VoiceAskHandler => {
  const now = dependencies.now ?? ((): number => Date.now());

  return async (invocation) => {
    if ((invocation.path ?? "").split("?")[0] !== VOICE_ASK_PATH) {
      // Not ours — fall through to the GraphQL transport.
      return undefined;
    }

    const startedAt = now();
    const writeAudit = async (
      status: VoiceAskStatus,
      category: string,
      requestSummary: string
    ): Promise<void> => {
      await dependencies.audit({
        category,
        durationMs: now() - startedAt,
        requestSummary,
        status,
        timestamp: new Date().toISOString()
      });
    };

    if ((invocation.method ?? "").toUpperCase() !== "POST") {
      return jsonResult(405, { error: "Method not allowed." });
    }

    const voiceKey = dependencies.voiceKey;

    if (voiceKey === undefined || voiceKey.length === 0) {
      // Disabled: no key configured. Body is untrusted and unparsed — audit no summary.
      await writeAudit("disabled", "none", "");

      return jsonResult(503, {
        error: "Voice bridge is disabled: SANCTUARY_OS_VOICE_KEY is not set."
      });
    }

    const authHeader = headerValue(invocation.headers, "authorization") ?? "";
    const presentedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (presentedKey.length === 0 || !bearerKeyMatches(presentedKey, voiceKey)) {
      // Never audit the presented header or key — only the outcome.
      await writeAudit("unauthorized", "none", "");

      return jsonResult(401, { error: "Unauthorized." });
    }

    let request: string;
    try {
      request = VoiceAskBodySchema.parse(JSON.parse(invocation.rawBody)).request;
    } catch {
      await writeAudit("invalid", "none", "");

      return jsonResult(400, {
        error: 'Invalid body: expected { "request": "<natural language>" }.'
      });
    }

    const decision = classifyVoiceRequest(request);
    const summary = truncateForAudit(request);

    if (decision.category === "block") {
      await writeAudit("blocked", "block", summary);

      return jsonResult(200, {
        speech: "I can't help with that by voice.",
        status: "blocked"
      });
    }

    if (decision.category === "confirm") {
      // NEVER execute — the human-confirm gates in the web console are the
      // only path for mutations. Voice may request, never bypass.
      await writeAudit("needs_confirmation", "confirm", summary);

      return jsonResult(200, {
        speech:
          "That would change something, so I can't do it by voice. " +
          "Please confirm it in the Sanctuary OS web console.",
        status: "needs_confirmation"
      });
    }

    try {
      const speech = await dependencies.answerers[decision.query]();
      await writeAudit("answered", "allow", summary);

      return jsonResult(200, { speech, status: "answered" });
    } catch {
      await writeAudit("error", "allow", summary);

      return jsonResult(500, { error: "Failed to answer the request." });
    }
  };
};
