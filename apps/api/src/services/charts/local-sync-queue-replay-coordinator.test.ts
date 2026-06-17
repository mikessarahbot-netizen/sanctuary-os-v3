import { describe, expect, it } from "vitest";
import type {
  ChartsLocalSyncQueueEntryMutationResult,
  ChartsLocalSyncQueueEntryPersistenceRecord,
  ChartsLocalSyncQueuePersistenceRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ChartsDomainError, type ChartsCommandService } from "../../domain/charts/index.js";
import { runChartsLocalSyncQueueReplayPass } from "./local-sync-queue-replay-coordinator.js";

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

const now = "2026-06-17T05:01:00.000Z";

const pendingEntry = (
  overrides: Partial<ChartsLocalSyncQueueEntryPersistenceRecord> = {}
): ChartsLocalSyncQueueEntryPersistenceRecord => ({
  actorId: "musician_1",
  attemptCount: 0,
  chartId: "chart_1",
  createdAt: "2026-06-17T05:00:00.000Z",
  operation: {
    operation: "updateChartSource",
    payload: { chartId: "chart_1", chordProSource: "[G]Hello" }
  },
  queuedAt: "2026-06-17T05:00:00.000Z",
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "charts-local-sync-queue.v1",
  status: "pending",
  tenantId,
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
  readonly repository: ChartsLocalSyncQueuePersistenceRepository;
  readonly transitions: readonly RecordedTransition[];
}

const createFakeRepository = (
  pending: readonly ChartsLocalSyncQueueEntryPersistenceRecord[]
): FakeRepository => {
  const transitions: RecordedTransition[] = [];
  const byId = new Map(pending.map((entry) => [entry.queueEntryId, entry] as const));
  const unexpected = (): never => {
    throw new Error("Unexpected repository call in Charts replay pass test.");
  };
  const mutationFor = (
    queueEntryId: string,
    patch: Partial<ChartsLocalSyncQueueEntryPersistenceRecord>
  ): Promise<ChartsLocalSyncQueueEntryMutationResult> => {
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
          ...(operation.input.nextAttemptAt !== undefined
            ? { nextAttemptAt: operation.input.nextAttemptAt }
            : {}),
          queueEntryId: operation.input.queueEntryId,
          safeErrorMessage: operation.input.safeErrorMessage,
          to: operation.input.transition.to
        });

        return mutationFor(operation.input.queueEntryId, {
          safeErrorMessage: operation.input.safeErrorMessage,
          status: "failed"
        });
      },
      markInFlight: (operation) => {
        const current = byId.get(operation.input.queueEntryId);
        transitions.push({
          method: "markInFlight",
          queueEntryId: operation.input.queueEntryId,
          to: operation.input.transition.to
        });

        return mutationFor(operation.input.queueEntryId, {
          attemptCount: (current?.attemptCount ?? 0) + 1,
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
    } satisfies ChartsLocalSyncQueuePersistenceRepository
  };
};

interface RecordedCommand {
  readonly input: unknown;
  readonly operation: string;
}

interface FakeCommandService {
  readonly calls: readonly RecordedCommand[];
  readonly service: ChartsCommandService;
}

const createFakeCommandService = (
  failWith?: (operation: string) => Error | undefined
): FakeCommandService => {
  const calls: RecordedCommand[] = [];
  const handle = <TResult>(operation: string, input: unknown): Promise<TResult> => {
    calls.push({ input, operation });
    const failure = failWith?.(operation);

    return failure === undefined
      ? (Promise.resolve(undefined) as Promise<TResult>)
      : Promise.reject(failure);
  };

  return {
    get calls(): readonly RecordedCommand[] {
      return calls;
    },
    service: {
      addChartAnnotation: (command) => handle("addChartAnnotation", command.input),
      removeChartAnnotation: (command) => handle("removeChartAnnotation", command.input),
      saveChart: (command) => handle("saveChart", command.input),
      saveChartArrangement: (command) => handle("saveChartArrangement", command.input),
      setMusicianChartPreference: (command) =>
        handle("setMusicianChartPreference", command.input),
      updateChartAnnotation: (command) => handle("updateChartAnnotation", command.input),
      updateChartSource: (command) => handle("updateChartSource", command.input)
    } satisfies ChartsCommandService
  };
};

