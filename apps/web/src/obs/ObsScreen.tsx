import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { ObsDataSource } from "./client.js";
import { DEMO_OBS_ACTOR_REF } from "./sample-data.js";
import { ObsSceneList } from "./ObsSceneList.js";
import { ObsStatusPanel } from "./ObsStatusPanel.js";
import { ObsSwitchGate } from "./ObsSwitchGate.js";
import type { ObsConsole, ObsConsoleState, ObsScene } from "./types.js";

/**
 * OBS control surface container.
 *
 * Loads the OBS console (connection + scenes + stream/recording state + action
 * log) from the injected `ObsDataSource`, renders a read panel (scenes with the
 * current program scene highlighted; stream/recording status), and drives the
 * human-confirm gate for a scene switch. The data source is injected so the same
 * component renders against demo sample data, a live GraphQL endpoint, or a test
 * double. The `mode` label is surfaced in the header so a screenshot makes clear
 * whether the data is demo or live.
 *
 * THE GATE (the whole point of this surface): clicking a non-program scene's
 * "Switch to this scene" calls `requestObsAction` and moves into an
 * `awaiting-confirm` flow that shows the confirm step — it does NOT switch. Only
 * the operator's explicit Confirm runs `confirmObsAction` then `dispatchObsAction`
 * (the single dispatch call site in this component), after which the console is
 * reloaded so the program scene + audit line reflect the live result. Cancel
 * aborts with no dispatch. Because `dispatchAction` is invoked only inside the
 * Confirm handler, a dispatch can never fire without a confirmation.
 */
export interface ObsScreenProps {
  readonly dataSource: ObsDataSource;
  readonly mode: "demo" | "live";
}

/**
 * The gated-switch flow. `idle`: nothing pending. `requesting`: the request is
 * in flight (scene buttons disabled, no confirm step yet). `awaiting-confirm`: a
 * `requested` intent exists and the confirm step is shown. `working`: confirm +
 * dispatch are in flight after the operator pressed Confirm.
 */
type SwitchFlow =
  | { readonly phase: "idle" }
  | { readonly phase: "requesting"; readonly targetScene: ObsScene }
  | {
      readonly phase: "awaiting-confirm";
      readonly targetScene: ObsScene;
      readonly actionIntentId: string;
      readonly errorMessage: string | null;
    }
  | {
      readonly phase: "working";
      readonly targetScene: ObsScene;
      readonly actionIntentId: string;
    };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

const programSceneName = (console: ObsConsole): string =>
  console.scenes.find((scene) => scene.isCurrentProgramScene)?.displayName ??
  "(none)";

const latestLogEntry = (console: ObsConsole): ObsConsole["actionLog"][number] | null => {
  const log = console.actionLog;

  return log.length === 0 ? null : (log[log.length - 1] ?? null);
};

