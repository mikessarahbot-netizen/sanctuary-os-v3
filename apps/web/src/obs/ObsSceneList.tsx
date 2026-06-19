import type { ReactElement } from "react";
import type { ObsScene } from "./types.js";

/**
 * OBS SCENE list. Renders the connection's scenes with the current program scene
 * (what viewers see right now) clearly highlighted and badged "On air" — it has
 * no switch control. Every OTHER scene gets a "Switch to this scene" button that
 * STARTS the human-confirm gate (it does not switch directly): the screen turns
 * the click into a `requestObsAction` and then shows the confirm step. Buttons are
 * disabled while a switch is mid-flight so only one gated action runs at a time.
 */
export interface ObsSceneListProps {
  readonly scenes: readonly ObsScene[];
  readonly onRequestSwitch: (scene: ObsScene) => void;
  readonly busy: boolean;
}

export const ObsSceneList = (props: ObsSceneListProps): ReactElement => {
  const { scenes } = props;

  if (scenes.length === 0) {
    return (
      <div className="obs-scenes">
        <p className="charts-empty">No scenes in this OBS catalog.</p>
      </div>
    );
  }

  return (
    <ul className="obs-scenes" aria-label="OBS scenes">
      {scenes.map((scene) => {
        const isProgram = scene.isCurrentProgramScene;

        return (
          <li
            key={scene.sceneId}
            className={
              isProgram ? "obs-scene-row obs-scene-row--program" : "obs-scene-row"
            }
            aria-current={isProgram ? "true" : undefined}
          >
            <span className="obs-scene-row__name">{scene.displayName}</span>
            {isProgram ? (
              <span className="obs-scene-row__program-badge">On air</span>
            ) : (
              <button
                type="button"
                className="obs-switch-button"
                disabled={props.busy}
                onClick={(): void => {
                  props.onRequestSwitch(scene);
                }}
              >
                Switch to this scene
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};
