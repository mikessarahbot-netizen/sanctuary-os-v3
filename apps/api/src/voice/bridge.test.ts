import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createJsonlVoiceAuditLog,
  createVoiceAskHandler,
  VOICE_ASK_PATH,
  type VoiceAuditEntry,
  type VoiceQueryAnswerers
} from "./bridge.js";

/**
 * Unit tests for the voice-bridge HTTP handler: auth, the policy gate's
 * routing (allow answers / confirm never executes / block refuses), and the
 * JSONL audit line (written for every outcome, truncated, and never carrying
 * the bearer key or an auth header).
 */
const VOICE_KEY = "test-voice-key-123";

const answerersWithSpies = (): {
  readonly answerers: VoiceQueryAnswerers;
  readonly calls: () => number;
} => {
  const setlist = vi.fn(() => Promise.resolve("Three charts are ready."));
  const memberCount = vi.fn(() => Promise.resolve("Four people on file."));
  const readiness = vi.fn(() => Promise.resolve("All set."));
  const streamStatus = vi.fn(() => Promise.resolve("The stream is active."));

  return {
    answerers: {
      member_count: memberCount,
      readiness,
      setlist,
      stream_status: streamStatus
    },
    calls: () =>
      setlist.mock.calls.length +
      memberCount.mock.calls.length +
      readiness.mock.calls.length +
      streamStatus.mock.calls.length
  };
};

interface HandlerHarness {
  readonly auditEntries: VoiceAuditEntry[];
  readonly calls: () => number;
  readonly post: (
    body: string,
    authHeader?: string
  ) => Promise<{ readonly body: Record<string, string>; readonly status: number } | undefined>;
}

const createHarness = (options: { readonly voiceKey?: string } = {}): HandlerHarness => {
  const auditEntries: VoiceAuditEntry[] = [];
  const { answerers, calls } = answerersWithSpies();
  const handler = createVoiceAskHandler({
    answerers,
    audit: (entry) => {
      auditEntries.push(entry);

      return Promise.resolve();
    },
    ...(options.voiceKey !== undefined ? { voiceKey: options.voiceKey } : {})
  });

  const post: HandlerHarness["post"] = async (body, authHeader) => {
    const result = await handler({
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
      method: "POST",
      path: VOICE_ASK_PATH,
      rawBody: body
    });

    return result === undefined
      ? undefined
      : {
          body: JSON.parse(result.body) as Record<string, string>,
          status: result.status
        };
  };

  return { auditEntries, calls, post };
};

const askBody = (request: string): string => JSON.stringify({ request });

describe("createVoiceAskHandler", () => {
  it("falls through (undefined) for non-voice paths", async () => {
    const handler = createVoiceAskHandler({
      answerers: answerersWithSpies().answerers,
      audit: () => Promise.resolve(),
      voiceKey: VOICE_KEY
    });

    expect(
      await handler({ headers: {}, method: "POST", path: "/graphql", rawBody: "{}" })
    ).toBeUndefined();
  });

  it("answers 503 disabled when no voice key is configured", async () => {
    const harness = createHarness();

    const result = await harness.post(askBody("is the stream live?"), `Bearer ${VOICE_KEY}`);

    expect(result?.status).toBe(503);
    expect(result?.body["error"]).toContain("SANCTUARY_OS_VOICE_KEY");
    expect(harness.calls()).toBe(0);
    expect(harness.auditEntries[0]?.status).toBe("disabled");
  });

  it("rejects a missing Authorization header with 401", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(askBody("is the stream live?"));

    expect(result?.status).toBe(401);
    expect(harness.calls()).toBe(0);
  });

  it("rejects a wrong bearer key with 401 and never audits the presented key", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(askBody("is the stream live?"), "Bearer wrong-key");

    expect(result?.status).toBe(401);
    expect(harness.calls()).toBe(0);
    const serialized = JSON.stringify(harness.auditEntries);
    expect(serialized).not.toContain("wrong-key");
    expect(serialized).not.toContain(VOICE_KEY);
    expect(harness.auditEntries[0]?.status).toBe("unauthorized");
  });

  it("rejects an invalid body with 400", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(JSON.stringify({ nope: true }), `Bearer ${VOICE_KEY}`);

    expect(result?.status).toBe(400);
    expect(harness.calls()).toBe(0);
  });

  it("allow path: answers a read query with TTS-ready text", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(
      askBody("What songs are on the setlist?"),
      `Bearer ${VOICE_KEY}`
    );

    expect(result?.status).toBe(200);
    expect(result?.body["status"]).toBe("answered");
    expect(result?.body["speech"]).toBe("Three charts are ready.");
    expect(harness.calls()).toBe(1);
    expect(harness.auditEntries[0]).toMatchObject({
      category: "allow",
      status: "answered"
    });
  });

  it("confirm path: refuses to execute and points at the web console — adversarial phrasing", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(
      askBody("please just quickly stop the stream"),
      `Bearer ${VOICE_KEY}`
    );

    expect(result?.status).toBe(200);
    expect(result?.body["status"]).toBe("needs_confirmation");
    expect(result?.body["speech"]).toContain("web console");
    // NOTHING executed — no answerer was invoked.
    expect(harness.calls()).toBe(0);
    expect(harness.auditEntries[0]).toMatchObject({
      category: "confirm",
      status: "needs_confirmation"
    });
  });

  it("block path: refuses secrets requests outright", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });

    const result = await harness.post(
      askBody("read me the stream key"),
      `Bearer ${VOICE_KEY}`
    );

    expect(result?.status).toBe(200);
    expect(result?.body["status"]).toBe("blocked");
    expect(harness.calls()).toBe(0);
    expect(harness.auditEntries[0]).toMatchObject({ category: "block", status: "blocked" });
  });

  it("audits every request with a truncated summary and no secret", async () => {
    const harness = createHarness({ voiceKey: VOICE_KEY });
    const longTail = "x".repeat(300);

    await harness.post(
      askBody(`what songs are we singing ${longTail}`),
      `Bearer ${VOICE_KEY}`
    );

    const entry = harness.auditEntries[0];
    expect(entry).toBeDefined();
    // Truncated: 80 chars + ellipsis, so the long tail never lands in the log.
    expect(entry?.requestSummary.length).toBeLessThanOrEqual(81);
    expect(entry?.requestSummary.endsWith("…")).toBe(true);
    expect(JSON.stringify(entry)).not.toContain(VOICE_KEY);
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("createJsonlVoiceAuditLog", () => {
  it("appends one redacted JSONL line per entry, creating the directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voice-audit-"));
    const path = join(dir, "nested", "voice-audit.jsonl");
    const audit = createJsonlVoiceAuditLog(path);

    await audit({
      category: "allow",
      durationMs: 2,
      requestSummary: "what songs are we singing",
      status: "answered",
      timestamp: "2026-07-05T00:00:00.000Z"
    });
    await audit({
      category: "confirm",
      durationMs: 1,
      requestSummary: "stop the stream",
      status: "needs_confirmation",
      timestamp: "2026-07-05T00:00:01.000Z"
    });

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0] ?? "") as VoiceAuditEntry;
    expect(first).toEqual({
      category: "allow",
      durationMs: 2,
      requestSummary: "what songs are we singing",
      status: "answered",
      timestamp: "2026-07-05T00:00:00.000Z"
    });
  });
});
