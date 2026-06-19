import {
  PlayLocalSyncQueueEntryPersistenceRecordSchema,
  type PlayLocalSyncQueueEntryPersistenceRecord
} from "@sanctuary-os/db";
import { AuthenticatedActorSchema, type AuthenticatedActor } from "../../auth/index.js";
import {
  AddPlayCueCommandSchema,
  ReorderPlaySectionsCommandSchema,
  SavePadLayerCommandSchema,
  SavePlayArrangementCommandSchema,
  SavePlaySectionCommandSchema,
  SaveTrackSetCommandSchema,
  SetPlaybackStateCommandSchema,
  UpdatePlayCueCommandSchema,
  UpdateTrackSetMembersCommandSchema,
  type AddPlayCueCommand,
  type ReorderPlaySectionsCommand,
  type SavePadLayerCommand,
  type SavePlayArrangementCommand,
  type SavePlaySectionCommand,
  type SaveTrackSetCommand,
  type SetPlaybackStateCommand,
  type UpdatePlayCueCommand,
  type UpdateTrackSetMembersCommand
} from "../../domain/play/index.js";

/**
 * The minimal Play command surface the desktop replay runtime needs: the nine
 * approved non-destructive operations, each executed for its effect. The
 * destructive `removePlayCue` is intentionally excluded — it is never queued for
 * offline replay and requires explicit online intent and audit metadata.
 *
 * The result is intentionally `unknown`. Replay only needs to know whether a
 * command succeeded or threw, and a network (GraphQL) client cannot rebuild the
 * full domain aggregate from the truncated mutation projections. Because the
 * methods return `Promise<unknown>`, the in-process `PlayCommandService` (which
 * returns full aggregates) and a network executor (which returns nothing) are
 * both assignable, so the replay pass is transport-agnostic.
 */
export interface PlayReplayCommandExecutor {
  readonly saveTrackSet: (command: SaveTrackSetCommand) => Promise<unknown>;
  readonly updateTrackSetMembers: (
    command: UpdateTrackSetMembersCommand
  ) => Promise<unknown>;
  readonly savePlayArrangement: (
    command: SavePlayArrangementCommand
  ) => Promise<unknown>;
  readonly savePlaySection: (command: SavePlaySectionCommand) => Promise<unknown>;
  readonly reorderPlaySections: (
    command: ReorderPlaySectionsCommand
  ) => Promise<unknown>;
  readonly addPlayCue: (command: AddPlayCueCommand) => Promise<unknown>;
  readonly updatePlayCue: (command: UpdatePlayCueCommand) => Promise<unknown>;
  readonly savePadLayer: (command: SavePadLayerCommand) => Promise<unknown>;
  readonly setPlaybackState: (command: SetPlaybackStateCommand) => Promise<unknown>;
}

const playReplayMutationDocument = (
  operationName: string,
  inputTypeName: string,
  confirmationField: string
): string =>
  `mutation ${operationName}($input: ${inputTypeName}!) {\n  ${operationName}(input: $input) {\n    ${confirmationField}\n  }\n}`;

/**
 * Canonical Play replay mutation documents, keyed by operation name.
 *
 * Each document declares the server's real typed input (e.g. `SaveTrackSetInput!`),
 * so it validates against the executable Play schema — a `JSON!` variable would be
 * rejected because the mutations expect their specific `input` type. This map is
 * the single source of truth: the desktop network replay executor sends exactly
 * these strings, and the api `validate(schema, parse(document))` test asserts
 * against this same map, so the documents the desktop ships are the documents
 * proven valid against the schema. The selection set is the minimal confirmation
 * field replay relies on.
 */
export const PLAY_REPLAY_MUTATION_DOCUMENTS = {
  addPlayCue: playReplayMutationDocument("addPlayCue", "AddPlayCueInput", "cueId"),
  reorderPlaySections: playReplayMutationDocument(
    "reorderPlaySections",
    "ReorderPlaySectionsInput",
    "sectionId"
  ),
  savePadLayer: playReplayMutationDocument("savePadLayer", "SavePadLayerInput", "padLayerRef"),
  savePlayArrangement: playReplayMutationDocument(
    "savePlayArrangement",
    "SavePlayArrangementInput",
    "arrangementRef"
  ),
  savePlaySection: playReplayMutationDocument(
    "savePlaySection",
    "SavePlaySectionInput",
    "sectionId"
  ),
  saveTrackSet: playReplayMutationDocument("saveTrackSet", "SaveTrackSetInput", "trackSetId"),
  setPlaybackState: playReplayMutationDocument(
    "setPlaybackState",
    "SetPlaybackStateInput",
    "trackSetId"
  ),
  updatePlayCue: playReplayMutationDocument("updatePlayCue", "UpdatePlayCueInput", "cueId"),
  updateTrackSetMembers: playReplayMutationDocument(
    "updateTrackSetMembers",
    "UpdateTrackSetMembersInput",
    "trackSetId"
  )
} as const satisfies Readonly<Record<string, string>>;

