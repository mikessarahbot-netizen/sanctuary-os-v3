import { ObsDomainError, type ObsActionIntent } from "../../domain/obs/index.js";
import type { ObsControlPort } from "./control-port.js";
import type {
  ObsConnectionProfile,
  ObsSceneItem,
  ObsStreamState
} from "../../domain/obs/index.js";

/**
 * Shared OBS port-bridge — the single place either service adapter (in-memory or
 * persistence-backed) reaches a port **mutate** method, extracted so both paths
 * dispatch through identical logic and the confirm→dispatch gate cannot drift
 * between them.
 *
 * `callObsPortForAction` realizes a dispatched action's `kind` by calling the one
 * matching `ObsControlPort` mutate method and nothing else. It is reached ONLY
 * from each adapter's `dispatchObsAction`, ONLY for a confirmed-then-dispatched
 * intent — it is the sole bridge from an OBS service to a port mutate method.
 * Stream actions return the port's observed coarse stream status (so the caller
 * records the durable transition); scene/source toggles resolve `void` and return
 * `undefined`. A normalized `ObsControlError` from the port propagates to the
 * dispatch caller, which classifies and records it. The five v1 kinds are handled
 * exhaustively (no default branch), so adding a kind is a compile error here until
 * it is wired.
 *
 * The owning-scene resolution a `toggle-source-visibility` dispatch needs is
 * delegated to an injected `resolveSceneRef` callback, because the two adapters
 * read the durable scene-item snapshot differently (an in-memory map vs the SQL
 * repository); the bridge itself stays storage-agnostic and pure of I/O beyond the
 * single port call.
 */
export type ResolveSceneRefForSceneItem = (
  intent: ObsActionIntent,
  targetSceneItemId: NonNullable<ObsActionIntent["targetSceneItemId"]>
) => ObsSceneItem["sceneRef"];

/**
 * Missing-ref guard for the dispatch switch. The `ObsActionIntentSchema`
 * superRefine already guarantees the per-kind target refs are present on any
 * stored intent, but the *types* are optional, so this narrows them and fails
 * closed with `VALIDATION_FAILED` rather than letting an `undefined` ref reach the
 * port — a stored intent should never hit this.
 */
export const requireObsActionField = <TValue>(
  value: TValue | undefined,
  field: string
): TValue => {
  if (value === undefined) {
    throw new ObsDomainError(
      "VALIDATION_FAILED",
      `This OBS action is missing its required ${field}.`
    );
  }

  return value;
};

export const callObsPortForAction = async (
  controlPort: ObsControlPort,
  connectionRef: ObsConnectionProfile["connectionRef"],
  intent: ObsActionIntent,
  resolveSceneRef: ResolveSceneRefForSceneItem
): Promise<ObsStreamState["streamStatus"] | undefined> => {
  switch (intent.kind) {
    case "switch-scene": {
      await controlPort.setCurrentProgramScene(
        connectionRef,
        requireObsActionField(intent.targetSceneRef, "target scene")
      );

      return undefined;
    }

    case "toggle-source-visibility": {
      const targetSceneItemId = requireObsActionField(
        intent.targetSceneItemId,
        "target scene-item"
      );

      await controlPort.setSceneItemEnabled(connectionRef, {
        enabled: requireObsActionField(intent.desiredVisible, "desired visibility"),
        obsSceneItemId: targetSceneItemId,
        obsSceneRef: resolveSceneRef(intent, targetSceneItemId)
      });

      return undefined;
    }

    case "toggle-source-mute": {
      await controlPort.setInputMute(connectionRef, {
        muted: requireObsActionField(intent.desiredMuted, "desired mute"),
        obsSourceRef: requireObsActionField(intent.targetSourceRef, "target source")
      });

      return undefined;
    }

    case "start-stream": {
      const observed = await controlPort.startStream(connectionRef);

      return observed.streamStatus;
    }

    case "stop-stream": {
      const observed = await controlPort.stopStream(connectionRef);

      return observed.streamStatus;
    }
  }
};
