import type {
  ConfirmActionInput,
  DispatchActionInput,
  ObsDataSource,
  RequestSwitchSceneInput
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

const buildStreamState = (timestamp: string): ObsStreamState => ({
  connectionProfileId: DEMO_OBS_CONNECTION_PROFILE_ID,
  streamStatus: "active",
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
  streamState: buildStreamState(DEMO_SEED_TIMESTAMP)
};

const sceneDisplayName = (obsSceneRef: string): string =>
  DEMO_SCENE_SEEDS.find((seed) => seed.obsSceneRef === obsSceneRef)?.displayName ??
  obsSceneRef;

/**
 * A stateful in-memory OBS data source for demo mode that REPLAYS the real gate:
 * `requestSwitchScene` records a `requested` intent and does NOT move the program
 * scene; `confirmAction` advances it to `confirmed`; `dispatchAction` refuses
 * unless the intent is `confirmed`, and only then flips the program scene and
 * appends a `succeeded` audit line. This makes the demo gate behave exactly like
 * the live server (request alone never goes live), so screenshots and the
 * component tests exercise a faithful flow without an API.
 */
export const createSampleObsDataSource = (): ObsDataSource => {
  let programSceneRef = DEMO_PROGRAM_SCENE_REF;
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
    streamState: buildStreamState(now())
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
        reason: `Confirmed switch_scene: ${input.reason}`
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

      if (existing.targetSceneRef !== null) {
        programSceneRef = existing.targetSceneRef;
      }

      const succeeded: ObsActionIntent = { ...existing, status: "succeeded" };
      intents.set(succeeded.actionIntentId, succeeded);
      appendLog({
        actionIntentRef: succeeded.actionIntentId,
        outcome: "succeeded",
        reason: `Dispatched switch_scene to ${sceneDisplayName(programSceneRef)} successfully.`
      });

      return Promise.resolve({ ...succeeded });
    },
    // The demo source already flips the program scene in `dispatchAction`, so a
    // catalog refresh is a no-op here; it exists to satisfy the live-parity gate
    // flow (the live client re-reads the durable snapshot after a refresh).
    refreshCatalog: (): Promise<void> => Promise.resolve()
  };
};
