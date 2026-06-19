import {
  START_STREAM_ACTION_KIND,
  STOP_STREAM_ACTION_KIND,
  type ConfirmActionInput,
  type DispatchActionInput,
  type ObsDataSource,
  type RequestStreamActionInput,
  type RequestSwitchSceneInput,
  type SuggestWithAiInput
} from "./client.js";
import type {
  ObsActionIntent,
  ObsActionLogEntry,
  ObsConnectionProfile,
  ObsConsole,
  ObsRecordingState,
  ObsScene,
  ObsStreamState
} from "./types.js";

/**
 * Seeded sample OBS data for demo mode and tests.
 *
 * Demo mode (the default data source, or `?demo` / `VITE_DATA_SOURCE=demo`)
 * renders these so the OBS screen is populated and screenshot-able without a live
 * GraphQL API. The same connection + scene catalog (Worship / Sermon /
 * Announcements, with Worship the current program scene) is seeded into the demo
 * server (`apps/api/src/demo/server.ts`) via the FAKE control port so live mode
 * renders the same console.
 *
 * SAFETY: the connection carries only an opaque `connectionRef` (a `vault://`
 * handle) — never a host / port / password / stream key. The demo deliberately
 * uses an obviously-non-secret ref token so a test can assert no secret-shaped
 * value (no `ws://`, no `password`) ever reaches the DOM.
 *
 * The enum-valued fields use the GraphQL SDL names the live client receives so
 * demo and live render identically.
 */
export const DEMO_OBS_CONNECTION_PROFILE_ID = "obs-connection-sanctuary";
export const DEMO_OBS_TENANT_ID = "tenant-demo";

/**
 * The actor ref a demo switch is attributed to. Cosmetic in demo mode (the demo
 * source does not authenticate); it pairs with the `demo-web-operator` bearer
 * token the live client sends.
 */
export const DEMO_OBS_ACTOR_REF = "demo-web-operator";

const DEMO_CONNECTION: ObsConnectionProfile = {
  connectionProfileId: DEMO_OBS_CONNECTION_PROFILE_ID,
  connectionRef: "vault://obs/demo-sanctuary",
  connectionStatus: "connected",
  label: "Sanctuary OBS",
  obsWebsocketVersion: "5.0.0",
  tenantId: DEMO_OBS_TENANT_ID
};

interface DemoSceneSeed {
  readonly displayName: string;
  readonly obsSceneRef: string;
}

const DEMO_SCENE_SEEDS: readonly DemoSceneSeed[] = [
  { displayName: "Worship", obsSceneRef: "scene-worship" },
  { displayName: "Sermon", obsSceneRef: "scene-sermon" },
  { displayName: "Announcements", obsSceneRef: "scene-announcements" }
];

const DEMO_PROGRAM_SCENE_REF = "scene-worship";

/**
 * The scene the demo AI "suggestion" proposes switching to: Sermon (a non-program
 * scene, so the suggested switch is meaningful). The canned demo suggestion mirrors
 * what the real `claude-opus-4-8` adapter would return for an operator intent like
 * "the pastor is about to preach" — a `switch-scene` to this ref. It is returned as
 * a `requested`, `ai_suggested` intent that still must pass the human-confirm gate.
 */
const DEMO_AI_SUGGESTED_SCENE_REF = "scene-sermon";

const buildScenes = (programSceneRef: string): readonly ObsScene[] =>
  DEMO_SCENE_SEEDS.map((seed, index) => ({
    connectionProfileId: DEMO_OBS_CONNECTION_PROFILE_ID,
    displayName: seed.displayName,
    isCurrentProgramScene: seed.obsSceneRef === programSceneRef,
    obsSceneRef: seed.obsSceneRef,
    orderHint: index,
    sceneId: `scene-${seed.obsSceneRef}`,
    tenantId: DEMO_OBS_TENANT_ID
  }));

/**
 * The stream status the demo boots with. The stream is LIVE on first load, so the
 * surface offers a (gated) "Stop stream" first; stopping flips it to `inactive`,
 * after which a (gated) "Go live" is offered — so both stream actions are
 * demonstrable from a single demo session.
 */
const DEMO_STREAM_STATUS = "active";

const buildStreamState = (
  streamStatus: string,
  timestamp: string
): ObsStreamState => ({
  connectionProfileId: DEMO_OBS_CONNECTION_PROFILE_ID,
  streamStatus,
  tenantId: DEMO_OBS_TENANT_ID,
  updatedAt: timestamp
});

