import { describe, expect, it } from "vitest";
import {
  createChartsLocalSyncQueueSqlRepository,
  type ChartsLocalSyncQueueEntryPersistenceRecord,
  type PlanningSqlQueryResult,
  type PlanningSqlRow,
  type PlanningSqlStatement
} from "./index.js";

const tenantId = "tenant_1";
const queuedAt = "2026-06-17T01:00:00.000Z";
const updatedAt = "2026-06-17T01:00:00.000Z";
const transitionedAt = "2026-06-17T02:00:00.000Z";

interface RecordingSqlExecutor {
  readonly query: (statement: PlanningSqlStatement) => Promise<PlanningSqlQueryResult>;
  readonly statements: readonly PlanningSqlStatement[];
}

const createRecordingExecutor = (
  resultSets: readonly (readonly PlanningSqlRow[])[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const queuedResults = [...resultSets];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    }
  };
};

const baseEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  chartId: "chart_1",
  createdAt: queuedAt,
  operation: {
    operation: "addChartAnnotation",
    payload: {
      annotationId: "annotation_1",
      chartId: "chart_1",
      createdAt: queuedAt,
      kind: "note",
      lineIndex: 0,
      musicianId: "musician_1",
      note: "watch the tempo",
      sectionIndex: 0,
      tenantId,
      updatedAt: queuedAt
    }
  },
  queuedAt,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "charts-local-sync-queue.v1",
  status: "pending",
  tenantId,
  updatedAt
};

const canonicalOperationJson =
  '{"operation":"addChartAnnotation","payload":{"annotationId":"annotation_1","chartId":"chart_1","createdAt":"2026-06-17T01:00:00.000Z","kind":"note","lineIndex":0,"musicianId":"musician_1","note":"watch the tempo","sectionIndex":0,"tenantId":"tenant_1","updatedAt":"2026-06-17T01:00:00.000Z"}}';

const toStoredRow = (
  entry: ChartsLocalSyncQueueEntryPersistenceRecord,
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  actor_id: entry.actorId,
  attempt_count: entry.attemptCount,
  chart_id: entry.chartId ?? null,
  created_at: entry.createdAt,
  last_attempted_at: entry.lastAttemptedAt ?? null,
  next_attempt_at: entry.nextAttemptAt ?? null,
  operation: entry.operation.operation,
  payload_json: JSON.stringify(entry.operation),
  queue_entry_id: entry.queueEntryId,
  queued_at: entry.queuedAt,
  request_id: entry.requestId,
  safe_error_message: entry.safeErrorMessage ?? null,
  schema_version: entry.schemaVersion,
  status: entry.status,
  tenant_id: entry.tenantId,
  updated_at: entry.updatedAt,
  ...overrides
});

const readOptions = {
  context: { actorId: "actor_1", requestId: "request_read", tenantId }
} as const;

const writeOptions = {
  context: { actorId: "actor_1", requestId: "request_write", tenantId },
  intent: "update"
} as const;

const statementAt = (executor: RecordingSqlExecutor, index: number): PlanningSqlStatement => {
  const statement = executor.statements[index];

  if (statement === undefined) {
    throw new Error(`Expected SQL statement at index ${String(index)}.`);
  }

  return statement;
};

const secretLikeTokens = [
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "auth0",
  "cookie"
] as const;

