import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteMigrationDatabaseClient
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  ObsConnectionProfileSchema,
  isObsDomainError,
  type ObsActionIntent,
  type ObsConnectionProfile,
  type ObsDomainErrorCode
} from "../../domain/obs/index.js";
import {
  OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
  ObsAiActionSuggestionPromptSchema,
  ObsAiActionSuggestionSchema,
  assertObsAiActionSuggestionPromptIsSecretFree,
  buildObsAiActionSuggestionPrompt,
  type ObsAiActionSuggestion,
  type ObsAiActionSuggestionPrompt,
  type ObsAiSuggestionPort
} from "./ai-suggest.js";
import { createObsPersistenceSelection, migrateObsSqliteSchema } from "./composition.js";
import {
  createFakeObsControlPort,
  type FakeObsControlPort,
  type FakeObsOperation
} from "./fake-control-port.js";
import { createInMemoryObsServicesAdapter } from "./in-memory.js";

const leader: AuthenticatedActor = {
  actorId: "leader_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const otherTenantLeader: AuthenticatedActor = {
  actorId: "leader_other",
  roles: ["worship_leader"],
  tenantId: "tenant_2"
};

const viewer: AuthenticatedActor = {
  actorId: "viewer_1",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const timestamp = "2026-06-21T14:00:00.000Z";

/**
 * The vault handle that names the OBS instance. Its very presence on the seeded
 * connection profile is the point: the tests assert this secret string NEVER
 * reaches the AI port — only the opaque `connectionProfileId` may.
 */
const SECRET_CONNECTION_REF = "vault://obs/connection_1?password=hunter2";

const connectedProfile: ObsConnectionProfile = ObsConnectionProfileSchema.parse({
  connectionProfileId: "connection_1",
  connectionRef: SECRET_CONNECTION_REF,
  connectionStatus: "connected",
  createdAt: timestamp,
  label: "Sanctuary OBS",
  tenantId: "tenant_1",
  updatedAt: timestamp
});

/**
 * The set of port methods that mutate live OBS state. An AI suggestion only ever
 * creates a `requested` intent, so NONE of these may be called by
 * `suggestObsActionWithAi` — and `dispatchObsAction` must refuse to call them for
 * an unconfirmed, AI-suggested intent. Tests assert these never appear in the
 * control port's call log.
 */
const PORT_MUTATE_OPERATIONS: readonly FakeObsOperation[] = [
  "setCurrentProgramScene",
  "setInputMute",
  "setSceneItemEnabled",
  "startStream",
  "stopStream",
  "startRecord",
  "stopRecord"
];

const expectNoPortMutation = (fakePort: FakeObsControlPort): void => {
  const mutatingCalls = fakePort
    .calls()
    .filter((call) => PORT_MUTATE_OPERATIONS.includes(call.operation));

  expect(mutatingCalls).toEqual([]);
};

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: ObsDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isObsDomainError(error)).toBe(true);
  if (isObsDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

/**
 * A connected fake control port whose scripted catalog has a `scene-lower` scene,
 * so a `switch-scene` suggestion targeting it passes the pure eligibility check
 * after a `refreshObsCatalog` mirrors the catalog into the snapshot.
 */
const connectedFakePort = (): FakeObsControlPort =>
  createFakeObsControlPort({
    currentProgramSceneRef: "scene-main",
    scenes: [
      { displayName: "Main", obsSceneRef: "scene-main" },
      { displayName: "Lower Third", obsSceneRef: "scene-lower" }
    ],
    sceneItems: [
      {
        obsSceneItemId: "item-1",
        obsSceneRef: "scene-main",
        obsSourceRef: "source-cam",
        visibleHint: true
      }
    ],
    sources: [{ kindLabel: "v4l2_source", obsSourceRef: "source-cam" }],
    streamStatus: "inactive"
  });

/**
 * A well-formed AI suggestion: switch to the (existing) `scene-lower` scene. Refs
 * only, `needsReview` literally true, `status = "suggested"`.
 */
const validSuggestion: ObsAiActionSuggestion = {
  kind: "switch-scene",
  needsReview: true,
  rationale: "Move to the lower-third scene for the announcements segment.",
  status: "suggested",
  targetSceneRef: "scene-lower"
};

/**
 * A fake AI port that captures the exact prompt it receives and returns a
 * caller-supplied suggestion. No network, no real model — the injected boundary.
 */
const createCapturingPort = (
  suggestion: unknown
): {
  readonly port: ObsAiSuggestionPort;
  readonly received: ObsAiActionSuggestionPrompt[];
} => {
  const received: ObsAiActionSuggestionPrompt[] = [];

  return {
    port: {
      suggestObsAction: (prompt): Promise<unknown> => {
        received.push(prompt);

        return Promise.resolve(suggestion);
      }
    },
    received
  };
};

/**
 * Seed a connected profile and mirror the fake port's catalog into the snapshot so
 * a `switch-scene` to `scene-lower` is eligible, then return the adapter + the
 * capturing AI port.
 */
const createSuggestingAdapter = async (
  suggestion: unknown,
  options: {
    readonly profile?: ObsConnectionProfile;
    readonly withPort?: boolean;
  } = {}
): Promise<{
  readonly adapter: ReturnType<typeof createInMemoryObsServicesAdapter>;
  readonly controlPort: FakeObsControlPort;
  readonly received: ObsAiActionSuggestionPrompt[];
}> => {
  const controlPort = connectedFakePort();
  const { port, received } = createCapturingPort(suggestion);
  const adapter = createInMemoryObsServicesAdapter({
    clock: () => timestamp,
    controlPort: controlPort.port,
    ids: {
      actionIntentId: () => "action_ai",
      logEntryId: (() => {
        let next = 0;
        return () => {
          next += 1;
          return `log_${String(next)}`;
        };
      })(),
      sceneId: (() => {
        let next = 0;
        return () => {
          next += 1;
          return `scene_${String(next)}`;
        };
      })(),
      sceneItemId: (() => {
        let next = 0;
        return () => {
          next += 1;
          return `scene_item_${String(next)}`;
        };
      })(),
      sourceId: (() => {
        let next = 0;
        return () => {
          next += 1;
          return `source_${String(next)}`;
        };
      })()
    },
    seed: { connectionProfiles: [options.profile ?? connectedProfile] },
    ...(options.withPort === false ? {} : { aiSuggestionPort: port })
  });

  // Mirror the live catalog into the durable snapshot (read-only — no mutate).
  await adapter.commandService.refreshObsCatalog({
    actor: leader,
    input: { connectionProfileId: "connection_1" },
    requestId: "request_refresh"
  });

  return { adapter, controlPort, received };
};

const suggestWithAi = (
  adapter: ReturnType<typeof createInMemoryObsServicesAdapter>,
  actor: AuthenticatedActor = leader
): Promise<ObsActionIntent> =>
  adapter.commandService.suggestObsActionWithAi({
    actor,
    input: {
      connectionProfileId: "connection_1",
      operatorIntent: "Moving into announcements.",
      requestedByRef: "operator_1",
      serviceSegmentLabels: ["Welcome", "Announcements"]
    },
    requestId: "request_ai_suggest"
  });

describe("suggestObsActionWithAi (in-memory)", () => {
  it("hands the AI port a secret-free + PII-free projection (no connectionRef/host/password, refs only)", async () => {
    const { adapter, received } = await createSuggestingAdapter(validSuggestion);

    await suggestWithAi(adapter);

    expect(received).toHaveLength(1);
    const prompt = received[0];
    expect(prompt).toBeDefined();
    if (prompt === undefined) {
      return;
    }

    // The projection must parse as the secret-free prompt shape...
    expect(() => ObsAiActionSuggestionPromptSchema.parse(prompt)).not.toThrow();

    // ...and, inspected as raw JSON, must contain NONE of the connection secret:
    // not the vault handle, not the embedded password, and no forbidden key.
    const serialized = JSON.stringify(prompt);
    expect(serialized).not.toContain(SECRET_CONNECTION_REF);
    expect(serialized).not.toContain("vault://");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("connectionRef");
    expect(serialized).not.toContain("streamKey");
    expect(serialized).not.toContain("authToken");

    // It carries only the opaque profile id (NOT the vault handle), coarse state,
    // and the AI-safe catalog refs.
    expect(prompt.connectionProfileRef).toBe("connection_1");
    expect(prompt.connectionStatus).toBe("connected");
    expect(prompt.streamStatus).toBe("inactive");
    expect(prompt.scenes.map((scene) => scene.obsSceneRef).sort()).toEqual([
      "scene-lower",
      "scene-main"
    ]);
    expect(prompt.sources.map((source) => source.obsSourceRef)).toEqual([
      "source-cam"
    ]);
    expect(prompt.serviceSegmentLabels).toEqual(["Welcome", "Announcements"]);
    expect(prompt.aiPolicyProfile.piiSharingAllowed).toBe(false);
    expect(prompt.promptVersion).toBe("obs-action-suggestion.v1");
  });

  it("rejects malformed AI output via the Zod schema and creates no intent", async () => {
    const { adapter, controlPort } = await createSuggestingAdapter({
      needsReview: false,
      unexpected: "shape"
    });

    await expectDomainErrorCode(suggestWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readActionIntents()).toEqual([]);
    expectNoPortMutation(controlPort);
  });

  it("rejects an AI suggestion that smuggles a secret-shaped target ref", async () => {
    const { adapter } = await createSuggestingAdapter({
      ...validSuggestion,
      // A switch-scene whose target carries a vault-handle-looking value: rejected
      // both because it is not in the snapshot AND (here) by schema/eligibility.
      targetSceneRef: "vault://obs/secret-scene"
    });

    // Off-catalog target → ineligible (no intent persisted).
    await expectDomainErrorCode(suggestWithAi(adapter), "ACTION_INELIGIBLE");
    expect(adapter.readActionIntents()).toEqual([]);
  });

  it("rejects a non-suggested AI status (insufficient_context) without creating an intent", async () => {
    const { adapter } = await createSuggestingAdapter({
      ...validSuggestion,
      status: "insufficient_context"
    });

    await expectDomainErrorCode(suggestWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readActionIntents()).toEqual([]);
  });

  it("produces a requested, ai-suggested intent that the human-confirm gate still blocks from dispatch", async () => {
    const { adapter, controlPort } = await createSuggestingAdapter(validSuggestion);

    const suggested = await suggestWithAi(adapter);
    expect(suggested.origin).toBe("ai-suggested");
    expect(suggested.status).toBe("requested");
    expect(suggested.kind).toBe("switch-scene");
    expect(suggested.targetSceneRef).toBe("scene-lower");
    expect(suggested.confirmation).toBeUndefined();
    expect(suggested.affectsLiveOutput).toBe(true);

    // THE GATE, re-proven end-to-end for an AI-originated intent: dispatching it
    // directly (no human confirmObsAction) is refused with NOT_CONFIRMED, and the
    // control port is NEVER called. AI may suggest, never go live.
    await expectDomainErrorCode(
      adapter.commandService.dispatchObsAction({
        actor: leader,
        input: { actionIntentId: "action_ai" },
        requestId: "request_ai_dispatch"
      }),
      "NOT_CONFIRMED"
    );
    expectNoPortMutation(controlPort);

    // The intent is still `requested` (the failed dispatch did not advance it).
    const afterDispatch = adapter
      .readActionIntents()
      .find((intent) => intent.actionIntentId === "action_ai");
    expect(afterDispatch?.status).toBe("requested");
    expect(afterDispatch?.origin).toBe("ai-suggested");

    // Only an explicit human confirmation advances the same AI-suggested intent —
    // and only THEN can a dispatch reach the port.
    const confirmed = await adapter.commandService.confirmObsAction({
      actor: leader,
      input: {
        actionIntentId: "action_ai",
        confirmationIntent: { confirmed: true, reason: "Reviewed by the operator" },
        confirmedByRef: "leader_1"
      },
      requestId: "request_ai_confirm"
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.origin).toBe("ai-suggested");
    expect(confirmed.confirmation?.confirmedByRef).toBe("leader_1");

    const dispatched = await adapter.commandService.dispatchObsAction({
      actor: leader,
      input: { actionIntentId: "action_ai" },
      requestId: "request_ai_dispatch_confirmed"
    });
    expect(dispatched.status).toBe("succeeded");
    // Now — and only now, after a HUMAN confirmation — the port was called.
    expect(
      controlPort.calls().some((call) => call.operation === "setCurrentProgramScene")
    ).toBe(true);
  });

  it("keeps the suggestion tenant-scoped — another tenant cannot suggest against this profile", async () => {
    const { adapter, received } = await createSuggestingAdapter(validSuggestion);

    // tenant_2 actor against tenant_1's connection profile → not found (scoped).
    await expectDomainErrorCode(
      suggestWithAi(adapter, otherTenantLeader),
      "CONNECTION_PROFILE_NOT_FOUND"
    );
    // The port was never called for the cross-tenant attempt.
    expect(received).toHaveLength(0);
    expect(adapter.readActionIntents()).toEqual([]);
  });

  it("rejects a non-command role (viewer) from suggesting with AI (AUTHORIZATION_FAILED)", async () => {
    const { adapter, received } = await createSuggestingAdapter(validSuggestion);

    await expectDomainErrorCode(suggestWithAi(adapter, viewer), "AUTHORIZATION_FAILED");
    expect(received).toHaveLength(0);
  });

  it("fails cleanly when no AI port is injected", async () => {
    const { adapter } = await createSuggestingAdapter(validSuggestion, {
      withPort: false
    });

    await expectDomainErrorCode(suggestWithAi(adapter), "VALIDATION_FAILED");
    expect(adapter.readActionIntents()).toEqual([]);
  });

  it("round-trips a valid fake suggestion into a requested ai-suggested intent and audits it", async () => {
    const { adapter } = await createSuggestingAdapter(validSuggestion);

    const suggested = await suggestWithAi(adapter);

    expect(suggested).toMatchObject({
      actionIntentId: "action_ai",
      connectionProfileId: "connection_1",
      kind: "switch-scene",
      origin: "ai-suggested",
      status: "requested",
      targetSceneRef: "scene-lower",
      tenantId: "tenant_1"
    });
    expect(adapter.readActionIntents()).toHaveLength(1);

    // The requested suggestion is audited like any other request.
    const log = adapter
      .readActionLog()
      .filter((entry) => entry.actionIntentRef === "action_ai");
    expect(log.map((entry) => entry.outcome)).toContain("requested");
  });
});

// ---------------------------------------------------------------------------
// Persistence-backed adapter (node:sqlite) — re-prove the gate + secret-free
// projection over the production path so the AI seam cannot drift between adapters.
// ---------------------------------------------------------------------------

interface NodeSqliteStatementLike {
  readonly all: (
    ...parameters: readonly SqliteBindValue[]
  ) => readonly Record<string, unknown>[];
  readonly run: (...parameters: readonly SqliteBindValue[]) => {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
}

interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

const wrapMigrationDatabase = (
  database: NodeSqliteDatabaseLike
): SqliteMigrationDatabaseClient => ({
  exec: (sql: string): void => {
    database.exec(sql);
  },
  prepare: (sql: string) => {
    const statement = database.prepare(sql);

    return {
      all: (...parameters) => statement.all(...parameters),
      run: (...parameters) => {
        const result = statement.run(...parameters);

        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    };
  }
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

const createSequentialIds = (): ((prefix: string) => () => string) => {
  const counters = new Map<string, number>();

  return (prefix: string) => (): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${String(next)}`;
  };
};

describe("suggestObsActionWithAi (node:sqlite persistence)", () => {
  liveIt(
    "builds a secret-free projection and creates an ai-suggested intent the gate still blocks, over real SQLite",
    async () => {
      if (nodeSqlite === undefined) {
        throw new Error("node:sqlite is unavailable.");
      }

      const database = new nodeSqlite.DatabaseSync(":memory:");

      try {
        const clock = (): string => timestamp;
        await migrateObsSqliteSchema({
          clock,
          database: wrapMigrationDatabase(database)
        });

        const controlPort = connectedFakePort();
        const { port, received } = createCapturingPort(validSuggestion);
        const seq = createSequentialIds();
        const selection = createObsPersistenceSelection(
          { environment: "production" },
          {
            sql: {
              aiSuggestionPort: port,
              clock,
              controlPort: controlPort.port,
              executor: createSqliteExecutor({ database }),
              ids: {
                actionIntentId: () => "action_ai",
                connectionProfileId: () => "connection_1",
                logEntryId: seq("log"),
                sceneId: seq("scene"),
                sceneItemId: seq("scene_item"),
                sourceId: seq("source")
              }
            }
          }
        );
        expect(selection.mode).toBe("sql");
        const { commandService } = selection.servicesAdapter;

        // save a connection profile with the SECRET connectionRef, then mirror the
        // catalog so a switch-scene to scene-lower is eligible.
        await commandService.saveObsConnectionProfile({
          actor: leader,
          input: { connectionRef: SECRET_CONNECTION_REF, label: "Sanctuary OBS" },
          requestId: "request_save"
        });
        await commandService.refreshObsCatalog({
          actor: leader,
          input: { connectionProfileId: "connection_1" },
          requestId: "request_refresh"
        });

        const suggested = await commandService.suggestObsActionWithAi({
          actor: leader,
          input: {
            connectionProfileId: "connection_1",
            requestedByRef: "operator_1",
            serviceSegmentLabels: ["Announcements"]
          },
          requestId: "request_ai_suggest"
        });

        expect(suggested.origin).toBe("ai-suggested");
        expect(suggested.status).toBe("requested");

        // The projection the port received over the persistence path is secret-free.
        const prompt = received[0];
        expect(prompt).toBeDefined();
        if (prompt === undefined) {
          return;
        }
        expect(prompt.connectionProfileRef).toBe("connection_1");
        const serialized = JSON.stringify(prompt);
        expect(serialized).not.toContain(SECRET_CONNECTION_REF);
        expect(serialized).not.toContain("vault://");
        expect(serialized).not.toContain("hunter2");

        // THE GATE re-proven over SQLite: an AI-suggested intent cannot dispatch
        // without a human confirmation, and the port is never called.
        await expectDomainErrorCode(
          commandService.dispatchObsAction({
            actor: leader,
            input: { actionIntentId: "action_ai" },
            requestId: "request_ai_dispatch"
          }),
          "NOT_CONFIRMED"
        );
        expectNoPortMutation(controlPort);
      } finally {
        database.close();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Prompt-spec contract: the output schema + the structural secret guard, tested
// directly so the `obs-action-suggestion.v1` contract is locked independent of the
// service wiring (the plan's schema-compliance + fallback + no-credential checks).
// ---------------------------------------------------------------------------

describe("ObsAiActionSuggestionSchema (obs-action-suggestion.v1 output contract)", () => {
  it("accepts a well-formed switch-scene suggestion (refs only, needsReview literal true)", () => {
    const parsed = ObsAiActionSuggestionSchema.safeParse(validSuggestion);
    expect(parsed.success).toBe(true);
  });

  it("accepts a toggle-source-visibility suggestion carrying all required refs", () => {
    const parsed = ObsAiActionSuggestionSchema.safeParse({
      desiredVisible: false,
      kind: "toggle-source-visibility",
      needsReview: true,
      rationale: "Hide the lower-third overlay during the sermon.",
      status: "suggested",
      targetSceneItemId: "item-1",
      targetSourceRef: "source-cam"
    } satisfies ObsAiActionSuggestion);
    expect(parsed.success).toBe(true);
  });

  it("rejects a switch-scene suggestion missing its targetSceneRef (fallback)", () => {
    const parsed = ObsAiActionSuggestionSchema.safeParse({
      kind: "switch-scene",
      needsReview: true,
      rationale: "Switch scenes.",
      status: "suggested"
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a start-stream suggestion that smuggles target refs", () => {
    const parsed = ObsAiActionSuggestionSchema.safeParse({
      kind: "start-stream",
      needsReview: true,
      rationale: "Go live.",
      status: "suggested",
      targetSceneRef: "scene-lower"
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects needsReview != true (an AI suggestion can never be auto-approved)", () => {
    const parsed = ObsAiActionSuggestionSchema.safeParse({
      ...validSuggestion,
      needsReview: false
    });
    expect(parsed.success).toBe(false);
  });
});

describe("assertObsAiActionSuggestionPromptIsSecretFree (structural secret guard)", () => {
  const baseInputs = {
    aiPolicyProfile: { humanReviewRequiredFor: ["obs-action"], piiSharingAllowed: false },
    connection: connectedProfile,
    operatorIntent: undefined,
    recording: {
      connectionProfileId: connectedProfile.connectionProfileId,
      recordingStatus: "inactive" as const,
      tenantId: connectedProfile.tenantId,
      updatedAt: timestamp
    },
    requestId: "request_guard",
    scenes: [],
    sceneItems: [],
    serviceSegmentLabels: ["Welcome"],
    sources: [],
    stream: {
      connectionProfileId: connectedProfile.connectionProfileId,
      streamStatus: "inactive" as const,
      tenantId: connectedProfile.tenantId,
      updatedAt: timestamp
    },
    tenantId: connectedProfile.tenantId
  };

  it("passes a legitimately-built secret-free projection (and never carries the connectionRef)", () => {
    const prompt = buildObsAiActionSuggestionPrompt(baseInputs);
    expect(() => {
      assertObsAiActionSuggestionPromptIsSecretFree(prompt);
    }).not.toThrow();
    expect(JSON.stringify(prompt)).not.toContain(SECRET_CONNECTION_REF);
    expect(prompt.connectionProfileRef).toBe(connectedProfile.connectionProfileId);
  });

  it("throws when a forbidden secret key is present (defence-in-depth)", () => {
    const leaked = {
      ...buildObsAiActionSuggestionPrompt(baseInputs),
      connectionRef: SECRET_CONNECTION_REF
    } as unknown as ObsAiActionSuggestionPrompt;
    expect(() => {
      assertObsAiActionSuggestionPromptIsSecretFree(leaked);
    }).toThrow(/forbidden field "connectionRef"/u);
  });

  it("throws when a value looks like a connection handle / URL", () => {
    const leaked = {
      ...buildObsAiActionSuggestionPrompt(baseInputs),
      operatorIntent: "ws://10.0.0.5:4455 go live"
    } as unknown as ObsAiActionSuggestionPrompt;
    expect(() => {
      assertObsAiActionSuggestionPromptIsSecretFree(leaked);
    }).toThrow(/connection handle or URL/u);
  });

  it("pins the prompt version literal", () => {
    expect(OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION).toBe("obs-action-suggestion.v1");
    const prompt = buildObsAiActionSuggestionPrompt(baseInputs);
    expect(prompt.promptVersion).toBe(OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION);
  });
});