const buildRecordingState = (timestamp: string): ObsRecordingState => ({
  connectionProfileId: DEMO_OBS_CONNECTION_PROFILE_ID,
  recordingStatus: "inactive",
  tenantId: DEMO_OBS_TENANT_ID,
  updatedAt: timestamp
});

const DEMO_SEED_TIMESTAMP = "2026-06-18T00:00:00.000Z";

/**
 * The OBS console exactly as it renders on first load: Worship on program, the
 * stream live, recording off, and a single `requested`-state-equivalent seed log
 * line so the audit panel is non-empty. Pure (no I/O), so a test can assert the
 * read view without constructing the stateful source.
 */
export const SAMPLE_OBS_CONSOLE: ObsConsole = {
  actionLog: [
    {
      actionIntentRef: "demo-seed-refresh",
      logEntryId: "demo-log-seed",
      occurredAt: DEMO_SEED_TIMESTAMP,
      outcome: "succeeded",
      reason: "Catalog refreshed from OBS.",
      safeMessage: null
    }
  ],
  connection: DEMO_CONNECTION,
  recordingState: buildRecordingState(DEMO_SEED_TIMESTAMP),
  scenes: buildScenes(DEMO_PROGRAM_SCENE_REF),
  streamState: buildStreamState(DEMO_STREAM_STATUS, DEMO_SEED_TIMESTAMP)
};

const sceneDisplayName = (obsSceneRef: string): string =>
  DEMO_SCENE_SEEDS.find((seed) => seed.obsSceneRef === obsSceneRef)?.displayName ??
  obsSceneRef;

const streamActionLabel = (kind: string): string =>
  kind === START_STREAM_ACTION_KIND ? "start_stream" : "stop_stream";

const streamStatusForKind = (kind: string): string =>
  kind === START_STREAM_ACTION_KIND ? "active" : "inactive";

/**
 * A stateful in-memory OBS data source for demo mode that REPLAYS the real gate:
 * `requestSwitchScene` / `requestStreamAction` record a `requested` intent and do
 * NOT change OBS; `confirmAction` advances it to `confirmed`; `dispatchAction`
 * refuses unless the intent is `confirmed`, and only then applies the effect (a
 * scene switch flips the program scene; a `start_stream` / `stop_stream` flips the
 * coarse stream status active↔inactive) and appends a `succeeded` audit line. This
 * makes the demo gate behave exactly like the live server (request alone never
 * goes live), so screenshots and the component tests exercise a faithful flow
 * without an API.
 */
