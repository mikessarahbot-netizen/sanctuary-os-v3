import { describe, expect, it } from "vitest";
import type { PlayLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { mapPlayLocalSyncQueueEntryToReplayCommand } from "./replay-command-executor.js";

const tenantId = "tenant_1";
const now = "2026-06-17T05:00:00.000Z";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId
};

const baseEntry = (
  overrides: Partial<PlayLocalSyncQueueEntryPersistenceRecord> = {}
): PlayLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "actor_1",
  attemptCount: 0,
  createdAt: now,
  operation: {
    operation: "setPlaybackState",
    payload: {
      clickEnabled: true,
      positionBeats: 0,
      tenantId,
      trackSetId: "track_set_1",
      transportStatus: "stopped",
      updatedAt: now
    }
  },
  queuedAt: now,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "pending",
  tenantId,
  trackSetId: "track_set_1",
  updatedAt: now,
  ...overrides
});

describe("mapPlayLocalSyncQueueEntryToReplayCommand", () => {
  it("projects a saveTrackSet persistence payload onto the command input and drops record-only fields", () => {
    const entry = baseEntry({
      operation: {
        operation: "saveTrackSet",
        payload: {
          arrangementRef: "arrangement_1",
          createdAt: now,
          defaultKey: "G",
          schemaVersion: "play.v1",
          songRef: "song_1",
          tempoBpm: 120,
          tenantId,
          title: "Set Title",
          trackRefs: [{ muted: false, role: "click", trackRef: "track_click" }],
          trackSetId: "track_set_1",
          updatedAt: now
        }
      },
      trackSetId: "track_set_1"
    });

    const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);

    expect(mapped.operation).toBe("saveTrackSet");
    expect(mapped.command).toEqual({
      actor,
      input: {
        arrangementRef: "arrangement_1",
        defaultKey: "G",
        songRef: "song_1",
        tempoBpm: 120,
        title: "Set Title",
        trackRefs: [{ muted: false, role: "click", trackRef: "track_click" }],
        trackSetId: "track_set_1"
      },
      requestId: "request_1"
    });
    expect("tenantId" in mapped.command.input).toBe(false);
    expect("createdAt" in mapped.command.input).toBe(false);
  });

  it("omits absent optionals from a savePadLayer command via conditional spreads", () => {
    const entry = baseEntry({
      operation: {
        operation: "savePadLayer",
        payload: {
          gain: 0.5,
          key: "C",
          loop: true,
          padLayerRef: "pad_1",
          padMediaRef: "media_1",
          tenantId,
          updatedAt: now
        }
      },
      trackSetId: undefined
    });

    const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);

    expect(mapped.operation).toBe("savePadLayer");
    expect(mapped.command.input).toEqual({
      gain: 0.5,
      key: "C",
      loop: true,
      padLayerRef: "pad_1",
      padMediaRef: "media_1"
    });
    expect("label" in mapped.command.input).toBe(false);
    expect("songRef" in mapped.command.input).toBe(false);
  });

  it("maps an addPlayCue jump cue including the target section reference", () => {
    const entry = baseEntry({
      operation: {
        operation: "addPlayCue",
        payload: {
          action: "jump",
          createdAt: now,
          cueId: "cue_1",
          fireMode: "manual",
          label: "Jump to bridge",
          markerOffsetBeats: 4,
          sectionId: "section_1",
          targetSectionRef: "section_bridge",
          tenantId,
          trackSetId: "track_set_1",
          updatedAt: now
        }
      },
      trackSetId: "track_set_1"
    });

    const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);

    expect(mapped.operation).toBe("addPlayCue");
    // `addPlayCue` does not carry a `cueId` (the server assigns it); the mapper
    // drops the persistence record's `cueId` for the add command input.
    expect("cueId" in mapped.command.input).toBe(false);
    expect(mapped.command.input).toMatchObject({
      action: "jump",
      targetSectionRef: "section_bridge",
      trackSetId: "track_set_1"
    });
  });

  it("maps a reorderPlaySections entry that carries no trackSetId", () => {
    const entry = baseEntry({
      operation: {
        operation: "reorderPlaySections",
        payload: {
          arrangementRef: "arrangement_1",
          orderedSectionIds: ["section_a", "section_b"]
        }
      },
      trackSetId: undefined
    });

    const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);

    expect(mapped.operation).toBe("reorderPlaySections");
    expect(mapped.command.input).toEqual({
      arrangementRef: "arrangement_1",
      orderedSectionIds: ["section_a", "section_b"]
    });
  });

  it("uses the entry requestId as the command idempotency key", () => {
    const entry = baseEntry({ requestId: "request_idem_42" });

    const mapped = mapPlayLocalSyncQueueEntryToReplayCommand(entry, actor);

    expect(mapped.command.requestId).toBe("request_idem_42");
  });

  it("throws when the actor tenant does not match the entry tenant", () => {
    const entry = baseEntry({
      operation: {
        operation: "savePlayArrangement",
        payload: {
          arrangementRef: "arrangement_1",
          defaultKey: "G",
          label: "Default",
          sectionOrder: ["section_a"],
          songRef: "song_1",
          tempoBpm: 120,
          tenantId
        }
      },
      trackSetId: undefined
    });

    expect(() =>
      mapPlayLocalSyncQueueEntryToReplayCommand(entry, {
        ...actor,
        tenantId: "tenant_other"
      })
    ).toThrow("actor tenant must match");
  });
});
