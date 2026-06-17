import { describe, expect, it } from "vitest";
import type {
  PlayLocalSyncQueueEntryMutationResult,
  PlayLocalSyncQueueEntryPersistenceRecord,
  PlayLocalSyncQueuePersistenceRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "@sanctuary-os/api";
import type { PlayReplayCommandExecutor } from "@sanctuary-os/api/play";
import { runPlayDesktopReplayPass } from "./play-replay-pass.js";

const tenantId = "tenant_1";

const actor: AuthenticatedActor = {
  actorId: "musician_1",
  roles: ["musician"],
  tenantId
};

const policy = {
  backoffBaseSeconds: 10,
  backoffCapSeconds: 60,
  backoffMultiplier: 2,
  maxAttempts: 3
};

const pendingEntry = (
  overrides: Partial<PlayLocalSyncQueueEntryPersistenceRecord> = {}
): PlayLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "musician_1",
  attemptCount: 0,
  createdAt: "2026-06-17T05:00:00.000Z",
  operation: {
    operation: "setPlaybackState",
    payload: {
      clickEnabled: true,
      positionBeats: 0,
      tenantId,
      trackSetId: "track_set_1",
      transportStatus: "stopped",
      updatedAt: "2026-06-17T05:00:00.000Z"
    }
  },
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "play-local-sync-queue.v1",
  status: "pending",
  tenantId,
  trackSetId: "track_set_1",
  updatedAt: "2026-06-17T05:00:00.000Z",
  ...overrides
});

interface RecordedTransition {
  readonly method: string;
  readonly nextAttemptAt?: string;
  readonly queueEntryId: string;
  readonly safeErrorMessage?: string;
  readonly to: string;
}

interface FakeRepository {
  readonly repository: PlayLocalSyncQueuePersistenceRepository;
  readonly transitions: readonly RecordedTransition[];
}