export const createSampleObsDataSource = (): ObsDataSource => {
  let programSceneRef = DEMO_PROGRAM_SCENE_REF;
  let streamStatus = DEMO_STREAM_STATUS;
  const intents = new Map<string, ObsActionIntent>();
  const actionLog: ObsActionLogEntry[] = [...SAMPLE_OBS_CONSOLE.actionLog];
  let nextId = 1;
  let clockTick = 0;

  const now = (): string => {
    const base = Date.parse(DEMO_SEED_TIMESTAMP);
    const value = new Date(base + clockTick * 1000).toISOString();
    clockTick += 1;

    return value;
  };

  const appendLog = (entry: {
    readonly actionIntentRef: string;
    readonly outcome: string;
    readonly reason: string;
  }): void => {
    actionLog.push({
      actionIntentRef: entry.actionIntentRef,
      logEntryId: `demo-log-${String(nextId++)}`,
      occurredAt: now(),
      outcome: entry.outcome,
      reason: entry.reason,
      safeMessage: null
    });
  };

  const snapshot = (): ObsConsole => ({
    actionLog: actionLog.map((entry) => ({ ...entry })),
    connection: { ...DEMO_CONNECTION },
    recordingState: buildRecordingState(now()),
    scenes: buildScenes(programSceneRef),
    streamState: buildStreamState(streamStatus, now())
  });

  return {
    loadConsole: (): Promise<ObsConsole> => Promise.resolve(snapshot()),
    requestSwitchScene: (
      input: RequestSwitchSceneInput
    ): Promise<ObsActionIntent> => {
      const intent: ObsActionIntent = {
        actionIntentId: `demo-intent-${String(nextId++)}`,
        kind: "switch_scene",
        origin: "human",
        safeFailureMessage: null,
        status: "requested",
        targetSceneRef: input.targetSceneRef
      };
      intents.set(intent.actionIntentId, intent);
      appendLog({
        actionIntentRef: intent.actionIntentId,
        outcome: "requested",
        reason: `Requested switch_scene to ${sceneDisplayName(input.targetSceneRef)}.`
      });

      return Promise.resolve({ ...intent });
    },
    requestStreamAction: (
      input: RequestStreamActionInput
    ): Promise<ObsActionIntent> => {
      // Mirrors `requestSwitchScene`: records a `requested` intent (no
      // `targetSceneRef`) and does NOT touch the stream. Only a confirmed dispatch
      // flips it.
      const intent: ObsActionIntent = {
        actionIntentId: `demo-intent-${String(nextId++)}`,
        kind: input.kind,
        origin: "human",
        safeFailureMessage: null,
        status: "requested",
        targetSceneRef: null
      };
      intents.set(intent.actionIntentId, intent);
      appendLog({
        actionIntentRef: intent.actionIntentId,
        outcome: "requested",
        reason: `Requested ${streamActionLabel(input.kind)}.`
      });

      return Promise.resolve({ ...intent });
    },
    confirmAction: (input: ConfirmActionInput): Promise<ObsActionIntent> => {
      const existing = intents.get(input.actionIntentId);

      if (existing === undefined) {
        return Promise.reject(
          new Error("This OBS action intent is no longer available.")
        );
      }

      const confirmed: ObsActionIntent = { ...existing, status: "confirmed" };
      intents.set(confirmed.actionIntentId, confirmed);
      appendLog({
        actionIntentRef: confirmed.actionIntentId,
        outcome: "confirmed",
        reason: `Confirmed ${existing.kind}: ${input.reason}`
      });

      return Promise.resolve({ ...confirmed });
    },
    dispatchAction: (input: DispatchActionInput): Promise<ObsActionIntent> => {
      const existing = intents.get(input.actionIntentId);

      if (existing === undefined) {
        return Promise.reject(
          new Error("This OBS action intent is no longer available.")
        );
      }

      // Mirror the live gate: dispatch refuses unless the intent is confirmed.
      if (existing.status !== "confirmed") {
        return Promise.reject(
          new Error("This OBS action cannot be dispatched until a human has confirmed it.")
        );
      }

      // Apply the confirmed effect. A stream action flips the coarse stream status
      // (mirrors the fake control port's startStream/stopStream); a scene switch
      // moves the program scene. Both are only reached AFTER the confirm guard.
      const isStreamAction =
        existing.kind === START_STREAM_ACTION_KIND ||
        existing.kind === STOP_STREAM_ACTION_KIND;
      let dispatchReason: string;

      if (isStreamAction) {
        streamStatus = streamStatusForKind(existing.kind);
        dispatchReason = `Dispatched ${existing.kind} successfully (stream ${streamStatus}).`;
      } else {
        if (existing.targetSceneRef !== null) {
          programSceneRef = existing.targetSceneRef;
        }
        dispatchReason = `Dispatched switch_scene to ${sceneDisplayName(programSceneRef)} successfully.`;
      }

      const succeeded: ObsActionIntent = { ...existing, status: "succeeded" };
      intents.set(succeeded.actionIntentId, succeeded);
      appendLog({
        actionIntentRef: succeeded.actionIntentId,
        outcome: "succeeded",
        reason: dispatchReason
      });

      return Promise.resolve({ ...succeeded });
    },
    suggestWithAi: (input: SuggestWithAiInput): Promise<ObsActionIntent> => {
      // Demo mode does NOT hit the network: it returns a CANNED `ai_suggested`
      // switch-scene intent and registers it in the SAME `intents` map a manual
      // switch uses, so the returned suggestion flows through the EXACT same
      // human-confirm gate (confirmAction → dispatchAction). It is born `requested`
      // and unconfirmed — `dispatchAction` still refuses it until a human confirms.
      // The live source calls the real claude-opus-4-8 adapter instead (when a key is
      // set). `input.operatorIntent` is accepted but, like the live projection, is a
      // non-PII hint only; the canned suggestion does not echo it.
      void input.operatorIntent;
      const intent: ObsActionIntent = {
        actionIntentId: `demo-intent-${String(nextId++)}`,
        kind: "switch_scene",
        origin: "ai_suggested",
        safeFailureMessage: null,
        status: "requested",
        targetSceneRef: DEMO_AI_SUGGESTED_SCENE_REF
      };
      intents.set(intent.actionIntentId, intent);
      appendLog({
        actionIntentRef: intent.actionIntentId,
        outcome: "requested",
        reason: `AI suggested switch_scene to ${sceneDisplayName(DEMO_AI_SUGGESTED_SCENE_REF)} (needs human confirm).`
      });

      return Promise.resolve({ ...intent });
    },
    // The demo source already applies the effect in `dispatchAction`, so a catalog
    // refresh is a no-op here; it exists to satisfy the live-parity gate flow (the
    // live client re-reads the durable snapshot after a refresh).
    refreshCatalog: (): Promise<void> => Promise.resolve()
  };
};
