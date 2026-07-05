/**
 * Voice-bridge policy gate.
 *
 * Classifies a natural-language voice request into exactly one of three
 * categories BEFORE anything executes:
 *
 * - `allow`   — a recognized read-only query (setlist / stream status /
 *               member count / readiness). Carries the query id to answer.
 * - `confirm` — anything that would mutate state (send/draft a message,
 *               start/stop the stream, switch a scene, edit records). The
 *               bridge NEVER executes these; it answers that the action must
 *               be confirmed by a human in the web console. Voice may request,
 *               never bypass, the existing human-confirm gates.
 * - `block`   — destructive operations, secrets/credentials, PII dumps, and
 *               anything about tunnels/public exposure. Also the DEFAULT for
 *               any request that matches no known read query: unknown never
 *               resolves to `allow`.
 *
 * The classifier is deliberately boring: ordered keyword rules over a
 * normalized lowercase string, block checked first, then confirm, then the
 * allow queries. A destructive phrasing that also mentions a read topic
 * ("delete the old charts") therefore blocks, and a mutation phrasing that
 * mentions a readable topic ("please just quickly stop the stream") therefore
 * requires confirmation — the read keyword never rescues it.
 */
export type VoiceQueryId = "member_count" | "readiness" | "setlist" | "stream_status";

export type VoicePolicyDecision =
  | { readonly category: "allow"; readonly query: VoiceQueryId; readonly reason: string }
  | { readonly category: "block"; readonly reason: string }
  | { readonly category: "confirm"; readonly reason: string };

interface PolicyRule {
  readonly pattern: RegExp;
  readonly reason: string;
}

/** Checked FIRST — a block match wins over everything else. */
const BLOCK_RULES: readonly PolicyRule[] = [
  {
    pattern:
      /\b(delete|drop|erase|wipe|destroy|purge|remove|reset|clear|uninstall|shut ?down|factory)\b/,
    reason: "destructive operation"
  },
  {
    pattern:
      /\b(passwords?|secrets?|credentials?|tokens?|api ?keys?|stream ?keys?|access ?keys?|private ?keys?|env (file|vars?|variables?))\b|\.env\b/,
    reason: "secrets or credentials"
  },
  {
    pattern:
      /\b(phone numbers?|email address(es)?|home address(es)?|contact (info|information|details|list)|pii|personal (data|information|details))\b/,
    reason: "PII disclosure"
  },
  {
    pattern:
      /\b(tunnels?|funnel|ngrok|port ?forward(ing)?|expose[ds]?|public (url|internet|endpoint)|publicly|firewall)\b/,
    reason: "network exposure"
  }
];

/** Checked SECOND — any mutation-shaped request must be confirmed in the web UI. */
const CONFIRM_RULES: readonly PolicyRule[] = [
  {
    pattern: /\b(send|sends|text|sms|messages?|draft|email|notify|remind|announce|reply)\b/,
    reason: "communication mutation"
  },
  {
    pattern:
      /\b(start|stop|end|go live|switch|restart|pause|resume|cut to|mute|unmute|enable|disable|turn (on|off)|record)\b/,
    reason: "OBS or stream mutation"
  },
  {
    pattern:
      /\b(edit|update|modify|rename|add|create|save|import|upload|publish|queue|approve|confirm|dispatch|assign|cancel|archive|reschedule)\b/,
    reason: "data mutation"
  }
];

/** Checked LAST, in order — only a request that matched no block/confirm rule can be allowed. */
const ALLOW_RULES: readonly (PolicyRule & { readonly query: VoiceQueryId })[] = [
  {
    pattern: /\b(stream(ing)?|on ?air|live|scenes?|obs|broadcast)\b/,
    query: "stream_status",
    reason: "read-only stream/service status"
  },
  {
    pattern: /\b(setlists?|songs?|charts?|sing(ing)?|worship|keys?)\b/,
    query: "setlist",
    reason: "read-only setlist question"
  },
  {
    pattern: /\b(members?|people|congregation|attendance|visitors?|how many)\b/,
    query: "member_count",
    reason: "read-only people count"
  },
  {
    pattern: /\b(ready|readiness|status|prepared)\b/,
    query: "readiness",
    reason: "read-only readiness check"
  }
];

/** Lowercase, collapse whitespace, and fold "set list" into "setlist" so the
 *  noun never trips the mutation-verb `set`/list heuristics. */
const normalize = (request: string): string =>
  request.toLowerCase().replace(/\s+/g, " ").replace(/\bset list\b/g, "setlist").trim();

export const classifyVoiceRequest = (request: string): VoicePolicyDecision => {
  const text = normalize(request);

  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(text)) {
      return { category: "block", reason: rule.reason };
    }
  }

  for (const rule of CONFIRM_RULES) {
    if (rule.pattern.test(text)) {
      return { category: "confirm", reason: rule.reason };
    }
  }

  for (const rule of ALLOW_RULES) {
    if (rule.pattern.test(text)) {
      return { category: "allow", query: rule.query, reason: rule.reason };
    }
  }

  // Unknown/ambiguous requests are NEVER allowed — default closed.
  return { category: "block", reason: "unrecognized request" };
};
