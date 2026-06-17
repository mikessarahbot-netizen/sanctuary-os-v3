import { describe, expect, it } from "vitest";
import type {
  PresenterLocalSyncQueueEntryPersistenceRecord,
  PresenterLocalSyncQueuePersistenceRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PresenterCommandService } from "@sanctuary-os/api/presenter";
import { runPresenterDesktopReplayPass } from "./replay-pass.js";

const tenantId = "tenant_1";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId
};

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const queuedEntry = (
  overrides: Partial<PresenterLocalSyncQueueEntryPersistenceRecord> = {}
): PresenterLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "revision_1",
  createdAt: "2026-06-17T05:00:00.000Z",
  operation: {
    operation: "updatePresentation",
    payload: { presentationId: "presentation_1", title: "Sunday" }
  },
  presentationId: "presentation_1",
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt: "2026-06-17T05:00:00.000Z",
  ...overrides
});

interface RecordedTransition {
  readonly method: string;
  readonly queueEntryId: string;
  readonly safeErrorMessage?: string;
  readonly to: string;
}

interface FakeRepository {
  readonly repository: PresenterLocalSyncQueuePersistenceRepository;
  readonly transitions: readonly RecordedTransition[];
}

const createFakeRepository = (
  ready: readonly PresenterLocalSyncQueueEntryPersistenceRecord[]
): FakeRepository => {
  const transitions: RecordedTransition[] = [];
  const byId = new Map(ready.map((entry) => [entry.queueEntryId, entry] as const));
  const mutation = (queueEntryId: string) => {
    const entry = byId.get(queueEntryId);

    if (entry === undefined) {
      throw new Error(`Unknown queue entry ${queueEntryId}.`);
    }

    return Promise.resolve({ entry });
  };
  const unexpected = (): never => {
    throw new Error("Unexpected repository call in replay pass test.");
  };

  return {
    get transitions(): readonly RecordedTransition[] {
      return transitions;
    },
    repository: {
      cancel: unexpected,
      cleanupSyncedAndCancelled: unexpected,
      enqueue: unexpected,
      getById: unexpected,
      listReadyForReplay: () => Promise.resolve(ready),
      markConflict: unexpected,
      markFailed: (operation) => {
        transitions.push({
          method: "markFailed",
          queueEntryId: operation.input.queueEntryId,
          safeErrorMessage: operation.input.safeErrorMessage,
          to: operation.input.transition.to
        });

        return mutation(operation.input.queueEntryId);
      },
      markReplaying: (operation) => {
        transitions.push({
          method: "markReplaying",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        return mutation(operation.input.queueEntryId);
      },
      markSynced: (operation) => {
        transitions.push({
          method: "markSynced",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        return mutation(operation.input.queueEntryId);
      },
      requeue: unexpected
    } satisfies PresenterLocalSyncQueuePersistenceRepository
  };
};

interface FakeCommandService {
  readonly calls: readonly string[];
  readonly service: PresenterCommandService;
}

const createFakeCommandService = (
  failOperation?: string
): FakeCommandService => {
  const calls: string[] = [];
  const handle = (operation: string): Promise<never> => {
    calls.push(operation);

    if (failOperation === operation) {
      return Promise.reject(new Error("Command service rejected the replay."));
    }

    return Promise.resolve() as Promise<never>;
  };

  return {
    get calls(): readonly string[] {
      return calls;
    },
    service: {
      addSlide: () => handle("addSlide"),
      applyPresenterTheme: () => handle("applyPresenterTheme"),
      createPresentationFromService: () => handle("createPresentationFromService"),
      removeSlide: () => handle("removeSlide"),
      reorderSlides: () => handle("reorderSlides"),
      setOutputTarget: () => handle("setOutputTarget"),
      updatePresentation: () => handle("updatePresentation"),
      updateSlide: () => handle("updateSlide")
    } satisfies PresenterCommandService
  };
};

describe("runPresenterDesktopReplayPass", () => {
  it("replays an eligible entry and marks it synced", async () => {
    const repository = createFakeRepository([queuedEntry()]);
    const commandService = createFakeCommandService();

    const result = await runPresenterDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.synced).toEqual(["queue_entry_1"]);
    expect(result.failed).toEqual([]);
    expect(result.exhausted).toEqual([]);
    expect(commandService.calls).toEqual(["updatePresentation"]);
    expect(repository.transitions).toEqual([
      { method: "markReplaying", queueEntryId: "queue_entry_1", to: "replaying" },
      { method: "markSynced", queueEntryId: "queue_entry_1", to: "synced" }
    ]);
  });

  it("marks an entry failed when the command service rejects", async () => {
    const repository = createFakeRepository([queuedEntry()]);
    const commandService = createFakeCommandService("updatePresentation");

    const result = await runPresenterDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.failed).toEqual(["queue_entry_1"]);
    expect(result.synced).toEqual([]);
    expect(repository.transitions[0]?.method).toBe("markReplaying");
    expect(repository.transitions[1]).toMatchObject({
      method: "markFailed",
      to: "failed"
    });
    expect(repository.transitions[1]?.safeErrorMessage).toContain("could not be synced");
  });

  it("marks an attempt-exhausted entry failed without calling the command service", async () => {
    const repository = createFakeRepository([
      queuedEntry({ attemptCount: 3, lastAttemptedAt: "2026-06-17T05:00:00.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runPresenterDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T06:00:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.exhausted).toEqual(["queue_entry_1"]);
    expect(commandService.calls).toEqual([]);
    expect(repository.transitions).toEqual([
      {
        method: "markFailed",
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "Sync attempts were exhausted for this edit.",
        to: "failed"
      }
    ]);
  });

  it("does nothing for an entry still within its backoff window", async () => {
    const repository = createFakeRepository([
      queuedEntry({ attemptCount: 1, lastAttemptedAt: "2026-06-17T05:00:00.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runPresenterDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:00:05.000Z",
      policy,
      repository: repository.repository
    });

    expect(result).toEqual({ exhausted: [], failed: [], synced: [] });
    expect(commandService.calls).toEqual([]);
    expect(repository.transitions).toEqual([]);
  });
});
