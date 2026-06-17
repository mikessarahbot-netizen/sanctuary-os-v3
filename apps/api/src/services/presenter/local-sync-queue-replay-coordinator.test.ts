import { describe, expect, it } from "vitest";
import type { PresenterLocalSyncQueueEntryPersistenceRecord } from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { mapPresenterLocalSyncQueueEntryToReplayCommand } from "./local-sync-queue-replay-coordinator.js";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const baseEntry = (
  operation: PresenterLocalSyncQueueEntryPersistenceRecord["operation"]
): PresenterLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: "2026-06-17T03:00:00.000Z",
  operation,
  presentationId: "presentation_1",
  queuedAt: "2026-06-17T03:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId: "tenant_1",
  updatedAt: "2026-06-17T03:00:00.000Z"
});

const slide = {
  blocks: [
    {
      alignment: "center" as const,
      blockId: "block_1",
      kind: "text" as const,
      text: "Welcome",
      textStyle: "heading" as const
    }
  ],
  layout: "title" as const
};

describe("mapPresenterLocalSyncQueueEntryToReplayCommand", () => {
  it("maps updatePresentation to the update command with request scope", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "updatePresentation",
        payload: { presentationId: "presentation_1", title: "Sunday Gathering" }
      }),
      actor
    );

    expect(mapped).toEqual({
      command: {
        actor,
        input: { presentationId: "presentation_1", title: "Sunday Gathering" },
        requestId: "request_1"
      },
      operation: "updatePresentation"
    });
  });

  it("maps addSlide, preserving the slide payload", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "addSlide",
        payload: { afterSlideId: "slide_0", presentationId: "presentation_1", slide }
      }),
      actor
    );

    expect(mapped.operation).toBe("addSlide");
    expect(mapped.command.requestId).toBe("request_1");
    if (mapped.operation === "addSlide") {
      expect(mapped.command.input.afterSlideId).toBe("slide_0");
      expect(mapped.command.input.slide.layout).toBe("title");
    }
  });

  it("maps updateSlide with a full slide record", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "updateSlide",
        payload: {
          presentationId: "presentation_1",
          slide: {
            ...slide,
            order: 0,
            presentationId: "presentation_1",
            slideId: "slide_1",
            tenantId: "tenant_1"
          }
        }
      }),
      actor
    );

    expect(mapped.operation).toBe("updateSlide");
    if (mapped.operation === "updateSlide") {
      expect(mapped.command.input.slide.slideId).toBe("slide_1");
    }
  });

  it("maps reorderSlides", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "reorderSlides",
        payload: {
          orderedSlideIds: ["slide_1", "slide_2"],
          presentationId: "presentation_1"
        }
      }),
      actor
    );

    expect(mapped.operation).toBe("reorderSlides");
    if (mapped.operation === "reorderSlides") {
      expect(mapped.command.input.orderedSlideIds).toEqual(["slide_1", "slide_2"]);
    }
  });

  it("maps applyPresenterTheme", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "applyPresenterTheme",
        payload: { presentationId: "presentation_1", themeId: "theme_1" }
      }),
      actor
    );

    expect(mapped.operation).toBe("applyPresenterTheme");
    if (mapped.operation === "applyPresenterTheme") {
      expect(mapped.command.input.themeId).toBe("theme_1");
    }
  });

  it("maps setOutputTarget with the output target payload", () => {
    const mapped = mapPresenterLocalSyncQueueEntryToReplayCommand(
      baseEntry({
        operation: "setOutputTarget",
        payload: {
          outputTarget: {
            confidenceOutputEnabled: false,
            displayName: "Main Projector",
            outputTargetId: "output_1",
            safeBlanked: true,
            targetKind: "main",
            tenantId: "tenant_1",
            windowRef: "display-main"
          },
          presentationId: "presentation_1"
        }
      }),
      actor
    );

    expect(mapped.operation).toBe("setOutputTarget");
    if (mapped.operation === "setOutputTarget") {
      expect(mapped.command.input.outputTarget.outputTargetId).toBe("output_1");
    }
  });

  it("rejects an actor whose tenant differs from the entry", () => {
    expect(() =>
      mapPresenterLocalSyncQueueEntryToReplayCommand(
        baseEntry({
          operation: "updatePresentation",
          payload: { presentationId: "presentation_1", title: "Sunday" }
        }),
        { ...actor, tenantId: "tenant_other" }
      )
    ).toThrow("actor tenant must match");
  });

  it("rejects a malformed queue entry", () => {
    expect(() =>
      mapPresenterLocalSyncQueueEntryToReplayCommand({ not: "an entry" }, actor)
    ).toThrow();
  });
});
