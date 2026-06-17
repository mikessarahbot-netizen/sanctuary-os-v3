import { PresenterLocalSyncQueueEntryPersistenceRecordSchema } from "@sanctuary-os/db";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import {
  AddPresenterSlideCommandSchema,
  ApplyPresenterThemeCommandSchema,
  ReorderPresenterSlidesCommandSchema,
  SetPresenterOutputTargetCommandSchema,
  UpdatePresentationCommandSchema,
  UpdatePresenterSlideCommandSchema,
  type AddPresenterSlideCommand,
  type ApplyPresenterThemeCommand,
  type ReorderPresenterSlidesCommand,
  type SetPresenterOutputTargetCommand,
  type UpdatePresentationCommand,
  type UpdatePresenterSlideCommand
} from "./contracts.js";

/**
 * Maps a validated Presenter local sync queue entry to the existing Presenter
 * service command shape so a desktop replay runtime can re-issue an offline
 * edit through the normal command path. This is pure mapping: it performs no
 * I/O and calls no service.
 *
 * The queue stores only the original `actorId`, so the replay runtime supplies
 * the authenticated actor that will execute the replay; the mapping reuses the
 * entry's `requestId` as the command's idempotency key and requires the actor's
 * tenant to match the entry's tenant.
 */
export type PresenterLocalSyncQueueReplayCommand =
  | { readonly command: UpdatePresentationCommand; readonly operation: "updatePresentation" }
  | { readonly command: AddPresenterSlideCommand; readonly operation: "addSlide" }
  | { readonly command: UpdatePresenterSlideCommand; readonly operation: "updateSlide" }
  | { readonly command: ReorderPresenterSlidesCommand; readonly operation: "reorderSlides" }
  | { readonly command: ApplyPresenterThemeCommand; readonly operation: "applyPresenterTheme" }
  | {
      readonly command: SetPresenterOutputTargetCommand;
      readonly operation: "setOutputTarget";
    };

export const mapPresenterLocalSyncQueueEntryToReplayCommand = (
  rawEntry: unknown,
  rawActor: unknown
): PresenterLocalSyncQueueReplayCommand => {
  const entry = PresenterLocalSyncQueueEntryPersistenceRecordSchema.parse(rawEntry);
  const actor = AuthenticatedActorSchema.parse(rawActor);

  if (actor.tenantId !== entry.tenantId) {
    throw new Error(
      "Presenter local sync queue replay actor tenant must match the queue entry tenant."
    );
  }

  const request = { actor, requestId: entry.requestId };
  const operation = entry.operation;

  switch (operation.operation) {
    case "updatePresentation":
      return {
        command: UpdatePresentationCommandSchema.parse({ ...request, input: operation.payload }),
        operation: "updatePresentation"
      };
    case "addSlide":
      return {
        command: AddPresenterSlideCommandSchema.parse({ ...request, input: operation.payload }),
        operation: "addSlide"
      };
    case "updateSlide":
      return {
        command: UpdatePresenterSlideCommandSchema.parse({
          ...request,
          input: operation.payload
        }),
        operation: "updateSlide"
      };
    case "reorderSlides":
      return {
        command: ReorderPresenterSlidesCommandSchema.parse({
          ...request,
          input: operation.payload
        }),
        operation: "reorderSlides"
      };
    case "applyPresenterTheme":
      return {
        command: ApplyPresenterThemeCommandSchema.parse({
          ...request,
          input: operation.payload
        }),
        operation: "applyPresenterTheme"
      };
    case "setOutputTarget":
      return {
        command: SetPresenterOutputTargetCommandSchema.parse({
          ...request,
          input: operation.payload
        }),
        operation: "setOutputTarget"
      };
  }
};