export const ObsScreen = (props: ObsScreenProps): ReactElement => {
  const { dataSource } = props;
  const [consoleState, setConsoleState] = useState<ObsConsoleState>({
    status: "loading"
  });
  const [flow, setFlow] = useState<SwitchFlow>({ phase: "idle" });

  const reloadConsole = useCallback(
    (connectionProfileId: string): void => {
      dataSource
        .loadConsole(connectionProfileId)
        .then((console) => {
          setConsoleState({ status: "loaded", console });
        })
        .catch((error: unknown) => {
          setConsoleState({ status: "error", message: errorMessage(error) });
        });
    },
    [dataSource]
  );

  useEffect(() => {
    let cancelled = false;

    dataSource
      .loadConsole()
      .then((console) => {
        if (!cancelled) {
          setConsoleState({ status: "loaded", console });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setConsoleState({ status: "error", message: errorMessage(error) });
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [dataSource]);

  const handleRequestSwitch = useCallback(
    (scene: ObsScene): void => {
      if (consoleState.status !== "loaded" || consoleState.console.connection === null) {
        return;
      }

      const connectionProfileId = consoleState.console.connection.connectionProfileId;
      setFlow({ phase: "requesting", targetScene: scene });

      // The request proposes a `requested` intent and never touches OBS. Success
      // moves into the confirm step; nothing has gone live yet.
      dataSource
        .requestSwitchScene({
          connectionProfileId,
          requestedByRef: DEMO_OBS_ACTOR_REF,
          targetSceneRef: scene.obsSceneRef
        })
        .then((intent) => {
          setFlow({
            actionIntentId: intent.actionIntentId,
            errorMessage: null,
            phase: "awaiting-confirm",
            targetScene: scene
          });
        })
        .catch((error: unknown) => {
          setFlow({
            actionIntentId: "",
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            targetScene: scene
          });
        });
    },
    [consoleState, dataSource]
  );

  const handleCancel = useCallback((): void => {
    // Abort the gate with NO dispatch.
    setFlow({ phase: "idle" });
  }, []);

  const handleConfirm = useCallback(
    (reason: string): void => {
      if (flow.phase !== "awaiting-confirm" || flow.actionIntentId === "") {
        return;
      }

      if (consoleState.status !== "loaded" || consoleState.console.connection === null) {
        return;
      }

      const connectionProfileId = consoleState.console.connection.connectionProfileId;
      const { actionIntentId, targetScene } = flow;
      setFlow({ actionIntentId, phase: "working", targetScene });

      // The ONLY dispatch path: confirm the human gate, THEN dispatch. Dispatch
      // is never called anywhere else, so it can never fire without this confirm.
      dataSource
        .confirmAction({
          actionIntentId,
          confirmedByRef: DEMO_OBS_ACTOR_REF,
          reason
        })
        .then(() => dataSource.dispatchAction({ actionIntentId }))
        // A successful dispatch updates the OBS instance; refresh the durable
        // catalog snapshot so the reloaded program-scene highlight reflects it.
        .then(() => dataSource.refreshCatalog(connectionProfileId))
        .then(() => {
          // Reload from the source of truth so the program scene + audit line
          // reflect the dispatched result.
          setFlow({ phase: "idle" });
          reloadConsole(connectionProfileId);
        })
        .catch((error: unknown) => {
          setFlow({
            actionIntentId,
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            targetScene
          });
        });
    },
    [consoleState, dataSource, flow, reloadConsole]
  );

  return (
    <main className="charts-screen">
      <header className="charts-screen__header">
        <h1>OBS</h1>
        <span className={`mode-badge mode-badge--${props.mode}`}>{props.mode} data</span>
      </header>
      <div className="obs-screen__body">{renderBody()}</div>
    </main>
  );

  function renderBody(): ReactElement {
    if (consoleState.status === "loading") {
      return (
        <div className="obs-screen__panel" role="status" aria-busy="true">
          <p className="charts-empty">Loading OBS…</p>
        </div>
      );
    }

    if (consoleState.status === "error") {
      return (
        <div className="obs-screen__panel" role="alert">
          <p className="charts-error">Could not load OBS: {consoleState.message}</p>
        </div>
      );
    }

    const { console } = consoleState;

    if (console.connection === null) {
      return (
        <div className="obs-screen__panel">
          <p className="charts-empty">No OBS connection is configured.</p>
        </div>
      );
    }

    const busy = flow.phase !== "idle";

    return (
      <>
        <ObsStatusPanel
          connection={console.connection}
          streamState={console.streamState}
          recordingState={console.recordingState}
          latestLogEntry={latestLogEntry(console)}
        />

        <section className="obs-screen__panel" aria-label="Program scene control">
          <h2 className="play-panel__title">Scenes</h2>
          <ObsSceneList
            scenes={console.scenes}
            onRequestSwitch={handleRequestSwitch}
            busy={busy}
          />
        </section>

        {flow.phase === "awaiting-confirm" || flow.phase === "working" ? (
          <ObsSwitchGate
            targetSceneName={flow.targetScene.displayName}
            programSceneName={programSceneName(console)}
            status={flow.phase === "working" ? "working" : "awaiting-confirm"}
            errorMessage={flow.phase === "awaiting-confirm" ? flow.errorMessage : null}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        ) : null}
      </>
    );
  }
};
