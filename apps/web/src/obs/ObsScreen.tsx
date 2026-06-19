import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  START_STREAM_ACTION_KIND,
  STOP_STREAM_ACTION_KIND,
  type ObsDataSource
} from "./client.js";
import { DEMO_OBS_ACTOR_REF } from "./sample-data.js";
import { ObsAiSuggestGate } from "./ObsAiSuggestGate.js";
import { ObsSceneList } from "./ObsSceneList.js";
import { ObsStatusPanel } from "./ObsStatusPanel.js";
import { ObsStreamGate, type StreamGateDirection } from "./ObsStreamGate.js";
import { ObsSwitchGate } from "./ObsSwitchGate.js";
import type { ObsActionIntent, ObsConsole, ObsConsoleState, ObsScene } from "./types.js";

/**
 * OBS control surface container.
 *
 * Loads the OBS console (connection + scenes + stream/recording state + action
 * log) from the injected `ObsDataSource`, renders a read panel (scenes with the
 * current program scene highlighted; stream/recording status + the gated stream
 * control), and drives the human-confirm gate for a scene switch AND for a stream
 * start/stop. The data source is injected so the same component renders against
 * demo sample data, a live GraphQL endpoint, or a test double. The `mode` label is
 * surfaced in the header so a screenshot makes clear whether the data is demo or
 * live.
 *
 * THE GATE (the whole point of this surface): clicking a non-program scene's
 * "Switch to this scene", the "Go live" / "Stop stream" control, or the "AI suggest"
 * button calls the corresponding request mutation (`requestObsAction` /
 * `suggestObsActionWithAi`) and moves into an `awaiting-confirm` flow that shows the
 * confirm step — it does NOT switch or go live. Only the operator's explicit
 * Confirm runs `confirmObsAction` then `dispatchObsAction` (the single dispatch
 * call site in this component), after which the console is reloaded so the program
 * scene + stream status + audit line reflect the live result. Cancel aborts with no
 * dispatch. Because `dispatchAction` is invoked only inside the one Confirm
 * handler — shared by the scene gate, the stream gate, AND the AI-suggest gate — a
 * dispatch can never fire without a confirmation, for any action kind. AI SUGGESTS,
 * A HUMAN CONFIRMS: an AI-suggested intent is the SAME `requested` intent type and
 * is bound by this same gate; the AI never dispatches, never goes live.
 */
export interface ObsScreenProps {
  readonly dataSource: ObsDataSource;
  readonly mode: "demo" | "live";
}

/**
 * What a gated action targets: a scene switch (carries the target scene), a stream
 * start/stop (carries the direction), or an AI-SUGGESTED action (carries the
 * `requested`, `ai_suggested` intent the backend returned + a human-readable
 * summary of it). The flow is shared so ALL of them go through the exact same
 * confirm → dispatch path — an AI-suggested intent can never dispatch without the
 * human confirm.
 */
type ActionTarget =
  | { readonly kind: "switch-scene"; readonly scene: ObsScene }
  | { readonly kind: "stream"; readonly direction: StreamGateDirection }
  | {
      readonly kind: "ai-suggested";
      readonly intent: ObsActionIntent;
      readonly summary: string;
    };

/**
 * The gated-action flow. `idle`: nothing pending. `requesting`: the request is in
 * flight (controls disabled, no confirm step yet). `awaiting-confirm`: a
 * `requested` intent exists and the confirm step is shown. `working`: confirm +
 * dispatch are in flight after the operator pressed Confirm. The `target`
 * discriminates which gate (scene or stream) is open.
 */
type ActionFlow =
  | { readonly phase: "idle" }
  | { readonly phase: "requesting"; readonly target: ActionTarget }
  | {
      readonly phase: "awaiting-confirm";
      readonly target: ActionTarget;
      readonly actionIntentId: string;
      readonly errorMessage: string | null;
    }
  | {
      readonly phase: "working";
      readonly target: ActionTarget;
      readonly actionIntentId: string;
    };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

const programSceneName = (console: ObsConsole): string =>
  console.scenes.find((scene) => scene.isCurrentProgramScene)?.displayName ??
  "(none)";

/**
 * A short, human-readable summary of an AI-suggested action, derived from the
 * returned intent's kind + target (the target scene ref resolved to its display
 * name from the console). Used as the AI gate's "AI suggests: …" line. The model's
 * free-text rationale is not carried on the intent, so this describes the concrete
 * action the operator is being asked to confirm.
 */
const summarizeAiSuggestion = (
  intent: ObsActionIntent,
  console: ObsConsole
): string => {
  if (intent.kind === "switch_scene" && intent.targetSceneRef !== null) {
    const target = intent.targetSceneRef;
    const sceneName =
      console.scenes.find((scene) => scene.obsSceneRef === target)?.displayName ??
      target;

    return `Switch program scene to ${sceneName}`;
  }

  if (intent.kind === START_STREAM_ACTION_KIND) {
    return "Start the live stream";
  }

  if (intent.kind === STOP_STREAM_ACTION_KIND) {
    return "Stop the live stream";
  }

  return `Run ${intent.kind}`;
};

const latestLogEntry = (console: ObsConsole): ObsConsole["actionLog"][number] | null => {
  const log = console.actionLog;

  return log.length === 0 ? null : (log[log.length - 1] ?? null);
};