describe("Charts local sync queue SQL repository", () => {
  it("enqueues with tenant-scoped params and canonical payload JSON", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.enqueue({ input: { entry: baseEntry }, options: writeOptions })
    ).resolves.toEqual({ entry: baseEntry });

    const statement = statementAt(executor, 0);
    expect(statement.name).toBe("charts.local_sync_queue.enqueue");
    expect(statement.sql).toContain("INSERT INTO charts_local_sync_queue_entries");
    expect(statement.parameters[0]).toBe(tenantId);
    expect(statement.parameters[1]).toBe("queue_entry_1");
    expect(statement.parameters[2]).toBe("chart_1");
    expect(statement.parameters[5]).toBe("addChartAnnotation");
    expect(statement.parameters[6]).toBe(canonicalOperationJson);
    expect(statement.parameters[7]).toBe("pending");
  });

  it("rejects an enqueue whose entry tenant does not match the operation tenant", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.enqueue({
        input: { entry: baseEntry },
        options: {
          context: { actorId: "actor_1", requestId: "request_write", tenantId: "tenant_other" },
          intent: "update"
        }
      })
    ).rejects.toThrow("tenant must match");
  });

  it("scopes getById by tenant and maps the row back to a record", async () => {
    const executor = createRecordingExecutor([[toStoredRow(baseEntry)]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({ input: { queueEntryId: "queue_entry_1" }, options: readOptions })
    ).resolves.toEqual(baseEntry);

    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("WHERE tenant_id = ?");
    expect(statement.sql).toContain("AND queue_entry_id = ?");
    expect(statement.parameters).toEqual([tenantId, "queue_entry_1"]);
  });

  it("returns null when getById matches no row", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({ input: { queueEntryId: "missing" }, options: readOptions })
    ).resolves.toBeNull();
  });

  it("throws when a mapped row belongs to another tenant", async () => {
    // A self-consistent row for tenant_other (payload tenant matches the row
    // tenant) parses cleanly, so the repository's own tenant guard — not the
    // record schema — is what must reject it for the tenant_1 read context.
    const otherTenantEntry: ChartsLocalSyncQueueEntryPersistenceRecord = {
      ...baseEntry,
      operation: {
        operation: "updateChartSource",
        payload: { chartId: "chart_1", chordProSource: "[G]Hello" }
      },
      tenantId: "tenant_other"
    };
    const executor = createRecordingExecutor([[toStoredRow(otherTenantEntry)]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({ input: { queueEntryId: "queue_entry_1" }, options: readOptions })
    ).rejects.toThrow("tenant mismatch");
  });

  it("lists only pending entries ordered by queue position with an optional chart filter", async () => {
    const executor = createRecordingExecutor([[toStoredRow(baseEntry)]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.listPending({ input: { chartId: "chart_1" }, options: readOptions })
    ).resolves.toEqual([baseEntry]);

    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("status = 'pending'");
    expect(statement.sql).toContain("(? IS NULL OR chart_id = ?)");
    expect(statement.sql).toContain("ORDER BY queued_at, queue_entry_id");
    expect(statement.parameters).toEqual([tenantId, "chart_1", "chart_1", null, null]);
  });

  it("passes a positive limit through to the list statement", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await repository.listPending({ input: { limit: 5 }, options: readOptions });

    const statement = statementAt(executor, 0);
    expect(statement.parameters).toEqual([tenantId, null, null, 5, 5]);
  });

  it("marks in-flight by incrementing the attempt count and guarding the prior status", async () => {
    const inFlightRow = toStoredRow(baseEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "in-flight",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[inFlightRow]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markInFlight({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "pending", to: "in-flight", transitionedAt }
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("in-flight");
    expect(result.entry.attemptCount).toBe(1);
    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("attempt_count = attempt_count + 1");
    expect(statement.sql).toContain("AND status = ?");
    expect(statement.parameters).toEqual([
      "in-flight",
      transitionedAt,
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "pending"
    ]);
  });

  it("marks failed with a safe error message and optional backoff", async () => {
    const failedRow = toStoredRow(baseEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      next_attempt_at: "2026-06-17T02:05:00.000Z",
      safe_error_message: "Sync failed; will retry.",
      status: "failed",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[failedRow]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markFailed({
      input: {
        nextAttemptAt: "2026-06-17T02:05:00.000Z",
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "Sync failed; will retry.",
        transition: { from: "in-flight", to: "failed", transitionedAt }
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("failed");
    expect(result.entry.safeErrorMessage).toBe("Sync failed; will retry.");
    expect(result.entry.nextAttemptAt).toBe("2026-06-17T02:05:00.000Z");
    const statement = statementAt(executor, 0);
    expect(statement.parameters).toEqual([
      "failed",
      "Sync failed; will retry.",
      "2026-06-17T02:05:00.000Z",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "in-flight"
    ]);
  });

  it("marks synced and clears error and backoff columns", async () => {
    const syncedRow = toStoredRow(baseEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "synced",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[syncedRow]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markSynced({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "in-flight", to: "synced", transitionedAt }
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("synced");
    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("safe_error_message = NULL");
    expect(statement.sql).toContain("next_attempt_at = NULL");
    expect(statement.parameters).toEqual([
      "synced",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "in-flight"
    ]);
  });

  it("throws when a transition matches no tenant-scoped row", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.markSynced({
        input: {
          queueEntryId: "queue_entry_1",
          transition: { from: "in-flight", to: "synced", transitionedAt }
        },
        options: writeOptions
      })
    ).rejects.toThrow("did not match a tenant-scoped entry");
  });

  it("requeues a failed entry back to pending and clears failure metadata", async () => {
    const requeuedRow = toStoredRow(baseEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "pending",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[requeuedRow]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    const result = await repository.requeue({
      input: {
        queueEntryId: "queue_entry_1",
        transition: { from: "failed", to: "pending", transitionedAt }
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("pending");
    expect(result.entry.safeErrorMessage).toBeUndefined();
    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("safe_error_message = NULL");
    expect(statement.parameters).toEqual([
      "pending",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "failed"
    ]);
  });

  it("prunes only synced entries older than the cutoff and reports the removed count", async () => {
    const executor = createRecordingExecutor([[{ queue_entry_id: "queue_entry_1" }]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.pruneSynced({
        input: { olderThan: "2026-06-17T03:00:00.000Z" },
        options: writeOptions
      })
    ).resolves.toEqual({ removedCount: 1 });

    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("status = 'synced'");
    expect(statement.sql).toContain("updated_at < ?");
    expect(statement.parameters).toEqual([tenantId, "2026-06-17T03:00:00.000Z"]);
  });

  it("groups status counts by tenant and defaults missing statuses to zero", async () => {
    const executor = createRecordingExecutor([
      [
        { count: 2, status: "pending" },
        { count: 1, status: "in-flight" },
        { count: 3, status: "failed" }
      ]
    ]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.countByStatus({ input: {}, options: readOptions })
    ).resolves.toEqual({ failed: 3, inFlight: 1, pending: 2, synced: 0 });

    const statement = statementAt(executor, 0);
    expect(statement.sql).toContain("GROUP BY status");
    expect(statement.parameters).toEqual([tenantId]);
  });

  it("never embeds secret-like tokens in the queue SQL", async () => {
    const executor = createRecordingExecutor([[], [toStoredRow(baseEntry)], [toStoredRow(baseEntry)]]);
    const repository = createChartsLocalSyncQueueSqlRepository({ executor });

    await repository.enqueue({ input: { entry: baseEntry }, options: writeOptions });
    await repository.getById({ input: { queueEntryId: "queue_entry_1" }, options: readOptions });
    await repository.listPending({ input: {}, options: readOptions });

    for (const statement of executor.statements) {
      const sql = statement.sql.toLowerCase();
      for (const token of secretLikeTokens) {
        expect(sql).not.toContain(token);
      }
    }
  });
});
