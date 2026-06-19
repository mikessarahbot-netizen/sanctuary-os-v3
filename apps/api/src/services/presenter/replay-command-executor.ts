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

const presenterReplayMutationDocument = (
  operationName: string,
  inputTypeName: string,
  confirmationField: string
): string =>
  `mutation ${operationName}($input: ${inputTypeName}!) {\n  ${operationName}(input: $input) {\n    ${confirmationField}\n  }\n}`;

/**
 * Canonical Presenter replay mutation documents, keyed by operation name.
 *
 * Each document declares the server's real typed input (e.g. `SaveChartInput!`
 * elsewhere; here `UpdatePresentationInput!`), so it validates against the
 * executable Presenter schema — a `JSON!` variable would be rejected because the
 * mutations expect their specific `input` type. This map is the single source of
 * truth: the desktop network replay executor sends exactly these strings, and the
 * api `validate(schema, parse(document))` test asserts against this same map, so
 * the documents the desktop ships are the documents proven valid against the
 * schema. The selection set is the minimal confirmation field replay relies on.
 */
export const PRESENTER_REPLAY_MUTATION_DOCUMENTS = {
  addSlide: presenterReplayMutationDocument("addSlide", "AddPresenterSlideInput", "slideId"),
  applyPresenterTheme: presenterReplayMutationDocument(
    "applyPresenterTheme",
    "ApplyPresenterThemeInput",
    "presentationId"
  ),
  reorderSlides: presenterReplayMutationDocument(
    "reorderSlides",
    "ReorderPresenterSlidesInput",
    "slideId"
  ),
  setOutputTarget: presenterReplayMutationDocument(
    "setOutputTarget",
    "SetPresenterOutputTargetInput",
    "outputTargetId"
  ),
  updatePresentation: presenterReplayMutationDocument(
    "updatePresentation",
    "UpdatePresentationInput",
    "presentationId"
  ),
  updateSlide: presenterReplayMutationDocument(
    "updateSlide",
    "UpdatePresenterSlideInput",
    "slideId"
  )
} as const satisfies Readonly<Record<string, string>>;
