import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import OBSWebSocket from "obs-websocket-js";
import type { AuthenticatedActor } from "../auth/index.js";
import { createObsPersistenceSelection } from "../services/obs/composition.js";
import { createObsWebSocketControlPort } from "../services/obs/obs-websocket-control-port.js";
import type { InMemoryObsServicesAdapter } from "../services/obs/in-memory.js";

/**
 * Runnable LIVE OBS smoke test for the real obs-websocket-v5 control-port adapter
 * (`createObsWebSocketControlPort`).
 *
 * This is a plain ESM script (NOT a vitest spec), the OBS sibling of
 * `ai-smoke-test.ts`. It proves the production control port works against a live OBS
 * Studio — but ONLY ever through the existing request -> confirm -> dispatch
 * human-confirm gate, never by calling the port's mutate methods directly. A green
 * run means: the SDK connect + request shapes compile AND are accepted by a live
 * OBS, the catalog refresh reads real scenes, and a gated `switch-scene` actually
 * moved the live program scene.
 *
 *   - The ONLY live action it performs is a program-scene SWITCH. It NEVER starts or
 *     stops a stream or a recording: no `start-stream` / `stop-stream` intent is ever
 *     requested, so the gate's dispatch path never reaches `startStream`/`stopStream`.
 *   - The switch is driven through `requestObsAction` (kind `switch-scene`) ->
 *     `confirmObsAction` (audited reason) -> `dispatchObsAction`, exactly like the
 *     dispatch-gate tests. The control port is wired in as the in-memory OBS
 *     services' `controlPort`; the script never calls `controlPort.setCurrentProgramScene`
 *     itself — the gate does, and only after a human-style confirm.
 *   - It picks the current program scene + a DIFFERENT target from the LIVE catalog,
 *     verifies the switch via the real `controlPort.getCurrentProgramScene()` read,
 *     then switches back through the SAME gate so OBS ends where it started.
 *
 * Secret handling: the OBS url + (optional) password are read from `apps/api/.env`
 * via dotenv resolved from this file's own location, so they load regardless of cwd.
 * The password value is NEVER printed — at most a length acknowledgement.
 *
 * Run with: `pnpm --filter @sanctuary-os/api obs:smoke`
 * (Requires `SANCTUARY_OS_OBS_URL=ws://127.0.0.1:4455` and, if OBS has auth on,
 * `SANCTUARY_OS_OBS_PASSWORD=...` in `apps/api/.env`, and OBS Studio running with
 * the obs-websocket server enabled and at least two scenes.)
 */

// Load apps/api/.env relative to THIS file (src/demo/obs-live-smoke.ts ->
// apps/api/.env), so the connection settings load no matter where the script runs.
const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
config({ path: envPath });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const obsUrl = process.env["SANCTUARY_OS_OBS_URL"];
if (obsUrl === undefined || obsUrl.length === 0) {
  console.error(
    "SANCTUARY_OS_OBS_URL not set in apps/api/.env — set it to your OBS websocket url (e.g. ws://127.0.0.1:4455) and re-run"
  );
  process.exit(1);
}

const obsPassword = process.env["SANCTUARY_OS_OBS_PASSWORD"];

// Never print the password itself; a length-only acknowledgement confirms it loaded.
console.log(
  `obs websocket: ${obsUrl} (password length ${String(obsPassword?.length ?? 0)})`
);

// The opaque connection profile the gate carries. This adapter operates an
// already-connected client (see obs-websocket-control-port.ts), so the connectionRef
// is never used to dial OBS — it is only the vault-handle the port contract expects,
// and is NEVER a host/port/password/stream key.
const CONNECTION_PROFILE_ID = "obs-live-smoke-connection";
const CONNECTION_REF = "vault://obs/live-smoke";

// A stable demo actor with a command-capable OBS role, mirroring the obs tests'
// literal actor (worship_leader passes both the query + command role gates).
const smokeActor: AuthenticatedActor = {
  actorId: "obs-live-smoke-operator",
  roles: ["worship_leader"],
  tenantId: "tenant-demo"
};

/**
 * Drive ONE gated program-scene switch end-to-end: request a `switch-scene` intent
 * to `targetSceneRef`, confirm it with an audited reason, then dispatch it. This is
 * the only way the control port's `setCurrentProgramScene` is ever reached — the
 * gate, never a direct call.
 */