export const ObsScreen = (props: ObsScreenProps): ReactElement => {
  const { dataSource } = props;
  const [consoleState, setConsoleState] = useState<ObsConsoleState>({
    status: "loading"
  });
  const [flow, setFlow] = useState<ActionFlow>({ phase: "idle" });

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
      const target: ActionTarget = { kind: "switch-scene", scene };
      setFlow({ phase: "requesting", target });

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
            target
          });
        })
        .catch((error: unknown) => {
          setFlow({
            actionIntentId: "",
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            target
          });
        });
    },
    [consoleState, dataSource]
  );

  const handleRequestStream = useCallback(
    (direction: StreamGateDirection): void => {
      if (consoleState.status !== "loaded" || consoleState.console.connection === null) {
        return;
      }

      const connectionProfileId = consoleState.console.connection.connectionProfileId;
      const target: ActionTarget = { direction, kind: "stream" };
      setFlow({ phase: "requesting", target });

      // SAME gate as a scene switch: the request proposes a `requested` intent and
      // never touches OBS. Going live/off-air waits for the explicit Confirm.
      dataSource
        .requestStreamAction({
          connectionProfileId,
          kind:
            direction === "start"
              ? START_STREAM_ACTION_KIND
              : STOP_STREAM_ACTION_KIND,
          requestedByRef: DEMO_OBS_ACTOR_REF
        })
        .then((intent) => {
          setFlow({
            actionIntentId: intent.actionIntentId,
            errorMessage: null,
            phase: "awaiting-confirm",
            target
          });
        })
        .catch((error: unknown) => {
          setFlow({
            actionIntentId: "",
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            target
          });
        });
    },
    [consoleState, dataSource]
  );

  const handleRequestAiSuggest = useCallback(
    (operatorIntent: string): void => {
      if (consoleState.status !== "loaded" || consoleState.console.connection === null) {
        return;
      }

      const console = consoleState.console;
      const connectionProfileId = consoleState.console.connection.connectionProfileId;

      // SAME gate as a manual switch: ask the backend to AI-suggest the next action.
      // The returned intent is `requested` + `ai_suggested` and has NOT been
      // dispatched. We move into the confirm step for THAT intent; nothing has gone
      // live, and only the operator's explicit Confirm will confirm + dispatch it.
      dataSource
        .suggestWithAi({
          connectionProfileId,
          operatorIntent,
          requestedByRef: DEMO_OBS_ACTOR_REF
        })
        .then((intent) => {
          const target: ActionTarget = {
            intent,
            kind: "ai-suggested",
            summary: summarizeAiSuggestion(intent, console)
          };
          setFlow({
            actionIntentId: intent.actionIntentId,
            errorMessage: null,
            phase: "awaiting-confirm",
            target
          });
        })
        .catch((error: unknown) => {
          // The suggestion request itself failed (e.g. no AI provider configured, or
          // the model produced no usable suggestion). Surface it in an AI gate with
          // no pending intent, so the operator can read the error and cancel — there
          // is nothing to confirm or dispatch.
          setFlow({
            actionIntentId: "",
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            target: {
              intent: {
                actionIntentId: "",
                kind: "switch_scene",
                origin: "ai_suggested",
                safeFailureMessage: null,
                status: "requested",
                targetSceneRef: null
              },
              kind: "ai-suggested",
              summary: "an action"
            }
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
      const { actionIntentId, target } = flow;
      setFlow({ actionIntentId, phase: "working", target });

      // The ONLY dispatch path (shared by the scene gate AND the stream gate):
      // confirm the human gate, THEN dispatch. Dispatch is never called anywhere
      // else, so it can never fire without this confirm — for either action kind.
      dataSource
        .confirmAction({
          actionIntentId,
          confirmedByRef: DEMO_OBS_ACTOR_REF,
          reason
        })
        .then(() => dataSource.dispatchAction({ actionIntentId }))
        // A successful dispatch updates the OBS instance; refresh the durable
        // catalog snapshot so the reloaded program-scene + stream status reflect it.
        .then(() => dataSource.refreshCatalog(connectionProfileId))
        .then(() => {
          // Reload from the source of truth so the program scene, stream status,
          // and audit line reflect the dispatched result.
          setFlow({ phase: "idle" });
          reloadConsole(connectionProfileId);
        })
        .catch((error: unknown) => {
          setFlow({
            actionIntentId,
            errorMessage: errorMessage(error),
            phase: "awaiting-confirm",
            target
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
          onRequestStreamAction={handleRequestStream}
          onRequestAiSuggest={handleRequestAiSuggest}
          busy={busy}
        />

        <section className="obs-screen__panel" aria-label="Program scene control">
          <h2 className="play-panel__title">Scenes</h2>
          <ObsSceneList
            scenes={console.scenes}
            onRequestSwitch={handleRequestSwitch}
            busy={busy}
          />
        </section>

        {renderGate(console)}
      </>
    );
  }

  function renderGate(console: ObsConsole): ReactElement | null {
    if (flow.phase !== "awaiting-confirm" && flow.phase !== "working") {
      return null;
    }

    const status = flow.phase === "working" ? "working" : "awaiting-confirm";
    const gateError = flow.phase === "awaiting-confirm" ? flow.errorMessage : null;

    if (flow.target.kind === "stream") {
      return (
        <ObsStreamGate
          direction={flow.target.direction}
          status={status}
          errorMessage={gateError}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );
    }

    if (flow.target.kind === "ai-suggested") {
      // The AI suggested this action; it enters the SAME confirm → dispatch path.
      // `handleConfirm` is unchanged — the single dispatch call site — so an
      // ai-suggested intent can never dispatch without the operator's Confirm.
      return (
        <ObsAiSuggestGate
          suggestionSummary={flow.target.summary}
          programSceneName={programSceneName(console)}
          status={status}
          errorMessage={gateError}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );
    }

    return (
      <ObsSwitchGate
        targetSceneName={flow.target.scene.displayName}
        programSceneName={programSceneName(console)}
        status={status}
        errorMessage={gateError}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }
};
