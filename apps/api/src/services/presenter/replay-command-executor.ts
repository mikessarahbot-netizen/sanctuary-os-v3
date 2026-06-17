import type {
  AddPresenterSlideCommand,
  ApplyPresenterThemeCommand,
  ReorderPresenterSlidesCommand,
  SetPresenterOutputTargetCommand,
  UpdatePresentationCommand,
  UpdatePresenterSlideCommand
} from "./contracts.js";

/**
 * The minimal Presenter command surface the desktop replay runtime needs: the
 * six approved non-destructive operations, each executed for its effect.
 *
 * The result is intentionally `unknown`. Replay only needs to know whether a
 * command succeeded or threw, and a network (GraphQL) client cannot rebuild the
 * full domain aggregate from the truncated mutation projections. Because the
 * methods return `Promise<unknown>`, the in-process `PresenterCommandService`
 * (which returns full aggregates) and a network executor (which returns nothing)
 * are both assignable, so the replay pass is transport-agnostic.
 */
export interface PresenterReplayCommandExecutor {
  readonly updatePresentation: (command: UpdatePresentationCommand) => Promise<unknown>;
  readonly addSlide: (command: AddPresenterSlideCommand) => Promise<unknown>;
  readonly updateSlide: (command: UpdatePresenterSlideCommand) => Promise<unknown>;
  readonly reorderSlides: (command: ReorderPresenterSlidesCommand) => Promise<unknown>;
  readonly applyPresenterTheme: (command: ApplyPresenterThemeCommand) => Promise<unknown>;
  readonly setOutputTarget: (command: SetPresenterOutputTargetCommand) => Promise<unknown>;
}