describe("runChartsLocalSyncQueueReplayPass", () => {
  it("replays an eligible entry and marks it synced", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService();

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    expect(result).toEqual({ exhausted: [], failed: [], requeued: [], synced: ["queue_entry_1"] });
    expect(commandService.calls.map((call) => call.operation)).toEqual(["updateChartSource"]);
    expect(repository.transitions).toEqual([
      { method: "markInFlight", queueEntryId: "queue_entry_1", to: "in-flight" },
      { method: "markSynced", queueEntryId: "queue_entry_1", to: "synced" }
    ]);
  });

  it("maps a queued persistence payload onto the command input shape", async () => {
    const repository = createFakeRepository([
      pendingEntry({
        chartId: "chart_9",
        operation: {
          operation: "saveChart",
          payload: {
            chartId: "chart_9",
            chordProSource: "[C]Grace",
            createdAt: "2026-06-17T05:00:00.000Z",
            defaultKey: "C",
            schemaVersion: "charts.v1",
            songRef: "song_9",
            tenantId,
            title: "Grace",
            updatedAt: "2026-06-17T05:00:00.000Z"
          }
        }
      })
    ]);
    const commandService = createFakeCommandService();

    await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    // The command input drops persistence-only fields (schemaVersion/timestamps).
    expect(commandService.calls[0]).toEqual({
      input: {
        chartId: "chart_9",
        chordProSource: "[C]Grace",
        defaultKey: "C",
        songRef: "song_9",
        title: "Grace"
      },
      operation: "saveChart"
    });
  });

  it("requeues with backoff when the command service throws a retryable error", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(() => new Error("Network was unavailable."));

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    expect(result.requeued).toEqual(["queue_entry_1"]);
    expect(result.failed).toEqual([]);
    expect(result.synced).toEqual([]);
    expect(repository.transitions.map((transition) => transition.method)).toEqual([
      "markInFlight",
      "markFailed",
      "requeue"
    ]);
    // attemptCount was 0; markInFlight bumped it to 1 -> backoff = base (10s).
    expect(repository.transitions[1]).toMatchObject({
      method: "markFailed",
      nextAttemptAt: "2026-06-17T05:01:10.000Z",
      to: "failed"
    });
    expect(repository.transitions[2]).toMatchObject({ method: "requeue", to: "pending" });
  });

  it("marks an entry terminally failed without requeue for a typed domain error", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(
      () =>
        new ChartsDomainError("CHART_NOT_FOUND", "This chart is no longer available on the server.")
    );

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    expect(result.failed).toEqual(["queue_entry_1"]);
    expect(result.requeued).toEqual([]);
    expect(repository.transitions.map((transition) => transition.method)).toEqual([
      "markInFlight",
      "markFailed"
    ]);
    const failure = repository.transitions[1];
    expect(failure).toMatchObject({
      method: "markFailed",
      safeErrorMessage: "This chart is no longer available on the server.",
      to: "failed"
    });
    expect(failure?.nextAttemptAt).toBeUndefined();
  });

  it("marks an attempt-exhausted entry failed without calling the command service", async () => {
    const repository = createFakeRepository([
      pendingEntry({ attemptCount: 3, lastAttemptedAt: "2026-06-17T05:00:00.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
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
      pendingEntry({ attemptCount: 1, lastAttemptedAt: "2026-06-17T05:00:55.000Z" })
    ]);
    const commandService = createFakeCommandService();

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    expect(result).toEqual({ exhausted: [], failed: [], requeued: [], synced: [] });
    expect(commandService.calls).toEqual([]);
    expect(repository.transitions).toEqual([]);
  });

  it("honours an injected classifier that forces a retryable outcome", async () => {
    const repository = createFakeRepository([pendingEntry()]);
    const commandService = createFakeCommandService(
      () =>
        new ChartsDomainError("VALIDATION_FAILED", "The server rejected this edit as invalid.")
    );

    const result = await runChartsLocalSyncQueueReplayPass({
      actor,
      commandService: commandService.service,
      errorClassifier: () => ({ kind: "retryable", safeErrorMessage: "Try again shortly." }),
      now,
      policy,
      repository: repository.repository
    });

    expect(result.requeued).toEqual(["queue_entry_1"]);
    expect(repository.transitions[1]).toMatchObject({
      method: "markFailed",
      safeErrorMessage: "Try again shortly."
    });
  });

  it("rejects a replay whose actor tenant does not match the entry tenant", async () => {
    const repository = createFakeRepository([pendingEntry({ tenantId: "tenant_1" })]);
    const commandService = createFakeCommandService();

    const result = await runChartsLocalSyncQueueReplayPass({
      actor: { ...actor, tenantId: "tenant_other" },
      commandService: commandService.service,
      now,
      policy,
      repository: repository.repository
    });

    // The listed entry belongs to tenant_1, so the tenant-scoped read yields it
    // here; the mapping guard rejects it, which the default classifier treats as
    // a retryable failure rather than crashing the pass.
    expect(result.requeued).toEqual(["queue_entry_1"]);
    expect(commandService.calls).toEqual([]);
  });
});