const createFakeRepository = (
  pending: readonly PlayLocalSyncQueueEntryPersistenceRecord[]
): FakeRepository => {
  const transitions: RecordedTransition[] = [];
  const byId = new Map(pending.map((entry) => [entry.queueEntryId, entry] as const));
  const unexpected = (): never => {
    throw new Error("Unexpected repository call in Play replay pass test.");
  };
  const mutationFor = (
    queueEntryId: string,
    patch: Partial<PlayLocalSyncQueueEntryPersistenceRecord>
  ): Promise<PlayLocalSyncQueueEntryMutationResult> => {
    const entry = byId.get(queueEntryId);

    if (entry === undefined) {
      throw new Error(`Unknown queue entry ${queueEntryId}.`);
    }

    const next = { ...entry, ...patch };
    byId.set(queueEntryId, next);

    return Promise.resolve({ entry: next });
  };

  return {
    get transitions(): readonly RecordedTransition[] {
      return transitions;
    },
    repository: {
      countByStatus: unexpected,
      enqueue: unexpected,
      getById: unexpected,
      listPending: () => Promise.resolve(pending),
      markFailed: (operation) => {
        transitions.push({
          method: "markFailed",
          queueEntryId: operation.input.queueEntryId,
          safeErrorMessage: operation.input.safeErrorMessage,
          to: operation.input.transition.to,
          ...(operation.input.nextAttemptAt !== undefined
            ? { nextAttemptAt: operation.input.nextAttemptAt }
            : {})
        });

        return mutationFor(operation.input.queueEntryId, {
          safeErrorMessage: operation.input.safeErrorMessage,
          status: "failed"
        });
      },
      markInFlight: (operation) => {
        transitions.push({
          method: "markInFlight",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        const entry = byId.get(operation.input.queueEntryId);
        const attemptCount = (entry?.attemptCount ?? 0) + 1;

        return mutationFor(operation.input.queueEntryId, {
          attemptCount,
          lastAttemptedAt: operation.input.transition.transitionedAt,
          status: "in-flight"
        });
      },
      markSynced: (operation) => {
        transitions.push({
          method: "markSynced",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        return mutationFor(operation.input.queueEntryId, { status: "synced" });
      },
      pruneSynced: unexpected,
      requeue: (operation) => {
        transitions.push({
          method: "requeue",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        return mutationFor(operation.input.queueEntryId, { status: "pending" });
      }
    } satisfies PlayLocalSyncQueuePersistenceRepository
  };
};

interface FakeCommandService {
  readonly calls: readonly string[];
  readonly service: PlayReplayCommandExecutor;
}

const createFakeCommandService = (failWith?: () => Error): FakeCommandService => {
  const calls: string[] = [];
  const handle = (operation: string): Promise<unknown> => {
    calls.push(operation);

    if (failWith !== undefined) {
      return Promise.reject(failWith());
    }

    return Promise.resolve();
  };

  return {
    get calls(): readonly string[] {
      return calls;
    },
    service: {
      addPlayCue: () => handle("addPlayCue"),
      reorderPlaySections: () => handle("reorderPlaySections"),
      savePadLayer: () => handle("savePadLayer"),
      savePlayArrangement: () => handle("savePlayArrangement"),
      savePlaySection: () => handle("savePlaySection"),
      saveTrackSet: () => handle("saveTrackSet"),
      setPlaybackState: () => handle("setPlaybackState"),
      updatePlayCue: () => handle("updatePlayCue"),
      updateTrackSetMembers: () => handle("updateTrackSetMembers")
    } satisfies PlayReplayCommandExecutor
  };
};

describe("runPlayDesktopReplayPass", () => {
  it("replays an eligible entry and marks it synced", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService();

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.synced).toEqual(["queue_entry_1"]);
    expect(result.failed).toEqual([]);
    expect(result.requeued).toEqual([]);
    expect(result.exhausted).toEqual([]);
    expect(commandService.calls).toEqual(["setPlaybackState"]);
    expect(repository.transitions).toEqual([
      { method: "markInFlight", queueEntryId: "queue_entry_1", to: "in-flight" },
      { method: "markSynced", queueEntryId: "queue_entry_1", to: "synced" }
    ]);
  });

  it("requeues with backoff when the command service rejects with a retryable error", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(() => new Error("socket hang up"));

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.requeued).toEqual(["queue_entry_1"]);
    expect(result.synced).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(repository.transitions.map((transition) => transition.method)).toEqual([
      "markInFlight",
      "markFailed",
      "requeue"
    ]);
    // First in-flight attempt -> attemptCount 1 -> base backoff of 10s.
    expect(repository.transitions[1]?.nextAttemptAt).toBe("2026-06-17T05:01:10.000Z");
    expect(repository.transitions[1]?.safeErrorMessage).toContain("retried automatically");
  });

  it("marks a terminal failure without requeueing when the classifier returns terminal", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(() => new Error("rejected"));

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      errorClassifier: () => ({
        kind: "terminal",
        safeErrorMessage: "The server rejected this edit."
      }),
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.failed).toEqual(["queue_entry_1"]);
    expect(result.requeued).toEqual([]);
    expect(repository.transitions.map((transition) => transition.method)).toEqual([
      "markInFlight",
      "markFailed"
    ]);
    expect(repository.transitions[1]?.nextAttemptAt).toBeUndefined();
    expect(repository.transitions[1]?.safeErrorMessage).toBe("The server rejected this edit.");
  });

  it("marks an attempt-exhausted entry failed without calling the command service", async () => {
    const repository = createFakeRepository([
      pendingEntry({ attemptCount: 3, lastAttemptedAt: "2026-06-17T05:00:00.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T06:00:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.exhausted).toEqual(["queue_entry_1"]);
    expect(commandService.calls).toEqual([]);
    expect(repository.transitions).toEqual([
      { method: "markInFlight", queueEntryId: "queue_entry_1", to: "in-flight" },
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
      pendingEntry({ attemptCount: 1, lastAttemptedAt: "2026-06-17T05:00:00.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      now: "2026-06-17T05:00:05.000Z",
      policy,
      repository: repository.repository
    });

    expect(result).toEqual({ exhausted: [], failed: [], requeued: [], synced: [] });
    expect(commandService.calls).toEqual([]);
    expect(repository.transitions).toEqual([]);
  });

  it("uses a classifier-supplied safe message for a retryable failure", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(() => new Error("rejected"));

    const result = await runPlayDesktopReplayPass({
      actor,
      commandService: commandService.service,
      errorClassifier: () => ({ kind: "retryable", safeErrorMessage: "Network was unavailable." }),
      now: "2026-06-17T05:01:00.000Z",
      policy,
      repository: repository.repository
    });

    expect(result.requeued).toEqual(["queue_entry_1"]);
    expect(repository.transitions[1]?.safeErrorMessage).toBe("Network was unavailable.");
  });
});