const gatedSwitchScene = async (
  adapter: InMemoryObsServicesAdapter,
  targetSceneRef: string,
  reason: string,
  label: string
): Promise<void> => {
  const { commandService } = adapter;

  const requested = await commandService.requestObsAction({
    actor: smokeActor,
    input: {
      connectionProfileId: CONNECTION_PROFILE_ID,
      kind: "switch-scene",
      origin: "human",
      requestedByRef: smokeActor.actorId,
      targetSceneRef
    },
    requestId: `obs-live-smoke-request-${label}`
  });

  await commandService.confirmObsAction({
    actor: smokeActor,
    input: {
      actionIntentId: requested.actionIntentId,
      confirmationIntent: { confirmed: true, reason },
      confirmedByRef: smokeActor.actorId
    },
    requestId: `obs-live-smoke-confirm-${label}`
  });

  await commandService.dispatchObsAction({
    actor: smokeActor,
    input: { actionIntentId: requested.actionIntentId },
    requestId: `obs-live-smoke-dispatch-${label}`
  });
};

const main = async (): Promise<void> => {
  const obs = new OBSWebSocket();

  // The caller (this script) owns connect/auth + secret resolution. If no password is
  // configured, connect with no password (OBS with auth disabled).
  if (obsPassword === undefined || obsPassword.length === 0) {
    await obs.connect(obsUrl);
  } else {
    await obs.connect(obsUrl, obsPassword);
  }

  let pass = false;

  try {
    const controlPort = createObsWebSocketControlPort({ client: obs });

    // Wire the REAL control port into the in-memory OBS services adapter. The gate
    // drives this port; the script never calls a mutate method on it directly.
    const selection = createObsPersistenceSelection(
      { mode: "in-memory" },
      { inMemory: { controlPort } }
    );
    if (selection.mode !== "in-memory") {
      throw new Error("Expected the in-memory OBS persistence selection.");
    }
    const adapter = selection.inMemoryAdapter;
    const { commandService } = adapter;

    // Register the connection profile (opaque connectionRef — NO secret), then pull
    // the LIVE scene catalog from OBS via the real port.
    await commandService.saveObsConnectionProfile({
      actor: smokeActor,
      input: {
        connectionProfileId: CONNECTION_PROFILE_ID,
        connectionRef: CONNECTION_REF,
        label: "OBS Live Smoke"
      },
      requestId: "obs-live-smoke-save-connection"
    });

    const catalog = await commandService.refreshObsCatalog({
      actor: smokeActor,
      input: { connectionProfileId: CONNECTION_PROFILE_ID },
      requestId: "obs-live-smoke-refresh"
    });

    const scenes = catalog.scenes;
    console.log(
      `live scenes (${String(scenes.length)}): ${scenes
        .map((scene) => scene.obsSceneRef)
        .join(", ")}`
    );

    if (scenes.length < 2) {
      console.error(
        "--- OBS LIVE: FAIL --- needs >=2 scenes in OBS to prove a program-scene switch"
      );
      return;
    }

    // The live program scene from the refreshed catalog, and a DIFFERENT target.
    const originalProgram = await controlPort.getCurrentProgramScene(
      catalog.connectionProfile.connectionRef
    );
    const originalSceneRef = originalProgram.currentProgramSceneRef;

    const targetScene = scenes.find(
      (scene) => scene.obsSceneRef !== originalSceneRef
    );
    if (targetScene === undefined) {
      console.error(
        "--- OBS LIVE: FAIL --- could not find a scene different from the current program scene"
      );
      return;
    }
    const targetSceneRef = targetScene.obsSceneRef;

    console.log(
      `switching program scene: ${originalSceneRef} -> ${targetSceneRef} (through the confirm gate)`
    );

    // Drive the gated switch to the target scene.
    await gatedSwitchScene(
      adapter,
      targetSceneRef,
      "live smoke verification",
      "to-target"
    );

    // The real live read: did OBS actually move the program scene?
    const afterSwitch = await controlPort.getCurrentProgramScene(
      catalog.connectionProfile.connectionRef
    );
    if (afterSwitch.currentProgramSceneRef === targetSceneRef) {
      pass = true;
      console.log("--- OBS LIVE: PASS ---");
      console.log(`program scene is now: ${afterSwitch.currentProgramSceneRef}`);
    } else {
      console.error(
        `--- OBS LIVE: FAIL --- expected program scene ${targetSceneRef}, got ${afterSwitch.currentProgramSceneRef}`
      );
    }

    // Courtesy restore: switch back to the original scene through the SAME gate so
    // OBS ends where it started. A restore failure does NOT fail the smoke.
    try {
      await gatedSwitchScene(
        adapter,
        originalSceneRef,
        "live smoke restore",
        "restore"
      );
      console.log(`restored program scene to: ${originalSceneRef}`);
    } catch (error: unknown) {
      console.warn(`restore skipped (non-fatal): ${errorMessage(error)}`);
    }
  } finally {
    await obs.disconnect();
  }

  if (!pass) {
    process.exit(1);
  }

  console.log("OBS live smoke PASSED.");
};

main().catch((error: unknown) => {
  console.error(`--- OBS LIVE: FAIL --- ${errorMessage(error)}`);
  process.exit(1);
});