/**
 * Maps a validated Play local sync queue entry to the existing Play service
 * command shape so a desktop replay runtime can re-issue an offline edit through
 * the normal command path. This is pure mapping: it performs no I/O and calls no
 * service.
 *
 * The queued payload is the command repository's persistence input (a full
 * record carrying `tenantId`/timestamps that the online command input does not
 * accept), so each branch projects the persistence payload onto the command
 * input field by field rather than passing it through. The queue stores only the
 * original `actorId`, so the replay runtime supplies the authenticated actor that
 * will execute the replay; the mapping reuses the entry's `requestId` as the
 * command's idempotency key and requires the actor's tenant to match the entry's
 * tenant.
 */
export type PlayLocalSyncQueueReplayCommand =
  | { readonly command: SaveTrackSetCommand; readonly operation: "saveTrackSet" }
  | {
      readonly command: UpdateTrackSetMembersCommand;
      readonly operation: "updateTrackSetMembers";
    }
  | {
      readonly command: SavePlayArrangementCommand;
      readonly operation: "savePlayArrangement";
    }
  | { readonly command: SavePlaySectionCommand; readonly operation: "savePlaySection" }
  | {
      readonly command: ReorderPlaySectionsCommand;
      readonly operation: "reorderPlaySections";
    }
  | { readonly command: AddPlayCueCommand; readonly operation: "addPlayCue" }
  | { readonly command: UpdatePlayCueCommand; readonly operation: "updatePlayCue" }
  | { readonly command: SavePadLayerCommand; readonly operation: "savePadLayer" }
  | {
      readonly command: SetPlaybackStateCommand;
      readonly operation: "setPlaybackState";
    };

export const mapPlayLocalSyncQueueEntryToReplayCommand = (
  rawEntry: unknown,
  rawActor: unknown
): PlayLocalSyncQueueReplayCommand => {
  const entry: PlayLocalSyncQueueEntryPersistenceRecord =
    PlayLocalSyncQueueEntryPersistenceRecordSchema.parse(rawEntry);
  const actor: AuthenticatedActor = AuthenticatedActorSchema.parse(rawActor);

  if (actor.tenantId !== entry.tenantId) {
    throw new Error(
      "Play local sync queue replay actor tenant must match the queue entry tenant."
    );
  }

  const request = { actor, requestId: entry.requestId };
  const operation = entry.operation;

  switch (operation.operation) {
    case "saveTrackSet":
      return {
        command: SaveTrackSetCommandSchema.parse({
          ...request,
          input: {
            defaultKey: operation.payload.defaultKey,
            songRef: operation.payload.songRef,
            tempoBpm: operation.payload.tempoBpm,
            trackRefs: operation.payload.trackRefs,
            trackSetId: operation.payload.trackSetId,
            ...(operation.payload.arrangementRef !== undefined
              ? { arrangementRef: operation.payload.arrangementRef }
              : {}),
            ...(operation.payload.serviceRef !== undefined
              ? { serviceRef: operation.payload.serviceRef }
              : {}),
            ...(operation.payload.title !== undefined
              ? { title: operation.payload.title }
              : {})
          }
        }),
        operation: "saveTrackSet"
      };
    case "updateTrackSetMembers":
      return {
        command: UpdateTrackSetMembersCommandSchema.parse({
          ...request,
          input: {
            trackRefs: operation.payload.trackRefs,
            trackSetId: operation.payload.trackSetId
          }
        }),
        operation: "updateTrackSetMembers"
      };
    case "savePlayArrangement":
      return {
        command: SavePlayArrangementCommandSchema.parse({
          ...request,
          input: {
            arrangementRef: operation.payload.arrangementRef,
            defaultKey: operation.payload.defaultKey,
            label: operation.payload.label,
            sectionOrder: operation.payload.sectionOrder,
            songRef: operation.payload.songRef,
            tempoBpm: operation.payload.tempoBpm,
            ...(operation.payload.loopSectionRef !== undefined
              ? { loopSectionRef: operation.payload.loopSectionRef }
              : {})
          }
        }),
        operation: "savePlayArrangement"
      };
    case "savePlaySection":
      return {
        command: SavePlaySectionCommandSchema.parse({
          ...request,
          input: {
            arrangementRef: operation.payload.arrangementRef,
            clickEnabledDefault: operation.payload.clickEnabledDefault,
            kind: operation.payload.kind,
            lengthBars: operation.payload.lengthBars,
            sectionId: operation.payload.sectionId,
            ...(operation.payload.label !== undefined
              ? { label: operation.payload.label }
              : {}),
            ...(operation.payload.padLayerRef !== undefined
              ? { padLayerRef: operation.payload.padLayerRef }
              : {})
          }
        }),
        operation: "savePlaySection"
      };
    case "reorderPlaySections":
      return {
        command: ReorderPlaySectionsCommandSchema.parse({
          ...request,
          input: {
            arrangementRef: operation.payload.arrangementRef,
            orderedSectionIds: operation.payload.orderedSectionIds
          }
        }),
        operation: "reorderPlaySections"
      };
    case "addPlayCue":
      return {
        command: AddPlayCueCommandSchema.parse({
          ...request,
          input: {
            action: operation.payload.action,
            fireMode: operation.payload.fireMode,
            label: operation.payload.label,
            markerOffsetBeats: operation.payload.markerOffsetBeats,
            sectionId: operation.payload.sectionId,
            trackSetId: operation.payload.trackSetId,
            ...(operation.payload.padLayerRef !== undefined
              ? { padLayerRef: operation.payload.padLayerRef }
              : {}),
            ...(operation.payload.targetSectionRef !== undefined
              ? { targetSectionRef: operation.payload.targetSectionRef }
              : {})
          }
        }),
        operation: "addPlayCue"
      };
    case "updatePlayCue":
      return {
        command: UpdatePlayCueCommandSchema.parse({
          ...request,
          input: {
            action: operation.payload.action,
            cueId: operation.payload.cueId,
            fireMode: operation.payload.fireMode,
            label: operation.payload.label,
            markerOffsetBeats: operation.payload.markerOffsetBeats,
            sectionId: operation.payload.sectionId,
            trackSetId: operation.payload.trackSetId,
            ...(operation.payload.padLayerRef !== undefined
              ? { padLayerRef: operation.payload.padLayerRef }
              : {}),
            ...(operation.payload.targetSectionRef !== undefined
              ? { targetSectionRef: operation.payload.targetSectionRef }
              : {})
          }
        }),
        operation: "updatePlayCue"
      };
    case "savePadLayer":
      return {
        command: SavePadLayerCommandSchema.parse({
          ...request,
          input: {
            gain: operation.payload.gain,
            key: operation.payload.key,
            loop: operation.payload.loop,
            padLayerRef: operation.payload.padLayerRef,
            padMediaRef: operation.payload.padMediaRef,
            ...(operation.payload.label !== undefined
              ? { label: operation.payload.label }
              : {}),
            ...(operation.payload.sectionScopeRef !== undefined
              ? { sectionScopeRef: operation.payload.sectionScopeRef }
              : {}),
            ...(operation.payload.songRef !== undefined
              ? { songRef: operation.payload.songRef }
              : {})
          }
        }),
        operation: "savePadLayer"
      };
    case "setPlaybackState":
      return {
        command: SetPlaybackStateCommandSchema.parse({
          ...request,
          input: {
            clickEnabled: operation.payload.clickEnabled,
            positionBeats: operation.payload.positionBeats,
            transportStatus: operation.payload.transportStatus,
            trackSetId: operation.payload.trackSetId,
            ...(operation.payload.activePadLayerRef !== undefined
              ? { activePadLayerRef: operation.payload.activePadLayerRef }
              : {}),
            ...(operation.payload.activeSectionRef !== undefined
              ? { activeSectionRef: operation.payload.activeSectionRef }
              : {})
          }
        }),
        operation: "setPlaybackState"
      };
  }
};
